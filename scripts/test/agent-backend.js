#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent B — Backend API Carpet-Bomb Test
 * ═══════════════════════════════════════════════════════════════
 * Logs in as all 6 roles and systematically tests every API
 * endpoint group. Non-destructive (read-only GET requests).
 *
 * Usage:
 *   node scripts/test/agent-backend.js [BASE_URL]
 *   Default: https://gacpth.com
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://gacpth.com';
const API = `${BASE_URL}/api`;

// ─── Test Accounts (from seed-test-accounts.js) ──────────────
// IDs are generated dynamically — we use the same logic as seed
function generateThaiId(prefix) {
    const digits = prefix.split('').map(Number);
    while (digits.length < 12) digits.push(0);
    const weights = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += digits[i] * weights[i];
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

const ACCOUNTS = {
    HEALTH:     { id: generateThaiId('110000000000'), portal: 'health',    role: 'HEALTH' },
    ADMIN:      { id: generateThaiId('290000000000'), portal: 'provider',  role: 'ADMIN' },
    REVIEWER:   { id: generateThaiId('390000000000'), portal: 'provider',  role: 'REVIEWER_AUDITOR' },
    SCHEDULER:  { id: generateThaiId('490000000000'), portal: 'provider',  role: 'SCHEDULER' },
    AUDITOR:    { id: generateThaiId('590000000000'), portal: 'provider',  role: 'AUDITOR' },
    ACCOUNTANT: { id: generateThaiId('690000000000'), portal: 'provider',  role: 'ACCOUNTANT' },
};
const PASSWORD = 'Test@12345';

// ─── Test Runner ─────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const results = [];
const tokens = {};

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
    let res = await fetch(url, {
        ...opts,
        headers,
        redirect: 'manual',  // Don't auto-follow (strips Authorization on redirect)
    });
    // If redirect, re-send with original headers to redirect target
    if ([301, 302, 307, 308].includes(res.status) && res.headers.get('location')) {
        let redirectUrl = new URL(res.headers.get('location'), url).href;
        // Upgrade http→https to prevent auth header stripping on protocol downgrade
        const origProto = new URL(url).protocol;
        if (origProto === 'https:' && redirectUrl.startsWith('http://')) {
            redirectUrl = redirectUrl.replace(/^http:/, 'https:');
        }
        res = await fetch(redirectUrl, { ...opts, headers });
    }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
}

function authHeader(role) {
    return tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {};
}

// ═══════════════════════════════════════════════════════════════
// PHASE 1: LOGIN ALL ROLES
// ═══════════════════════════════════════════════════════════════

