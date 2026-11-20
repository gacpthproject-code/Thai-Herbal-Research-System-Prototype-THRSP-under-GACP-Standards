// View-pack for wave1/honest-limits review round 2 (HARNESS.md §4.4).
//
// Drives the REAL web app (next dev from this worktree: real middleware.ts, real
// api-client / AuthService, real /api/session/clear-cookie route) in Chromium.
// The backend is stub-backend.js, which answers every call with
// 403 ACCOUNT_INACTIVE. No database and no real account: the portal gates are
// passed with unsigned role-only cookies, which middleware only decodes. Only
// ever run this against a local server.
//
// Reviewer's finding: a suspended officer ended on /provider/dashboard, or on a
// login page without the notice, because the navigation carried or aborted the
// httpOnly provider_token clear. Each scene is repeated with clear-cookie
// delayed by 0 / 5 / 30 / 100 ms, and with clear-cookie aborted.
//
// usage: NODE_PATH=apps/web-app/node_modules node viewpack.js <baseUrl> <label> <sha12> <outDir> <traceDir> [runs]
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const [baseUrl, label, sha, outDir, traceDir, runsArg] = process.argv.slice(2);
if (!baseUrl || !label || !sha || !outDir || !traceDir) {
    console.error('usage: node viewpack.js <baseUrl> <label> <sha12> <outDir> <traceDir> [runs]');
    process.exit(2);
}
const RUNS = Number(runsArg || 10);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(traceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const NOTICE = 'บัญชีของคุณถูกระงับการใช้งาน หากมีข้อสงสัย กรุณาติดต่อเจ้าหน้าที่กรมการแพทย์แผนไทยและการแพทย์ทางเลือก';
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const PROVIDER_TOKEN = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ id: 'view-pack-officer', role: 'AUDITOR', canonicalRole: 'FIELD_INSPECTOR', exp })}.view-pack`;
const HEALTH_TOKEN = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ id: 'view-pack-farmer', role: 'FARMER', canonicalRole: 'HEALTH', exp })}.view-pack`;

const PORTALS = {
    provider: {
        start: '/provider/dashboard',
        cookie: { name: 'provider_token', value: PROVIDER_TOKEN },
        user: { id: 'view-pack-officer', role: 'AUDITOR', canonicalRole: 'FIELD_INSPECTOR', firstName: 'เจ้าหน้าที่', lastName: 'ตัวอย่าง', authType: 'PROVIDER_ID' },
        loginPath: '/auth/provider/login',
    },
    health: {
        start: '/health/home',
        cookie: { name: 'auth_token', value: HEALTH_TOKEN },
        user: { id: 'view-pack-farmer', role: 'HEALTH', firstName: 'เกษตรกร', lastName: 'ตัวอย่าง' },
        loginPath: '/auth/health/login',
    },
};

async function overlay(page, text) {
    await page.evaluate(([t]) => {
        const el = document.createElement('div');
        el.textContent = t;
        el.setAttribute('style', 'position:fixed;right:8px;bottom:8px;z-index:2147483647;font:11px/1.4 monospace;background:#111;color:#fff;padding:3px 6px;border-radius:4px;opacity:.85;max-width:90vw');
        document.body.appendChild(el);
    }, [text]).catch(() => {});
}

async function newContext(browser, portal, { loggedIn }) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH' });
    if (loggedIn) {
        await context.addCookies([{ ...portal.cookie, url: baseUrl, httpOnly: true, sameSite: 'Lax' }]);
        await context.addInitScript((user) => {
            try {
                if (!localStorage.getItem('view-pack-seeded')) {
                    localStorage.setItem('user', JSON.stringify(user));
                    localStorage.setItem('view-pack-seeded', '1');
                }
            } catch { /* ignore */ }
        }, portal.user);
    }
    return context;
}

async function cookieNames(context) {
    return (await context.cookies(baseUrl)).map((c) => c.name).sort();
}

/**
 * One suspended session: open the portal, let the app meet ACCOUNT_INACTIVE,
 * and see where the browser settles.
 */
