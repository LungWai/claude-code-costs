const fs = require('fs');
const path = require('path');
const os = require('os');
const SecurityUtils = require('./security');

class ReportVisualizer {
  constructor(configManager) {
    this.configManager = configManager;
  }

  // Helper method to safely escape HTML
  escapeHtml(unsafe) {
    return SecurityUtils.escapeHtml(unsafe);
  }

  generateReport(analyzer, monitor) {
    const stats = analyzer.getTotalStats();
    const conversationsWithCosts = analyzer.getConversationsWithCosts();
    const dailyData = analyzer.aggregateDailyCosts();
    const hourlyData = analyzer.aggregateHourlyCosts();
    const toolUsage = analyzer.aggregateToolUsage();
    const modelUsage = analyzer.aggregateModelUsage();
    const commandUsage = analyzer.aggregateCommandUsage();
    const errorStats = analyzer.getErrorStats();
    const sessionStats = analyzer.getSessionStats();
    const tokenBurnStats = analyzer.getTokenBurnStats();
    const projectStats = analyzer.getProjectStats();

    const last30Days = this.getLast30Days();
    const dailyCostMap = this.prepareDailyData(dailyData, last30Days);
    const activeSession = monitor ? monitor.getActiveSession() : null;

    const html = this.generateHTML({
      stats,
      conversationsWithCosts,
      dailyData: dailyCostMap,
      hourlyData,
      toolUsage,
      modelUsage,
      commandUsage,
      errorStats,
      sessionStats,
      tokenBurnStats,
      projectStats,
      activeSession,
      config: this.configManager.config
    });

    const outputPath = path.join(os.tmpdir(), `claude-costs-report-${Date.now()}.html`);
    fs.writeFileSync(outputPath, html);
    return outputPath;
  }

  getLast30Days() {
    const days = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }

    return days;
  }

  prepareDailyData(dailyData, last30Days) {
    const dailyCostMap = {};
    dailyData.forEach(d => {
      dailyCostMap[d.date] = d;
    });

    return last30Days.map(date => ({
      date,
      ...dailyCostMap[date] || { totalCost: 0, totalTokens: 0, conversationCount: 0, conversations: [] }
    }));
  }

  generateHTML(data) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Cost Analysis Dashboard</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com; img-src 'self' data:;">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/date-fns@2.29.3/index.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    ${this.generateStyles()}
</head>
<body class="${data.config.display.theme}">
    <div class="dashboard">
        ${this.generateHeader(data)}
        ${this.generateAlerts(data)}
        ${this.generateSummaryCards(data)}
        ${this.generateActiveSession(data.activeSession)}
        ${this.generateTabNavigation()}
        
        <div class="tab-content">
            <div id="overview-tab" class="tab-pane active">
                ${this.generateDailyCostChart(data)}
                ${this.generateHourlyCostHeatmap(data)}
                ${this.generateTopConversationsChart(data)}
            </div>
            
            <div id="tools-tab" class="tab-pane">
                ${this.generateToolUsageChart(data)}
                ${this.generateToolCostChart(data)}
                ${this.generateCommandUsageTable(data)}
            </div>
            
            <div id="models-tab" class="tab-pane">
                ${this.generateModelUsageChart(data)}
                ${this.generateModelCostDistribution(data)}
            </div>
            
            <div id="sessions-tab" class="tab-pane">
                ${this.generateSessionTimeline(data)}
                ${this.generateTokenBurnChart(data)}
                ${this.generateSessionStats(data)}
            </div>
            
            <div id="projects-tab" class="tab-pane">
                ${this.generateProjectComparison(data)}
                ${this.generateProjectToolMatrix(data)}
            </div>
            
            <div id="conversations-tab" class="tab-pane">
                ${this.generateFilters()}
                ${this.generateConversationTable(data)}
            </div>
            
            <div id="settings-tab" class="tab-pane">
                ${this.generateSettings(data)}
            </div>
        </div>
    </div>
    
    ${this.generateScripts(data)}
