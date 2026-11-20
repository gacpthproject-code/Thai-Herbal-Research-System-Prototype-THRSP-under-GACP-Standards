/**
 * ============================================================================
 * Playwright Fixtures — finance_officer_dtam + finance_officer_platform
 * ============================================================================
 * Helpers for finance-one-view-journey.spec.ts. Both finance roles see the
 * same data (operator 2026-09-11, 2026-09-27); payment settles only through
 * the Stripe webhook, so no finance surface here approves or issues anything.
 *
 *   - accountDtamMocks(page) / accountPlatformMocks(page) — wire the
 *     accounting dashboard's read routes with empty payloads.
 *
 *   - seedProviderTokenCookie(page, role) — seeds the middleware cookie.
 *
 *   - expectLiveBackend() — sentinel for the dual-mode contract. Returns
 *     true when E2E_LIVE_BACKEND=1, so the spec can `test.skip` mock-
 *     only assertions during live-backend smoke runs.
 *
 * DUAL-MODE: mock (default) + E2E_LIVE_BACKEND=1
 */

import type { Page, Route } from '@playwright/test';
import { installMockAssetRoutes } from './fixtures/mock-assets';

// ────────────────────────────────────────────────────────────────────────────
// Sentinel — dual-mode toggle
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the spec should target a live backend (Docker
 * compose / smoke env) instead of the mock layer. Set by ops at T-3
 * per cutover-checklist §3 T-3.
 */
export function expectLiveBackend(): boolean {
    return process.env.E2E_LIVE_BACKEND === '1';
}

// ────────────────────────────────────────────────────────────────────────────
// Provider-token cookie helper (server-side middleware gate)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The Next.js middleware at `apps/web-app/src/middleware.ts:171` reads
 * `provider_token` (cookie) to gate `/provider/**` and `/admin/**` routes.
 * Existing `loginAsAccountDtam` / `loginAsAccountPlatform` fixtures in
 * `fixtures.ts` only seed localStorage `auth_token` + `auth_user` — they
 * do NOT set the server-visible `provider_token` cookie. Per I-004 file
 * boundary discipline (W1-C must not modify `fixtures.ts`; byte-checksum
 * pinned), this helper layers the cookie on TOP of the existing login
 * fixture so the middleware admits the page.
 *
 * The token encodes `{ role, sub, exp }` as a JWT-shaped string (HS256
 * header + base64 payload + dummy signature) because
 * `decodeProviderRoleFromToken` in the middleware only base64-decodes the
 * payload — signature is verified server-side via the backend API, not in
 * the middleware. This mirrors the existing `makeFakeJwt()` pattern in
 * `fixtures.ts` line 145.
 *
 * Must be called AFTER the role-specific login fixture (so the localStorage
 * + auth state is also set) AND BEFORE the first `page.goto()` so the
 * cookie is in the very first request the middleware sees.
 */
export async function seedProviderTokenCookie(
    page: Page,
    role: 'ACCOUNT_DTAM' | 'ACCOUNT_PLATFORM',
    overrides: { sub?: string; baseURL?: string } = {},
): Promise<void> {
    if (expectLiveBackend()) return;

    const sub = overrides.sub
        ?? (role === 'ACCOUNT_DTAM' ? 'dtam-account-iter23' : 'platform-account-iter26');

    const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
        JSON.stringify({
            sub,
            role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 60 * 60,
        }),
    ).toString('base64url');
    const token = `${header}.${payload}.signature-not-verified-middleware-side`;

    // Use a URL with the page's baseURL so the cookie is bound to the
    // origin Playwright is testing. If page.url() is still about:blank,
    // fall back to the explicit baseURL (Playwright's first goto() will
    // then carry the cookie regardless of port).
    const url = overrides.baseURL
        ?? (page.url() && page.url() !== 'about:blank'
            ? page.url()
            : (process.env.E2E_BASE_URL || 'http://localhost'));

    await page.context().addCookies([
        {
            name: 'provider_token',
            value: token,
            url,
        },
    ]).catch(() => {
        // ignore — non-fatal; the page-load may still surface the cookie
        // via initScript or test-time injection
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Empty defaults — kept for the misc endpoints the dashboard touches
// ────────────────────────────────────────────────────────────────────────────

const EMPTY_INVOICES_LIST = {
    success: true,
    data: { invoices: [] },
};

const EMPTY_EXCEPTIONS_LIST = {
    success: true,
    data: { exceptions: [] },
};

const EMPTY_PAYMENT_SUMMARY = {
    success: true,
    data: {
        totalRevenue: 0,
        pendingAmount: 0,
        overdueAmount: 0,
        monthlyRevenue: 0,
        invoiceCount: { paid: 0, pending: 0, overdue: 0 },
    },
};

const EMPTY_SUBSCRIPTIONS_LIST = {
    success: true,
    data: [],
};

// ────────────────────────────────────────────────────────────────────────────
// Mock wiring — both finance roles read the same surface
// ────────────────────────────────────────────────────────────────────────────

/**
 * Wire the accounting-dashboard read routes. In live mode
 * (`expectLiveBackend()` true) only the asset routes are installed so the
 * real backend serves the data.
 */
async function accountMocks(page: Page): Promise<void> {
    // Preview assets (documents, audit photos) — without these every
    // preview box in this flow renders a broken image while the spec still passes.
    await installMockAssetRoutes(page);
    if (expectLiveBackend()) return;

    const empty = async (route: Route, payload: unknown) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload),
        });
    };

    await page.route('**/api/invoices/summary**', (route) => empty(route, EMPTY_PAYMENT_SUMMARY));
    await page.route('**/api/invoices**', async (route) => {
        // /api/invoices is the broader "list invoices" path — only mock
        // GETs on the exact path, not deeper paths.
        const url = new URL(route.request().url());
        if (url.pathname !== '/api/invoices') return route.fallback();
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(EMPTY_INVOICES_LIST),
        });
    });
    await page.route('**/api/invoices/receipts/exceptions**', (route) => empty(route, EMPTY_EXCEPTIONS_LIST));
    await page.route('**/api/subscriptions/my**', (route) => empty(route, EMPTY_SUBSCRIPTIONS_LIST));
}

export const accountDtamMocks = accountMocks;
export const accountPlatformMocks = accountMocks;
