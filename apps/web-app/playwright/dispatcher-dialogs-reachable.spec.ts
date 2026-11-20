/**
 * Every dialog the dispatcher books a visit or assigns an officer through keeps each control it needs
 * reachable, on a 1440x900 desktop and on a 390-wide phone, with the tallest content the dialog can
 * show: the site contact opened, every reason the server can ask for (late visit, over the workload
 * cap, a correction in progress), and "อื่น ๆ (โปรดระบุ)" chosen with its text box. A dialog taller
 * than the screen used to lose its top and bottom with no way to scroll, so the dispatcher could not
 * press "ยืนยันนัดหมายพร้อมเหตุผล" on a desktop or "บันทึกนัดหมาย" on a phone.
 *
 * API-mocked, no backend or database. The reason lists and the refusal bodies come from the backend's
 * own shared modules, so the dialogs receive what the server sends. Run against `next dev` of this tree:
 *   E2E_BASE_URL=http://127.0.0.1:3741 npx playwright test playwright/dispatcher-dialogs-reachable.spec.ts \
 *     --project=chromium --no-deps --reporter=list
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

const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const bangkokDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const INSPECT_BY = `${bangkokDay(1)}T10:00:00.000Z`;
const VISIT_DAY = bangkokDay(10);
const OTHER_TEXT = 'ผู้ยื่นขอเลื่อนเพราะต้องเก็บเกี่ยวรอบนี้ให้เสร็จก่อน';

const DISPATCHER = {
    id: 'dispatcher-r6',
    username: 'dispatcher-r6',
    firstName: 'ปรียา',
    lastName: 'จัดคิว',
    email: 'dispatcher.r6@test.local',
    role: 'dispatcher',
    canonicalRole: 'dispatcher',
};

const INSPECTORS = [{ id: 'inspector-r6', firstName: 'วิชัย', lastName: 'ลงแปลง', fullName: 'วิชัย ลงแปลง', role: 'field_inspector', canonicalRole: 'field_inspector' }];
const REVIEWERS = [{ id: 'reviewer-r6', firstName: 'สุดา', lastName: 'ตรวจเอกสาร', fullName: 'สุดา ตรวจเอกสาร', role: 'document_reviewer', canonicalRole: 'document_reviewer' }];
const SITE = 'แปลงสาธิตบ้านดอยคำ 12 หมู่ 3 ต.ริมใต้ อ.แม่ริม จ.เชียงใหม่ 50180';

const queueRow = (applicationId: string, applicationNumber: string, workflowState: string) => ({
    id: applicationId,
    applicationId,
    applicationNumber,
    applicantName: 'สมชาย ใจดี',
    status: workflowState,
    workflowState,
    phase2Paid: true,
    receiptIssued: true,
    auditorId: null,
    auditorName: null,
    reviewerId: null,
    reviewerName: null,
    scheduledDate: null,
    mapLink: null,
    location: SITE,
    notes: null,
    estimatedDuration: 120,
    isReinspectionRequired: false,
    overdueDays: 0,
    createdAt: '2026-10-01T03:00:00.000Z',
    updatedAt: '2026-10-01T03:00:00.000Z',
    inspectBy: INSPECT_BY,
    siteContactGiven: true,
    siteContactRequestedAt: null,
});

const BOOKING = queueRow('app-r6-booking', 'APP-r6-0001', 'AUDIT_FEE_PAID');
const DOC_REVIEW = queueRow('app-r6-review', 'APP-r6-0002', 'DOC_FEE_PAID');

const DASHBOARD = {
    queues: {
        readyForReview: { total: 1, items: [DOC_REVIEW] },
        readyToSchedule: { total: 1, items: [BOOKING] },
        scheduledUpcoming: { total: 0, items: [] },
        reinspectionRequired: { total: 0, items: [] },
        awaitingApplicant: { total: 0, items: [] },
    },
    pipeline: {
        submitted: 0, pendingDocFee: 0, docFeePaid: 1, assignedForReview: 0, docApproved: 0, pendingAuditFee: 0, auditFeePaid: 1, auditConfirmed: 0,
    },
    calendar: { events: [] },
    kpi: { scheduledToday: 0, scheduledThisWeek: 0, pendingScheduling: 1, reinspectionBacklog: 0, overdue: 0 },
};

const SCHEDULING_QUEUE = {
    items: [{
        applicationId: BOOKING.applicationId,
        applicationNumber: BOOKING.applicationNumber,
        applicantName: 'สมชาย ใจดี',
        applicantNameMasked: 'สมชาย ใจดี',
        ageDays: 3,
        status: 'AUDIT_FEE_PAID',
        farmAddress: SITE,
        inspectBy: INSPECT_BY,
        siteContactGiven: true,
        siteContactRequestedAt: null,
    }],
    summary: { totalPending: 1, byRegion: [], oldestPendingDays: 3 },
};

const REASSIGNABLE_VISIT = {
    id: 'app-r6-correction', applicationNumber: 'APP-r6-0003', applicantName: 'สมชาย ใจดี', plantType: 'กัญชา', status: 'CAR_PENDING',
    currentAuditor: 'มานะ อดทน', currentAuditorId: 'inspector-r6-old', scheduledDate: `${VISIT_DAY}T02:00:00.000Z`, daysOverdue: 0,
};
const REASSIGNABLE_REVIEW = {
    id: 'app-r6-revision', applicationNumber: 'APP-r6-0004', applicantName: 'สมชาย ใจดี', plantType: 'กัญชา', status: 'ASSIGNED_FOR_REVIEW',
    currentReviewer: 'ศรีสุดา เดิม', currentReviewerId: 'reviewer-r6-old',
};

const ok = (data: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

/** Every /api call this spec does not name answers 404, so nothing reaches a backend. */
async function mockDispatcherApi(page: Page): Promise<void> {
    await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'not mocked' }) }));
    await applySession(page, { user: DISPATCHER, tokenPayload: { sub: DISPATCHER.id, email: DISPATCHER.email, role: 'dispatcher', canonicalRole: 'dispatcher' } });
    const get = (url: RegExp, data: unknown) => page.route(url, (route) => (route.request().method() === 'GET' ? route.fulfill(ok(data)) : route.fallback()));
    await get(/\/api\/provider\/scheduler\/reasons$/, dispatcherReasonOptions());
    await get(/\/api\/provider\/scheduler\/dashboard(\?.*)?$/, DASHBOARD);
    await get(/\/api\/provider\/scheduler\/auditors(\?.*)?$/, INSPECTORS);
    await get(/\/api\/provider\/scheduler\/reviewers(\?.*)?$/, REVIEWERS);
    await get(/\/api\/provider\/scheduler\/urgent-monitor(\?.*)?$/, { stuckItems: [], deadlineItems: [], summary: { totalStuck: 0, critical: 0, warning: 0, approachingDeadlines: 0 } });
    await get(/\/api\/provider\/scheduler\/auditor-workload$/, { auditors: [], summary: { totalAuditors: 0, available: 0, busy: 0, full: 0, totalActiveAssignments: 0 } });
    await get(/\/api\/provider\/applications\/[^/]+\/site-contact$/, { applicationNumber: BOOKING.applicationNumber, siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '081-234-5678' });
    await get(/\/api\/audit\/scheduling\/queue(\?.*)?$/, SCHEDULING_QUEUE);
    await get(/\/api\/audit\/scheduling\/auditor-availability\/[^/?]+(\?.*)?$/, {
        auditorId: INSPECTORS[0]?.id,
        busySlots: [{ applicationId: 'app-r6-other', applicationNumber: 'APP-r6-0009', status: 'AUDIT_CONFIRMED', scheduledDate: `${VISIT_DAY}T02:00:00.000Z` }],
        overCapDays: [{ day: VISIT_DAY, count: 2 }],
        cap: 2,
    });
    await get(/\/api\/audits\/reassign\/reassignable$/, { applications: [REASSIGNABLE_VISIT] });
    await get(/\/api\/provider\/scheduler\/reviewer-assignments\/reassignable$/, { applications: [REASSIGNABLE_REVIEW] });
    // The Next dev-tools badge sits over the page corner; production pages have none.
    await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style');
            style.textContent = 'nextjs-portal { display: none !important; }';
            document.head.appendChild(style);
        });
    });
}

