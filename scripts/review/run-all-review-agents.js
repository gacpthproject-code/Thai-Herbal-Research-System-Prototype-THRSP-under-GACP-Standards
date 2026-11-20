#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * GACP Multi-Agent Code Review Orchestrator
 * ═══════════════════════════════════════════════════════════════
 * Runs all 10 review agents sequentially and produces a unified
 * report with an overall health score.
 *
 * Usage:
 *   node scripts/review/run-all-review-agents.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;

const agents = [
  { name: 'Agent 01 — Code Quality',         script: 'agent-code-quality.js',      results: 'agent-code-quality-results.json',       icon: '🔍' },
  { name: 'Agent 02 — Logic & Flow',         script: 'agent-logic-flow.js',        results: 'agent-logic-flow-results.json',         icon: '🧠' },
  { name: 'Agent 03 — API Endpoints',        script: 'agent-api-endpoint.js',      results: 'agent-api-endpoint-results.json',       icon: '🔌' },
  { name: 'Agent 04 — System Design',        script: 'agent-system-design.js',     results: 'agent-system-design-results.json',      icon: '🏗️' },
  { name: 'Agent 05 — Frontend',             script: 'agent-frontend.js',          results: 'agent-frontend-results.json',           icon: '🌐' },
  { name: 'Agent 06 — Backend',              script: 'agent-backend.js',           results: 'agent-backend-results.json',            icon: '⚙️' },
  { name: 'Agent 07 — Database',             script: 'agent-database.js',          results: 'agent-database-results.json',           icon: '🗄️' },
  { name: 'Agent 08 — Duplicate/Zombie',     script: 'agent-duplicate-zombie.js',  results: 'agent-duplicate-zombie-results.json',   icon: '🧟' },
  { name: 'Agent 09 — Lint & Debug',         script: 'agent-lint-debug.js',        results: 'agent-lint-debug-results.json',         icon: '🐛' },
  { name: 'Agent 10 — Sitemap & Flow',       script: 'agent-sitemap-flow.js',      results: 'agent-sitemap-flow-results.json',       icon: '🗺️' },
];

function loadResults(filename) {
  const filePath = path.join(SCRIPT_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║ GACP Multi-Agent Code Review Suite ║');
  console.log('║  10 Agents × Full Codebase Static Analysis                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Date: ${new Date().toISOString()}\n`);

  const summaries = [];

  for (const agent of agents) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`${agent.icon}  Running ${agent.name}...`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
      execSync(
        `node "${path.join(SCRIPT_DIR, agent.script)}"`,
        { stdio: 'inherit', timeout: 120000 }
      );
    } catch {
      // Agent may error — we still collect results
    }

    const results = loadResults(agent.results);
    if (results) {
      summaries.push({
        ...agent,
        score: results.score || 0,
        critical: results.summary?.critical || 0,
        warnings: results.summary?.warnings || 0,
        info: results.summary?.info || 0,
        total: results.summary?.total || 0,
      });
    } else {
      summaries.push({ ...agent, score: 0, critical: 0, warnings: 0, info: 0, total: 0 });
    }
  }

  // ─── UNIFIED REPORT ──────────────────────────────────────────
  const totalCritical = summaries.reduce((s, a) => s + a.critical, 0);
  const totalWarnings = summaries.reduce((s, a) => s + a.warnings, 0);
  const totalInfo = summaries.reduce((s, a) => s + a.info, 0);
  const totalFindings = summaries.reduce((s, a) => s + a.total, 0);
  const avgScore = summaries.length > 0
    ? Math.round(summaries.reduce((s, a) => s + a.score, 0) / summaries.length)
    : 0;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║ UNIFIED CODE REVIEW REPORT ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  for (const s of summaries) {
    const bar = `${'█'.repeat(Math.round(s.score / 5))}${'░'.repeat(20 - Math.round(s.score / 5))}`;
    const statusIcon = s.score >= 80 ? '🟢' : s.score >= 60 ? '🟡' : '🔴';
    console.log(`║  ${s.icon} ${s.name.padEnd(30)} ${statusIcon} ${bar} ${String(s.score).padStart(3)}/100 ║`);
  }

  console.log('╠══════════════════════════════════════════════════════════════╣');
  const overallIcon = avgScore >= 80 ? '🟢' : avgScore >= 60 ? '🟡' : '🔴';
  console.log(`║  ${overallIcon} OVERALL SCORE: ${avgScore}/100                                  ║`);
  console.log(`║ Critical: ${String(totalCritical).padStart(4)} Warning: ${String(totalWarnings).padStart(4)} Info: ${String(totalInfo).padStart(4)} ║`);
  console.log(`║ Total findings: ${String(totalFindings).padStart(4)} ${elapsed}s ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (totalCritical === 0 && totalWarnings === 0) {
    console.log('\n NO CRITICAL OR WARNING ISSUES — Codebase is clean!\n');
  } else if (totalCritical === 0) {
    console.log(`\n ${totalWarnings} warning(s) found — review recommended\n`);
  } else {
    console.log(`\n ${totalCritical} critical issue(s) and ${totalWarnings} warning(s) — action needed\n`);
  }

  // Save unified report
  const reportFile = path.join(SCRIPT_DIR, 'review-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    duration: `${elapsed}s`,
    overallScore: avgScore,
    summary: { critical: totalCritical, warnings: totalWarnings, info: totalInfo, total: totalFindings },
    agents: summaries.map(s => ({
      name: s.name, score: s.score,
      critical: s.critical, warnings: s.warnings, info: s.info, total: s.total,
    })),
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`  Unified report → ${reportFile}`);

  // Also save text report
  const textFile = path.join(SCRIPT_DIR, 'review-report.txt');
  const textLines = [
    '═══════════════════════════════════════════════════════════',
    '  GACP Multi-Agent Code Review Report',
    '═══════════════════════════════════════════════════════════',
    `  Date:     ${new Date().toISOString()}`,
    `  Duration: ${elapsed}s`,
    '',
    ...summaries.map(s => `  ${s.name}: ${s.score}/100 (${s.critical} critical, ${s.warnings} warnings, ${s.info} info)`),
    '',
    `  OVERALL: ${avgScore}/100`,
    `  Total: ${totalFindings} findings (${totalCritical} critical, ${totalWarnings} warnings, ${totalInfo} info)`,
    '',
    totalCritical === 0 ? '  ✅ NO CRITICAL ISSUES' : `  ❌ ${totalCritical} CRITICAL ISSUE(S)`,
  ];
  fs.writeFileSync(textFile, textLines.join('\n'), 'utf-8');
  console.log(`  Text report   → ${textFile}\n`);

  process.exit(totalCritical > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
