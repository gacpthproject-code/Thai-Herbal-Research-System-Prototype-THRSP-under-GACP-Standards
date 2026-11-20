#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent P — Performance Benchmark
 * ═══════════════════════════════════════════════════════════════
 * Measures response times for API endpoints and frontend pages.
 * Flags slow responses: <200ms <1s <3s >3s
 *
 * Usage:
 *   node scripts/test/agent-performance.js [BASE_URL]
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://gacpth.com';
const API = `${BASE_URL}/api`;

const PASSWORD = 'Test@12345';
const tokens = {};

// ─── Helpers ────────────────────────────────────────────────
function generateThaiId(prefix) {
    const digits = prefix.split('').map(Number);
    while (digits.length < 12) digits.push(0);
    const weights = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += digits[i] * weights[i];
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

async function timedFetch(url, opts = {}) {
    const start = performance.now();
    try {
        const res = await fetch(url, {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        });
        const elapsed = performance.now() - start;
        return { status: res.status, ms: Math.round(elapsed), ok: true };
    } catch (err) {
        const elapsed = performance.now() - start;
        return { status: 0, ms: Math.round(elapsed), ok: false, error: err.message };
    }
}

function authH(role) {
    return tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {};
}

function speedIcon(ms) {
    if (ms < 200) return '⚡';
    if (ms < 1000) return '✅';
    if (ms < 3000) return '⚠️';
    return '🐌';
}

async function loginAll() {
    const hRes = await timedFetch(`${API}/auth/health/login`, {
        method: 'POST', body: JSON.stringify({ identifier: generateThaiId('110000000000'), password: PASSWORD }),
    });
    try {
        const r = await fetch(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({ identifier: generateThaiId('110000000000'), password: PASSWORD }),
            headers: { 'Content-Type': 'application/json' },
        });
        const j = await r.json();
        tokens.HEALTH = j?.data?.tokens?.accessToken || null;
    } catch {}

    const providerRoles = [
        { key: 'ADMIN', prefix: '290000000000' },
        { key: 'REVIEWER', prefix: '390000000000' },
        { key: 'AUDITOR', prefix: '590000000000' },
        { key: 'ACCOUNTANT', prefix: '690000000000' },
    ];
    for (const r of providerRoles) {
        await new Promise(resolve => setTimeout(resolve, 300));
        try {
            const res = await fetch(`${API}/auth/provider/login`, {
                method: 'POST', body: JSON.stringify({ providerId: generateThaiId(r.prefix), password: PASSWORD }),
                headers: { 'Content-Type': 'application/json' },
            });
            const j = await res.json();
            tokens[r.key] = j?.data?.token || null;
        } catch {}
    }

    const logged = Object.entries(tokens).filter(([,v]) => v).map(([k]) => k);
    console.log(`Tokens: ${logged.join(',')} (${logged.length}/5)\n`);
}