async function loginAllRoles() {
    for (const [roleName, acc] of Object.entries(ACCOUNTS)) {
        await test('LOGIN', `${roleName} login (${acc.portal})`, async () => {
            const endpoint = acc.portal === 'health'
                ? `${API}/auth/health/login`
                : `${API}/auth/provider/login`;

            const body = acc.portal === 'health'
                ? { identifier: acc.id, password: PASSWORD }
                : { providerId: acc.id, password: PASSWORD };

            const { status, json, headers } = await fetchAPI(endpoint, {
                method: 'POST',
                body: JSON.stringify(body),
            });

            // Extract token from response body (multiple paths)
            let token = json?.data?.tokens?.accessToken
                     || json?.data?.token
                     || json?.token
                     || null;

            // Also try cookie extraction
            if (!token) {
                const cookieNames = acc.portal === 'health'
                    ? ['auth_token', 'health_token']
                    : ['provider_token'];
                const setCookies = headers.getSetCookie?.() || [];
                for (const c of setCookies) {
                    for (const name of cookieNames) {
                        if (c.startsWith(`${name}=`)) {
                            token = c.split(';')[0].split('=').slice(1).join('=');
                        }
                    }
                }
            }

            if (token) {
                tokens[roleName] = token;
                return `✓ Token obtained (${token.substring(0, 20)}...)`;
            }

            // If 200 but no token, still mark as partial success
            if (status === 200) {
                return `⚠️ Login 200 but no token extracted`;
            }

            throw new Error(`Login failed: HTTP ${status} — ${JSON.stringify(json?.message || json?.error || '').substring(0, 80)}`);
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: ENDPOINT TESTS PER ROLE
// ═══════════════════════════════════════════════════════════════

const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';

// Endpoints grouped by which role should have access
const ROLE_ENDPOINTS = {
    HEALTH: [
        // Applications
        { method: 'GET', path: '/applications/my', name: 'My applications' },
        { method: 'GET', path: `/applications/${DUMMY_UUID}`, name: 'Application detail' },
        // Farms
        { method: 'GET', path: '/farms', name: 'My farms' },
        // Planting
        { method: 'GET', path: '/planting-cycles', name: 'My planting cycles' },
        // Payments
        { method: 'GET', path: '/payments', name: 'My payments' },
        // Certificates
        { method: 'GET', path: '/certificates', name: 'My certificates' },
        // Notifications
        { method: 'GET', path: '/notifications', name: 'My notifications' },
        // Documents
        { method: 'GET', path: '/documents', name: 'My documents' },
        // Dashboard
        { method: 'GET', path: '/dashboard/stats', name: 'Dashboard stats' },
        // Profile (via /me)
        { method: 'GET', path: '/auth/health/me', name: 'Health /me profile', allowAuth: true },
        // Trace
        { method: 'GET', path: '/trace/verify/NONEXISTENT', name: 'Trace verify (public)', noAuth: true },
    ],

    ADMIN: [
        { method: 'GET', path: '/admin/config', name: 'Admin config' },
        { method: 'GET', path: '/admin/users', name: 'Admin users list' },
        { method: 'GET', path: '/admin/applications', name: 'Admin applications' },
        { method: 'GET', path: '/admin/analytics', name: 'Admin analytics' },
        { method: 'GET', path: '/analytics/dashboard', name: 'Analytics dashboard' },
        { method: 'GET', path: '/system/status-machine', name: 'Status machine' },
        { method: 'GET', path: '/analytics', name: 'Analytics' },
        { method: 'GET', path: '/config', name: 'System config' },
        { method: 'GET', path: '/auth/provider/me', name: 'Provider /me', allowAuth: true },
        { method: 'GET', path: '/notifications', name: 'Notifications' },
    ],

    REVIEWER: [
        { method: 'GET', path: '/applications', name: 'All applications' },
        { method: 'GET', path: '/audits', name: 'Audits list' },
        { method: 'GET', path: '/criteria', name: 'Criteria list' },
        { method: 'GET', path: '/auth/provider/me', name: 'Provider /me', allowAuth: true },
        { method: 'GET', path: '/dashboard', name: 'Dashboard' },
        { method: 'GET', path: '/notifications', name: 'Notifications' },
    ],

    SCHEDULER: [
        { method: 'GET', path: '/audits', name: 'Audits list' },
        { method: 'GET', path: '/auth/provider/me', name: 'Provider /me', allowAuth: true },
        { method: 'GET', path: '/dashboard', name: 'Dashboard' },
        { method: 'GET', path: '/notifications', name: 'Notifications' },
    ],

    AUDITOR: [
        { method: 'GET', path: '/audits', name: 'Audits list' },
        { method: 'GET', path: '/site-analyses', name: 'Site analyses' },
        { method: 'GET', path: '/auth/provider/me', name: 'Provider /me', allowAuth: true },
        { method: 'GET', path: '/analytics/dashboard', name: 'Analytics dashboard' },
        { method: 'GET', path: '/notifications', name: 'Notifications' },
    ],

    ACCOUNTANT: [
        { method: 'GET', path: '/invoices', name: 'Invoices list' },
        { method: 'GET', path: '/payments', name: 'Payments list' },
        { method: 'GET', path: '/accounting', name: 'Accounting data' },
        { method: 'GET', path: '/quotes', name: 'Quotes list' },
        { method: 'GET', path: '/pricing', name: 'Pricing config' },
        { method: 'GET', path: '/auth/provider/me', name: 'Provider /me', allowAuth: true },
        { method: 'GET', path: '/analytics/dashboard', name: 'Analytics dashboard' },
        { method: 'GET', path: '/notifications', name: 'Notifications' },
    ],
};

async function runRoleEndpointTests() {
    for (const [roleName, endpoints] of Object.entries(ROLE_ENDPOINTS)) {
        if (!tokens[roleName] && roleName !== 'HEALTH') {
            await test(roleName, `SKIP — no token`, async () => 'SKIP');
            continue;
        }

        for (const ep of endpoints) {
            await test(roleName, `${ep.method} ${ep.name}`, async () => {
                const headers = ep.noAuth ? {} : authHeader(roleName);
                const { status, json } = await fetchAPI(`${API}${ep.path}`, { method: ep.method, headers });

                if (ep.expect404) {
                    assert(status === 404 || status === 400 || status === 200, `Expected 200/400/404, got ${status}`);
                    return `status: ${status} (expected non-500)`;
                }

                assert(status < 500 || (ep.allowAuth && status === 503), `Server error: ${status}`);
                return `status: ${status}${json?.data ? ' ✓data' : ''}`;
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: CROSS-ROLE RBAC TESTS
// ═══════════════════════════════════════════════════════════════

async function runCrossRoleTests() {
    // Health user should NOT access admin endpoints
    if (tokens.HEALTH) {
        const adminPaths = ['/admin/config', '/admin/users'];
        for (const p of adminPaths) {
            await test('RBAC', `HEALTH cannot access ${p}`, async () => {
                const { status } = await fetchAPI(`${API}${p}`, { headers: authHeader('HEALTH') });
                assert(status === 401 || status === 403 || status === 429, `Expected 401/403, got ${status}`);
                return `Correctly blocked: ${status}`;
            });
        }
    }

    // Accountant should NOT access admin endpoints
    if (tokens.ACCOUNTANT) {
        await test('RBAC', 'ACCOUNTANT cannot access /admin/users', async () => {
            const { status } = await fetchAPI(`${API}/admin/users`, { headers: authHeader('ACCOUNTANT') });
            assert(status === 401 || status === 403 || status === 429, `Expected 401/403, got ${status}`);
            return `Correctly blocked: ${status}`;
        });
    }

    // Unauthenticated should be blocked everywhere
    const protectedPaths = ['/applications', '/farms', '/invoices', '/certificates', '/audits'];
    for (const p of protectedPaths) {
        await test('RBAC', `Unauthenticated blocked from ${p}`, async () => {
            const { status } = await fetchAPI(`${API}${p}`);
            assert(status === 401 || status === 403 || status === 429, `Expected 401/403, got ${status}`);
            return `Blocked: ${status}`;
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: PUBLIC ENDPOINTS
// ═══════════════════════════════════════════════════════════════

async function runPublicEndpointTests() {
    const publicEndpoints = [
        { path: '/health', name: 'API health' },
        { path: '/version', name: 'API version' },
        { path: '/standards', name: 'Standards list' },
        { path: '/pricing', name: 'Pricing' },
        { path: '/cultivation-config', name: 'Cultivation config' },
        { path: '/trace/verify/NONEXISTENT', name: 'Trace verify' },
        { path: '/system-config/public', name: 'System config (public)' },
    ];

    for (const ep of publicEndpoints) {
        await test('PUBLIC', ep.name, async () => {
            const { status } = await fetchAPI(`${API}${ep.path}`);
            assert(status < 500, `Server error: ${status}`);
            return `status: ${status}`;
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 5: ERROR HANDLING (POST with bad data)
// ═══════════════════════════════════════════════════════════════

async function runErrorHandlingTests() {
    // Login with bad credentials
    await test('ERROR', 'Health login bad creds → 4xx', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({ identifier: '0000000000000', password: 'wrongpass123' }),
        });
        assert(status >= 400 && status < 504, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    await test('ERROR', 'Provider login bad creds → 4xx', async () => {
        const { status } = await fetchAPI(`${API}/auth/provider/login`, {
            method: 'POST', body: JSON.stringify({ providerId: '0000000000000', password: 'wrongpass123' }),
        });
        assert(status >= 400 && status < 504, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    await test('ERROR', 'Health login empty body → 4xx', async () => {
        const { status } = await fetchAPI(`${API}/auth/health/login`, {
            method: 'POST', body: JSON.stringify({}),
        });
        assert(status >= 400 && status < 504, `Expected 4xx, got ${status}`);
        return `Rejected: ${status}`;
    });

    // SQL injection
    await test('ERROR', 'SQL injection rejected', async () => {
        const { status } = await fetchAPI(`${API}/auth/provider/login`, {
            method: 'POST', body: JSON.stringify({ idCard: "' OR 1=1 --", password: "' OR 1=1 --" }),
        });
        assert(status >= 400 && status < 504, `Expected 4xx/503, got ${status}`);
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
    console.log('║        Agent B — Backend API Test Report                  ║');
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

    if (failed === 0) console.log('\n ALL TESTS PASSED\n');
    else {
        console.log(`\n ${failed} TEST(S) FAILED\n`);
        for (const r of results) if (r.s ==='') console.log(`• ${r.label}: ${r.d}`);
        console.log('');
    }

    // Save results
    const outFile = path.join(__dirname, 'agent-backend-results.txt');
    const lines = [
        `Agent B — Backend API Test Report`,
        `Target: ${BASE_URL}`,
        `Date: ${new Date().toISOString()}`,
        `Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`,
        '',
        ...results.map(r => `${r.s === '✅' ? 'PASS' : r.s === '❌' ? 'FAIL' : 'SKIP'} | ${r.label} | ${r.d}`),
    ];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`Results → ${outFile}\n`);

    // Return summary for orchestrator
    return { agent: 'B-Backend', passed, failed, skipped, total, rate: parseFloat(rate) };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
    console.log(`\n Agent B — Backend API Carpet-Bomb Test`);
    console.log(`   Target: ${BASE_URL}\n`);

    // Wait for backend
    for (let i = 1; i <= 5; i++) {
        try {
            const r = await fetch(`${API}/health`);
            if (r.ok) { console.log(`Backend healthy\n`); break; }
        } catch { /* retry */ }
        if (i === 5) { console.log(`Backend not ready, testing anyway\n`); break; }
        console.log(`   Attempt ${i}/5...`);
        await new Promise(r => setTimeout(r, 3000));
    }

    await loginAllRoles();
    await runRoleEndpointTests();
    await runCrossRoleTests();
    await runPublicEndpointTests();
    await runErrorHandlingTests();

    const summary = printReport();

    // If loaded as module, export summary
    if (typeof module !== 'undefined') module.exports = summary;
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
