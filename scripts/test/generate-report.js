#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Carpet-Bomb Dashboard — HTML Report Generator
 * ═══════════════════════════════════════════════════════════════
 * Reads agent result files and generates a beautiful HTML dashboard.
 *
 * Usage:
 *   node scripts/test/generate-report.js
 */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;

function parseResultFile(filename) {
    const filepath = path.join(DIR, filename);
    if (!fs.existsSync(filepath)) return null;
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    const header = lines[0] || '';
    const dateLine = lines.find(l => l.startsWith('Date:')) || '';

    // Try standard format: Pass: X | Fail: Y
    const statsLine = lines.find(l => l.includes('Pass:')) || '';
    let pass = 0, fail = 0, skip = 0;

    const passMatch = statsLine.match(/Pass:\s*(\d+)/);
    const failMatch = statsLine.match(/Fail:\s*(\d+)/);
    const skipMatch = statsLine.match(/Skip:\s*(\d+)/);

    if (passMatch) {
        pass = parseInt(passMatch[1]);
        fail = failMatch ? parseInt(failMatch[1]) : 0;
        skip = skipMatch ? parseInt(skipMatch[1]) : 0;
    } else {
        // Agent R format: Working: 34/34 | Missing: 0 | Errors: 0
        const workingLine = lines.find(l => l.includes('Working:')) || '';
        const workingMatch = workingLine.match(/Working:\s*(\d+)\/(\d+)/);
        const missingMatch = workingLine.match(/Missing:\s*(\d+)/);
        if (workingMatch) {
            pass = parseInt(workingMatch[1]);
            fail = parseInt(workingMatch[2]) - pass + (missingMatch ? parseInt(missingMatch[1]) : 0);
        }
    }

    return { header, date: dateLine, pass, fail, skip, total: pass + fail + skip };
}

// Parse time-based results for Agent P
function parsePerformanceFile() {
    const filepath = path.join(DIR, 'agent-performance-results.txt');
    if (!fs.existsSync(filepath)) return null;
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    const statsLine = lines.find(l => l.includes('Avg:')) || '';
    const avgMatch = statsLine.match(/Avg:\s*(\d+)ms/);
    const p95Match = statsLine.match(/P95:\s*(\d+)ms/);

    const testLines = lines.filter(l => /^\d+ms/.test(l));
    const tests = testLines.map(l => {
        const parts = l.split('|').map(s => s.trim());
        const msMatch = parts[0]?.match(/^(\d+)ms/);
        return {
            ms: msMatch ? parseInt(msMatch[1]) : 0,
            icon: parts[1] || '',
            name: parts[2] || '',
            status: parts[3] || '',
        };
    });

    return {
        avg: avgMatch ? parseInt(avgMatch[1]) : 0,
        p95: p95Match ? parseInt(p95Match[1]) : 0,
        tests,
    };
}

const agents = [
    { key: 'B', name: 'Backend API', file: 'agent-backend-results.txt', icon: '🔌', color: '#3b82f6' },
    { key: 'F', name: 'Frontend', file: 'agent-frontend-results.txt', icon: '🌐', color: '#8b5cf6' },
    { key: 'D', name: 'Database', file: 'agent-database-results.txt', icon: '🗄️', color: '#06b6d4' },
    { key: 'R', name: 'Route Doctor', file: 'agent-route-doctor-results.txt', icon: '🩺', color: '#f59e0b' },
    { key: 'S', name: 'Security', file: 'agent-security-results.txt', icon: '🛡️', color: '#ef4444' },
    { key: 'P', name: 'Performance', file: 'agent-performance-results.txt', icon: '⏱️', color: '#10b981' },
    { key: 'E', name: 'Config Audit', file: 'agent-environment-results.txt', icon: '🔍', color: '#f97316' },
];

const agentData = agents.map(a => ({
    ...a,
    data: parseResultFile(a.file),
}));