// ─── Benchmark Targets ──────────────────────────────────────
const API_ENDPOINTS = [
    // Public
    { path: '/health', auth: null, label: 'Health' },
    { path: '/version', auth: null, label: 'Version' },
    { path: '/standards', auth: null, label: 'Standards' },
    { path: '/config/document-slots', auth: null, label: 'Config slots' },
    { path: '/config/standards', auth: null, label: 'Config standards' },
    { path: '/config/pricing', auth: null, label: 'Config pricing' },
    { path: '/pricing/fees', auth: null, label: 'Pricing fees' },
    { path: '/system-config/public', auth: null, label: 'System config' },

    // Health user
    { path: '/dashboard', auth: 'HEALTH', label: 'Dashboard' },
    { path: '/dashboard/stats', auth: 'HEALTH', label: 'Dashboard stats' },
    { path: '/dashboard/summary', auth: 'HEALTH', label: 'Dashboard summary' },
    { path: '/applications/my', auth: 'HEALTH', label: 'My applications' },
    { path: '/farms', auth: 'HEALTH', label: 'Farms' },
    { path: '/notifications', auth: 'HEALTH', label: 'Notifications' },

    // Admin
    { path: '/admin/health', auth: 'ADMIN', label: 'Admin health' },
    { path: '/admin/users', auth: 'ADMIN', label: 'Admin users' },
    { path: '/admin/config', auth: 'ADMIN', label: 'Admin config' },
    { path: '/admin/plants', auth: 'ADMIN', label: 'Admin plants' },
    { path: '/certificates', auth: 'ADMIN', label: 'Certificates' },

    // Provider dashboards
    { path: '/provider/admin/dashboard', auth: 'ADMIN', label: 'Admin dashboard' },
    { path: '/provider/reviewer/dashboard', auth: 'REVIEWER', label: 'Reviewer dashboard' },
    { path: '/provider/auditor/dashboard', auth: 'AUDITOR', label: 'Auditor dashboard' },

    // Finance
    { path: '/quotes', auth: 'ACCOUNTANT', label: 'Quotes' },
    { path: '/accounting/dashboard', auth: 'ACCOUNTANT', label: 'Accounting' },

    // Audit/Review
    { path: '/audits', auth: 'AUDITOR', label: 'Audits' },
    { path: '/criteria', auth: 'REVIEWER', label: 'Criteria' },
];

const PAGE_ENDPOINTS = [
    { path: '/', label: 'Homepage' },
    { path: '/login', label: 'Login page' },
    { path: '/provider/login', label: 'Provider login' },
    { path: '/dashboard', label: 'Dashboard page' },
    { path: '/application/new', label: 'New application' },
];

// ─── Run Benchmarks ─────────────────────────────────────────
async function benchmarkAPIs() {
    console.log('── API ENDPOINTS ─────────────────────────────');
    const results = [];

    for (const ep of API_ENDPOINTS) {
        const headers = ep.auth ? authH(ep.auth) : {};
        const r = await timedFetch(`${API}${ep.path}`, { headers });
        const icon = speedIcon(r.ms);
        const pad = ' '.repeat(Math.max(0, 24 - ep.label.length));
        console.log(`  ${icon} ${String(r.ms).padStart(5)}ms  ${ep.label}${pad} [${r.status}]`);
        results.push({ type: 'API', ...ep, ...r });
    }
    return results;
}

async function benchmarkPages() {
    console.log('\n── FRONTEND PAGES ────────────────────────────');
    const results = [];

    for (const pg of PAGE_ENDPOINTS) {
        const r = await timedFetch(`${BASE_URL}${pg.path}`);
        const icon = speedIcon(r.ms);
        const pad = ' '.repeat(Math.max(0, 24 - pg.label.length));
        console.log(`  ${icon} ${String(r.ms).padStart(5)}ms  ${pg.label}${pad} [${r.status}]`);
        results.push({ type: 'PAGE', ...pg, ...r });
    }
    return results;
}

async function benchmarkAuth() {
    console.log('\n── AUTH LATENCY ──────────────────────────────');
    const results = [];

    // Health login
    const h = await timedFetch(`${API}/auth/health/login`, {
        method: 'POST', body: JSON.stringify({ identifier: generateThaiId('110000000000'), password: PASSWORD }),
    });
    console.log(`  ${speedIcon(h.ms)} ${String(h.ms).padStart(5)}ms  Health login          [${h.status}]`);
    results.push({ type: 'AUTH', label: 'Health login', ...h });

    await new Promise(r => setTimeout(r, 500));

    // Provider login
    const p = await timedFetch(`${API}/auth/provider/login`, {
        method: 'POST', body: JSON.stringify({ providerId: generateThaiId('290000000000'), password: PASSWORD }),
    });
    console.log(`  ${speedIcon(p.ms)} ${String(p.ms).padStart(5)}ms  Provider login        [${p.status}]`);
    results.push({ type: 'AUTH', label: 'Provider login', ...p });

    return results;
}

