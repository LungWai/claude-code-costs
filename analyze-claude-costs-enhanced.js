#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Import modules
const ConversationParser = require('./lib/parser');
const ConversationAnalyzer = require('./lib/analyzer');
const ReportVisualizer = require('./lib/visualizer');
const ConfigManager = require('./lib/config');
const ConversationMonitor = require('./lib/monitor');
const SecurityUtils = require('./lib/security');

// Claude API Pricing (per million tokens)
const CLAUDE_PRICING = {
  // Claude Opus 4
  'claude-opus-4-20250514': {
    input: 15.0,
    output: 75.0,
    cache_write: 18.75,
    cache_read: 1.5
  },
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  },
  // Claude Sonnet 3.7
  'claude-3-7-sonnet-20250219': {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  },
  'claude-3-7-sonnet-latest': {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  },
  // Claude Sonnet 3.5
  'claude-3-5-sonnet-20241022': {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  },
  'claude-3-5-sonnet-20240620': {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  },
  'claude-3-5-sonnet-latest': {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  },
  // Claude Haiku 3.5
  'claude-3-5-haiku-20241022': {
    input: 0.8,
    output: 4.0,
    cache_write: 1.0,
    cache_read: 0.08
  },
  'claude-3-5-haiku-latest': {
    input: 0.8,
    output: 4.0,
    cache_write: 1.0,
    cache_read: 0.08
  },
  // Claude Opus 3
  'claude-3-opus-20240229': {
    input: 15.0,
    output: 75.0,
    cache_write: 18.75,
    cache_read: 1.5
  },
  'claude-3-opus-latest': {
    input: 15.0,
    output: 75.0,
    cache_write: 18.75,
    cache_read: 1.5
  },
  // Claude Sonnet 3
  'claude-3-sonnet-20240229': {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  },
  // Claude Haiku 3
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    cache_write: 0.3,
    cache_read: 0.03
  },
  // Default pricing (use Sonnet 3.5 as default)
  default: {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.3
  }
};

function displaySummary(analyzer, config) {
  const stats = analyzer.getTotalStats();
  const conversationsWithCosts = analyzer.getConversationsWithCosts();
  const toolUsage = analyzer.aggregateToolUsage();
  const modelUsage = analyzer.aggregateModelUsage();
  const errorStats = analyzer.getErrorStats();
  const sessionStats = analyzer.getSessionStats();
  const tokenBurnStats = analyzer.getTokenBurnStats();

  const currencySymbol = config.get('display.currencySymbol');

  console.log('\n=== Claude Conversation Cost Analysis ===\n');
  
  // Overall Stats
  console.log(`Total Cost: ${currencySymbol}${stats.totalCost.toFixed(4)}`);
  console.log(`Total Conversations: ${stats.conversationCount}`);
  console.log(`Average Cost per Conversation: ${currencySymbol}${stats.averageCost.toFixed(4)}`);
  console.log(`Total Tokens Used: ${formatNumber(stats.totalTokens)}`);
  console.log(`Total Time: ${formatDuration(stats.totalDuration)}`);
  
  // Model Usage
  console.log('\n=== Model Usage ===');
  modelUsage.slice(0, 3).forEach(model => {
    console.log(`${model.model}: ${currencySymbol}${model.totalCost.toFixed(4)} (${model.conversations} conversations)`);
  });
  
  // Tool Usage
  console.log('\n=== Top Tool Usage ===');
  toolUsage.slice(0, 5).forEach(tool => {
    console.log(`${tool.name}: ${tool.totalCount} uses, ${currencySymbol}${tool.totalCost.toFixed(4)}`);
  });
  
  // Error Stats
  if (errorStats.totalErrors > 0) {
    console.log(`\n=== Error Statistics ===`);
    console.log(`Total Errors: ${errorStats.totalErrors} (${(errorStats.errorRate * 100).toFixed(1)}% of conversations)`);
  }
  
  // Token Burn Stats
  console.log(`\n=== Token Burn Analysis ===`);
  console.log(`Average Burn Rate: ${tokenBurnStats.averageBurnRate.toFixed(0)} tokens/minute`);
  console.log(`Maximum Burn Rate: ${tokenBurnStats.maxBurnRate.toFixed(0)} tokens/minute`);
  
  // Top 5 Most Expensive Conversations
  console.log('\n=== Top 5 Most Expensive Conversations ===');
  conversationsWithCosts
    .slice(0, 5)
    .forEach((conv, i) => {
      console.log(`${i + 1}. ${conv.conversationTitle}`);
      console.log(`   Project: ${conv.conversationName.split('/').pop() || conv.projectName}`);
      console.log(`   Cost: ${currencySymbol}${conv.totalCost.toFixed(6)}`);
      console.log(`   Tokens: ${formatNumber(conv.totalTokens.total)}`);
      console.log(`   Duration: ${formatDuration(conv.duration)}`);
      console.log(`   Date: ${conv.startTime ? conv.startTime.toLocaleDateString() : 'Unknown'}`);
    });
  
  // Check for alerts
  const todaysCost = analyzer.aggregateDailyCosts()
    .filter(d => d.date === new Date().toISOString().split('T')[0])
    .reduce((sum, d) => sum + d.totalCost, 0);
  
  const alerts = config.checkAlerts({
    dailyCost: todaysCost,
    sessionCost: conversationsWithCosts[0]?.totalCost || 0,
    tokenBurnRate: tokenBurnStats.maxBurnRate
  });
  
  if (alerts.length > 0) {
    console.log('\n=== ⚠️  ALERTS ===');
    alerts.forEach(alert => {
      console.log(`${alert.severity.toUpperCase()}: ${alert.message}`);
    });
  }
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(0);
}

