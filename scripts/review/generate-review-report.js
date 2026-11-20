#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * GACP Code Review — HTML Dashboard Generator
 * ═══════════════════════════════════════════════════════════════
 * Reads all agent result JSON files and generates an interactive
 * HTML dashboard with severity breakdown, scores, and findings.
 *
 * Usage: node scripts/review/generate-review-report.js
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const OUTPUT_FILE = path.join(SCRIPT_DIR, 'review-dashboard.html');

const AGENTS = [
  { id: '01', name: 'Code Quality & Readability', file: 'agent-code-quality-results.json', icon: '🔍' },
  { id: '02', name: 'Logic & Flow', file: 'agent-logic-flow-results.json', icon: '🧠' },
  { id: '03', name: 'API Endpoints', file: 'agent-api-endpoint-results.json', icon: '🔌' },
  { id: '04', name: 'System Design & Architecture', file: 'agent-system-design-results.json', icon: '🏗️' },
  { id: '05', name: 'Frontend', file: 'agent-frontend-results.json', icon: '🌐' },
  { id: '06', name: 'Backend', file: 'agent-backend-results.json', icon: '⚙️' },
  { id: '07', name: 'Database', file: 'agent-database-results.json', icon: '🗄️' },
  { id: '08', name: 'Duplicate / Zombie', file: 'agent-duplicate-zombie-results.json', icon: '🧟' },
  { id: '09', name: 'Lint & Debug', file: 'agent-lint-debug-results.json', icon: '🐛' },
  { id: '10', name: 'Sitemap & Flow', file: 'agent-sitemap-flow-results.json', icon: '🗺️' },
];