// ─── Report ─────────────────────────────────────────────────
function printReport(allResults) {
    const total = allResults.length;
    const fast = allResults.filter(r => r.ms < 200).length;
    const ok = allResults.filter(r => r.ms >= 200 && r.ms < 1000).length;
    const slow = allResults.filter(r => r.ms >= 1000 && r.ms < 3000).length;
    const critical = allResults.filter(r => r.ms >= 3000).length;

    const avgMs = Math.round(allResults.reduce((s, r) => s + r.ms, 0) / total);
    const maxEntry = allResults.reduce((max, r) => r.ms > max.ms ? r : max, allResults[0]);
    const minEntry = allResults.reduce((min, r) => r.ms < min.ms ? r : min, allResults[0]);
    const p95 = allResults.map(r => r.ms).sort((a, b) => a - b)[Math.floor(total * 0.95)];

    const passCount = fast + ok;
    const failCount = slow + critical;
    const rate = ((passCount / total) * 100).toFixed(1);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     Agent P — Performance Benchmark Report               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`  Target: ${BASE_URL}`);
    console.log(`  Date:   ${new Date().toISOString()}\n`);

    console.log('Response Time Distribution:');
    console.log(`<200ms: ${fast} endpoints`);
    console.log(`<1s: ${ok} endpoints`);
    console.log(`<3s: ${slow} endpoints`);
    console.log(`>3s: ${critical} endpoints`);
    console.log('');
    console.log(`Statistics:`);
    console.log(`    Avg: ${avgMs}ms  |  P95: ${p95}ms`);
    console.log(`    Min: ${minEntry.ms}ms (${minEntry.label})`);
    console.log(`    Max: ${maxEntry.ms}ms (${maxEntry.label})`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passCount} Failed: ${failCount} Skipped: 0`);
    console.log(`Pass Rate: ${rate}% (${total} total)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (failCount === 0) console.log('\n ALL PERFORMANCE CHECKS PASSED');
    else console.log(`\n ${failCount} SLOW ENDPOINT(S) FOUND`);

    if (slow + critical > 0) {
        console.log('\n SLOW ENDPOINTS:');
        for (const r of allResults.filter(r => r.ms >= 1000).sort((a, b) => b.ms - a.ms)) {
            console.log(`    • ${r.ms}ms — ${r.label} [${r.type}]`);
        }
    }

    // Save report
    const outFile = path.join(__dirname, 'agent-performance-results.txt');
    const lines = [
        'Agent P — Performance Benchmark Report',
        `Target: ${BASE_URL}`,
        `Date: ${new Date().toISOString()}`,
        `Pass: ${passCount} | Fail: ${failCount} | Skip: 0 | Rate: ${rate}%`,
        `Avg: ${avgMs}ms | P95: ${p95}ms | Min: ${minEntry.ms}ms | Max: ${maxEntry.ms}ms`,
        '',
        ...allResults.map(r => `${r.ms}ms | ${speedIcon(r.ms)} | [${r.type}] ${r.label} | ${r.status}`),
    ];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`\nResults → ${outFile}\n`);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
    console.log('\n Agent P — Performance Benchmark');
    console.log(`   Target: ${BASE_URL}\n`);

    for (let i = 1; i <= 3; i++) {
        try {
            const r = await fetch(`${API}/health`);
            if (r.ok) { console.log('Backend healthy'); break; }
        } catch { /* retry */ }
        if (i === 3) { console.log('Backend not ready'); break; }
        await new Promise(r => setTimeout(r, 2000));
    }

    await loginAll();

    const apiResults = await benchmarkAPIs();
    const pageResults = await benchmarkPages();
    const authResults = await benchmarkAuth();

    const allResults = [...apiResults, ...pageResults, ...authResults];
    printReport(allResults);

    const critical = allResults.filter(r => r.ms >= 3000).length;
    process.exit(critical > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
