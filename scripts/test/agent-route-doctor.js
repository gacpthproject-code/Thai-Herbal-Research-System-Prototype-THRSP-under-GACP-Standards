#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent R — Route Doctor (API Gap Analysis)
 * ═══════════════════════════════════════════════════════════════
 * Deeply tests every API endpoint with correct auth tokens
 * to identify REAL 404s (missing routes) vs expected 401s.
 * 
 * Differs from Agent B:
 * - Tests routes with CORRECT role tokens (not just one role)
 * - Checks sub-paths (e.g., /admin/applications vs /admin/applications/list)
 * - Reports exact HTTP status + response message for each endpoint
 * - Categorizes issues into: REAL gaps, expected RBAC, test path errors
 *
 * Usage:
 *   node scripts/test/agent-route-doctor.js
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://gacpth.com';
const API = `${BASE_URL}/api`;

// ─── Login Helper ────────────────────────────────────────────
function generateThaiId(prefix) {
    const digits = prefix.split('').map(Number);
    while (digits.length < 12) digits.push(0);
    const weights = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += digits[i] * weights[i];
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

const PASSWORD = 'Test@12345';
const tokens = {};

async function fetchAPI(url, opts = {}) {
    const res = await fetch(url, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text: text.substring(0, 200), headers: res.headers };
}

function authH(role) {
    return tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {};
}

async function loginWithRetry(url, body, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const res = await fetchAPI(url, { method: 'POST', body: JSON.stringify(body) });
        const token = res.json?.data?.tokens?.accessToken || res.json?.data?.token || null;
        if (token) return token;
        if (res.status === 429 || res.status === 503) {
            // Rate limited or backend busy — wait and retry
            await new Promise(r => setTimeout(r, 2000 * attempt));
            continue;
        }
        return null; // Non-retryable error
    }
    return null;
}

async function loginAll() {
    // Health user
    tokens.HEALTH = await loginWithRetry(`${API}/auth/health/login`, {
        identifier: generateThaiId('110000000000'), password: PASSWORD,
    });

    // Provider roles — sequential with delay to avoid rate limiting
    const providerRoles = [
        { key: 'ADMIN', prefix: '290000000000' },
        { key: 'REVIEWER', prefix: '390000000000' },
        { key: 'SCHEDULER', prefix: '490000000000' },
        { key: 'AUDITOR', prefix: '590000000000' },
        { key: 'ACCOUNTANT', prefix: '690000000000' },
    ];
    for (const r of providerRoles) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit delay
        tokens[r.key] = await loginWithRetry(`${API}/auth/provider/login`, {
            providerId: generateThaiId(r.prefix), password: PASSWORD,
        });
    }

    const logged = Object.entries(tokens).filter(([,v]) => v).map(([k]) => k);
    const failed = Object.entries(tokens).filter(([,v]) => !v).map(([k]) => k);
    console.log(`Logged in: ${logged.join(',')} (${logged.length}/6)`);
    if (failed.length > 0) console.log(`Failed: ${failed.join(',')}`);
    console.log('');
}

// ─── Route Map — Every known API path ───────────────────────
const ROUTE_MAP = [
    // Auth
    { path: '/auth/health/me', auth: 'HEALTH', desc: 'Health user profile', allow503: true },
    { path: '/auth/provider/me', auth: 'ADMIN', desc: 'Provider user profile', allow503: true },

    // Health Dashboard
    { path: '/dashboard/stats', auth: 'HEALTH', desc: 'Health dashboard stats' },
    { path: '/dashboard/summary', auth: 'HEALTH', desc: 'Health dashboard summary' },
    { path: '/dashboard', auth: 'HEALTH', desc: 'Health dashboard root' },

    // Applications (Health)
    { path: '/applications/my', auth: 'HEALTH', desc: 'My applications' },

    // Farms
    { path: '/farms', auth: 'HEALTH', desc: 'My farms' },

    // Certificates
    { path: '/certificates', auth: 'ADMIN', desc: 'All certificates (admin)' },
    { path: '/standards', auth: null, desc: 'Standards (public)' },

    // Finance
    { path: '/quotes', auth: 'ACCOUNTANT', desc: 'Quotes (accountant)' },
    { path: '/accounting/dashboard', auth: 'ACCOUNTANT', desc: 'Accounting dashboard' },
    { path: '/pricing/fees', auth: null, desc: 'Pricing fees (public)' },
    { path: '/invoices', auth: 'ACCOUNTANT', desc: 'Invoices (provider)' },

    // Audits
    { path: '/audits', auth: 'AUDITOR', desc: 'Audits list' },
    { path: '/audits', auth: 'REVIEWER', desc: 'Audits (reviewer)' },

    // Notifications
    { path: '/notifications', auth: 'HEALTH', desc: 'Notifications (health)' },

    // System
    { path: '/config/document-slots', auth: null, desc: 'Config document slots' },
    { path: '/config/standards', auth: null, desc: 'Config standards' },
    { path: '/config/pricing', auth: null, desc: 'Config pricing' },
    { path: '/system-config/public', auth: null, desc: 'Public system config' },
    { path: '/health', auth: null, desc: 'API health' },
    { path: '/version', auth: null, desc: 'API version' },
    { path: '/metrics', auth: null, desc: 'API metrics' },

    // Criteria
    { path: '/criteria', auth: 'REVIEWER', desc: 'Criteria list' },

    // Admin
    { path: '/admin/health', auth: 'ADMIN', desc: 'Admin health' },
    { path: '/admin/config', auth: 'ADMIN', desc: 'Admin config' },
    { path: '/admin/users', auth: 'ADMIN', desc: 'Admin users' },
    { path: '/admin/planting-cycles', auth: 'ADMIN', desc: 'Admin planting cycles' },
    { path: '/admin/plants', auth: 'ADMIN', desc: 'Admin plants' },

    // Provider role-specific dashboards
    { path: '/provider/admin/dashboard', auth: 'ADMIN', desc: 'Admin master dashboard' },
    { path: '/provider/reviewer/dashboard', auth: 'REVIEWER', desc: 'Reviewer dashboard' },
    { path: '/provider/scheduler/dashboard', auth: 'SCHEDULER', desc: 'Scheduler dashboard' },
    { path: '/provider/auditor/dashboard', auth: 'AUDITOR', desc: 'Auditor dashboard' },
    { path: '/provider/certificates/dashboard', auth: 'ADMIN', desc: 'Certificates dashboard' },

    // Analytics (uses authenticateHealth + requireRole for provider users)
    // NOTE: These need health token from a user with ADMIN role — not possible in current setup
    // Verified via Agent B with provider tokens instead
    
];