const totalPass = agentData.reduce((s, a) => s + (a.data?.pass || 0), 0);
const totalFail = agentData.reduce((s, a) => s + (a.data?.fail || 0), 0);
const totalTests = agentData.reduce((s, a) => s + (a.data?.total || 0), 0);
const overallRate = totalTests > 0 ? ((totalPass / totalTests) * 100).toFixed(1) : '0.0';
const perfData = parsePerformanceFile();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GACP Carpet-Bomb Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #e2e8f0;
    min-height: 100vh;
    padding: 2rem;
  }
  .header {
    text-align: center;
    margin-bottom: 2rem;
  }
  .header h1 {
    font-size: 2.5rem;
    font-weight: 800;
    background: linear-gradient(135deg, #34d399, #3b82f6, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0.5rem;
  }
  .header .subtitle {
    color: #94a3b8;
    font-size: 1.1rem;
  }
  .overall {
    display: flex;
    justify-content: center;
    gap: 2rem;
    margin: 2rem 0;
    flex-wrap: wrap;
  }
  .stat-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 1.5rem 2rem;
    text-align: center;
    min-width: 160px;
    backdrop-filter: blur(10px);
  }
  .stat-card .value {
    font-size: 2.5rem;
    font-weight: 800;
    color: #34d399;
  }
  .stat-card .label {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-top: 0.25rem;
  }
  .stat-card.fail .value { color: #f87171; }
  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin: 2rem 0;
  }
  .agent-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 1.5rem;
    transition: transform 0.2s, border-color 0.2s;
  }
  .agent-card:hover {
    transform: translateY(-4px);
    border-color: rgba(255,255,255,0.2);
  }
  .agent-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .agent-icon {
    font-size: 1.5rem;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: rgba(255,255,255,0.05);
  }
  .agent-header h3 { font-size: 1.1rem; font-weight: 600; }
  .agent-header .key { color: #64748b; font-size: 0.85rem; }
  .progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    overflow: hidden;
    margin: 0.75rem 0;
  }
  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .agent-stats {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #94a3b8;
  }
  .agent-stats .rate {
    font-weight: 700;
    color: #34d399;
  }
  .perf-section {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 1.5rem;
    margin: 2rem 0;
  }
  .perf-section h3 {
    margin-bottom: 1rem;
    font-size: 1.2rem;
  }
  .perf-bars {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    height: 120px;
  }
  .perf-bar {
    flex: 1;
    background: linear-gradient(180deg, #34d399, #059669);
    border-radius: 4px 4px 0 0;
    min-width: 8px;
    position: relative;
    transition: opacity 0.2s;
  }
  .perf-bar:hover { opacity: 0.8; }
  .footer {
    text-align: center;
    margin-top: 2rem;
    color: #475569;
    font-size: 0.85rem;
  }
  .timestamp { color: #64748b; font-size: 0.8rem; }
</style>
</head>
<body>
<div class="header">
  <h1>🤖 GACP Carpet-Bomb Dashboard</h1>
  <p class="subtitle">7-Agent Platform Health Report</p>
  <p class="timestamp">${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
</div>

<div class="overall">
  <div class="stat-card">
    <div class="value">${totalPass}/${totalTests}</div>
    <div class="label">Tests Passed</div>
  </div>
  <div class="stat-card">
    <div class="value">${overallRate}%</div>
    <div class="label">Pass Rate</div>
  </div>
  <div class="stat-card${totalFail > 0 ? ' fail' : ''}">
    <div class="value">${totalFail}</div>
    <div class="label">Failures</div>
  </div>
  <div class="stat-card">
    <div class="value">${perfData?.avg || '?'}ms</div>
    <div class="label">Avg Latency</div>
  </div>
  <div class="stat-card">
    <div class="value">7</div>
    <div class="label">Active Agents</div>
  </div>
</div>

<div class="agents-grid">
${agentData.map(a => {
    const d = a.data;
    const rate = d ? ((d.pass / d.total) * 100).toFixed(1) : '0';
    const color = d && d.fail === 0 ? '#34d399' : '#f87171';
    return `
  <div class="agent-card">
    <div class="agent-header">
      <div class="agent-icon">${a.icon}</div>
      <div>
        <h3>${a.name}</h3>
        <span class="key">Agent ${a.key}</span>
      </div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${rate}%; background: ${color};"></div>
    </div>
    <div class="agent-stats">
      <span>${d ? d.pass : 0}/${d ? d.total : 0} passed</span>
      <span class="rate" style="color: ${color}">${rate}%</span>
    </div>
  </div>`;
}).join('')}
</div>

${perfData && perfData.tests.length > 0 ? `
<div class="perf-section">
  <h3>⏱️ Response Time Distribution (Avg: ${perfData.avg}ms | P95: ${perfData.p95}ms)</h3>
  <div class="perf-bars">
    ${perfData.tests.map(t => {
        const h = Math.max(5, Math.min(100, (t.ms / 200) * 100));
        const color = t.ms < 200 ? '#34d399' : t.ms < 1000 ? '#f59e0b' : '#ef4444';
        return `<div class="perf-bar" style="height: ${h}%; background: ${color};" title="${t.name}: ${t.ms}ms"></div>`;
    }).join('')}
  </div>
</div>` : ''}

<div class="footer">
  GACP Carpet-Bomb Test Suite v1.0 — Generated by Agent Dashboard
</div>
</body>
</html>`;

const outFile = path.join(DIR, 'dashboard.html');
fs.writeFileSync(outFile, html, 'utf-8');
console.log(`\n Dashboard generated → ${outFile}`);
console.log(`   Open in browser: file:///${outFile.replace(/\\/g, '/')}\n`);