function formatDuration(minutes) {
  if (minutes < 60) {
    return minutes.toFixed(0) + ' minutes';
  } else if (minutes < 1440) {
    return (minutes / 60).toFixed(1) + ' hours';
  } else {
    return (minutes / 1440).toFixed(1) + ' days';
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    monitor: false,
    export: null,
    project: null,
    days: 30,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--monitor':
      case '-m':
        options.monitor = true;
        break;
      case '--export':
      case '-e':
        const format = args[++i];
        if (!format || !['html', 'csv', 'json'].includes(format.toLowerCase())) {
          console.error('Invalid export format. Use: html, csv, or json');
          process.exit(1);
        }
        options.export = format.toLowerCase();
        break;
      case '--project':
      case '-p':
        const project = args[++i];
        if (!project) {
          console.error('Project name required for --project option');
          process.exit(1);
        }
        // Sanitize project name to prevent injection
        options.project = project.replace(/[^a-zA-Z0-9._-]/g, '');
        break;
      case '--days':
      case '-d':
        try {
          const days = SecurityUtils.validateNumber(args[++i], 1, 365);
          options.days = days;
        } catch (error) {
          console.error('Invalid days value. Must be between 1 and 365');
          process.exit(1);
        }
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        console.log('Use --help for usage information');
        process.exit(1);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Claude Code Cost Analyzer - Enhanced Edition

Usage: npx claude-code-costs [options]

Options:
  -m, --monitor          Enable real-time monitoring mode
  -e, --export <format>  Export data (formats: html, csv, json)
  -p, --project <name>   Filter by project name
  -d, --days <number>    Number of days to analyze (default: 30)
  -h, --help            Show this help message

Examples:
  npx claude-code-costs                    # Generate HTML report
  npx claude-code-costs --monitor          # Start real-time monitoring
  npx claude-code-costs --export csv       # Export to CSV
  npx claude-code-costs --project myapp    # Analyze specific project

Configuration:
  Settings are stored in ~/.claude-code-costs/config.json
  Edit this file to customize alerts, display options, and more.
`);
}

// Main execution
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  console.log('🔍 Analyzing Claude conversation costs...\n');

  // Initialize components
  const configManager = new ConfigManager();
  const parser = new ConversationParser(CLAUDE_PRICING);
  const analyzer = new ConversationAnalyzer();
  const visualizer = new ReportVisualizer(configManager);
  const monitor = new ConversationMonitor(configManager);

  // Load and analyze conversations
  const conversations = await analyzer.analyzeAllConversations(parser);

  if (conversations.length === 0) {
    console.log('No conversations found.');
    return;
  }

  // Apply filters if specified
  if (options.project) {
    analyzer.conversations = analyzer.conversations.filter(
      c => c.projectName.includes(options.project)
    );
  }

  if (options.days < 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.days);
    analyzer.conversations = analyzer.conversations.filter(
      c => c.startTime && c.startTime >= cutoffDate
    );
  }

  // Display summary
  displaySummary(analyzer, configManager);

  // Handle different modes
  if (options.monitor) {
    console.log('\n🔄 Starting real-time monitoring...');
    console.log('Press Ctrl+C to stop\n');

    monitor.on('session-updated', (data) => {
      console.log(`\n📊 Active Session Update:`);
      console.log(`   Session: ${data.sessionId}`);
      console.log(`   Cost: $${data.session.totalCost.toFixed(4)}`);
      console.log(`   Tokens: ${data.session.totalTokens}`);
      console.log(`   Burn Rate: ${data.session.avgBurnRate.toFixed(0)} tokens/min`);
    });

    monitor.on('alerts', (alerts) => {
      console.log(`\n⚠️  ALERTS:`);
      alerts.forEach(alert => {
        console.log(`   ${alert.severity.toUpperCase()}: ${alert.message}`);
      });
    });

    monitor.startMonitoring();

    // Keep the process running
    process.on('SIGINT', () => {
      console.log('\n\nStopping monitor...');
      monitor.stopMonitoring();
      process.exit(0);
    });

  } else if (options.export) {
    console.log(`\n📁 Exporting data as ${options.export}...`);
    
    switch (options.export) {
      case 'csv':
        exportCSV(analyzer, configManager);
        break;
      case 'json':
        exportJSON(analyzer, configManager);
        break;
      default:
        console.log('Unsupported export format. Use: csv, json');
    }

  } else {
    // Generate HTML report
    const reportPath = visualizer.generateReport(analyzer, monitor);
    console.log(`\n📊 HTML report generated: ${reportPath}`);
    console.log('Opening report in browser...');

    // Open the HTML file in the default browser (secure implementation)
    const platform = process.platform;
    let openCommand;
    let args = [];
    
    if (platform === 'darwin') {
      openCommand = 'open';
      args = [reportPath];
    } else if (platform === 'win32') {
      openCommand = 'cmd.exe';
      args = ['/c', 'start', '""', reportPath];
    } else {
      openCommand = 'xdg-open';
      args = [reportPath];
    }

    const child = spawn(openCommand, args, {
      detached: true,
      stdio: 'ignore'
    });

    child.on('error', (err) => {
      console.error('Failed to open browser automatically.');
      console.log(`Please open the following file manually: ${reportPath}`);
    });

    child.unref();
  }
}

function exportCSV(analyzer, config) {
  const fs = require('fs');
  const conversations = analyzer.getConversationsWithCosts();
  const currencySymbol = config.get('display.currencySymbol');
  
  const headers = ['Title', 'Project', 'Cost', 'Tokens', 'Messages', 'Duration', 'Date', 'Top Tools'];
  const rows = conversations.map(c => {
    const topTools = Object.entries(c.toolUsage)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([tool, data]) => `${tool}(${data.count})`)
      .join(', ');
    
    return [
      c.conversationTitle,
      c.projectName,
      c.totalCost.toFixed(6),
      c.totalTokens.total,
      c.messageCount,
      c.duration.toFixed(1),
      c.startTime ? c.startTime.toISOString() : '',
      topTools
    ];
  });
  
  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const filename = `claude-costs-export-${Date.now()}.csv`;
  fs.writeFileSync(filename, csv);
  console.log(`CSV exported to: ${filename}`);
}

function exportJSON(analyzer, config) {
  const fs = require('fs');
  const data = {
    metadata: {
      exportDate: new Date().toISOString(),
      version: '2.0.0',
      config: config.config
    },
    summary: analyzer.getTotalStats(),
    conversations: analyzer.getConversationsWithCosts(),
    toolUsage: analyzer.aggregateToolUsage(),
    modelUsage: analyzer.aggregateModelUsage(),
    dailyCosts: analyzer.aggregateDailyCosts(),
    projectStats: analyzer.getProjectStats()
  };
  
  const filename = `claude-costs-export-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`JSON exported to: ${filename}`);
}

main().catch(console.error);