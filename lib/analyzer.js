const fs = require('fs');
const path = require('path');

class ConversationAnalyzer {
  constructor() {
    this.conversations = [];
  }

  async analyzeAllConversations(parser) {
    const claudeProjectsDir = path.join(process.env.HOME, '.claude', 'projects');

    if (!fs.existsSync(claudeProjectsDir)) {
      console.error('Claude projects directory not found:', claudeProjectsDir);
      return [];
    }

    this.conversations = [];

    // Get all project directories
    const projectDirs = fs
      .readdirSync(claudeProjectsDir)
      .filter(dir => fs.statSync(path.join(claudeProjectsDir, dir)).isDirectory());

    let processedCount = 0;
    const totalFiles = projectDirs.reduce((acc, dir) => {
      const projectPath = path.join(claudeProjectsDir, dir);
      return acc + fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl')).length;
    }, 0);

    for (const projectDir of projectDirs) {
      const projectPath = path.join(claudeProjectsDir, projectDir);
      const jsonlFiles = fs.readdirSync(projectPath).filter(file => file.endsWith('.jsonl'));

      for (const jsonlFile of jsonlFiles) {
        const filePath = path.join(projectPath, jsonlFile);
        processedCount++;
        process.stdout.write(`\rProcessing: ${processedCount}/${totalFiles} files...`);

        try {
          const conversation = await parser.parseJSONLFile(filePath);
          conversation.projectName = projectDir;
          this.conversations.push(conversation);
        } catch (e) {
          // Log error but continue processing other files
          console.error(`\nError processing ${path.basename(filePath)}:`, e.message);
          // Don't expose full file paths in errors
        }
      }
    }

    console.log('\n');
    return this.conversations;
  }

