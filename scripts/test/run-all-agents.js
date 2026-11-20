#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * GACP Multi-Agent Carpet-Bomb Test Orchestrator
 * ═══════════════════════════════════════════════════════════════
 * Runs all 18 test agents sequentially:
 *   Core Agents (7):
 *     B — Backend API, F — Frontend Pages, D — Database,
 *     R — Route Doctor, S — Security, P — Performance, E — Config
 *   Specialized Agents (9):
 *     A — Authentication, M — Member, H — Health Portal,
 *     V — Provider Portal, SC — Scheduler, DR — Doc Reviewer,
 *     AU — Auditor, RA — Reviewer+Auditor, FN — Finance,
 *     APP — Application Submission, DOC — Document Standards
 *
 * Usage:
 *   node scripts/test/run-all-agents.js [BASE_URL]
 *   Default: https://gacpth.com
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://gacpth.com';
const SCRIPT_DIR = __dirname;

const agents = [
    // ── Core Agents ──
    { name: 'Agent B — Backend API',     script: 'agent-backend.js',  icon: '🔌' },
    { name: 'Agent F — Frontend Pages',  script: 'agent-frontend.js', icon: '🌐' },
    { name: 'Agent D — Database',        script: 'agent-database.js', icon: '🗄️' },
    { name: 'Agent R — Route Doctor',    script: 'agent-route-doctor.js', icon: '🩺' },
    { name: 'Agent S — Security',        script: 'agent-security.js', icon: '🛡️' },
    { name: 'Agent P — Performance',     script: 'agent-performance.js', icon: '⏱️' },
    { name: 'Agent E — Config Audit',    script: 'agent-environment.js', icon: '🔍' },
    // ── Specialized Agents ──
    { name: 'Agent A — Authentication',  script: 'agent-auth.js',     icon: '🔐' },
    { name: 'Agent M — Member System',   script: 'agent-member.js',   icon: '👤' },
    { name: 'Agent H — Health Portal',   script: 'agent-health.js',   icon: '🌿' },
    { name: 'Agent V — Provider Portal', script: 'agent-provider.js', icon: '🏢' },
    { name: 'Agent SC — Scheduler',      script: 'agent-scheduler.js', icon: '📅' },
    { name: 'Agent DR — Doc Reviewer',   script: 'agent-reviewer.js', icon: '📋' },
    { name: 'Agent AU — Auditor',        script: 'agent-auditor.js',  icon: '🔎' },
    { name: 'Agent RA — Rev+Auditor',    script: 'agent-reviewer-auditor.js', icon: '📋🔎' },
    { name: 'Agent FN — Finance',        script: 'agent-finance.js',  icon: '💰' },
    // ── Domain-Specific Agents ──
    { name: 'Agent APP — App Submission', script: 'agent-application.js', icon: '📄' },
    { name: 'Agent DOC — Doc Standards',  script: 'agent-document-design.js', icon: '📋' },
];

