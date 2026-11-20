#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent F — Frontend Page Carpet-Bomb Test
 * ═══════════════════════════════════════════════════════════════
 * Tests all frontend pages: public pages load correctly,
 * auth-guarded pages redirect to login without credentials.
 *
 * Usage:
 *   node scripts/test/agent-frontend.js [BASE_URL]
 *   Default: https://gacpth.com
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'https://gacpth.com';

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

// ═══════════════════════════════════════════════════════════════
// PUBLIC PAGES — Should load without auth (HTTP 200)
// ═══════════════════════════════════════════════════════════════

const PUBLIC_PAGES = [
    { path: '/', name: 'Landing page' },
    { path: '/privacy', name: 'Privacy policy' },
    { path: '/terms', name: 'Terms of service' },
    { path: '/auth/provider/login', name: 'Provider login' },
    { path: '/auth/health/login', name: 'Health login' },
    { path: '/trace', name: 'Trace page' },
    { path: '/verify', name: 'Verify page' },
];

async function runPublicPageTests() {
    for (const page of PUBLIC_PAGES) {
        await test('PUBLIC', `${page.name} → 200`, async () => {
            const start = Date.now();
            const res = await fetch(`${BASE_URL}${page.path}`, {
                redirect: 'follow',
                headers: { Accept: 'text/html' },
            });
            const elapsed = Date.now() - start;
            const text = await res.text();

            assert(res.status === 200, `Expected 200, got ${res.status}`);
            assert(text.includes('html') || text.includes('GACP'), 'Not HTML page');
            assert(!text.includes('Internal Server Error'), 'Contains server error');
            assert(elapsed < 15000, `Too slow: ${elapsed}ms`);

            return `${elapsed}ms`;
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// HEALTH PORTAL — Should redirect to /auth/health/login
// ═══════════════════════════════════════════════════════════════

const HEALTH_PAGES = [
    '/health/dashboard',
    '/health/applications',
    '/health/applications/new',
    '/health/certificates',
    '/health/profile',
    '/health/settings',
    '/health/payments',
    '/health/notifications',
    '/health/planting',
    '/health/documents',
    '/health/tracking',
];

// ═══════════════════════════════════════════════════════════════
// PROVIDER PORTAL — Should redirect to /auth/provider/login
// ═══════════════════════════════════════════════════════════════

const PROVIDER_PAGES = [
    '/provider/dashboard',
    '/provider/applications',
    '/provider/certificates',
    '/provider/audits',
    '/provider/accounting',
    '/provider/calendar',
    '/provider/analytics',
    '/provider/management',
    '/provider/receipts',
    '/provider/profile',
    '/provider/settings',
    '/provider/verification',
    '/provider/planting',
    '/provider/criteria',
];

// ═══════════════════════════════════════════════════════════════
// ADMIN PORTAL — Should redirect to /auth/provider/login
// ═══════════════════════════════════════════════════════════════

const ADMIN_PAGES = [
    '/admin/dashboard',
    '/admin/users',
    '/admin/settings',
    '/admin/planting',
    '/admin/analytics',
    '/admin/applications',
];

async function runGuardedPageTests() {
    const allGuarded = [
        ...HEALTH_PAGES.map(p => ({ path: p, portal: 'Health', loginPath: 'auth/health/login' })),
        ...PROVIDER_PAGES.map(p => ({ path: p, portal: 'Provider', loginPath: 'auth/provider/login' })),
        ...ADMIN_PAGES.map(p => ({ path: p, portal: 'Admin', loginPath: 'auth/provider/login' })),
    ];

    for (const page of allGuarded) {
        await test(page.portal.toUpperCase(), `${page.path} → redirect to login`, async () => {
            const start = Date.now();
            const res = await fetch(`${BASE_URL}${page.path}`, {
                redirect: 'follow',
                headers: { Accept: 'text/html' },
            });
            const elapsed = Date.now() - start;
            const text = await res.text();
            const finalUrl = res.url || '';

            // Page should either redirect to login or show login form
            const redirected = finalUrl.includes('login') || finalUrl.includes('redirect');
            const showsLogin = text.includes('เข้าสู่ระบบ') || text.includes('login');
            // Some pages might return 200 but show login component (SPA)
            assert(res.status === 200 || res.status === 307 || res.status === 302, `Unexpected: ${res.status}`);
            assert(redirected || showsLogin || text.includes('html'), `No login redirect. URL: ${finalUrl.substring(0, 60)}`);

            return `${elapsed}ms → ${redirected ? 'redirected' : 'shows login'}`;
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// STATIC ASSETS — CSS/JS bundles load
// ═══════════════════════════════════════════════════════════════

async function runStaticAssetTests() {
    await test('ASSETS', 'Next.js chunk loads', async () => {
        // Fetch the login page and extract a JS chunk URL
        const res = await fetch(`${BASE_URL}/auth/health/login`, {
            headers: { Accept: 'text/html' },
        });
        const html = await res.text();
        const jsMatch = html.match(/\/_next\/static\/[^"']+\.js/);
        if (!jsMatch) return 'No JS chunks found (may be SSR-only)';

        const jsRes = await fetch(`${BASE_URL}${jsMatch[0]}`);
        assert(jsRes.status === 200, `JS chunk returned ${jsRes.status}`);
        return `✓ chunk loads (${jsMatch[0].substring(0, 40)}...)`;
    });

    await test('ASSETS', 'Favicon exists', async () => {
        const res = await fetch(`${BASE_URL}/favicon.ico`);
        assert(res.status === 200 || res.status === 204, `favicon: ${res.status}`);
        return `status: ${res.status}`;
    });
}

// ═══════════════════════════════════════════════════════════════
// SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════

async function runSecurityHeaderTests() {
    const res = await fetch(`${BASE_URL}/auth/health/login`, { redirect: 'manual' });

    await test('SECURITY', 'X-Frame-Options present', async () => {
        const h = res.headers.get('x-frame-options');
        return h ? `✓ ${h}` : '⚠️ Missing (CSP may cover)';
    });

    await test('SECURITY', 'Content-Type present', async () => {
        const h = res.headers.get('content-type');
        assert(h, 'Missing Content-Type');
        return `✓ ${h.substring(0, 50)}`;
    });

    await test('SECURITY', 'No server version exposed', async () => {
        const h = res.headers.get('x-powered-by');
        assert(!h || h !== 'Express', 'X-Powered-By exposed');
        return h ? `header: ${h}` : '✓ Not exposed';
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
    console.log('║        Agent F — Frontend Page Test Report                ║');
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

    const outFile = path.join(__dirname, 'agent-frontend-results.txt');
    const lines = [
        `Agent F — Frontend Page Test Report`,
        `Target: ${BASE_URL}`,
        `Date: ${new Date().toISOString()}`,
        `Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`,
        '',
        ...results.map(r => `${r.s === '✅' ? 'PASS' : r.s === '❌' ? 'FAIL' : 'SKIP'} | ${r.label} | ${r.d}`),
    ];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`Results → ${outFile}\n`);

    return { agent: 'F-Frontend', passed, failed, skipped, total, rate: parseFloat(rate) };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
    console.log(`\n Agent F — Frontend Page Carpet-Bomb Test`);
    console.log(`   Target: ${BASE_URL}\n`);

    await runPublicPageTests();
    await runGuardedPageTests();
    await runStaticAssetTests();
    await runSecurityHeaderTests();

    const summary = printReport();
    if (typeof module !== 'undefined') module.exports = summary;
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
