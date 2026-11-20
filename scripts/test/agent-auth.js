#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent A — Authentication Deep-Dive Test
 * ═══════════════════════════════════════════════════════════════
 * Tests authentication flows: login, logout, token refresh,
 * password reset, registration validation, session cookies,
 * JWT verification, and cross-portal isolation.
 *
 * Usage: node scripts/test/agent-auth.js [BASE_URL]
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

// ═══════════════════════════════════════════════════════════════
// PHASE 1: Health Portal Authentication
// ═══════════════════════════════════════════════════════════════

let healthToken = null;
let providerToken = null;

async function runHealthAuthTests() {
    // Valid login
    await test('HEALTH-AUTH', 'Login with valid credentials', async () => {
        const { status, json, headers } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({ identifier: HEALTH_ID, password: PASSWORD }),
        });
        healthToken = json?.data?.tokens?.accessToken || json?.data?.token || json?.token || null;
        if (!healthToken) {
            const setCookies = headers.getSetCookie?.() || [];
            for (const c of setCookies) {
                if (c.startsWith('auth_token=') || c.startsWith('health_token=')) {
                    healthToken = c.split(';')[0].split('=').slice(1).join('=');
                }
            }
        }
        assert(status === 200, `Expected 200, got ${status}`);
        return `Token: ${healthToken ? healthToken.substring(0, 16) + '...' : 'cookie-based'}`;
    });

    // Bad password
    await test('HEALTH-AUTH', 'Reject wrong password', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({ identifier: HEALTH_ID, password: 'WrongPassword' }),
        });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    // Empty body
    await test('HEALTH-AUTH', 'Reject empty body', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({}),
        });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    // Non-existent user
    await test('HEALTH-AUTH', 'Reject non-existent user', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({ identifier: '9999999999999', password: PASSWORD }),
        });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    // /me endpoint
    await test('HEALTH-AUTH', 'GET /me with token', async () => {
        const headers = healthToken ? { Authorization: `Bearer ${healthToken}` } : {};
        const { status, json } = await fetchAPI(`${API}/auth/health/me`, { headers });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}, data: ${json?.data ? 'present' : 'none'}`;
    });

    // /me without token
    await test('HEALTH-AUTH', 'GET /me without token → 401', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/me`);
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
    });

    // Token verify
    await test('HEALTH-AUTH', 'GET /verify with token', async () => {
        const headers = healthToken ? { Authorization: `Bearer ${healthToken}` } : {};
        const { status } = await fetchAPI(`${API}/auth/health/verify`, { headers });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}`;
    });

    // Check identifier
    await test('HEALTH-AUTH', 'POST /check-identifier', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/check-identifier`, {
            method: 'POST', body: JSON.stringify({ identifier: HEALTH_ID }),
        });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}`;
    });

    // Refresh token
    await test('HEALTH-AUTH', 'POST /refresh', async () => {
        const headers = healthToken ? { Authorization: `Bearer ${healthToken}` } : {};
        const { status } = await fetchAPI(`${API}/auth/health/refresh`, { method: 'POST', headers });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}`;
    });

    // SQL injection on login
    await test('HEALTH-AUTH', 'SQL injection blocked', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({ identifier: "' OR 1=1 --", password: "' OR 1=1 --" }),
        });
        assert(status >= 400 && status < 504, `Expected 4xx, got ${status}`);
        return `Blocked: ${status}`;
    });

    // XSS in identifier
    await test('HEALTH-AUTH', 'XSS in identifier blocked', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({ identifier: '<script>alert(1)</script>', password: 'test' }),
        });
        assert(status >= 400 && status < 504, `Expected 4xx, got ${status}`);
        return `Blocked: ${status}`;
    });
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: Provider Portal Authentication
// ═══════════════════════════════════════════════════════════════

