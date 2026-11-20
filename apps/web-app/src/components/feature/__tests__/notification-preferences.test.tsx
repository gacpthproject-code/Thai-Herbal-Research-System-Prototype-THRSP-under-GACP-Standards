/**
 * notification-preferences.test.tsx — External-services cleanup, Task 4
 * (2026-08-19).
 *
 * RED-first pins for the FE prefs UI dropping the email/SMS channel
 * concept (backend already tracks only `inApp` per type — see
 * notification-preferences-service.js):
 *
 *   1. Renders in-app-only: no "อีเมล"/"SMS" column headers, and every
 *      row carries exactly ONE checkbox (the in-app toggle) instead of
 *      three.
 *   2. A legacy-shaped API response (an entry still carrying `email`/
 *      `sms` sub-keys, as a pre-cleanup persisted value would) does not
 *      crash the component; the in-app checkbox reflects `.inApp` and
 *      the retired fields are simply ignored.
 *
 * Mocking strategy: createRoot + act (project convention — see
 * OfflineIndicator.test.tsx / dashboard-layout-bell.test.tsx). Mock
 * `@/lib/api/api-client` so fetchPrefs() resolves synchronously with a
 * controlled payload.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
        put: (...args: unknown[]) => mockPut(...args),
    },
}));

import { NotificationPreferences } from '../notification-preferences';

describe('NotificationPreferences — external-services cleanup Task 4 (in-app only)', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        if (container) {
            container.remove();
            container = null;
        }
    });

    async function mount(portal: 'health' | 'provider' = 'health') {
        container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => {
            root = createRoot(container!);
            root!.render(
                <NotificationPreferences portal={portal} apiBase={portal === 'health' ? '/auth/health' : '/auth/provider'} />,
            );
        });
        // Flush the fetchPrefs() promise chain.
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
    }

    // The row for a notification type. The code is the wire identifier the server sends; it is
    // not shown to the person, so the row is found by its test id, not by visible text.
    function rowOf(code: string): Element | null {
        return container!.querySelector(`[data-testid="notification-type-${code}"]`);
    }

    it('renders in-app-only: no "อีเมล"/"SMS" column headers, one checkbox per row', async () => {
        mockGet.mockResolvedValue({ success: true, data: { channels: {} } });

        await mount('health');

        const headerTexts = Array.from(container!.querySelectorAll('thead th')).map((th) => th.textContent);
        expect(headerTexts).toContain('ในแอป');
        expect(headerTexts).not.toContain('อีเมล');
        expect(headerTexts.some((t) => t?.includes('SMS'))).toBe(false);

        const rows = container!.querySelectorAll('tbody tr');
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((row) => {
            expect(row.querySelectorAll('input[type="checkbox"]').length).toBe(1);
        });
    });

    it('legacy-shaped stored entry (email/sms sub-keys, from before the cleanup) does not crash — in-app checkbox reflects .inApp only', async () => {
        mockGet.mockResolvedValue({
            success: true,
            data: {
                channels: {
                    // Pre-cleanup persisted shape: email/sms present, inApp
                    // explicitly opted out. This is the exact shape a user's
                    // stored notificationSettings JSON could carry.
                    AUDIT_SCHEDULED: { email: true, sms: true, inApp: false },
                },
            },
        });

        await expect(mount('health')).resolves.not.toThrow();

        const targetRow = rowOf('AUDIT_SCHEDULED');
        expect(targetRow).toBeTruthy();
        const checkbox = targetRow!.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
    });

    it('rulings 2026-10-08 and 2026-10-09: the types the server names always-on show checked, locked, with the reason', async () => {
        mockGet.mockResolvedValue({
            success: true,
            data: { channels: {}, alwaysOn: ['PAYMENT_REMINDER', 'APPLICATION_EXPIRED', 'DEADLINE_REMINDER', 'AUDIT_VISIT_REMINDER'] },
        });

        await mount('health');

        for (const code of ['PAYMENT_REMINDER', 'APPLICATION_EXPIRED', 'DEADLINE_REMINDER', 'AUDIT_VISIT_REMINDER']) {
            const row = rowOf(code);
            expect(row).toBeTruthy();
            const box = row!.querySelector('input[type="checkbox"]') as HTMLInputElement;
            expect(box.checked).toBe(true);
            expect(box.disabled).toBe(true);
            expect(row!.textContent).toContain('ปิดไม่ได้');
        }
        const control = rowOf('AUDIT_SCHEDULED');
        expect((control!.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(false);
    });

    // Order 89 ก(3): every move of a staff account's 2FA tells its owner, in case someone else did
    // it, and that notice cannot be muted. Staff read their preferences on the provider portal.
    it('order 89, provider portal: the 2FA-moved notice has a Thai row, locked on, with its own reason', async () => {
        mockGet.mockResolvedValue({
            success: true,
            data: { channels: {}, alwaysOn: ['PAYMENT_REMINDER', 'APPLICATION_EXPIRED', 'DEADLINE_REMINDER', 'AUDIT_VISIT_REMINDER', 'SECOND_FACTOR_MOVED'] },
        });

        await mount('provider');

        const row = rowOf('SECOND_FACTOR_MOVED');
        expect(row).toBeTruthy();
        expect(row!.textContent).toContain('ย้ายการยืนยันตัวตนสองชั้นไปอุปกรณ์ใหม่');
        const box = row!.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(box.checked).toBe(true);
        expect(box.disabled).toBe(true);
        expect(row!.textContent).toContain('ปิดไม่ได้');
        expect(row!.textContent).not.toContain('กำหนดชำระ');
    });

    // Order 51 (operator 2026-10-09): no English jargon on Thai screens. A type code is a
    // wire identifier, so a run of 4+ capitals/underscores in a row is a leaked code.
    it.each(['health', 'provider'] as const)(
        'order 51, %s portal: no row shows an English notification type code, every row keeps its Thai name',
        async (portal) => {
            mockGet.mockResolvedValue({
                success: true,
                data: { channels: {}, alwaysOn: ['PAYMENT_REMINDER', 'APPLICATION_EXPIRED', 'DEADLINE_REMINDER'] },
            });

            await mount(portal);

            const rowTexts = Array.from(container!.querySelectorAll('tbody tr')).map((row) => row.textContent ?? '');
            expect(rowTexts.length).toBeGreaterThan(0);
            expect(rowTexts.filter((text) => /[A-Z_]{4,}/.test(text))).toEqual([]);
            expect(rowTexts.filter((text) => !/[\u0E00-\u0E7F]/.test(text))).toEqual([]);
        },
    );
});

// Round 3 (thai-ui-copy, No-Tracking-On-Thai): the group headings are Thai text, so they carry no
// uppercase and no wide letter-spacing. And the same-side admins' notice about a staff member's
// second factor (review M3) has its own locked row on the provider portal.
describe('round 3: Thai group headings and the admin second-factor notice', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => { jest.clearAllMocks(); });
    afterEach(() => {
        if (root) { act(() => { root?.unmount(); }); root = null; }
        if (container) { container.remove(); container = null; }
    });
    async function mount(portal: 'health' | 'provider') {
        container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => {
            root = createRoot(container!);
            root!.render(<NotificationPreferences portal={portal} apiBase={portal === 'health' ? '/auth/health' : '/auth/provider'} />);
        });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    }

    it.each(['health', 'provider'] as const)('%s portal: no group heading uses uppercase or wide tracking on Thai text', async (portal) => {
        mockGet.mockResolvedValue({ success: true, data: { channels: {}, alwaysOn: [] } });
        await mount(portal);
        const headings = Array.from(container!.querySelectorAll('h2'));
        expect(headings.length).toBeGreaterThan(0);
        for (const heading of headings) {
            expect(heading.className).not.toMatch(/uppercase|tracking-wide|tracking-wider|tracking-widest/);
        }
    });

    it('provider portal: the admin notice about a staff second-factor change has a Thai row, locked on', async () => {
        mockGet.mockResolvedValue({ success: true, data: { channels: {}, alwaysOn: ['SECOND_FACTOR_MOVED', 'STAFF_SECOND_FACTOR_CHANGED'] } });
        await mount('provider');
        const row = container!.querySelector('[data-testid="notification-type-STAFF_SECOND_FACTOR_CHANGED"]');
        expect(row).toBeTruthy();
        expect(row!.textContent).toMatch(/เจ้าหน้าที่/);
        const box = row!.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(box.checked).toBe(true);
        expect(box.disabled).toBe(true);
    });
});