function loadAgent(filename) {
  const fp = path.join(SCRIPT_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function main() {
  console.log('\n Generating Review Dashboard...');

  const agentData = AGENTS.map(a => ({ ...a, data: loadAgent(a.file) }));
  const totalScore = agentData.filter(a => a.data).reduce((s, a) => s + (a.data.score || 0), 0);
  const agentCount = agentData.filter(a => a.data).length;
  const avgScore = agentCount > 0 ? Math.round(totalScore / agentCount) : 0;

  const totalCritical = agentData.reduce((s, a) => s + (a.data?.summary?.critical || 0), 0);
  const totalWarnings = agentData.reduce((s, a) => s + (a.data?.summary?.warnings || 0), 0);
  const totalInfo = agentData.reduce((s, a) => s + (a.data?.summary?.info || 0), 0);
  const totalFindings = totalCritical + totalWarnings + totalInfo;

  const scoreColor = avgScore >= 80 ? '#22c55e' : avgScore >= 60 ? '#eab308' : '#ef4444';

  // Build agent cards
  const agentCards = agentData.map(a => {
    if (!a.data) return `<div class="card disabled"><h3>${a.icon} ${a.name}</h3><p class="muted">No results</p></div>`;
    const d = a.data;
    const sc = d.score || 0;
    const color = sc >= 80 ? '#22c55e' : sc >= 60 ? '#eab308' : '#ef4444';

    const findingsHtml = (d.findings || [])
      .filter(f => f.severity !== 'info')
      .slice(0, 10)
      .map(f => {
        const icon = f.severity === 'critical' ? '🔴' : '🟡';
        return `<div class="finding ${f.severity}"><span class="icon">${icon}</span><span class="file">${escapeHtml(f.file)}${f.line ? ':' + f.line : ''}</span><span class="msg">${escapeHtml(f.message)}</span></div>`;
      }).join('');

    const rulesHtml = d.byRule
      ? Object.entries(d.byRule).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([rule, count]) => `<span class="rule-tag">${escapeHtml(rule)} <b>${count}</b></span>`).join('')
      : '';

    return `
    <div class="card" id="agent-${a.id}">
      <div class="card-header">
        <h3>${a.icon} ${escapeHtml(a.name)}</h3>
        <div class="score-badge" style="background:${color}">${sc}/100</div>
      </div>
      <div class="stats">
        <span class="stat critical">${d.summary?.critical || 0} critical</span>
        <span class="stat warning">${d.summary?.warnings || 0} warnings</span>
        <span class="stat info">${d.summary?.info || 0} info</span>
      </div>
      <div class="bar-container"><div class="bar" style="width:${sc}%;background:${color}"></div></div>
      ${rulesHtml ? `<div class="rules">${rulesHtml}</div>` : ''}
      ${findingsHtml ? `<details><summary>Top findings</summary><div class="findings">${findingsHtml}</div></details>` : '<p class="muted">No critical/warning issues</p>'}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GACP Code Review Dashboard</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
  .container{max-width:1200px;margin:0 auto;padding:24px}
  header{text-align:center;padding:32px 0;border-bottom:1px solid #1e293b;margin-bottom:32px}
  header h1{font-size:28px;margin-bottom:8px;color:#f8fafc}
  .timestamp{color:#64748b;font-size:13px}
  .overall{display:flex;justify-content:center;gap:32px;margin:24px 0;flex-wrap:wrap}
  .overall-score{width:120px;height:120px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:4px solid ${scoreColor};font-size:32px;font-weight:700;color:${scoreColor}}
  .overall-score span{font-size:12px;color:#94a3b8;font-weight:400}
  .summary-cards{display:flex;gap:16px;flex-wrap:wrap}
  .summary-card{background:#1e293b;border-radius:12px;padding:16px 24px;text-align:center;flex:1;min-width:120px}
  .summary-card .num{font-size:28px;font-weight:700}
  .summary-card .label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px}
  .summary-card.critical .num{color:#ef4444}
  .summary-card.warning .num{color:#eab308}
  .summary-card.info .num{color:#3b82f6}
  .summary-card.total .num{color:#a78bfa}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));gap:20px;margin-top:32px}
  .card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;transition:border-color .2s}
  .card:hover{border-color:#475569}
  .card.disabled{opacity:.4}
  .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .card-header h3{font-size:16px;color:#f1f5f9}
  .score-badge{color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:600}
  .stats{display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap}
  .stat{font-size:12px;padding:2px 8px;border-radius:4px;background:#0f172a}
  .stat.critical{color:#fca5a5}
  .stat.warning{color:#fde047}
  .stat.info{color:#93c5fd}
  .bar-container{height:6px;background:#0f172a;border-radius:3px;margin:8px 0}
  .bar{height:100%;border-radius:3px;transition:width .5s}
  .rules{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
  .rule-tag{font-size:11px;background:#0f172a;border:1px solid #334155;padding:2px 8px;border-radius:4px;color:#94a3b8}
  .rule-tag b{color:#e2e8f0}
  details{margin-top:12px}
  details summary{cursor:pointer;color:#94a3b8;font-size:13px;user-select:none}
  details summary:hover{color:#e2e8f0}
  .findings{margin-top:8px}
  .finding{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #0f172a;font-size:12px;align-items:flex-start}
  .finding .icon{flex-shrink:0}
  .finding .file{color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;flex-shrink:0}
  .finding .msg{color:#cbd5e1}
  .finding.critical .msg{color:#fca5a5}
  .finding.warning .msg{color:#fde047}
  .muted{color:#475569;font-size:13px}
  footer{text-align:center;padding:32px 0;color:#475569;font-size:12px;margin-top:32px;border-top:1px solid #1e293b}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>🤖 GACP Multi-Agent Code Review</h1>
    <p class="timestamp">Generated: ${new Date().toISOString()}</p>
  </header>

  <div class="overall">
    <div class="overall-score">${avgScore}<span>Overall</span></div>
    <div class="summary-cards">
      <div class="summary-card critical"><div class="num">${totalCritical}</div><div class="label">Critical</div></div>
      <div class="summary-card warning"><div class="num">${totalWarnings}</div><div class="label">Warnings</div></div>
      <div class="summary-card info"><div class="num">${totalInfo}</div><div class="label">Info</div></div>
      <div class="summary-card total"><div class="num">${totalFindings}</div><div class="label">Total</div></div>
    </div>
  </div>

  <div class="grid">
    ${agentCards}
  </div>

  <footer>
    GACP Platform — Multi-Agent Code Review System — 10 Agents
  </footer>
</div>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
  console.log(`\n Dashboard → ${OUTPUT_FILE}`);
  console.log(`Overall Score: ${avgScore}/100`);
  console.log(`${totalFindings} total findings (${totalCritical} critical, ${totalWarnings} warnings)\n`);
}

main();
