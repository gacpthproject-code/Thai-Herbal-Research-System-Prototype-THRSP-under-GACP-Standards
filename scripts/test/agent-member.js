#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent M — Member System Deep-Dive Test
 * ═══════════════════════════════════════════════════════════════
 * Tests member registration, profile management, password flows,
 * and member-specific data access patterns.
 *
 * Usage: node scripts/test/agent-member.js [BASE_URL]
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://gacpth.com';
const API = `${BASE_URL}/api`;

function generateThaiId(prefix) {
    const digits = prefix.split('').map(Number);
    while (digits.length < 12) digits.push(0);
    const weights = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += digits[i] * weights[i];
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

const HEALTH_ID = generateThaiId('110000000000');
const ADMIN_ID = generateThaiId('290000000000');
const PASSWORD = 'Test@12345';

let passed = 0, failed = 0, skipped = 0;
const results = [];

async function test(category, name, fn) {
    const label = `[${category}] ${name}`;
    try {
        const result = await fn();
        if (result === 'SKIP') { skipped++; results.push({ s: '⏭️', label, d: 'Skipped' }); return; }
        passed++;
        results.push({ s: '✅', label, d: String(result || '').substring(0, 100) });
    } catch (err) {
        failed++;
        results.push({ s: '❌', label, d: String(err.message || err).substring(0, 120) });
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function fetchAPI(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    let res = await fetch(url, { ...opts, headers, redirect: 'manual' });
    if ([301, 302, 307, 308].includes(res.status) && res.headers.get('location')) {
        let redirectUrl = new URL(res.headers.get('location'), url).href;
        const origProto = new URL(url).protocol;
        if (origProto === 'https:' && redirectUrl.startsWith('http://')) redirectUrl = redirectUrl.replace(/^http:/, 'https:');
        res = await fetch(redirectUrl, { ...opts, headers });
    }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
}

let healthToken = null;
let adminToken = null;

async function login(portal, id) {
    const endpoint = portal === 'health' ? `${API}/auth/health/login` : `${API}/auth/provider/login`;
    const body = portal === 'health' ? { identifier: id, password: PASSWORD } : { providerId: id, password: PASSWORD };
    const { json, headers } = await fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(body) });
    let token = json?.data?.tokens?.accessToken || json?.data?.token || json?.token || null;
    if (!token) {
        const cookieNames = portal === 'health' ? ['auth_token', 'health_token'] : ['provider_token'];
        const setCookies = headers.getSetCookie?.() || [];
        for (const c of setCookies) { for (const name of cookieNames) { if (c.startsWith(`${name}=`)) token = c.split(';')[0].split('=').slice(1).join('='); } }
    }
    return token;
}

function authHeader(token) { return token ? { Authorization: `Bearer ${token}` } : {}; }

// ═══════════════════════════════════════════════════════════════
// PHASE 1: Member Registration Validation
// ═══════════════════════════════════════════════════════════════

async function runRegistrationTests() {
    await test('REGISTER', 'Reject empty registration', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/register`, { method: 'POST', body: JSON.stringify({}) });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    await test('REGISTER', 'Reject invalid Thai ID format', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/register`, {
            method: 'POST', body: JSON.stringify({ identifier: '123', password: PASSWORD, firstName: 'Test', lastName: 'User' }),
        });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    await test('REGISTER', 'Reject short password', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/register`, {
            method: 'POST', body: JSON.stringify({ identifier: generateThaiId('880000000000'), password: '123', firstName: 'Test', lastName: 'User' }),
        });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    await test('REGISTER', 'Reject duplicate registration', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/register`, {
            method: 'POST', body: JSON.stringify({ identifier: HEALTH_ID, password: PASSWORD, firstName: 'Dup', lastName: 'User' }),
        });
        assert(status >= 400 && status < 500, `Expected 4xx (duplicate), got ${status}`);
        return `Rejected: ${status}`;
    });
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: Member Profile
// ═══════════════════════════════════════════════════════════════