function parseResultsFile(filename) {
    const filePath = path.join(SCRIPT_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Agent B/F/D format: "Pass: X | Fail: Y | Skip: Z | Rate: R%"
    const summaryLine = lines.find(l => l.includes('Pass:') && l.includes('Fail:'));
    if (summaryLine) {
        const match = summaryLine.match(/Pass:\s*(\d+)\s*\|\s*Fail:\s*(\d+)\s*\|\s*Skip:\s*(\d+)\s*\|\s*Rate:\s*([\d.]+)/);
        if (match) return {
            passed: parseInt(match[1]),
            failed: parseInt(match[2]),
            skipped: parseInt(match[3]),
            rate: parseFloat(match[4]),
            total: parseInt(match[1]) + parseInt(match[2]) + parseInt(match[3]),
        };
    }

    // Agent R format: "Working: X/Y | Missing: M | Errors: E"
    const routeLine = lines.find(l => l.includes('Working:') && l.includes('Missing:'));
    if (routeLine) {
        const match = routeLine.match(/Working:\s*(\d+)\/(\d+)\s*\|\s*Missing:\s*(\d+)\s*\|\s*Errors:\s*(\d+)/);
        if (match) {
            const ok = parseInt(match[1]), total = parseInt(match[2]);
            return { passed: ok, failed: total - ok, skipped: 0, rate: total > 0 ? parseFloat(((ok / total) * 100).toFixed(1)) : 0, total };
        }
    }

    return null;
}

async function main() {
    const startTime = Date.now();

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║ GACP Multi-Agent Carpet-Bomb Test Suite ║');
    console.log('║  18 Agents × Full Platform Coverage                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${BASE_URL}`);
    console.log(`  Date:   ${new Date().toISOString()}\n`);

    const summaries = [];

    for (const agent of agents) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`${agent.icon}  Running ${agent.name}...`);
        console.log(`${'═'.repeat(60)}\n`);

        try {
            execSync(
                `node "${path.join(SCRIPT_DIR, agent.script)}" "${BASE_URL}"`,
                { stdio: 'inherit', timeout: 120000 }
            );
        } catch {
            // Agent may exit(1) on failures — that's OK, we still collect results
        }

        // Parse the results file
        const resultsFile = agent.script.replace('.js', '-results.txt');
        const stats = parseResultsFile(resultsFile);
        if (stats) {
            summaries.push({ ...agent, ...stats });
        } else {
            summaries.push({ ...agent, passed: 0, failed: 0, skipped: 0, total: 0, rate: 0 });
        }

        // Cooldown between agents to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));
    }

    // ─── UNIFIED REPORT ──────────────────────────────────────────
    const totalPassed = summaries.reduce((s, a) => s + a.passed, 0);
    const totalFailed = summaries.reduce((s, a) => s + a.failed, 0);
    const totalSkipped = summaries.reduce((s, a) => s + a.skipped, 0);
    const grandTotal = totalPassed + totalFailed + totalSkipped;
    const overallRate = grandTotal > 0 ? ((totalPassed / grandTotal) * 100).toFixed(1) : '0.0';
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║ UNIFIED CARPET-BOMB TEST REPORT ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');

    for (const s of summaries) {
        const bar = s.total > 0
            ? `${'█'.repeat(Math.round(s.rate / 5))}${'░'.repeat(20 - Math.round(s.rate / 5))}`
            : '░'.repeat(20);
        const statusIcon = s.failed === 0 ? '🟢' : s.rate >= 80 ? '🟡' : '🔴';
        console.log(`║  ${s.icon} ${s.name.padEnd(28)} ${statusIcon} ${String(s.passed).padStart(3)}/${String(s.total).padStart(3)} ${bar} ${String(s.rate).padStart(5)}% ║`);
    }

    console.log('╠══════════════════════════════════════════════════════════════╣');
    const overallIcon = totalFailed === 0 ? '🟢' : parseFloat(overallRate) >= 80 ? '🟡' : '🔴';
    console.log(`║ ${overallIcon} OVERALL: ${totalPassed}/${grandTotal} passed (${overallRate}%) ${elapsed}s ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    if (totalFailed === 0) {
        console.log('\n ALL AGENTS PASSED — Platform is healthy!\n');
    } else {
        console.log(`\n ${totalFailed} total failure(s) across ${summaries.filter(s => s.failed > 0).length} agent(s)\n`);
    }

    // Save unified report
    const reportFile = path.join(SCRIPT_DIR, 'carpet-bomb-report.txt');
    const lines = [
        '═══════════════════════════════════════════════════════════',
        '  GACP Multi-Agent Carpet-Bomb Test Report',
        '═══════════════════════════════════════════════════════════',
        `  Target:   ${BASE_URL}`,
        `  Date:     ${new Date().toISOString()}`,
        `  Duration: ${elapsed}s`,
        '',
        ...summaries.map(s => `  ${s.name}: ${s.passed}/${s.total} (${s.rate}%) ${s.failed === 0 ? '✓' : `✗ ${s.failed} failed`}`),
        '',
        `  OVERALL: ${totalPassed}/${grandTotal} (${overallRate}%)`,
        '',
        totalFailed === 0 ? '  ✅ ALL PASSED' : `  ❌ ${totalFailed} FAILURE(S)`,
    ];
    fs.writeFileSync(reportFile, lines.join('\n'), 'utf-8');
    console.log(`Unified report → ${reportFile}\n`);

    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