/** The door refuses each submission in turn with the next code, as the server does until a reason is stated. */
async function refuseInTurn(page: Page, url: RegExp, codes: readonly string[]): Promise<void> {
    const rows = codes.map((code) => {
        const row = lookup(code);
        if (!row) { throw new Error(`${code} is not in the backend error catalog`); }
        return row;
    });
    let calls = 0;
    await page.route(url, (route) => {
        if (route.request().method() !== 'POST') { return route.fallback(); }
        const row = rows[Math.min(calls, rows.length - 1)];
        calls += 1;
        if (!row) { return route.fallback(); }
        return route.fulfill({
            status: row.httpStatus,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, code: row.code, error: row.messageTh, messageTh: row.messageTh, data: {} }),
        });
    });
}

/**
 * Scrolls whatever can scroll to bring `target` into view, then requires all of it on screen with nothing over
 * it: its centre and a point just inside each edge must hit the control itself, so a bar fixed over the bottom
 * of the screen that hides half a button counts as a failure.
 */
async function reach(page: Page, target: Locator, what: string): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    const screen = page.viewportSize();
    if (!box || !screen) { throw new Error(`${what} has no box on the screen`); }
    const onScreen = box.x >= 0 && box.y >= 0 && box.x + box.width <= screen.width && box.y + box.height <= screen.height;
    expect(onScreen, `${what} lies at x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}, outside the ${screen.width}x${screen.height} screen`).toBe(true);
    const covered = await target.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const inset = 3;
        const points: Array<[string, number, number]> = [
            ['centre', r.left + r.width / 2, r.top + r.height / 2],
            ['top edge', r.left + r.width / 2, r.top + inset],
            ['bottom edge', r.left + r.width / 2, r.bottom - inset],
            ['left edge', r.left + inset, r.top + r.height / 2],
            ['right edge', r.right - inset, r.top + r.height / 2],
        ];
        return points.flatMap(([where, x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit && (hit === element || element.contains(hit)) ? [] : [`${where} under ${hit ? hit.outerHTML.slice(0, 80) : 'nothing'}`];
        });
    });
    expect(covered, `${what} is partly covered`).toEqual([]);
    await target.click({ trial: true, timeout: 5000 });
}