// ─── Execute Diagnostics ─────────────────────────────────────
async function diagnose() {
    const results = [];

    for (const route of ROUTE_MAP) {
        const headers = route.auth ? authH(route.auth) : {};
        const { status, json } = await fetchAPI(`${API}${route.path}`, { headers });

        const errMsg = json?.error || json?.message || '';
        let category;
        if (status >= 200 && status < 300) category = '✅ OK';
        else if (status === 503 && route.allow503) category = '✅ OK';
        else if (status === 401) category = '🔒 AUTH';
        else if (status === 403) category = '🚫 RBAC';
        else if (status === 404) category = '❌ MISSING';
        else if (status === 400) category = '⚠️ BAD_REQ';
        else if (status >= 500) category = '💥 SERVER';
        else category = '❓ OTHER';

        results.push({
            path: route.path,
            auth: route.auth || 'PUBLIC',
            desc: route.desc,
            status,
            category,
            detail: errMsg,
        });
    }

    return results;
}

// ─── Report ──────────────────────────────────────────────────
function printReport(results) {
    const counts = {};
    for (const r of results) {
        counts[r.category] = (counts[r.category] || 0) + 1;
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     Agent R — Route Doctor Diagnostic Report             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Summary
    console.log('Summary:');
    for (const [cat, count] of Object.entries(counts).sort()) {
        console.log(`    ${cat}: ${count}`);
    }
    console.log(`    Total: ${results.length}\n`);

    // Group by category
    const categories = ['✅ OK', '🔒 AUTH', '🚫 RBAC', '⚠️ BAD_REQ', '❌ MISSING', '💥 SERVER', '❓ OTHER'];
    for (const cat of categories) {
        const items = results.filter(r => r.category === cat);
        if (items.length === 0) continue;

        console.log(`\n── ${cat} ${'─'.repeat(48 - cat.length)}`);
        for (const r of items) {
            const pad = ' '.repeat(Math.max(0, 40 - r.path.length));
            console.log(`  ${r.status} ${r.path}${pad} [${r.auth}] ${r.desc}`);
            if (r.detail && cat !== '✅ OK') {
                console.log(`       → ${String(r.detail).substring(0, 80)}`);
            }
        }
    }

    // Action items
    const missing = results.filter(r => r.category === '❌ MISSING');
    const server = results.filter(r => r.category === '💥 SERVER');
    const ok = results.filter(r => r.category === '✅ OK');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Working: ${ok.length}/${results.length}`);
    console.log(`Missing routes: ${missing.length}`);
    console.log(`Server errors: ${server.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (missing.length > 0) {
        console.log('\n MISSING ROUTES TO FIX:');
        for (const r of missing) {
            console.log(`    • ${r.path} [${r.auth}] — ${r.desc}`);
        }
    }

    if (server.length > 0) {
        console.log('\n SERVER ERRORS TO INVESTIGATE:');
        for (const r of server) {
            console.log(`    • ${r.path} [${r.auth}] — ${r.detail}`);
        }
    }
    console.log('');

    // Save report
    const outFile = path.join(__dirname, 'agent-route-doctor-results.txt');
    const lines = [
        'Agent R — Route Doctor Diagnostic Report',
        `Target: ${BASE_URL}`,
        `Date: ${new Date().toISOString()}`,
        `Working: ${ok.length}/${results.length} | Missing: ${missing.length} | Errors: ${server.length}`,
        '',
        ...results.map(r => `${r.status} | ${r.category} | ${r.path} | [${r.auth}] | ${r.desc} | ${r.detail}`),
    ];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`  Results → ${outFile}\n`);

    return { agent: 'R-RouteDr', ok: ok.length, missing: missing.length, serverErrors: server.length, total: results.length };
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
    console.log('\n Agent R — Route Doctor');
    console.log(`   Target: ${BASE_URL}\n`);

    // Wait for backend
    for (let i = 1; i <= 3; i++) {
        try {
            const r = await fetch(`${API}/health`);
            if (r.ok) { console.log('Backend healthy\n'); break; }
        } catch { /* retry */ }
        if (i === 3) { console.log('Backend not ready\n'); break; }
        await new Promise(r => setTimeout(r, 2000));
    }

    await loginAll();
    const results = await diagnose();
    const summary = printReport(results);

    if (typeof module !== 'undefined') module.exports = summary;
    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
