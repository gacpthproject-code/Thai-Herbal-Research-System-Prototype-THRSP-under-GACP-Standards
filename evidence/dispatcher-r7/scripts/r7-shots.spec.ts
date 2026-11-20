/**
 * Round 7 screens (evidence only, not a suite): the dispatcher's site-contact card in each ask state
 * (I-1) and the reason picker with "อื่น ๆ" chosen (I-8), on the calendar booking dialog at
 * 1440x900 and 390x844. API-mocked like playwright/dispatcher-dialogs-reachable.spec.ts; the reason
 * lists and refusal bodies come from the backend's own shared modules. Copied into an export of the
 * commit under test and run against `next dev` of that export.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { applySession } from './fixtures';

interface ErrorCodeRow { code: string; httpStatus: number; messageTh: string }

const backend = createRequire(__filename);
const shared = (file: string) => backend(path.resolve(__dirname, '../../backend/shared', file));
const { dispatcherReasonOptions } = shared('dispatcher-reasons.js') as { dispatcherReasonOptions: () => unknown };
const { lookup } = shared('error-codes.js') as { lookup: (code: string) => ErrorCodeRow | undefined };

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const bangkokDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const INSPECT_BY = `${bangkokDay(1)}T10:00:00.000Z`;
const VISIT_DAY = bangkokDay(10);
const OTHER_TEXT = 'ผู้ยื่นขอเลื่อนเพราะต้องเก็บเกี่ยวรอบนี้ให้เสร็จก่อน';
const SITE = 'แปลงสาธิตบ้านดอยคำ 12 หมู่ 3 ต.ริมใต้ อ.แม่ริม จ.เชียงใหม่ 50180';
const DISPATCHER = {
    id: 'dispatcher-r7', username: 'dispatcher-r7', firstName: 'ปรียา', lastName: 'จัดคิว', email: 'dispatcher.r7@test.local',
    role: 'dispatcher', canonicalRole: 'dispatcher',
};
const INSPECTORS = [{ id: 'inspector-r7', firstName: 'วิชัย', lastName: 'ลงแปลง', fullName: 'วิชัย ลงแปลง', role: 'field_inspector', canonicalRole: 'field_inspector' }];

type Ask = { siteContactGiven: boolean; siteContactRequestedAt: string | null; siteContactRequestPending: boolean };
const ASK_STATES: Record<string, Ask> = {
    'card-will-ask': { siteContactGiven: false, siteContactRequestedAt: null, siteContactRequestPending: true },
    'card-asked': { siteContactGiven: false, siteContactRequestedAt: '2026-10-12T02:15:00.000Z', siteContactRequestPending: false },
    'card-no-ask-coming': { siteContactGiven: false, siteContactRequestedAt: null, siteContactRequestPending: false },
};

function bookingRow(ask: Ask) {
    return {
        id: 'app-r7-booking', applicationId: 'app-r7-booking', applicationNumber: 'APP-r7-0001', applicantName: 'สมชาย ใจดี',
        status: 'AUDIT_FEE_PAID', workflowState: 'AUDIT_FEE_PAID', phase2Paid: true, receiptIssued: true, auditorId: null, auditorName: null,
        reviewerId: null, reviewerName: null, scheduledDate: null, mapLink: null, location: SITE, notes: null, estimatedDuration: 120,
        isReinspectionRequired: false, overdueDays: 0, createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z',
        inspectBy: INSPECT_BY, ...ask,
    };
}

const ok = (data: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

async function mockApi(page: Page, ask: Ask): Promise<void> {
    const row = bookingRow(ask);
    await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'not mocked' }) }));
    await applySession(page, { user: DISPATCHER, tokenPayload: { sub: DISPATCHER.id, email: DISPATCHER.email, role: 'dispatcher', canonicalRole: 'dispatcher' } });
    const get = (url: RegExp, data: unknown) => page.route(url, (route) => (route.request().method() === 'GET' ? route.fulfill(ok(data)) : route.fallback()));
    await get(/\/api\/provider\/scheduler\/reasons$/, dispatcherReasonOptions());
    await get(/\/api\/provider\/scheduler\/dashboard(\?.*)?$/, {
        queues: {
            readyForReview: { total: 0, items: [] }, readyToSchedule: { total: 1, items: [row] }, scheduledUpcoming: { total: 0, items: [] },
            reinspectionRequired: { total: 0, items: [] }, awaitingApplicant: { total: 0, items: [] },
        },
        pipeline: { submitted: 0, pendingDocFee: 0, docFeePaid: 0, assignedForReview: 0, docApproved: 0, pendingAuditFee: 0, auditFeePaid: 1, auditConfirmed: 0 },
        calendar: { events: [] },
        kpi: { scheduledToday: 0, scheduledThisWeek: 0, pendingScheduling: 1, reinspectionBacklog: 0, overdue: 0 },
    });
    await get(/\/api\/provider\/scheduler\/auditors(\?.*)?$/, INSPECTORS);
    await get(/\/api\/provider\/scheduler\/urgent-monitor(\?.*)?$/, { stuckItems: [], deadlineItems: [], summary: { totalStuck: 0, critical: 0, warning: 0, approachingDeadlines: 0 } });
    await get(/\/api\/provider\/scheduler\/auditor-workload$/, { auditors: [], summary: { totalAuditors: 0, available: 0, busy: 0, full: 0, totalActiveAssignments: 0 } });
    await get(/\/api\/audit\/scheduling\/auditor-availability\/[^/?]+(\?.*)?$/, { auditorId: 'inspector-r7', busySlots: [], overCapDays: [], cap: 2 });
    await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style');
            style.textContent = 'nextjs-portal { display: none !important; }';
            document.head.appendChild(style);
        });
    });
}

async function refuseWith(page: Page, code: string): Promise<void> {
    const row = lookup(code);
    if (!row) { throw new Error(`${code} is not in the backend error catalog`); }
    await page.route(/\/api\/provider\/scheduler\/audits\/schedules$/, (route) => (route.request().method() === 'POST'
        ? route.fulfill({ status: row.httpStatus, contentType: 'application/json', body: JSON.stringify({ success: false, code: row.code, error: row.messageTh, messageTh: row.messageTh, data: {} }) })
        : route.fallback()));
}

async function openBooking(page: Page): Promise<Locator> {
    await page.goto('/provider/calendar');
    await page.getByRole('button', { name: 'จัดคู่นัดตรวจ' }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'กำหนดวันนัดหมายตรวจประเมิน' });
    await expect(dialog).toBeVisible();
    return dialog;
}

for (const [size, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`round 7 screens ${size}`, () => {
        test.use({ viewport });

        for (const [name, ask] of Object.entries(ASK_STATES)) {
            test(name, async ({ page }, testInfo) => {
                await mockApi(page, ask);
                const dialog = await openBooking(page);
                const card = dialog.getByTestId('site-contact-card');
                await card.scrollIntoViewIfNeeded();
                await expect(card).toContainText('ยังไม่มีผู้ติดต่อหน้างาน');
                const text = (await card.textContent()) || '';
                testInfo.annotations.push({ type: 'card-text', description: text });
                if (name === 'card-will-ask') { await expect(card).toContainText('ระบบจะแจ้งให้ผู้ยื่นเพิ่มผู้ติดต่อหน้างาน'); }
                if (name === 'card-asked') { await expect(card).toContainText('ระบบแจ้งให้ผู้ยื่นเพิ่มแล้วเมื่อ'); }
                if (name === 'card-no-ask-coming') { expect(text).not.toContain('ระบบจะแจ้ง'); expect(text).not.toContain('ระบบแจ้งให้'); }
                await card.screenshot({ path: testInfo.outputPath(`${name}-${size}-card.png`) });
                await page.screenshot({ path: testInfo.outputPath(`${name}-${size}-screen.png`) });
            });
        }

        for (const [name, code, list] of [
            ['picker-late-visit-other', 'LATE_VISIT_REASON_REQUIRED', 'lateVisit'],
            ['picker-over-cap-other', 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED', 'overCap'],
        ] as const) {
            test(name, async ({ page }, testInfo) => {
                await mockApi(page, ASK_STATES['card-will-ask']!);
                await refuseWith(page, code);
                const dialog = await openBooking(page);
                await dialog.locator('input[type="date"]').fill(VISIT_DAY);
                await dialog.locator('button[role="combobox"]').first().click();
                await page.getByRole('option', { name: 'วิชัย ลงแปลง' }).click();
                await dialog.getByRole('button', { name: 'บันทึกนัดหมาย' }).click();
                const fieldset = dialog.getByTestId(`stated-reason-${list}`);
                await expect(fieldset).toBeVisible();
                await fieldset.locator('input[type="radio"][value="OTHER"]').check();
                await fieldset.locator('textarea').fill(OTHER_TEXT);
                if (list === 'lateVisit') { await expect(fieldset).toContainText('ผู้ยื่นจะเห็นเหตุผลที่พิมพ์นี้ในหน้าคำขอ'); }
                else { await expect(fieldset).not.toContainText('ผู้ยื่นจะเห็น'); }
                await fieldset.scrollIntoViewIfNeeded();
                await fieldset.screenshot({ path: testInfo.outputPath(`${name}-${size}-picker.png`) });
                await page.screenshot({ path: testInfo.outputPath(`${name}-${size}-screen.png`) });
            });
        }
    });
}
