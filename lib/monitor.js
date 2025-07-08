const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class ConversationMonitor extends EventEmitter {
  constructor(configManager) {
    super();
    this.configManager = configManager;
    this.watchers = new Map();
    this.sessionData = new Map();
    this.activeSession = null;
    this.monitoringEnabled = false;
    this.lastCheckedFiles = new Map();
  }

  startMonitoring(projectsDir) {
    if (this.monitoringEnabled) {
      console.log('Monitoring already enabled');
      return;
    }

    this.monitoringEnabled = true;
    this.projectsDir = projectsDir || path.join(process.env.HOME, '.claude', 'projects');

    // Monitor all project directories
    this.watchDirectory(this.projectsDir);

    // Set up periodic checks
    const refreshInterval = this.configManager.get('monitoring.refreshInterval') * 1000;
    this.refreshTimer = setInterval(() => {
      this.checkForUpdates();
    }, refreshInterval);

    console.log('Real-time monitoring started');
    this.emit('monitoring-started');
  }

  stopMonitoring() {
    if (!this.monitoringEnabled) {
      return;
    }

    this.monitoringEnabled = false;

    // Clear all watchers with error handling
    for (const [dir, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        console.error(`Error closing watcher for ${dir}:`, error.message);
      }
    }
    this.watchers.clear();

    // Clear refresh timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clear session data to free memory
    this.clearSessionData();

    console.log('Real-time monitoring stopped');
    this.emit('monitoring-stopped');
  }

  watchDirectory(dirPath) {
    if (this.watchers.has(dirPath)) {
      return;
    }

    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          this.handleFileChange(path.join(dirPath, filename), eventType);
        }
      });

      this.watchers.set(dirPath, watcher);

      // Watch subdirectories
      const subdirs = fs.readdirSync(dirPath)
        .filter(item => {
          const itemPath = path.join(dirPath, item);
          return fs.statSync(itemPath).isDirectory();
        });

      subdirs.forEach(subdir => {
        this.watchDirectory(path.join(dirPath, subdir));
      });
    } catch (error) {
      console.error(`Error watching directory ${dirPath}:`, error.message);
    }
  }

  handleFileChange(filePath, eventType) {
    const stats = fs.statSync(filePath);
    const lastChecked = this.lastCheckedFiles.get(filePath);

    if (!lastChecked || stats.mtime > lastChecked) {
      this.lastCheckedFiles.set(filePath, stats.mtime);
      
      // Extract session ID from file path
      const sessionId = path.basename(filePath, '.jsonl');
      
      // Emit file change event
      this.emit('file-changed', {
        filePath,
        sessionId,
        eventType,
        timestamp: new Date()
      });

      // Track as active session
      this.activeSession = sessionId;
      
      // Process the file for real-time stats
      this.processFileUpdate(filePath, sessionId);
    }
  }

  async processFileUpdate(filePath, sessionId) {
    try {
      // Read the last few lines to get recent updates
      const lines = await this.readLastLines(filePath, 50);
      const updates = this.parseRecentUpdates(lines, sessionId);

      if (updates.length > 0) {
        // Update session data
        if (!this.sessionData.has(sessionId)) {
          this.sessionData.set(sessionId, {
            sessionId,
            startTime: new Date(),
            lastUpdate: new Date(),
            totalCost: 0,
            totalTokens: 0,
            messages: 0,
            tokenBurnRate: [],
            recentActivity: []
          });
        }

        const session = this.sessionData.get(sessionId);
        
        updates.forEach(update => {
          if (update.cost) {
            session.totalCost += update.cost;
          }
          if (update.tokens) {
            session.totalTokens += update.tokens;
          }
          if (update.type === 'assistant') {
            session.messages++;
          }

          // Calculate burn rate
          if (session.recentActivity.length > 0) {
            const lastActivity = session.recentActivity[session.recentActivity.length - 1];
            const timeDiff = (update.timestamp - lastActivity.timestamp) / 1000 / 60; // minutes
            if (timeDiff > 0 && update.tokens) {
              const burnRate = update.tokens / timeDiff;
              session.tokenBurnRate.push({
                timestamp: update.timestamp,
                rate: burnRate,
                tokens: update.tokens
              });
            }
          }

          session.recentActivity.push(update);
          session.lastUpdate = update.timestamp;
        });

        // Keep only recent activity (last 100 items)
        if (session.recentActivity.length > 100) {
          session.recentActivity = session.recentActivity.slice(-100);
        }

        // Emit session update
        this.emit('session-updated', {
          sessionId,
          session: this.getSessionStats(sessionId),
          latestUpdate: updates[updates.length - 1]
        });

        // Check for alerts
        this.checkSessionAlerts(session);
      }
    } catch (error) {
      console.error(`Error processing file update for ${filePath}:`, error.message);
    }
  }

  async readLastLines(filePath, numLines) {
    return new Promise((resolve, reject) => {
      const lines = [];
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let remainder = '';

      stream.on('data', chunk => {
        const parts = (remainder + chunk).split('\n');
        remainder = parts.pop() || '';
        lines.push(...parts);
        
        // Keep only the last numLines
        if (lines.length > numLines) {
          lines.splice(0, lines.length - numLines);
        }
      });

      stream.on('end', () => {
        if (remainder) {
          lines.push(remainder);
        }
        resolve(lines.slice(-numLines));
      });

      stream.on('error', reject);
    });
  }

  parseRecentUpdates(lines, sessionId) {
    const updates = [];
    const pricing = this.configManager.get('pricing.customPricing') || {};

    lines.forEach(line => {
      try {
        const message = JSON.parse(line);
        const update = {
          sessionId,
          timestamp: new Date(message.timestamp || Date.now()),
          type: message.type
        };

        if (message.type === 'assistant' && message.message) {
          const usage = message.message.usage;
          const model = message.message.model;

          if (usage && model) {
            // Calculate cost and tokens
            const modelPricing = pricing[model] || pricing.default || {
              input: 3.0,
              output: 15.0,
              cache_write: 3.75,
              cache_read: 0.3
            };

            const inputCost = ((usage.input_tokens || 0) * modelPricing.input) / 1000000;
            const outputCost = ((usage.output_tokens || 0) * modelPricing.output) / 1000000;
            const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) * modelPricing.cache_write) / 1000000;
            const cacheReadCost = ((usage.cache_read_input_tokens || 0) * modelPricing.cache_read) / 1000000;

            update.cost = inputCost + outputCost + cacheWriteCost + cacheReadCost;
            update.tokens = (usage.input_tokens || 0) + 
                           (usage.output_tokens || 0) + 
                           (usage.cache_creation_input_tokens || 0) + 
                           (usage.cache_read_input_tokens || 0);
            update.model = model;
            update.usage = usage;
          }
        }

        if (message.type === 'tool_use') {
          update.tool = message.tool_use?.name;
        }

        if (message.type === 'user' && message.text) {
          update.text = message.text.substring(0, 100);
        }

        updates.push(update);
      } catch (e) {
        // Ignore malformed lines
      }
    });

    return updates;
  }

  checkSessionAlerts(session) {
    const alerts = [];
    const thresholds = this.configManager.getAlertThresholds();

    if (!thresholds.enabled) {
      return;
    }

    // Check session cost
    if (session.totalCost > thresholds.sessionCostThreshold) {
      alerts.push({
        type: 'session_cost',
        severity: 'warning',
        message: `Active session cost ($${session.totalCost.toFixed(2)}) exceeds threshold`,
        sessionId: session.sessionId
      });
    }

    // Check burn rate
    if (session.tokenBurnRate.length > 0) {
      const recentBurnRates = session.tokenBurnRate.slice(-5);
      const avgBurnRate = recentBurnRates.reduce((sum, r) => sum + r.rate, 0) / recentBurnRates.length;

      if (avgBurnRate > thresholds.tokenBurnRateThreshold) {
        alerts.push({
          type: 'token_burn_rate',
          severity: 'critical',
          message: `High token burn rate detected (${avgBurnRate.toFixed(0)} tokens/min)`,
          sessionId: session.sessionId
        });
      }
    }

    if (alerts.length > 0) {
      this.emit('alerts', alerts);
    }
  }

  getSessionStats(sessionId) {
    const session = this.sessionData.get(sessionId);
    if (!session) {
      return null;
    }

    const duration = (session.lastUpdate - session.startTime) / 1000 / 60; // minutes
    const avgBurnRate = session.tokenBurnRate.length > 0
      ? session.tokenBurnRate.reduce((sum, r) => sum + r.rate, 0) / session.tokenBurnRate.length
      : 0;

    return {
      sessionId: session.sessionId,
      startTime: session.startTime,
      lastUpdate: session.lastUpdate,
      duration,
      totalCost: session.totalCost,
      totalTokens: session.totalTokens,
      messages: session.messages,
      avgBurnRate,
      costPerMinute: duration > 0 ? session.totalCost / duration : 0,
      tokensPerMinute: duration > 0 ? session.totalTokens / duration : 0,
      recentActivity: session.recentActivity.slice(-10),
      burnRateHistory: session.tokenBurnRate.slice(-20)
    };
  }

  getActiveSession() {
    if (!this.activeSession) {
      return null;
    }
    return this.getSessionStats(this.activeSession);
  }

  getAllSessions() {
    const sessions = [];
    for (const [sessionId, _] of this.sessionData) {
      const stats = this.getSessionStats(sessionId);
      if (stats) {
        sessions.push(stats);
      }
    }
    return sessions.sort((a, b) => b.lastUpdate - a.lastUpdate);
  }

  checkForUpdates() {
    // This method can be used to periodically check for any missed updates
    this.emit('periodic-check', {
      timestamp: new Date(),
      activeSessions: this.sessionData.size,
      currentSession: this.activeSession
    });
  }

  clearSessionData() {
    this.sessionData.clear();
    this.activeSession = null;
    this.emit('sessions-cleared');
  }
}

module.exports = ConversationMonitor;