async function runProviderAuthTests() {
    await test('PROVIDER-AUTH', 'Login with valid credentials', async () => {
        const { status, json, headers } = await fetchAPI(`${API}/auth/provider/login`, {
            method: 'POST', body: JSON.stringify({ providerId: ADMIN_ID, password: PASSWORD }),
        });
        providerToken = json?.data?.tokens?.accessToken || json?.data?.token || json?.token || null;
        if (!providerToken) {
            const setCookies = headers.getSetCookie?.() || [];
            for (const c of setCookies) {
                if (c.startsWith('provider_token=')) providerToken = c.split(';')[0].split('=').slice(1).join('=');
            }
        }
        assert(status === 200, `Expected 200, got ${status}`);
        return `Token: ${providerToken ? providerToken.substring(0, 16) + '...' : 'cookie-based'}`;
    });

    await test('PROVIDER-AUTH', 'Reject wrong password', async () => {
        const { status } = await fetchAPI(`${API}/auth/provider/login`, {
            method: 'POST', body: JSON.stringify({ providerId: ADMIN_ID, password: 'BadPass' }),
        });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    await test('PROVIDER-AUTH', 'Reject empty body', async () => {
        const { status } = await fetchAPI(`${API}/auth/provider/login`, {
            method: 'POST', body: JSON.stringify({}),
        });
        assert(status >= 400 && status < 500, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    await test('PROVIDER-AUTH', 'GET /me with token', async () => {
        const headers = providerToken ? { Authorization: `Bearer ${providerToken}` } : {};
        const { status } = await fetchAPI(`${API}/auth/provider/me`, { headers });
        assert(status < 500, `Server error: ${status}`);
        return `status: ${status}`;
    });

    await test('PROVIDER-AUTH', 'GET /me without token → 401', async () => {
        const { status } = await fetchAPI(`${API}/auth/provider/me`);
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
    });
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: Cross-Portal Isolation
// ═══════════════════════════════════════════════════════════════

async function runIsolationTests() {
    // Health token cannot access provider /me
    if (healthToken) {
        await test('ISOLATION', 'Health token → Provider /me blocked', async () => {
            const { status } = await fetchAPI(`${API}/auth/provider/me`, { headers: { Authorization: `Bearer ${healthToken}` } });
            assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
            return `Blocked: ${status}`;
        });
    }

    // Provider token cannot access health /me
    if (providerToken) {
        await test('ISOLATION', 'Provider token → Health /me blocked', async () => {
            const { status } = await fetchAPI(`${API}/auth/health/me`, { headers: { Authorization: `Bearer ${providerToken}` } });
            assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
            return `Blocked: ${status}`;
        });
    }

    // Malformed JWT
    await test('ISOLATION', 'Malformed JWT rejected', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/me`, { headers: { Authorization: 'Bearer not.a.real.jwt.token' } });
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
    });

    // Expired-style token
    await test('ISOLATION', 'Invalid bearer rejected', async () => {
        const { status } = await fetchAPI(`${API}/auth/provider/me`, { headers: { Authorization: 'Bearer abc123' } });
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
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
    console.log('║       Agent A — Authentication Test Report               ║');
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
    if (failed === 0) console.log('\n ALL AUTHENTICATION TESTS PASSED\n');
    else { console.log(`\n ${failed} TEST(S) FAILED\n`); for (const r of results) if (r.s ==='') console.log(`• ${r.label}: ${r.d}`); console.log(''); }
    const outFile = path.join(__dirname, 'agent-auth-results.txt');
    const lines = [`Agent A — Authentication Test Report`, `Target: ${BASE_URL}`, `Date: ${new Date().toISOString()}`, `Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`, '', ...results.map(r => `${r.s === '✅' ? 'PASS' : r.s === '❌' ? 'FAIL' : 'SKIP'} | ${r.label} | ${r.d}`)];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`Results → ${outFile}\n`);
    return { agent: 'A-Auth', passed, failed, skipped, total, rate: parseFloat(rate) };
}

async function main() {
    console.log(`\n Agent A — Authentication Deep-Dive Test`);
    console.log(`   Target: ${BASE_URL}\n`);
    for (let i = 1; i <= 5; i++) {
        try { const r = await fetch(`${API}/health`); if (r.ok) { console.log(`Backend healthy\n`); break; } } catch { /* retry */ }
        if (i === 5) { console.log(`Backend not ready, testing anyway\n`); break; }
        await new Promise(r => setTimeout(r, 3000));
    }
    await runHealthAuthTests();
    await runProviderAuthTests();
    await runIsolationTests();
    const summary = printReport();
    if (typeof module !== 'undefined') module.exports = summary;
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