async function press(page: Page, target: Locator, what: string): Promise<void> {
    await reach(page, target, what);
    await target.click();
}

/** Picks "อื่น ๆ (โปรดระบุ)" in the reason list the server asked for, and writes the reason. */
async function stateOtherReason(page: Page, dialog: Locator, list: string, where: string): Promise<void> {
    const fieldset = dialog.getByTestId(`stated-reason-${list}`);
    await expect(fieldset).toBeVisible();
    const other = fieldset.locator('input[type="radio"][value="OTHER"]');
    await reach(page, other, `${where}: the "อื่น ๆ" choice of ${list}`);
    await other.check();
    const text = fieldset.locator('textarea');
    await reach(page, text, `${where}: the reason box of ${list}`);
    await text.fill(OTHER_TEXT);
}

async function pickOption(page: Page, dialog: Locator, option: string, where: string): Promise<void> {
    await press(page, dialog.locator('button[role="combobox"]').first(), `${where}: the officer picker`);
    await page.getByRole('option', { name: option }).click();
}

for (const [size, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`dispatcher dialogs on ${size} ${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport });

        // The screen as the test left it, passed or failed: what the dispatcher would see.
        test.afterEach(async ({ page }, testInfo) => {
            await page.screenshot({ path: testInfo.outputPath(`${size}-last-screen.png`) });
        });

        test('the calendar booking dialog: site contact, late-visit and over-cap reasons', async ({ page }) => {
            const where = `calendar ${size}`;
            await mockDispatcherApi(page);
            await refuseInTurn(page, /\/api\/provider\/scheduler\/audits\/schedules$/, ['LATE_VISIT_REASON_REQUIRED', 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED']);
            await page.goto('/provider/calendar');
            await page.getByRole('button', { name: 'จัดคู่นัดตรวจ' }).first().click();
            const dialog = page.getByRole('dialog').filter({ hasText: 'กำหนดวันนัดหมายตรวจประเมิน' });
            await expect(dialog).toBeVisible();

            await press(page, dialog.getByRole('button', { name: 'ดูชื่อและเบอร์ผู้ติดต่อหน้างาน' }), `${where}: the site contact button`);
            await expect(dialog.getByText('นายสมศักดิ์ ดูแลแปลง')).toBeVisible();
            await dialog.locator('input[type="date"]').fill(VISIT_DAY);
            await pickOption(page, dialog, 'วิชัย ลงแปลง', where);

            await press(page, dialog.getByRole('button', { name: 'บันทึกนัดหมาย' }), `${where}: "บันทึกนัดหมาย"`);
            await stateOtherReason(page, dialog, 'lateVisit', where);
            await press(page, dialog.getByRole('button', { name: 'ยืนยันนัดหมายพร้อมเหตุผล' }), `${where}: "ยืนยันนัดหมายพร้อมเหตุผล" with the late-visit reason`);
            await stateOtherReason(page, dialog, 'overCap', where);

            await reach(page, dialog.getByRole('button', { name: 'ยืนยันนัดหมายพร้อมเหตุผล' }), `${where}: "ยืนยันนัดหมายพร้อมเหตุผล" with both reasons`);
            await reach(page, dialog.getByRole('button', { name: 'ยกเลิก' }), `${where}: "ยกเลิก"`);
        });

        test('the queue booking dialog: site contact, conflict warning, late-visit and over-cap reasons', async ({ page }) => {
            const where = `queue ${size}`;
            await mockDispatcherApi(page);
            await refuseInTurn(page, /\/api\/audit\/scheduling\/assign$/, ['LATE_VISIT_REASON_REQUIRED', 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED']);
            await page.goto('/provider/scheduler/queue');
            await page.locator('tr').filter({ hasText: BOOKING.applicationNumber }).getByRole('button', { name: /จัดตาราง/ }).click();
            const dialog = page.getByRole('dialog').filter({ hasText: 'จัดตารางตรวจประเมินภาคสนาม' });
            await expect(dialog).toBeVisible();

            await press(page, dialog.getByRole('button', { name: 'ดูชื่อและเบอร์ผู้ติดต่อหน้างาน' }), `${where}: the site contact button`);
            await expect(dialog.getByText('นายสมศักดิ์ ดูแลแปลง')).toBeVisible();
            await dialog.locator('#assign-date').fill(VISIT_DAY);
            await dialog.locator('#assign-auditor').selectOption({ label: 'วิชัย ลงแปลง' });
            await expect(dialog.getByTestId('conflict-warning')).toBeVisible();

            await press(page, dialog.getByRole('button', { name: 'ยืนยันจัดตาราง' }), `${where}: "ยืนยันจัดตาราง"`);
            await stateOtherReason(page, dialog, 'lateVisit', where);
            await press(page, dialog.getByRole('button', { name: 'ยืนยันจัดตารางพร้อมเหตุผล' }), `${where}: "ยืนยันจัดตารางพร้อมเหตุผล" with the late-visit reason`);
            await stateOtherReason(page, dialog, 'overCap', where);

            await reach(page, dialog.getByRole('button', { name: 'ยืนยันจัดตารางพร้อมเหตุผล' }), `${where}: "ยืนยันจัดตารางพร้อมเหตุผล" with both reasons`);
            await reach(page, dialog.getByRole('button', { name: 'ยกเลิก' }), `${where}: "ยกเลิก"`);
        });

        test('the document-review assignment dialog: over-cap reason', async ({ page }) => {
            const where = `coordinator ${size}`;
            await mockDispatcherApi(page);
            await refuseInTurn(page, /\/api\/provider\/scheduler\/reviewer-assignments$/, ['OFFICER_OVER_CAP_CONFIRMATION_REQUIRED']);
            await page.goto('/provider/coordinator');
            await page.getByRole('button', { name: 'จ่ายงานตรวจ', exact: true }).click();
            const dialog = page.getByRole('dialog').filter({ hasText: 'จ่ายงานตรวจเอกสาร' });
            await expect(dialog).toBeVisible();

            await dialog.getByLabel('เลือกผู้ตรวจเอกสาร').selectOption({ label: 'สุดา ตรวจเอกสาร' });
            await press(page, dialog.getByRole('button', { name: 'ยืนยันจ่ายงาน' }), `${where}: "ยืนยันจ่ายงาน"`);
            await stateOtherReason(page, dialog, 'overCap', where);

            await reach(page, dialog.getByRole('button', { name: 'ยืนยันจ่ายงานแม้เกินเพดาน' }), `${where}: "ยืนยันจ่ายงานแม้เกินเพดาน"`);
            await reach(page, dialog.getByRole('button', { name: 'ยกเลิก' }), `${where}: "ยกเลิก"`);
        });

        test('the field-inspector reassignment dialog during a correction: correction and over-cap reasons', async ({ page }) => {
            const where = `inspector reassign ${size}`;
            await mockDispatcherApi(page);
            await refuseInTurn(page, /\/api\/audits\/reassign\/[^/]+\/reassign$/, ['OFFICER_OVER_CAP_CONFIRMATION_REQUIRED']);
            await page.goto('/provider/scheduler/reassign');
            await page.locator('tr').filter({ hasText: REASSIGNABLE_VISIT.applicationNumber }).getByRole('button', { name: 'มอบหมายใหม่' }).click();
            const dialog = page.getByRole('dialog').filter({ hasText: 'มอบหมายงานใหม่' });
            await expect(dialog).toBeVisible();

            await pickOption(page, dialog, 'วิชัย ลงแปลง', where);
            await stateOtherReason(page, dialog, 'correctionReassign', where);
            await press(page, dialog.getByRole('button', { name: 'ยืนยันการมอบหมาย' }), `${where}: "ยืนยันการมอบหมาย"`);
            await stateOtherReason(page, dialog, 'overCap', where);

            await reach(page, dialog.getByRole('button', { name: 'ยืนยันมอบหมายแม้เกินเพดาน' }), `${where}: "ยืนยันมอบหมายแม้เกินเพดาน"`);
            await reach(page, dialog.getByRole('button', { name: 'ยกเลิก' }), `${where}: "ยกเลิก"`);
        });

        test('the document-reviewer reassignment dialog: written reason and over-cap reason', async ({ page }) => {
            const where = `reviewer reassign ${size}`;
            await mockDispatcherApi(page);
            await refuseInTurn(page, /\/api\/provider\/scheduler\/reviewer-assignments\/[^/]+\/reassign$/, ['OFFICER_OVER_CAP_CONFIRMATION_REQUIRED']);
            await page.goto('/provider/scheduler/reviewer-reassign');
            await page.locator('tr').filter({ hasText: REASSIGNABLE_REVIEW.applicationNumber }).getByRole('button', { name: 'มอบหมายใหม่' }).click();
            const dialog = page.getByRole('dialog').filter({ hasText: 'มอบหมายผู้ตรวจเอกสารใหม่' });
            await expect(dialog).toBeVisible();

            await pickOption(page, dialog, 'สุดา ตรวจเอกสาร', where);
            const written = dialog.getByLabel('เหตุผลในการมอบหมายใหม่');
            await reach(page, written, `${where}: the written reason`);
            await written.fill(OTHER_TEXT);
            await press(page, dialog.getByRole('button', { name: 'ยืนยันการมอบหมาย' }), `${where}: "ยืนยันการมอบหมาย"`);
            await stateOtherReason(page, dialog, 'overCap', where);

            await reach(page, dialog.getByRole('button', { name: 'ยืนยันมอบหมายแม้เกินเพดาน' }), `${where}: "ยืนยันมอบหมายแม้เกินเพดาน"`);
            await reach(page, dialog.getByRole('button', { name: 'ยกเลิก' }), `${where}: "ยกเลิก"`);
        });
    });
}