  getConversationsWithCosts() {
    return this.conversations
      .filter(c => c.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  getTotalStats() {
    const conversationsWithCosts = this.getConversationsWithCosts();
    const totalCost = conversationsWithCosts.reduce((sum, c) => sum + c.totalCost, 0);
    const totalTokens = conversationsWithCosts.reduce((sum, c) => sum + c.totalTokens.total, 0);
    const totalMessages = conversationsWithCosts.reduce((sum, c) => sum + c.messageCount, 0);
    const totalDuration = conversationsWithCosts.reduce((sum, c) => sum + c.duration, 0);

    return {
      totalCost,
      totalTokens,
      totalMessages,
      totalDuration,
      conversationCount: conversationsWithCosts.length,
      averageCost: conversationsWithCosts.length > 0 ? totalCost / conversationsWithCosts.length : 0,
      averageTokens: conversationsWithCosts.length > 0 ? totalTokens / conversationsWithCosts.length : 0,
      averageDuration: conversationsWithCosts.length > 0 ? totalDuration / conversationsWithCosts.length : 0
    };
  }

  aggregateDailyCosts() {
    const dailyCosts = {};

    this.conversations.forEach(conv => {
      if (conv.totalCost > 0 && conv.startTime) {
        const dateKey = conv.startTime.toISOString().split('T')[0];
        if (!dailyCosts[dateKey]) {
          dailyCosts[dateKey] = {
            date: dateKey,
            totalCost: 0,
            totalTokens: 0,
            conversationCount: 0,
            conversations: []
          };
        }
        dailyCosts[dateKey].totalCost += conv.totalCost;
        dailyCosts[dateKey].totalTokens += conv.totalTokens.total;
        dailyCosts[dateKey].conversationCount += 1;
        dailyCosts[dateKey].conversations.push(conv);
      }
    });

    return Object.values(dailyCosts).sort((a, b) => a.date.localeCompare(b.date));
  }

  aggregateHourlyCosts() {
    const hourlyCosts = {};

    this.conversations.forEach(conv => {
      if (conv.totalCost > 0 && conv.startTime) {
        const hour = conv.startTime.getHours();
        if (!hourlyCosts[hour]) {
          hourlyCosts[hour] = {
            hour,
            totalCost: 0,
            totalTokens: 0,
            conversationCount: 0
          };
        }
        hourlyCosts[hour].totalCost += conv.totalCost;
        hourlyCosts[hour].totalTokens += conv.totalTokens.total;
        hourlyCosts[hour].conversationCount += 1;
      }
    });

    // Fill in missing hours
    for (let i = 0; i < 24; i++) {
      if (!hourlyCosts[i]) {
        hourlyCosts[i] = { hour: i, totalCost: 0, totalTokens: 0, conversationCount: 0 };
      }
    }

    return Object.values(hourlyCosts).sort((a, b) => a.hour - b.hour);
  }

  aggregateToolUsage() {
    const toolUsage = {};

    this.conversations.forEach(conv => {
      Object.entries(conv.toolUsage).forEach(([toolName, toolData]) => {
        if (!toolUsage[toolName]) {
          toolUsage[toolName] = {
            name: toolName,
            totalCount: 0,
            totalCost: 0,
            totalErrors: 0,
            conversations: 0
          };
        }
        toolUsage[toolName].totalCount += toolData.count;
        toolUsage[toolName].totalCost += toolData.totalCost;
        toolUsage[toolName].totalErrors += toolData.errors;
        toolUsage[toolName].conversations += 1;
      });
    });

    return Object.values(toolUsage).sort((a, b) => b.totalCount - a.totalCount);
  }

  aggregateModelUsage() {
    const modelUsage = {};

    this.conversations.forEach(conv => {
      Object.entries(conv.models).forEach(([model, data]) => {
        if (!modelUsage[model]) {
          modelUsage[model] = {
            model,
            totalCount: 0,
            totalCost: 0,
            totalTokens: { total: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
            conversations: 0
          };
        }
        modelUsage[model].totalCount += data.count;
        modelUsage[model].totalCost += data.cost;
        modelUsage[model].totalTokens.total += data.tokens.total;
        modelUsage[model].totalTokens.input += data.tokens.input;
        modelUsage[model].totalTokens.output += data.tokens.output;
        modelUsage[model].totalTokens.cacheWrite += data.tokens.cacheWrite;
        modelUsage[model].totalTokens.cacheRead += data.tokens.cacheRead;
        modelUsage[model].conversations += 1;
      });
    });

    return Object.values(modelUsage).sort((a, b) => b.totalCost - a.totalCost);
  }

  aggregateCommandUsage() {
    const commandUsage = {};

    this.conversations.forEach(conv => {
      conv.commands.forEach(cmd => {
        if (!commandUsage[cmd.command]) {
          commandUsage[cmd.command] = {
            command: cmd.command,
            count: 0,
            conversations: new Set()
          };
        }
        commandUsage[cmd.command].count++;
        commandUsage[cmd.command].conversations.add(conv.conversationId);
      });
    });

    // Convert Sets to counts
    Object.values(commandUsage).forEach(cmd => {
      cmd.conversationCount = cmd.conversations.size;
      delete cmd.conversations;
    });

    return Object.values(commandUsage).sort((a, b) => b.count - a.count);
  }

  getErrorStats() {
    const totalErrors = this.conversations.reduce((sum, c) => sum + c.errors.length, 0);
    const conversationsWithErrors = this.conversations.filter(c => c.errors.length > 0).length;

    const errorsByTool = {};
    this.conversations.forEach(conv => {
      Object.entries(conv.toolUsage).forEach(([toolName, toolData]) => {
        if (toolData.errors > 0) {
          if (!errorsByTool[toolName]) {
            errorsByTool[toolName] = 0;
          }
          errorsByTool[toolName] += toolData.errors;
        }
      });
    });

    return {
      totalErrors,
      conversationsWithErrors,
      errorRate: this.conversations.length > 0 ? conversationsWithErrors / this.conversations.length : 0,
      errorsByTool
    };
  }

  getSessionStats() {
    const sessions = this.conversations.filter(c => c.duration > 0);
    
    if (sessions.length === 0) {
      return {
        averageDuration: 0,
        longestSession: null,
        shortestSession: null,
        totalSessions: 0,
        idleTimeAnalysis: []
      };
    }

    const sortedByDuration = sessions.sort((a, b) => b.duration - a.duration);
    
    // Analyze idle time between messages
    const idleTimeAnalysis = sessions.map(session => {
      const messageGaps = [];
      for (let i = 1; i < session.messages.length; i++) {
        if (session.messages[i].timestamp && session.messages[i-1].timestamp) {
          const gap = (new Date(session.messages[i].timestamp) - new Date(session.messages[i-1].timestamp)) / 1000 / 60; // minutes
          if (gap > 0) {
            messageGaps.push(gap);
          }
        }
      }
      
      const avgGap = messageGaps.length > 0 ? messageGaps.reduce((a, b) => a + b, 0) / messageGaps.length : 0;
      const maxGap = messageGaps.length > 0 ? Math.max(...messageGaps) : 0;
      
      return {
        conversationId: session.conversationId,
        title: session.conversationTitle,
        averageGap: avgGap,
        maxGap: maxGap,
        idlePercentage: session.duration > 0 ? (maxGap / session.duration) * 100 : 0
      };
    }).filter(s => s.maxGap > 5); // Only include sessions with gaps > 5 minutes

    return {
      averageDuration: sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length,
      longestSession: sortedByDuration[0],
      shortestSession: sortedByDuration[sortedByDuration.length - 1],
      totalSessions: sessions.length,
      idleTimeAnalysis: idleTimeAnalysis.sort((a, b) => b.maxGap - a.maxGap).slice(0, 10)
    };
  }

  getTokenBurnStats() {
    const allBurnRates = [];
    
    this.conversations.forEach(conv => {
      conv.tokenBurnRate.forEach(burn => {
        allBurnRates.push({
          ...burn,
          conversationId: conv.conversationId,
          conversationTitle: conv.conversationTitle
        });
      });
    });

    if (allBurnRates.length === 0) {
      return {
        averageBurnRate: 0,
        maxBurnRate: 0,
        highBurnMoments: []
      };
    }

    const sortedByRate = allBurnRates.sort((a, b) => b.rate - a.rate);
    const averageBurnRate = allBurnRates.reduce((sum, b) => sum + b.rate, 0) / allBurnRates.length;

    return {
      averageBurnRate,
      maxBurnRate: sortedByRate[0].rate,
      highBurnMoments: sortedByRate.slice(0, 20) // Top 20 highest burn rate moments
    };
  }

  getProjectStats() {
    const projectStats = {};

    this.conversations.forEach(conv => {
      if (!projectStats[conv.projectName]) {
        projectStats[conv.projectName] = {
          name: conv.projectName,
          totalCost: 0,
          totalTokens: 0,
          conversationCount: 0,
          totalDuration: 0,
          toolUsage: {},
          models: {}
        };
      }
      
      const project = projectStats[conv.projectName];
      project.totalCost += conv.totalCost;
      project.totalTokens += conv.totalTokens.total;
      project.conversationCount += 1;
      project.totalDuration += conv.duration;

      // Aggregate tool usage per project
      Object.entries(conv.toolUsage).forEach(([tool, data]) => {
        if (!project.toolUsage[tool]) {
          project.toolUsage[tool] = { count: 0, cost: 0 };
        }
        project.toolUsage[tool].count += data.count;
        project.toolUsage[tool].cost += data.totalCost;
      });

      // Aggregate model usage per project
      Object.entries(conv.models).forEach(([model, data]) => {
        if (!project.models[model]) {
          project.models[model] = { count: 0, cost: 0 };
        }
        project.models[model].count += data.count;
        project.models[model].cost += data.cost;
      });
    });

    return Object.values(projectStats).sort((a, b) => b.totalCost - a.totalCost);
  }
}

module.exports = ConversationAnalyzer;