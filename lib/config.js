const fs = require('fs');
const path = require('path');
const os = require('os');
const SecurityUtils = require('./security');

class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.claude-code-costs');
    this.configFile = path.join(this.configDir, 'config.json');
    this.defaults = {
      alerts: {
        enabled: true,
        dailyCostThreshold: 10.0,
        sessionCostThreshold: 2.0,
        tokenBurnRateThreshold: 10000, // tokens per minute
        soundEnabled: false
      },
      display: {
        currency: 'USD',
        currencySymbol: '$',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        theme: 'light',
        chartAnimations: true
      },
      export: {
        defaultFormat: 'html',
        includeRawData: false,
        compressOutput: false
      },
      monitoring: {
        autoRefresh: false,
        refreshInterval: 300, // seconds
        showNotifications: true
      },
      filters: {
        defaultDateRange: 30, // days
        excludeZeroCostConversations: true,
        minConversationDuration: 0 // minutes
      },
      pricing: {
        customPricing: {},
        useCachedPricing: true
      }
    };
    this.config = this.loadConfig();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  loadConfig() {
    this.ensureConfigDir();
    
    if (fs.existsSync(this.configFile)) {
      try {
        const fileContent = fs.readFileSync(this.configFile, 'utf8');
        const userConfig = JSON.parse(fileContent);
        // Deep merge with defaults
        return this.deepMerge(this.defaults, userConfig);
      } catch (error) {
        console.error('Error loading config file, using defaults:', error.message);
        return { ...this.defaults };
      }
    }
    
    // Create default config file
    this.saveConfig(this.defaults);
    return { ...this.defaults };
  }

  saveConfig(config = this.config) {
    this.ensureConfigDir();
    
    try {
      fs.writeFileSync(
        this.configFile,
        JSON.stringify(config, null, 2),
        'utf8'
      );
      this.config = config;
      return true;
    } catch (error) {
      console.error('Error saving config:', error.message);
      return false;
    }
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj) || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = value;
    return this.saveConfig();
  }

  deepMerge(target, source) {
    // Use the secure merge function from SecurityUtils
    return SecurityUtils.safeMerge(target, source);
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  resetToDefaults() {
    this.config = { ...this.defaults };
    return this.saveConfig();
  }

  getAlertThresholds() {
    return this.config.alerts;
  }

  checkAlerts(stats) {
    const alerts = [];
    const thresholds = this.getAlertThresholds();
    
    if (!thresholds.enabled) {
      return alerts;
    }
    
    // Check daily cost threshold
    if (stats.dailyCost > thresholds.dailyCostThreshold) {
      alerts.push({
        type: 'daily_cost',
        severity: 'warning',
        message: `Daily cost ($${stats.dailyCost.toFixed(2)}) exceeds threshold ($${thresholds.dailyCostThreshold})`,
        value: stats.dailyCost,
        threshold: thresholds.dailyCostThreshold
      });
    }
    
    // Check session cost threshold
    if (stats.sessionCost > thresholds.sessionCostThreshold) {
      alerts.push({
        type: 'session_cost',
        severity: 'warning',
        message: `Session cost ($${stats.sessionCost.toFixed(2)}) exceeds threshold ($${thresholds.sessionCostThreshold})`,
        value: stats.sessionCost,
        threshold: thresholds.sessionCostThreshold
      });
    }
    
    // Check token burn rate threshold
    if (stats.tokenBurnRate > thresholds.tokenBurnRateThreshold) {
      alerts.push({
        type: 'token_burn_rate',
        severity: 'critical',
        message: `Token burn rate (${stats.tokenBurnRate.toFixed(0)} tokens/min) exceeds threshold (${thresholds.tokenBurnRateThreshold} tokens/min)`,
        value: stats.tokenBurnRate,
        threshold: thresholds.tokenBurnRateThreshold
      });
    }
    
    return alerts;
  }

  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  importConfig(configString) {
    try {
      const importedConfig = JSON.parse(configString);
      this.config = this.deepMerge(this.defaults, importedConfig);
      return this.saveConfig();
    } catch (error) {
      console.error('Error importing config:', error.message);
      return false;
    }
  }
}

module.exports = ConfigManager;