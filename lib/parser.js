const fs = require('fs');
const readline = require('readline');
const path = require('path');
const SecurityUtils = require('./security');

class ConversationParser {
  constructor(pricing) {
    this.pricing = pricing;
    this.claudeProjectsDir = path.join(process.env.HOME, '.claude', 'projects');
  }

  calculateCost(usage, model) {
    if (!usage) return 0;

    const pricing = this.pricing[model] || this.pricing['default'];

    const inputCost = ((usage.input_tokens || 0) * pricing.input) / 1000000;
    const outputCost = ((usage.output_tokens || 0) * pricing.output) / 1000000;
    const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) * pricing.cache_write) / 1000000;
    const cacheReadCost = ((usage.cache_read_input_tokens || 0) * pricing.cache_read) / 1000000;

    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }

  calculateTokens(usage) {
    if (!usage) return { total: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

    return {
      total: (usage.input_tokens || 0) + 
             (usage.output_tokens || 0) + 
             (usage.cache_creation_input_tokens || 0) + 
             (usage.cache_read_input_tokens || 0),
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0
    };
  }

  async parseJSONLFile(filePath) {
    // Validate file path to prevent traversal attacks
    const safePath = SecurityUtils.validatePath(filePath, this.claudeProjectsDir);
    
    // Check file size to prevent DoS
    const maxFileSize = 100 * 1024 * 1024; // 100MB
    if (!await SecurityUtils.validateFileSize(safePath, maxFileSize)) {
      throw new Error(`File too large: ${path.basename(safePath)}`);
    }
    
    const fileStream = fs.createReadStream(safePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const conversation = {
      conversationId: '',
      sessionId: '',
      conversationName: '',
      conversationTitle: '',
      totalCost: 0,
      totalTokens: { total: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
      messageCount: 0,
      startTime: null,
      endTime: null,
      duration: 0,
      summary: '',
      firstUserMessage: '',
      messages: [],
      toolUsage: {},
      commands: [],
      errors: [],
      models: {},
      workingDirectories: new Set(),
      userTypes: new Set(),
      serviceTiers: new Set(),
      tokenBurnRate: [],
      projectPath: ''
    };

    let currentTokenBurn = 0;
    let lastTimestamp = null;

    for await (const line of rl) {
      try {
        const message = JSON.parse(line);

        // Extract session ID
        if (message.sessionId && !conversation.sessionId) {
          conversation.sessionId = message.sessionId;
        }

        // Extract conversation metadata
        if (message.type === 'summary') {
          if (message.summary) {
            conversation.summary = message.summary;
          }
          if (message.metadata) {
            conversation.conversationName = message.metadata.workingDirectory || message.metadata.cwd || 'Unknown';
            conversation.projectPath = message.metadata.cwd || '';
            if (message.metadata.thread_summary) {
              conversation.conversationTitle = message.metadata.thread_summary;
            }
            if (message.metadata.summary) {
              conversation.conversationTitle = message.metadata.summary;
            }
          }
        }

        // Capture first user message as fallback title
        if (message.type === 'user' && !conversation.firstUserMessage && message.text) {
          conversation.firstUserMessage = message.text.substring(0, 100);
        }

        // Track working directories
        if (message.cwd) {
          conversation.workingDirectories.add(message.cwd);
        }

        // Track user types
        if (message.user) {
          conversation.userTypes.add(message.user);
        }

        // Track service tiers
        if (message.service_tier) {
          conversation.serviceTiers.add(message.service_tier);
        }

        // Extract tool usage
        if (message.type === 'tool_use') {
          const toolName = message.tool_use?.name || 'unknown';
          if (!conversation.toolUsage[toolName]) {
            conversation.toolUsage[toolName] = {
              count: 0,
              totalCost: 0,
              errors: 0,
              executions: []
            };
          }
          conversation.toolUsage[toolName].count++;
          
          // Store tool execution details
          conversation.toolUsage[toolName].executions.push({
            timestamp: message.timestamp,
            id: message.tool_use?.id,
            parentId: message.parentUUID,
            input: message.tool_use?.input
          });
        }

        // Track tool results and errors
        if (message.type === 'tool_result') {
          const toolUseId = message.tool_use_id;
          const isError = message.is_error || false;
          
          if (isError) {
            conversation.errors.push({
              timestamp: message.timestamp,
              toolUseId: toolUseId,
              content: message.content,
              parentId: message.parentUUID
            });
          }
        }

        // Extract command usage from user messages
        if (message.type === 'user' && message.text) {
          const commandMatch = message.text.match(/^\/(\w+)/);
          if (commandMatch) {
            conversation.commands.push({
              command: commandMatch[1],
              timestamp: message.timestamp,
              fullText: message.text
            });
          }
        }

        // Extract cost data from assistant messages
        if (message.type === 'assistant' && message.message) {
          const usage = message.message.usage;
          const model = message.message.model;
          
          if (usage && model) {
            const cost = this.calculateCost(usage, model);
            const tokens = this.calculateTokens(usage);
            
            conversation.totalCost += cost;
            conversation.totalTokens.total += tokens.total;
            conversation.totalTokens.input += tokens.input;
            conversation.totalTokens.output += tokens.output;
            conversation.totalTokens.cacheWrite += tokens.cacheWrite;
            conversation.totalTokens.cacheRead += tokens.cacheRead;
            
            conversation.messageCount++;
            
            // Track model usage
            if (!conversation.models[model]) {
              conversation.models[model] = {
                count: 0,
                cost: 0,
                tokens: { total: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
              };
            }
            conversation.models[model].count++;
            conversation.models[model].cost += cost;
            conversation.models[model].tokens.total += tokens.total;
            conversation.models[model].tokens.input += tokens.input;
            conversation.models[model].tokens.output += tokens.output;
            conversation.models[model].tokens.cacheWrite += tokens.cacheWrite;
            conversation.models[model].tokens.cacheRead += tokens.cacheRead;

            // Update tool cost if this is related to a tool use
            if (message.parentUUID) {
              // Find the related tool use
              for (const [toolName, toolData] of Object.entries(conversation.toolUsage)) {
                const relatedExecution = toolData.executions.find(
                  exec => exec.id === message.parentUUID || exec.parentId === message.parentUUID
                );
                if (relatedExecution) {
                  toolData.totalCost += cost;
                  break;
                }
              }
            }

            // Calculate token burn rate
            if (message.timestamp && lastTimestamp) {
              const timeDiff = (new Date(message.timestamp) - new Date(lastTimestamp)) / 1000 / 60; // minutes
              if (timeDiff > 0) {
                const burnRate = tokens.total / timeDiff;
                conversation.tokenBurnRate.push({
                  timestamp: message.timestamp,
                  rate: burnRate,
                  tokens: tokens.total,
                  cost: cost
                });
              }
            }
            lastTimestamp = message.timestamp;
          }
        }

        // Store full message data
        conversation.messages.push({
          type: message.type,
          timestamp: message.timestamp,
          id: message.id || message.UUID,
          parentId: message.parentUUID,
          role: message.role,
          model: message.message?.model,
          usage: message.message?.usage,
          toolUse: message.tool_use,
          toolResult: message.type === 'tool_result' ? {
            toolUseId: message.tool_use_id,
            isError: message.is_error,
            content: message.content
          } : null,
          text: message.text,
          requestId: message.requestID
        });

        // Track conversation time range
        if (message.timestamp) {
          const timestamp = new Date(message.timestamp);
          if (!conversation.startTime || timestamp < conversation.startTime) {
            conversation.startTime = timestamp;
          }
          if (!conversation.endTime || timestamp > conversation.endTime) {
            conversation.endTime = timestamp;
          }
        }
      } catch (e) {
        // Silent error handling for malformed lines
      }
    }

    // Calculate duration
    if (conversation.endTime && conversation.startTime) {
      conversation.duration = (conversation.endTime - conversation.startTime) / 1000 / 60; // in minutes
    }

    // Set conversation ID
    conversation.conversationId = require('path').basename(filePath, '.jsonl');

    // Determine best title
    if (!conversation.conversationTitle) {
      conversation.conversationTitle = conversation.summary || conversation.firstUserMessage || 'Untitled conversation';
    }
    conversation.conversationTitle = conversation.conversationTitle.replace(/\n/g, ' ').substring(0, 100);

    // Convert Sets to Arrays for serialization
    conversation.workingDirectories = Array.from(conversation.workingDirectories);
    conversation.userTypes = Array.from(conversation.userTypes);
    conversation.serviceTiers = Array.from(conversation.serviceTiers);

    return conversation;
  }
}

module.exports = ConversationParser;