</body>
</html>`;
  }

  generateStyles() {
    return `<style>
        :root {
            --primary-color: #007bff;
            --secondary-color: #6c757d;
            --success-color: #28a745;
            --danger-color: #dc3545;
            --warning-color: #ffc107;
            --info-color: #17a2b8;
            --light-bg: #f8f9fa;
            --dark-bg: #343a40;
            --border-color: #dee2e6;
            --text-color: #212529;
            --text-muted: #6c757d;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: var(--light-bg);
            color: var(--text-color);
        }

        body.dark {
            --light-bg: #1a1a1a;
            --dark-bg: #000000;
            --border-color: #333333;
            --text-color: #e9ecef;
            --text-muted: #adb5bd;
            background-color: var(--dark-bg);
        }

        .dashboard {
            max-width: 1600px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
        }

        .header h1 {
            margin: 0;
            font-size: 2.5rem;
            color: var(--primary-color);
        }

        .header .subtitle {
            color: var(--text-muted);
            font-size: 1.1rem;
            margin-top: 10px;
        }

        .alerts {
            margin-bottom: 20px;
        }

        .alert {
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .alert.warning {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
        }

        .alert.critical {
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        }

        body.dark .card {
            background: #2a2a2a;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }

        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
        }

        .card-title {
            font-size: 0.9rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
        }

        .card-icon {
            font-size: 1.5rem;
            opacity: 0.3;
        }

        .card-value {
            font-size: 2rem;
            font-weight: 600;
            margin: 0;
        }

        .card-subtitle {
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-top: 5px;
        }

        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
            border-bottom: 2px solid var(--border-color);
            overflow-x: auto;
        }

        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border: none;
            background: none;
            font-size: 1rem;
            color: var(--text-muted);
            transition: all 0.3s;
            white-space: nowrap;
        }

        .tab:hover {
            color: var(--primary-color);
        }

        .tab.active {
            color: var(--primary-color);
            border-bottom: 3px solid var(--primary-color);
            margin-bottom: -2px;
        }

        .tab-pane {
            display: none;
        }

        .tab-pane.active {
            display: block;
        }

        .chart-container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        body.dark .chart-container {
            background: #2a2a2a;
        }

        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .chart-title {
            font-size: 1.25rem;
            font-weight: 600;
        }

        .chart-actions {
            display: flex;
            gap: 10px;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s;
        }

        .btn-primary {
            background: var(--primary-color);
            color: white;
        }

        .btn-primary:hover {
            background: #0056b3;
        }

        .btn-secondary {
            background: var(--secondary-color);
            color: white;
        }

        .filter-container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        body.dark .filter-container {
            background: #2a2a2a;
        }

        .filter-row {
            display: flex;
            gap: 20px;
            align-items: center;
            flex-wrap: wrap;
        }

        .filter-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .filter-group label {
            font-weight: 500;
        }

        .filter-group select,
        .filter-group input {
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: white;
            color: var(--text-color);
        }

        body.dark .filter-group select,
        body.dark .filter-group input {
            background: #1a1a1a;
            border-color: #444;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th {
            background: var(--light-bg);
            font-weight: 600;
            text-align: left;
            padding: 12px;
            border-bottom: 2px solid var(--border-color);
        }

        td {
            padding: 12px;
            border-bottom: 1px solid var(--border-color);
        }

        tr:hover {
            background: rgba(0,0,0,0.02);
        }

        body.dark tr:hover {
            background: rgba(255,255,255,0.05);
        }

        .active-session {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
            position: relative;
            overflow: hidden;
        }

        .active-session::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 0.8; }
        }

        .session-info {
            position: relative;
            z-index: 1;
        }

        .session-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .session-title {
            font-size: 1.25rem;
            font-weight: 600;
        }

        .session-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
        }

        .session-stat {
            text-align: center;
        }

        .session-stat-value {
            font-size: 1.5rem;
            font-weight: 600;
        }

        .session-stat-label {
            font-size: 0.85rem;
            opacity: 0.8;
        }

        .burn-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-left: 5px;
            animation: blink 1s infinite;
        }

        .burn-indicator.low { background: var(--success-color); }
        .burn-indicator.medium { background: var(--warning-color); }
        .burn-indicator.high { background: var(--danger-color); }

        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .timeline-container {
            position: relative;
            height: 400px;
            overflow-x: auto;
            overflow-y: hidden;
        }

        .settings-section {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        body.dark .settings-section {
            background: #2a2a2a;
        }

        .settings-group {
            margin-bottom: 30px;
        }

        .settings-group h3 {
            margin-bottom: 15px;
            color: var(--primary-color);
        }

        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--border-color);
        }

        .setting-label {
            font-weight: 500;
        }

        .setting-description {
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-top: 5px;
        }

        .toggle {
            position: relative;
            width: 50px;
            height: 25px;
            background: var(--secondary-color);
            border-radius: 25px;
            cursor: pointer;
            transition: background 0.3s;
        }

        .toggle.active {
            background: var(--primary-color);
        }

        .toggle-slider {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 21px;
            height: 21px;
            background: white;
            border-radius: 50%;
            transition: transform 0.3s;
        }

        .toggle.active .toggle-slider {
            transform: translateX(25px);
        }

        @media (max-width: 768px) {
            .summary-cards {
                grid-template-columns: 1fr;
            }
            
            .tabs {
                overflow-x: scroll;
            }
            
            .filter-row {
                flex-direction: column;
                align-items: stretch;
            }
        }
    </style>`;
  }

  generateHeader(data) {
    const lastUpdate = new Date().toLocaleString();
    return `
    <div class="header">
        <h1><i class="fas fa-chart-line"></i> Claude Code Cost Analytics</h1>
        <div class="subtitle">Comprehensive usage analysis and insights</div>
        <div class="subtitle">Last updated: ${lastUpdate}</div>
    </div>`;
  }

  generateAlerts(data) {
    // This would be populated by real-time monitoring
    return `<div class="alerts" id="alerts-container"></div>`;
  }

  generateSummaryCards(data) {
    return `
    <div class="summary-cards">
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Total Cost</h3>
                <i class="fas fa-dollar-sign card-icon"></i>
            </div>
            <p class="card-value">${data.config.display.currencySymbol}${data.stats.totalCost.toFixed(2)}</p>
            <p class="card-subtitle">${data.stats.conversationCount} conversations</p>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Total Tokens</h3>
                <i class="fas fa-coins card-icon"></i>
            </div>
            <p class="card-value">${this.formatNumber(data.stats.totalTokens)}</p>
            <p class="card-subtitle">${this.formatNumber(data.stats.averageTokens)} avg per conversation</p>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Total Time</h3>
                <i class="fas fa-clock card-icon"></i>
            </div>
            <p class="card-value">${this.formatDuration(data.stats.totalDuration)}</p>
            <p class="card-subtitle">${this.formatDuration(data.stats.averageDuration)} avg per session</p>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Error Rate</h3>
                <i class="fas fa-exclamation-triangle card-icon"></i>
            </div>
            <p class="card-value">${(data.errorStats.errorRate * 100).toFixed(1)}%</p>
            <p class="card-subtitle">${data.errorStats.totalErrors} total errors</p>
        </div>
    </div>`;
  }

  generateActiveSession(session) {
    if (!session) {
      return '';
    }

    const burnClass = session.avgBurnRate > 10000 ? 'high' : 
                     session.avgBurnRate > 5000 ? 'medium' : 'low';

    return `
    <div class="active-session">
        <div class="session-info">
            <div class="session-header">
                <h2 class="session-title">
                    <i class="fas fa-circle burn-indicator ${burnClass}"></i>
                    Active Session
                </h2>
                <span>Started ${this.formatRelativeTime(session.startTime)}</span>
            </div>
            <div class="session-stats">
                <div class="session-stat">
                    <div class="session-stat-value">$${session.totalCost.toFixed(4)}</div>
                    <div class="session-stat-label">Current Cost</div>
                </div>
                <div class="session-stat">
                    <div class="session-stat-value">${this.formatNumber(session.totalTokens)}</div>
                    <div class="session-stat-label">Tokens Used</div>
                </div>
                <div class="session-stat">
                    <div class="session-stat-value">${session.avgBurnRate.toFixed(0)}/min</div>
                    <div class="session-stat-label">Token Burn Rate</div>
                </div>
                <div class="session-stat">
                    <div class="session-stat-value">${session.duration.toFixed(0)}m</div>
                    <div class="session-stat-label">Duration</div>
                </div>
            </div>
        </div>
    </div>`;
  }

  generateTabNavigation() {
    return `
    <div class="tabs">
        <button class="tab active" data-tab="overview">
            <i class="fas fa-home"></i> Overview
        </button>
        <button class="tab" data-tab="tools">
            <i class="fas fa-tools"></i> Tool Usage
        </button>
        <button class="tab" data-tab="models">
            <i class="fas fa-brain"></i> Models
        </button>
        <button class="tab" data-tab="sessions">
            <i class="fas fa-user-clock"></i> Sessions
        </button>
        <button class="tab" data-tab="projects">
            <i class="fas fa-folder"></i> Projects
        </button>
        <button class="tab" data-tab="conversations">
            <i class="fas fa-comments"></i> Conversations
        </button>
        <button class="tab" data-tab="settings">
            <i class="fas fa-cog"></i> Settings
        </button>
    </div>`;
  }

  generateDailyCostChart(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Daily Cost Trend</h2>
            <div class="chart-actions">
                <button class="btn btn-secondary" onclick="toggleChartType('dailyChart')">
                    <i class="fas fa-chart-bar"></i>
                </button>
                <button class="btn btn-secondary" onclick="resetZoom('dailyChart')">
                    <i class="fas fa-search-minus"></i> Reset
                </button>
            </div>
        </div>
        <canvas id="dailyChart" height="300"></canvas>
    </div>`;
  }

  generateHourlyCostHeatmap(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Activity Heatmap</h2>
            <p class="text-muted">Cost distribution by hour of day</p>
        </div>
        <canvas id="hourlyHeatmap" height="200"></canvas>
    </div>`;
  }

  generateTopConversationsChart(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Top 20 Most Expensive Conversations</h2>
        </div>
        <canvas id="topConversationsChart" height="400"></canvas>
    </div>`;
  }

  generateToolUsageChart(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Tool Usage Distribution</h2>
        </div>
        <canvas id="toolUsageChart" height="300"></canvas>
    </div>`;
  }

  generateToolCostChart(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Cost by Tool</h2>
        </div>
        <canvas id="toolCostChart" height="300"></canvas>
    </div>`;
  }

  generateCommandUsageTable(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Command Usage</h2>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Command</th>
                    <th>Usage Count</th>
                    <th>Conversations</th>
                </tr>
            </thead>
            <tbody>
                ${data.commandUsage.map(cmd => `
                    <tr>
                        <td><code>/${this.escapeHtml(cmd.command)}</code></td>
                        <td>${cmd.count}</td>
                        <td>${cmd.conversationCount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>`;
  }

  generateModelUsageChart(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Model Usage Distribution</h2>
        </div>
        <canvas id="modelUsageChart" height="300"></canvas>
    </div>`;
  }

  generateModelCostDistribution(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Cost Distribution by Model</h2>
        </div>
        <canvas id="modelCostChart" height="300"></canvas>
    </div>`;
  }

  generateSessionTimeline(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Session Timeline</h2>
            <p class="text-muted">Interactive session explorer</p>
        </div>
        <div class="timeline-container" id="sessionTimeline"></div>
    </div>`;
  }

  generateTokenBurnChart(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Token Burn Rate Analysis</h2>
        </div>
        <canvas id="tokenBurnChart" height="300"></canvas>
    </div>`;
  }

  generateSessionStats(data) {
    const sessionData = data.sessionStats;
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Session Statistics</h2>
        </div>
        <div class="summary-cards">
            <div class="card">
                <h3 class="card-title">Average Duration</h3>
                <p class="card-value">${this.formatDuration(sessionData.averageDuration)}</p>
            </div>
            <div class="card">
                <h3 class="card-title">Longest Session</h3>
                <p class="card-value">${sessionData.longestSession ? this.formatDuration(sessionData.longestSession.duration) : 'N/A'}</p>
                <p class="card-subtitle">${sessionData.longestSession ? sessionData.longestSession.conversationTitle : ''}</p>
            </div>
            <div class="card">
                <h3 class="card-title">Total Sessions</h3>
                <p class="card-value">${sessionData.totalSessions}</p>
            </div>
        </div>
    </div>`;
  }

  generateProjectComparison(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Project Cost Comparison</h2>
        </div>
        <canvas id="projectComparisonChart" height="400"></canvas>
    </div>`;
  }

  generateProjectToolMatrix(data) {
    return `
    <div class="chart-container">
        <div class="chart-header">
            <h2 class="chart-title">Project Tool Usage Matrix</h2>
        </div>
        <canvas id="projectToolMatrix" height="400"></canvas>
    </div>`;
  }

  generateFilters() {
    return `
    <div class="filter-container">
        <div class="filter-row">
            <div class="filter-group">
                <label>Project:</label>
                <select id="projectFilter">
                    <option value="all">All Projects</option>
                </select>
            </div>
            <div class="filter-group">
                <label>Date Range:</label>
                <input type="date" id="startDate">
                <span>to</span>
                <input type="date" id="endDate">
            </div>
            <div class="filter-group">
                <label>Min Cost:</label>
                <input type="number" id="minCost" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="filter-group">
                <button class="btn btn-primary" onclick="applyFilters()">
                    <i class="fas fa-filter"></i> Apply
                </button>
                <button class="btn btn-secondary" onclick="resetFilters()">
                    <i class="fas fa-undo"></i> Reset
                </button>
            </div>
        </div>
    </div>`;
  }

  generateConversationTable(data) {
    return `
    <div class="chart-container">
        <table id="conversationTable">
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Project</th>
                    <th>Cost</th>
                    <th>Tokens</th>
                    <th>Messages</th>
                    <th>Duration</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                ${data.conversationsWithCosts.slice(0, 50).map(conv => `
                    <tr>
                        <td title="${this.escapeHtml(conv.conversationTitle)}">${this.escapeHtml(conv.conversationTitle)}</td>
                        <td>${this.escapeHtml(conv.projectName.replace(/-home-.*?-/, ''))}</td>
                        <td>$${conv.totalCost.toFixed(6)}</td>
                        <td>${this.formatNumber(conv.totalTokens.total)}</td>
                        <td>${conv.messageCount}</td>
                        <td>${this.formatDuration(conv.duration)}</td>
                        <td>${conv.startTime ? conv.startTime.toLocaleDateString() : 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>`;
  }

  generateSettings(data) {
    return `
    <div class="settings-section">
        <div class="settings-group">
            <h3><i class="fas fa-bell"></i> Alert Settings</h3>
            <div class="setting-item">
                <div>
                    <div class="setting-label">Enable Alerts</div>
                    <div class="setting-description">Show alerts for high costs and usage</div>
                </div>
                <div class="toggle ${data.config.alerts.enabled ? 'active' : ''}" onclick="toggleSetting('alerts.enabled', this)">
                    <div class="toggle-slider"></div>
                </div>
            </div>
            <div class="setting-item">
                <div>
                    <div class="setting-label">Daily Cost Threshold</div>
                    <div class="setting-description">Alert when daily cost exceeds this amount</div>
                </div>
                <input type="number" value="${data.config.alerts.dailyCostThreshold}" 
                       onchange="updateSetting('alerts.dailyCostThreshold', this.value)">
            </div>
            <div class="setting-item">
                <div>
                    <div class="setting-label">Token Burn Rate Threshold</div>
                    <div class="setting-description">Alert when burn rate exceeds tokens/minute</div>
                </div>
                <input type="number" value="${data.config.alerts.tokenBurnRateThreshold}" 
                       onchange="updateSetting('alerts.tokenBurnRateThreshold', this.value)">
            </div>
        </div>
        
        <div class="settings-group">
            <h3><i class="fas fa-palette"></i> Display Settings</h3>
            <div class="setting-item">
                <div>
                    <div class="setting-label">Theme</div>
                    <div class="setting-description">Choose light or dark theme</div>
                </div>
                <select onchange="updateTheme(this.value)">
                    <option value="light" ${data.config.display.theme === 'light' ? 'selected' : ''}>Light</option>
                    <option value="dark" ${data.config.display.theme === 'dark' ? 'selected' : ''}>Dark</option>
                </select>
            </div>
            <div class="setting-item">
                <div>
                    <div class="setting-label">Chart Animations</div>
                    <div class="setting-description">Enable smooth chart animations</div>
                </div>
                <div class="toggle ${data.config.display.chartAnimations ? 'active' : ''}" 
                     onclick="toggleSetting('display.chartAnimations', this)">
                    <div class="toggle-slider"></div>
                </div>
            </div>
        </div>
        
        <div class="settings-group">
            <h3><i class="fas fa-file-export"></i> Export Settings</h3>
            <div class="setting-item">
                <button class="btn btn-primary" onclick="exportData('csv')">
                    <i class="fas fa-file-csv"></i> Export CSV
                </button>
                <button class="btn btn-primary" onclick="exportData('json')">
                    <i class="fas fa-file-code"></i> Export JSON
                </button>
                <button class="btn btn-primary" onclick="window.print()">
                    <i class="fas fa-file-pdf"></i> Print/PDF
                </button>
            </div>
        </div>
    </div>`;
  }

  generateScripts(data) {
    return `
    <script>
        // Store data globally
        const dashboardData = ${JSON.stringify({
            stats: data.stats,
            conversationsWithCosts: data.conversationsWithCosts,
            dailyData: data.dailyData,
            hourlyData: data.hourlyData,
            toolUsage: data.toolUsage,
            modelUsage: data.modelUsage,
            tokenBurnStats: data.tokenBurnStats,
            projectStats: data.projectStats,
            config: data.config
        })};

        // Initialize charts
        let charts = {};

        // Security: HTML escape function for dynamic content
        function escapeHtml(unsafe) {
            if (typeof unsafe !== 'string') return '';
            return unsafe
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/\\//g, '&#x2F;');
        }

        document.addEventListener('DOMContentLoaded', function() {
            initializeDashboard();
            setupEventListeners();
            renderAllCharts();
            
            // Start monitoring if enabled
            if (dashboardData.config.monitoring.autoRefresh) {
                startAutoRefresh();
            }
        });

        function initializeDashboard() {
            // Apply theme
            document.body.className = dashboardData.config.display.theme;
            
            // Populate project filter
            const projectFilter = document.getElementById('projectFilter');
            if (projectFilter) {
                const projects = [...new Set(dashboardData.conversationsWithCosts.map(c => c.projectName))];
                projects.forEach(project => {
                    const option = document.createElement('option');
                    option.value = project;
                    option.textContent = project.replace(/-home-.*?-/, '');
                    projectFilter.appendChild(option);
                });
            }
        }

        function setupEventListeners() {
            // Tab switching
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    
                    this.classList.add('active');
                    document.getElementById(this.dataset.tab + '-tab').classList.add('active');
                });
            });
        }

        function renderAllCharts() {
            renderDailyChart();
            renderHourlyHeatmap();
            renderTopConversationsChart();
            renderToolUsageChart();
            renderToolCostChart();
            renderModelUsageChart();
            renderModelCostChart();
            renderTokenBurnChart();
            renderProjectComparisonChart();
            renderProjectToolMatrix();
        }

        function renderDailyChart() {
            const ctx = document.getElementById('dailyChart');
            if (!ctx) return;

            charts.dailyChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dashboardData.dailyData.map(d => d.date),
                    datasets: [{
                        label: 'Daily Cost',
                        data: dashboardData.dailyData.map(d => d.totalCost),
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.1,
                        fill: true
                    }, {
                        label: 'Conversations',
                        data: dashboardData.dailyData.map(d => d.conversationCount),
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.1,
                        fill: true,
                        yAxisID: 'y1',
                        hidden: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        zoom: {
                            zoom: {
                                wheel: {
                                    enabled: true,
                                },
                                pinch: {
                                    enabled: true
                                },
                                mode: 'x',
                            },
                            pan: {
                                enabled: true,
                                mode: 'x',
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if (context.dataset.label === 'Daily Cost') {
                                        return context.dataset.label + ': $' + context.parsed.y.toFixed(4);
                                    }
                                    return context.dataset.label + ': ' + context.parsed.y;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'day'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            display: false,
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });
        }

        function renderHourlyHeatmap() {
            const ctx = document.getElementById('hourlyHeatmap');
            if (!ctx) return;

            const hours = Array.from({length: 24}, (_, i) => i);
            const maxCost = Math.max(...dashboardData.hourlyData.map(h => h.totalCost));

            charts.hourlyHeatmap = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: hours.map(h => h + ':00'),
                    datasets: [{
                        label: 'Total Cost',
                        data: dashboardData.hourlyData.map(h => h.totalCost),
                        backgroundColor: dashboardData.hourlyData.map(h => {
                            const intensity = h.totalCost / maxCost;
                            return \`rgba(75, 192, 192, \${0.2 + intensity * 0.8})\`;
                        })
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const hourData = dashboardData.hourlyData[context.dataIndex];
                                    return [
                                        'Cost: $' + hourData.totalCost.toFixed(4),
                                        'Conversations: ' + hourData.conversationCount,
                                        'Tokens: ' + formatNumber(hourData.totalTokens)
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
        }

        function renderTopConversationsChart() {
            const ctx = document.getElementById('topConversationsChart');
            if (!ctx) return;

            const top20 = dashboardData.conversationsWithCosts.slice(0, 20);

            charts.topConversationsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: top20.map(c => c.conversationTitle.substring(0, 50) + '...'),
                    datasets: [{
                        label: 'Cost',
                        data: top20.map(c => c.totalCost),
                        backgroundColor: 'rgba(54, 162, 235, 0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const conv = top20[context.dataIndex];
                                    return [
                                        'Cost: $' + conv.totalCost.toFixed(6),
                                        'Tokens: ' + formatNumber(conv.totalTokens.total),
                                        'Duration: ' + formatDuration(conv.duration)
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(4);
                                }
                            }
                        }
                    }
                }
            });
        }

        function renderToolUsageChart() {
            const ctx = document.getElementById('toolUsageChart');
            if (!ctx) return;

            charts.toolUsageChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: dashboardData.toolUsage.map(t => t.name),
                    datasets: [{
                        data: dashboardData.toolUsage.map(t => t.totalCount),
                        backgroundColor: generateColors(dashboardData.toolUsage.length)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const tool = dashboardData.toolUsage[context.dataIndex];
                                    const percentage = (tool.totalCount / dashboardData.toolUsage.reduce((sum, t) => sum + t.totalCount, 0) * 100).toFixed(1);
                                    return [
                                        tool.name + ': ' + tool.totalCount + ' uses (' + percentage + '%)',
                                        'Cost: $' + tool.totalCost.toFixed(4)
                                    ];
                                }
                            }
                        }
                    }
                }
            });
        }

        function renderToolCostChart() {
            const ctx = document.getElementById('toolCostChart');
            if (!ctx) return;

            charts.toolCostChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: dashboardData.toolUsage.map(t => t.name),
                    datasets: [{
                        label: 'Total Cost',
                        data: dashboardData.toolUsage.map(t => t.totalCost),
                        backgroundColor: 'rgba(255, 99, 132, 0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
        }

        function renderModelUsageChart() {
            const ctx = document.getElementById('modelUsageChart');
            if (!ctx) return;

            charts.modelUsageChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: dashboardData.modelUsage.map(m => m.model),
                    datasets: [{
                        data: dashboardData.modelUsage.map(m => m.totalCount),
                        backgroundColor: generateColors(dashboardData.modelUsage.length)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }

        function renderModelCostChart() {
            const ctx = document.getElementById('modelCostChart');
            if (!ctx) return;

            charts.modelCostChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: dashboardData.modelUsage.map(m => m.model),
                    datasets: [{
                        label: 'Total Cost',
                        data: dashboardData.modelUsage.map(m => m.totalCost),
                        backgroundColor: 'rgba(153, 102, 255, 0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
        }

        function renderTokenBurnChart() {
            const ctx = document.getElementById('tokenBurnChart');
            if (!ctx) return;

            const burnMoments = dashboardData.tokenBurnStats.highBurnMoments.slice(0, 50);

            charts.tokenBurnChart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Token Burn Rate',
                        data: burnMoments.map((b, i) => ({
                            x: i,
                            y: b.rate,
                            title: b.conversationTitle
                        })),
                        backgroundColor: burnMoments.map(b => 
                            b.rate > 10000 ? 'rgba(255, 99, 132, 0.8)' :
                            b.rate > 5000 ? 'rgba(255, 206, 86, 0.8)' :
                            'rgba(75, 192, 192, 0.8)'
                        )
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const burn = burnMoments[context.dataIndex];
                                    return [
                                        'Rate: ' + burn.rate.toFixed(0) + ' tokens/min',
                                        'Tokens: ' + burn.tokens,
                                        'Cost: $' + burn.cost.toFixed(4),
                                        'Conversation: ' + burn.conversationTitle.substring(0, 50) + '...'
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: false
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Tokens per Minute'
                            }
                        }
                    }
                }
            });
        }

        function renderProjectComparisonChart() {
            const ctx = document.getElementById('projectComparisonChart');
            if (!ctx) return;

            const top10Projects = dashboardData.projectStats.slice(0, 10);

            charts.projectComparisonChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: top10Projects.map(p => p.name.replace(/-home-.*?-/, '')),
                    datasets: [{
                        label: 'Total Cost',
                        data: top10Projects.map(p => p.totalCost),
                        backgroundColor: 'rgba(54, 162, 235, 0.8)'
                    }, {
                        label: 'Conversations',
                        data: top10Projects.map(p => p.conversationCount),
                        backgroundColor: 'rgba(255, 99, 132, 0.8)',
                        yAxisID: 'y1',
                        hidden: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toFixed(2);
                                }
                            }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            display: false,
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });
        }

        function renderProjectToolMatrix() {
            const ctx = document.getElementById('projectToolMatrix');
            if (!ctx) return;

            // Prepare matrix data
            const projects = dashboardData.projectStats.slice(0, 10);
            const allTools = [...new Set(projects.flatMap(p => Object.keys(p.toolUsage)))];
            
            const datasets = allTools.map((tool, i) => ({
                label: tool,
                data: projects.map(p => p.toolUsage[tool]?.count || 0),
                backgroundColor: generateColors(allTools.length)[i]
            }));

            charts.projectToolMatrix = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: projects.map(p => p.name.replace(/-home-.*?-/, '')),
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            stacked: true
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'right'
                        }
                    }
                }
            });
        }

        // Utility functions
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
                return minutes.toFixed(0) + 'm';
            } else if (minutes < 1440) {
                return (minutes / 60).toFixed(1) + 'h';
            } else {
                return (minutes / 1440).toFixed(1) + 'd';
            }
        }

        function formatRelativeTime(date) {
            const now = new Date();
            const diff = now - date;
            const minutes = Math.floor(diff / 60000);
            
            if (minutes < 1) return 'just now';
            if (minutes < 60) return minutes + ' minutes ago';
            if (minutes < 1440) return Math.floor(minutes / 60) + ' hours ago';
            return Math.floor(minutes / 1440) + ' days ago';
        }

        function generateColors(count) {
            const colors = [];
            for (let i = 0; i < count; i++) {
                const hue = (i * 360 / count) % 360;
                colors.push(\`hsla(\${hue}, 70%, 60%, 0.8)\`);
            }
            return colors;
        }

        function toggleChartType(chartId) {
            const chart = charts[chartId];
            if (!chart) return;
            
            const currentType = chart.config.type;
            const newType = currentType === 'line' ? 'bar' : 'line';
            
            chart.config.type = newType;
            chart.update();
        }

        function resetZoom(chartId) {
            const chart = charts[chartId];
            if (chart && chart.resetZoom) {
                chart.resetZoom();
            }
        }

        function applyFilters() {
            // Implementation for filtering conversations
            const project = document.getElementById('projectFilter').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const minCost = parseFloat(document.getElementById('minCost').value) || 0;
            
            let filtered = dashboardData.conversationsWithCosts;
            
            if (project !== 'all') {
                filtered = filtered.filter(c => c.projectName === project);
            }
            
            if (startDate) {
                filtered = filtered.filter(c => c.startTime >= new Date(startDate));
            }
            
            if (endDate) {
                filtered = filtered.filter(c => c.startTime <= new Date(endDate));
            }
            
            if (minCost > 0) {
                filtered = filtered.filter(c => c.totalCost >= minCost);
            }
            
            updateConversationTable(filtered);
        }

        function resetFilters() {
            document.getElementById('projectFilter').value = 'all';
            document.getElementById('startDate').value = '';
            document.getElementById('endDate').value = '';
            document.getElementById('minCost').value = '';
            
            updateConversationTable(dashboardData.conversationsWithCosts);
        }

        function updateConversationTable(conversations) {
            const tbody = document.querySelector('#conversationTable tbody');
            tbody.innerHTML = conversations.slice(0, 50).map(conv => \`
                <tr>
                    <td title="\${escapeHtml(conv.conversationTitle)}">\${escapeHtml(conv.conversationTitle)}</td>
                    <td>\${escapeHtml(conv.projectName.replace(/-home-.*?-/, ''))}</td>
                    <td>$\${conv.totalCost.toFixed(6)}</td>
                    <td>\${formatNumber(conv.totalTokens.total)}</td>
                    <td>\${conv.messageCount}</td>
                    <td>\${formatDuration(conv.duration)}</td>
                    <td>\${conv.startTime ? conv.startTime.toLocaleDateString() : 'N/A'}</td>
                </tr>
            \`).join('');
        }

        function updateTheme(theme) {
            document.body.className = theme;
            // Update config
            updateSetting('display.theme', theme);
        }

        function toggleSetting(key, element) {
            const isActive = element.classList.contains('active');
            element.classList.toggle('active');
            updateSetting(key, !isActive);
        }

        function updateSetting(key, value) {
            // In a real implementation, this would update the config file
            console.log('Update setting:', key, value);
        }

        function exportData(format) {
            if (format === 'csv') {
                exportCSV();
            } else if (format === 'json') {
                exportJSON();
            }
        }

        function exportCSV() {
            const headers = ['Title', 'Project', 'Cost', 'Tokens', 'Messages', 'Duration', 'Date'];
            const rows = dashboardData.conversationsWithCosts.map(c => [
                c.conversationTitle,
                c.projectName,
                c.totalCost.toFixed(6),
                c.totalTokens.total,
                c.messageCount,
                c.duration.toFixed(1),
                c.startTime ? c.startTime.toISOString() : ''
            ]);
            
            const csv = [headers, ...rows].map(row => row.map(cell => \`"\${cell}"\`).join(',')).join('\\n');
            downloadFile(csv, 'claude-costs-export.csv', 'text/csv');
        }

        function exportJSON() {
            const json = JSON.stringify(dashboardData, null, 2);
            downloadFile(json, 'claude-costs-export.json', 'application/json');
        }

        function downloadFile(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function startAutoRefresh() {
            const interval = dashboardData.config.monitoring.refreshInterval * 1000;
            setInterval(() => {
                // In a real implementation, this would fetch updated data
                console.log('Auto-refresh triggered');
            }, interval);
        }
    </script>`;
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
  }

  formatDuration(minutes) {
    if (minutes < 60) {
      return minutes.toFixed(0) + 'm';
    } else if (minutes < 1440) {
      return (minutes / 60).toFixed(1) + 'h';
    } else {
      return (minutes / 1440).toFixed(1) + 'd';
    }
  }

  formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' minutes ago';
    if (minutes < 1440) return Math.floor(minutes / 60) + ' hours ago';
    return Math.floor(minutes / 1440) + ' days ago';
  }
}

module.exports = ReportVisualizer;