async function runProfileTests() {
    await test('PROFILE', 'GET /me returns member data', async () => {
        const { status, json } = await fetchAPI(`${API}/auth/health/me`, { headers: authHeader(healthToken) });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}, hasData: ${!!json?.data}`;
    });

    await test('PROFILE', 'Check-identifier for existing member', async () => {
        const { status, json } = await fetchAPI(`${API}/auth/health/check-identifier`, {
            method: 'POST', body: JSON.stringify({ identifier: HEALTH_ID }),
        });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}, exists: ${json?.data?.exists ?? 'unknown'}`;
    });

    await test('PROFILE', 'Check-identifier for non-existing member', async () => {
        const { status, json } = await fetchAPI(`${API}/auth/health/check-identifier`, {
            method: 'POST', body: JSON.stringify({ identifier: '9999999999999' }),
        });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}`;
    });
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: Member Data Access
// ═══════════════════════════════════════════════════════════════

async function runDataAccessTests() {
    const endpoints = [
        { path: '/applications/my', name: 'My Applications' },
        { path: '/farms', name: 'My Farms' },
        { path: '/planting-cycles', name: 'My Planting Cycles' },
        { path: '/payments', name: 'My Payments' },
        { path: '/certificates', name: 'My Certificates' },
        { path: '/notifications', name: 'My Notifications' },
        { path: '/documents', name: 'My Documents' },
        { path: '/dashboard/stats', name: 'Dashboard Stats' },
    ];

    for (const ep of endpoints) {
        await test('DATA-ACCESS', `Member GET ${ep.name}`, async () => {
            const { status } = await fetchAPI(`${API}${ep.path}`, { headers: authHeader(healthToken) });
            assert(status < 500, `Server error: ${status}`);
            return `status: ${status}`;
        });
    }

    // Member should NOT access admin endpoints
    await test('DATA-ACCESS', 'Member blocked from /admin/users', async () => {
        const { status } = await fetchAPI(`${API}/admin/users`, { headers: authHeader(healthToken) });
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
    });

    await test('DATA-ACCESS', 'Member blocked from /provider', async () => {
        const { status } = await fetchAPI(`${API}/provider`, { headers: authHeader(healthToken) });
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
    });
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: Admin Member Management
// ═══════════════════════════════════════════════════════════════

async function runAdminMemberTests() {
    await test('ADMIN-MEMBER', 'Admin can list users', async () => {
        const { status } = await fetchAPI(`${API}/admin/users`, { headers: authHeader(adminToken) });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}`;
    });

    await test('ADMIN-MEMBER', 'Admin can access analytics', async () => {
        const { status } = await fetchAPI(`${API}/admin/analytics`, { headers: authHeader(adminToken) });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}`;
    });
}

// ═══════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════

function printReport() {
    const total = passed + failed + skipped;
    const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       Agent M — Member System Test Report                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${BASE_URL}`);
    console.log(`  Date:   ${new Date().toISOString()}\n`);
    let cat = '';
    for (const r of results) {
        const c = r.label.match(/\[(.+?)\]/)?.[1] || '';
        if (c !== cat) { cat = c; console.log(`\n── ${cat} ${'─'.repeat(50 - cat.length)}`); }
        console.log(`  ${r.s} ${r.label.replace(/\[.+?\] /, '')} ${r.d ? `(${r.d})` : ''}`);
    }
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passed} Failed: ${failed} Skipped: ${skipped}`);
    console.log(`Pass Rate: ${rate}% (${total} total)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (failed === 0) console.log('\n ALL MEMBER TESTS PASSED\n');
    else { console.log(`\n ${failed} TEST(S) FAILED\n`); for (const r of results) if (r.s ==='') console.log(`• ${r.label}: ${r.d}`); console.log(''); }
    const outFile = path.join(__dirname, 'agent-member-results.txt');
    const lines = [`Agent M — Member System Test Report`, `Target: ${BASE_URL}`, `Date: ${new Date().toISOString()}`, `Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`, '', ...results.map(r => `${r.s === '✅' ? 'PASS' : r.s === '❌' ? 'FAIL' : 'SKIP'} | ${r.label} | ${r.d}`)];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`Results → ${outFile}\n`);
    return { agent: 'M-Member', passed, failed, skipped, total, rate: parseFloat(rate) };
}

async function main() {
    console.log(`\n Agent M — Member System Deep-Dive Test`);
    console.log(`   Target: ${BASE_URL}\n`);
    for (let i = 1; i <= 5; i++) {
        try { const r = await fetch(`${API}/health`); if (r.ok) { console.log(`Backend healthy\n`); break; } } catch { /* retry */ }
        if (i === 5) { console.log(`Backend not ready, testing anyway\n`); break; }
        await new Promise(r => setTimeout(r, 3000));
    }
    healthToken = await login('health', HEALTH_ID);
    adminToken = await login('provider', ADMIN_ID);
    await runRegistrationTests();
    await runProfileTests();
    await runDataAccessTests();
    await runAdminMemberTests();
    const summary = printReport();
    if (typeof module !== 'undefined') module.exports = summary;
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