async function suspendedRun(browser, portalName, clearCookieMode, run, { shotName, trace }) {
    const portal = PORTALS[portalName];
    const context = await newContext(browser, portal, { loggedIn: true });
    if (trace) await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    const clearCookieCalls = [];
    await page.route('**/api/session/clear-cookie', async (route) => {
        clearCookieCalls.push(clearCookieMode);
        if (clearCookieMode === 'abort') return route.abort('failed');
        await new Promise((r) => setTimeout(r, clearCookieMode));
        return route.continue().catch(() => {});
    });
    const visited = [];
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname + new URL(frame.url()).search);
    });

    await page.goto(`${baseUrl}${portal.start}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Settle: the notice shows up, or give the page time to bounce around.
    const noticeSeen = await page.getByText(NOTICE, { exact: false }).first()
        .waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500);

    const finalUrl = new URL(page.url());
    const noticeVisibleAtEnd = await page.getByText(NOTICE, { exact: false }).first().isVisible().catch(() => false);
    const cookiesAtEnd = await cookieNames(context);
    const result = {
        portal: portalName,
        clearCookie: clearCookieMode === 'abort' ? 'aborted' : `${clearCookieMode}ms`,
        run,
        finalPath: finalUrl.pathname,
        finalSearch: finalUrl.search,
        noticeSeen,
        noticeVisibleAtEnd,
        sessionCookieLeft: cookiesAtEnd.includes(portal.cookie.name),
        markerLeft: cookiesAtEnd.includes('signed_out_reason'),
        clearCookieRequests: clearCookieCalls.length,
        visited,
        ok: finalUrl.pathname === portal.loginPath
            && finalUrl.searchParams.get('reason') === 'account_inactive'
            && noticeVisibleAtEnd
            && !cookiesAtEnd.includes(portal.cookie.name),
    };
    if (shotName) {
        await overlay(page, `view-pack · ${label} · build ${sha} · ${stamp} · ${portalName} suspended, clear-cookie ${result.clearCookie} · final ${finalUrl.pathname}${finalUrl.search}`);
        await page.screenshot({ path: path.join(outDir, `${label}-${shotName}-${sha}.png`), fullPage: true });
    }
    if (trace) await context.tracing.stop({ path: path.join(traceDir, `${label}-${shotName || portalName}-${sha}.zip`) });
    await context.close();
    return result;
}

/** A link from elsewhere carrying ?reason=account_inactive, opened by someone whose account is fine. */
async function craftedLinkRun(browser, portalName, { loggedIn, shotName }) {
    const portal = PORTALS[portalName];
    const context = await newContext(browser, portal, { loggedIn });
    const page = await context.newPage();
    // This person's account is active: API calls succeed (empty data).
    await page.route('**/api/**', (route) => {
        if (route.request().url().includes('/api/session/')) return route.continue();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    const response = await page.goto(`${baseUrl}${portal.loginPath}?reason=account_inactive`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const finalUrl = new URL(page.url());
    const noticeVisible = await page.getByText(NOTICE, { exact: false }).first().isVisible().catch(() => false);
    const cookiesAtEnd = await cookieNames(context);
    const result = {
        scene: 'crafted-link',
        portal: portalName,
        loggedIn,
        firstStatus: response ? response.status() : null,
        finalPath: finalUrl.pathname,
        noticeVisible,
        sessionCookieLeft: cookiesAtEnd.includes(portal.cookie.name),
        ok: !noticeVisible && (loggedIn ? cookiesAtEnd.includes(portal.cookie.name) : true),
    };
    await overlay(page, `view-pack · ${label} · build ${sha} · ${stamp} · link from elsewhere ${portal.loginPath}?reason=account_inactive · logged in: ${loggedIn} · final ${finalUrl.pathname}`);
    await page.screenshot({ path: path.join(outDir, `${label}-${shotName}-${sha}.png`), fullPage: true });
    await context.close();
    return result;
}

(async () => {
    const browser = await chromium.launch();
    const results = [];
    const modes = [0, 5, 30, 100, 'abort'];
    try {
        for (const portalName of ['provider', 'health']) {
            for (const mode of modes) {
                for (let run = 1; run <= RUNS; run += 1) {
                    const first = run === 1;
                    const tag = mode === 'abort' ? 'aborted' : `${mode}ms`;
                    const r = await suspendedRun(browser, portalName, mode, run, {
                        shotName: first ? `${portalName}-suspended-clear-cookie-${tag}` : null,
                        trace: first && (mode === 30 || mode === 'abort'),
                    });
                    results.push(r);
                    console.log(JSON.stringify(r));
                }
            }
        }
        results.push(await craftedLinkRun(browser, 'provider', { loggedIn: true, shotName: 'provider-crafted-link-logged-in' }));
        results.push(await craftedLinkRun(browser, 'provider', { loggedIn: false, shotName: 'provider-crafted-link-logged-out' }));
        results.push(await craftedLinkRun(browser, 'health', { loggedIn: false, shotName: 'health-crafted-link-logged-out' }));
        results.slice(-3).forEach((r) => console.log(JSON.stringify(r)));
    } finally {
        await browser.close();
    }

    const summary = {};
    for (const r of results.filter((x) => x.clearCookie)) {
        const key = `${r.portal} clear-cookie ${r.clearCookie}`;
        summary[key] = summary[key] || { runs: 0, ok: 0, endedOnDashboardOrHome: 0, endedOnLoginWithoutNotice: 0, sessionCookieLeft: 0 };
        const s = summary[key];
        s.runs += 1;
        if (r.ok) s.ok += 1;
        if (!PORTALS[r.portal].loginPath.startsWith(r.finalPath) && r.finalPath !== PORTALS[r.portal].loginPath) s.endedOnDashboardOrHome += 1;
        if (r.finalPath === PORTALS[r.portal].loginPath && !r.noticeVisibleAtEnd) s.endedOnLoginWithoutNotice += 1;
        if (r.sessionCookieLeft) s.sessionCookieLeft += 1;
    }
    const out = { label, sha, stamp, baseUrl, runsPerMode: RUNS, summary, crafted: results.filter((x) => x.scene), results };
    fs.writeFileSync(path.join(outDir, `${label}-checks-${sha}.json`), `${JSON.stringify(out, null, 2)}\n`);
    console.log(JSON.stringify({ summary, crafted: out.crafted }, null, 2));
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
