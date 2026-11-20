'use strict';

/**
 * Payment reminder sweep — three reminders per unpaid milestone, counted from the
 * milestone's clock start (operator order 32, 2026-10-07; real-Postgres coverage of the
 * clock itself: unpaid-milestone-clock-real-postgres.test.js).
 *
 * Under test here, with the REAL schedule service and calendar (the shift is proven, not
 * simulated):
 *   - the send day is the SHIFTED working day from computeReminderDates;
 *   - catch-up: the earliest reminder whose day has come and that has no ledger row of its type
 *     goes out, one per milestone per sweep, worded for where the milestone stands that day;
 *   - durable dedup, insert-first on (applicationId, milestone, reminderType, intendedDate):
 *     P2002 = another sweep holds the row, skip silently; a row that reached nobody is resent on
 *     that same row, never a second insert;
 *   - DUE_DATE and OVERDUE_NOTICE landing on the same working day go out on consecutive sweeps;
 *   - the sweep NEVER writes invoice/payment state;
 *   - one broken milestone must not sink the sweep.
 *
 * Fixture days (canonical calendar, utils/working-days.js):
 *   - due Tue 2026-08-11 → PRE_DUE 08-06, DUE_DATE 08-11, OVERDUE_NOTICE 08-13 (Wed 08-12 is
 *     วันแม่แห่งชาติ — the shift case).
 *   - due Sat 2026-08-08 → DUE_DATE and OVERDUE_NOTICE both shift onto Mon 08-10.
 */

const fs = require('fs');
const path = require('path');

const mockInvoiceUpdate = jest.fn();
const mockInvoiceUpdateMany = jest.fn();
const mockInvoiceUpsert = jest.fn();
const mockReminderCreate = jest.fn();
const mockReminderUpdate = jest.fn();
const mockReminderFindMany = jest.fn();
const mockReminderFindFirst = jest.fn();
const mockLockUnsent = jest.fn();
const mockCheckoutOrderUpdate = jest.fn();
const mockPaymentTransactionUpdate = jest.fn();
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        invoice: {
            update: (...a) => mockInvoiceUpdate(...a),
            updateMany: (...a) => mockInvoiceUpdateMany(...a),
            upsert: (...a) => mockInvoiceUpsert(...a),
        },
        paymentReminderLog: {
            create: (...a) => mockReminderCreate(...a),
            update: (...a) => mockReminderUpdate(...a),
            findMany: (...a) => mockReminderFindMany(...a),
            findFirst: (...a) => mockReminderFindFirst(...a),
        },
        checkoutOrder: { update: (...a) => mockCheckoutOrderUpdate(...a) },
        paymentTransaction: { update: (...a) => mockPaymentTransactionUpdate(...a) },
        $transaction: async (cb) => cb({
            $queryRaw: (...a) => mockLockUnsent(...a),
            paymentReminderLog: { update: (...a) => mockReminderUpdate(...a) },
        }),
    },
}));
jest.mock('../../services/tenant-context', () => ({
    withoutTenantScope: (fn) => fn(),
    getTenantContext: () => null,
}));
jest.mock('../../services/notification-service', () => ({
    NotifyType: { PAYMENT_REMINDER: 'PAYMENT_REMINDER' },
}));
const mockNotifyParties = jest.fn();
jest.mock('../../services/notification/application-parties', () => ({
    notifyApplicationParties: (...a) => mockNotifyParties(...a),
}));
const mockListUnpaid = jest.fn();
jest.mock('../../services/billing/unpaid-milestones', () => ({
    listUnpaidMilestones: (...a) => mockListUnpaid(...a),
}));
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../shared/logger', () => ({ ...mockLogger, createLogger: jest.fn(() => mockLogger) }));

const { getZonedParts } = require('../../utils/working-days');
const { computeReminderDates } = require('../../services/checkout/checkout-schedule-service');
const { runPaymentReminderSweep } = require('../../jobs/payment-reminder-job');

const JOB_FILE = path.join(__dirname, '..', '..', 'jobs', 'payment-reminder-job.js');

/** 10:00 Asia/Bangkok on the given calendar day. */
function ictMorning(isoDate) {
    return new Date(`${isoDate}T03:00:00.000Z`);
}

/** Asia/Bangkok calendar day of an instant. */
function dayOf(date) {
    return getZonedParts(date).isoDate;
}

function p2002() {
    const err = new Error('Unique constraint failed on (applicationId, milestone, reminderType, intendedDate)');
    err.code = 'P2002';
    return err;
}

/** The reminder types already delivered (sentAt stamped) for every milestone in the scenario. */
function ledger(...types) {
    mockReminderFindMany.mockResolvedValue(types.map((reminderType) => ({ reminderType })));
}

const DUE_TUE = ictMorning('2026-08-11');
const DUE_SAT = ictMorning('2026-08-08');

const unpaid = (id, milestone, dueDate, organizationId = 'org-1') => ({
    application: { id, applicationNumber: `APP-${id}`, organizationId },
    milestone,
    dueDate,
});
const ITEM_A = unpaid('app-a', 'M1', DUE_TUE);
const ITEM_B = unpaid('app-b', 'M1', DUE_TUE, 'org-2');
const ITEM_SAT = unpaid('app-sat', 'M2', DUE_SAT);

beforeEach(() => {
    jest.clearAllMocks();
    mockListUnpaid.mockResolvedValue([]);
    mockReminderCreate.mockImplementation(async ({ data }) => ({
        id: `prl-${mockReminderCreate.mock.calls.length}`,
        sentAt: null,
        ...data,
    }));
    mockReminderUpdate.mockResolvedValue({});
    mockReminderFindFirst.mockResolvedValue(null);
    mockLockUnsent.mockResolvedValue([{ id: 'prl-locked' }]);
    ledger();
    mockNotifyParties.mockResolvedValue({ recipients: ['u'], delivered: 1 });
});

// The sweep must never touch invoice / money state, whatever the scenario did.
afterEach(() => {
    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(mockInvoiceUpdateMany).not.toHaveBeenCalled();
    expect(mockInvoiceUpsert).not.toHaveBeenCalled();
    expect(mockCheckoutOrderUpdate).not.toHaveBeenCalled();
    expect(mockPaymentTransactionUpdate).not.toHaveBeenCalled();
});

describe('sweep scope — every unpaid milestone, none without a clock start', () => {
    test('a milestone whose clock start is not on record is skipped and logged, never guessed', async () => {
        mockListUnpaid.mockResolvedValue([unpaid('app-x', 'M2', null), ITEM_A]);
        const summary = await runPaymentReminderSweep(ictMorning('2026-08-06'));
        expect(summary).toMatchObject({ checked: 2, matched: 1, sent: 1 });
        expect(mockReminderCreate.mock.calls.map((c) => c[0].data.applicationId)).toEqual(['app-a']);
        expect(mockLogger.warn).toHaveBeenCalled();
    });
});

describe('three reminder types — send day is the SHIFTED day, ICT date-equality', () => {
    test.each([
        ['2026-08-06', 'PRE_DUE', []],
        ['2026-08-11', 'DUE_DATE', ['PRE_DUE']],
        ['2026-08-13', 'OVERDUE_NOTICE', ['PRE_DUE', 'DUE_DATE']],
    ])('run on %s dispatches %s for the milestone due Tue 2026-08-11', async (runDay, type, alreadySent) => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        ledger(...alreadySent);

        const summary = await runPaymentReminderSweep(ictMorning(runDay));

        expect(mockReminderCreate).toHaveBeenCalledTimes(1);
        const created = mockReminderCreate.mock.calls[0][0].data;
        expect(created).toMatchObject({
            applicationId: 'app-a',
            milestone: 'M1',
            reminderType: type,
            organizationId: 'org-1', // copied from the application (tenant pattern)
        });
        // intendedDate is EXACTLY the schedule service's shifted instant.
        expect(created.intendedDate.getTime())
            .toBe(computeReminderDates(DUE_TUE)[type].getTime());
        expect(dayOf(created.intendedDate)).toBe(runDay);

        // To the applicant and the holder, by application.
        expect(mockNotifyParties).toHaveBeenCalledTimes(1);
        expect(mockNotifyParties).toHaveBeenCalledWith('app-a', expect.objectContaining({
            type: 'PAYMENT_REMINDER',
            data: expect.objectContaining({ milestone: 'M1', reminderType: type, dueDate: DUE_TUE.toISOString() }),
        }), { db: expect.objectContaining({ paymentReminderLog: expect.anything() }) });

        // sentAt stamped on the freshly inserted row.
        expect(mockReminderUpdate).toHaveBeenCalledTimes(1);
        expect(mockReminderUpdate).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: expect.any(String) },
            data: expect.objectContaining({ sentAt: expect.any(Date) }),
        }));

        expect(summary).toMatchObject({ checked: 1, matched: 1, sent: 1, deduped: 0, failed: 0 });
    });

    test('a day that is no reminder day sends nothing (Fri 2026-08-07)', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        ledger('PRE_DUE');

        const summary = await runPaymentReminderSweep(ictMorning('2026-08-07'));

        expect(mockReminderCreate).not.toHaveBeenCalled();
        expect(mockNotifyParties).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ checked: 1, matched: 0, sent: 0 });
    });

    test('catch-up: no sweep ran on any reminder day → the earliest goes out now, worded as overdue', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);

        const summary = await runPaymentReminderSweep(ictMorning('2026-08-17'));

        expect(mockReminderCreate).toHaveBeenCalledTimes(1);
        expect(mockReminderCreate.mock.calls[0][0].data).toMatchObject({ reminderType: 'PRE_DUE' });
        expect(mockNotifyParties).toHaveBeenCalledWith('app-a', expect.objectContaining({
            data: expect.objectContaining({ reminderType: 'OVERDUE_NOTICE' }),
        }), expect.anything());
        expect(summary).toMatchObject({ matched: 1, sent: 1 });
    });

    test('a type already on the ledger under another intended day is not sent again', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        ledger('PRE_DUE', 'DUE_DATE', 'OVERDUE_NOTICE');

        expect(await runPaymentReminderSweep(ictMorning('2026-08-20'))).toMatchObject({ matched: 0, sent: 0 });
        expect(mockReminderCreate).not.toHaveBeenCalled();
    });
});

describe('durable dedup — insert-first, unique constraint is the last line', () => {
    test('same-day re-run: P2002 on the insert → skip silently, no second send', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        ledger('PRE_DUE');

        const first = await runPaymentReminderSweep(ictMorning('2026-08-11'));
        expect(first).toMatchObject({ sent: 1, deduped: 0, failed: 0 });
        expect(mockNotifyParties).toHaveBeenCalledTimes(1);

        // Second run the same day: the durable unique key already holds a row.
        mockReminderCreate.mockRejectedValueOnce(p2002());
        const second = await runPaymentReminderSweep(ictMorning('2026-08-11'));

        expect(second).toMatchObject({ matched: 1, sent: 0, deduped: 1, failed: 0 });
        // Still exactly ONE send + ONE sentAt stamp across both runs.
        expect(mockNotifyParties).toHaveBeenCalledTimes(1);
        expect(mockReminderUpdate).toHaveBeenCalledTimes(1);
    });
});

describe('a reminder that reached nobody is resent on its own row', () => {
    test('an unsent PRE_DUE row exists → no insert, the locked row is dispatched and stamped', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        mockReminderFindFirst.mockResolvedValue({ id: 'prl-unsent' });
        mockLockUnsent.mockResolvedValue([{ id: 'prl-unsent' }]);

        const summary = await runPaymentReminderSweep(ictMorning('2026-08-07'));

        expect(mockReminderCreate).not.toHaveBeenCalled();
        expect(mockNotifyParties).toHaveBeenCalledTimes(1);
        expect(mockReminderUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'prl-unsent' } }));
        expect(summary).toMatchObject({ matched: 1, sent: 1, deduped: 0 });
    });

    test('another sweep holds the unsent row (SKIP LOCKED returns nothing) → deduped, no send', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        mockReminderFindFirst.mockResolvedValue({ id: 'prl-unsent' });
        mockLockUnsent.mockResolvedValue([]);

        const summary = await runPaymentReminderSweep(ictMorning('2026-08-07'));

        expect(mockNotifyParties).not.toHaveBeenCalled();
        expect(mockReminderUpdate).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ matched: 1, sent: 0, deduped: 1 });
    });
});

describe('collision — DUE_DATE and OVERDUE_NOTICE on the same working day', () => {
    test('due Sat 2026-08-08: both fall on Mon 08-10 → one per sweep, DUE_DATE first, both worded as overdue', async () => {
        // Sanity-pin the fixture against the real calendar first.
        const r = computeReminderDates(DUE_SAT);
        expect(dayOf(r.DUE_DATE)).toBe('2026-08-10');
        expect(dayOf(r.OVERDUE_NOTICE)).toBe('2026-08-10');

        mockListUnpaid.mockResolvedValue([ITEM_SAT]);
        ledger('PRE_DUE');
        const first = await runPaymentReminderSweep(ictMorning('2026-08-10'));
        ledger('PRE_DUE', 'DUE_DATE');
        const second = await runPaymentReminderSweep(ictMorning('2026-08-11'));

        expect(mockReminderCreate.mock.calls.map((c) => c[0].data.reminderType)).toEqual(['DUE_DATE', 'OVERDUE_NOTICE']);
        expect(mockNotifyParties.mock.calls.map((c) => c[1].data.reminderType)).toEqual(['OVERDUE_NOTICE', 'OVERDUE_NOTICE']);
        expect([first, second]).toEqual([
            expect.objectContaining({ matched: 1, sent: 1 }),
            expect.objectContaining({ matched: 1, sent: 1 }),
        ]);
    });
});

describe('working-day shift — real calendar, no send on the holiday', () => {
    test('intended OVERDUE_NOTICE lands on วันแม่ (Wed 2026-08-12): holiday run sends nothing, next working day does', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        ledger('PRE_DUE', 'DUE_DATE');

        // Job runs ON the holiday: the shifted intended day is 08-13, so
        // nothing matches today.
        const holidayRun = await runPaymentReminderSweep(ictMorning('2026-08-12'));
        expect(holidayRun).toMatchObject({ matched: 0, sent: 0 });
        expect(mockReminderCreate).not.toHaveBeenCalled();
        expect(mockNotifyParties).not.toHaveBeenCalled();

        // Next working day: the shifted OVERDUE_NOTICE goes out.
        const workdayRun = await runPaymentReminderSweep(ictMorning('2026-08-13'));
        expect(workdayRun).toMatchObject({ matched: 1, sent: 1 });
        expect(mockReminderCreate).toHaveBeenCalledTimes(1);
        expect(mockReminderCreate.mock.calls[0][0].data.reminderType).toBe('OVERDUE_NOTICE');
    });
});

describe('fault isolation — one broken milestone never sinks the sweep', () => {
    test('non-P2002 insert failure on application 1 is logged; application 2 still gets its reminder', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A, ITEM_B]);
        ledger('PRE_DUE');
        mockReminderCreate.mockRejectedValueOnce(new Error('db down'));

        const summary = await runPaymentReminderSweep(ictMorning('2026-08-11'));

        expect(summary).toMatchObject({ checked: 2, failed: 1, sent: 1 });
        expect(mockNotifyParties).toHaveBeenCalledTimes(1);
        expect(mockNotifyParties.mock.calls[0][0]).toBe('app-b');
        expect(mockLogger.error).toHaveBeenCalled();
    });

    test('a reminder that reached nobody leaves sentAt unstamped and is not counted as sent', async () => {
        mockListUnpaid.mockResolvedValue([ITEM_A]);
        ledger('PRE_DUE');
        mockNotifyParties.mockResolvedValueOnce({ recipients: [], delivered: 0 });

        const summary = await runPaymentReminderSweep(ictMorning('2026-08-11'));

        expect(summary).toMatchObject({ matched: 1, sent: 0, failed: 0 });
        expect(mockReminderUpdate).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalled();
    });
});

describe('source pins — derived-only stays derived-only', () => {
    const src = fs.readFileSync(JOB_FILE, 'utf8');

    test('no stored-overdue literal, no invoice mutation call in the job source', () => {
        expect(src).not.toMatch(/['"`]overdue['"`]/i);
        expect(src).not.toMatch(/invoice\.(update|updateMany|upsert|delete)/);
    });

    test('no calendar or reminder-window data of its own — schedule service + config own those', () => {
        expect(src).not.toMatch(/HOLIDAY/i);
        expect(src).not.toMatch(/['"]\d{2}-\d{2}['"]/);
        expect(src).toMatch(/require\('\.\.\/services\/checkout\/checkout-schedule-service'\)/);
    });

    // Mock-vs-reality guard (waiver-job idiom): the NotifyType mocked above
    // must exist in the real notification-service WITH a template.
    test('real notification-service defines PAYMENT_REMINDER + template (static)', () => {
        const notifSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'services', 'notification-service.js'), 'utf8',
        );
        expect(notifSrc).toMatch(/PAYMENT_REMINDER: 'PAYMENT_REMINDER'/);
        expect(notifSrc).toMatch(/\[NotifyType\.PAYMENT_REMINDER\]: \(data\) =>/);
    });
});

describe('scheduler registration — daily 09:00 Asia/Bangkok, additive block', () => {
    const mockCronSchedule = jest.fn(() => ({ stop: jest.fn() }));
    const mockSweep = jest.fn(async () => ({ checked: 0, matched: 0, sent: 0, deduped: 0, failed: 0 }));

    function loadScheduler() {
        jest.resetModules();
        jest.doMock('node-cron', () => ({ schedule: (...args) => mockCronSchedule(...args) }));
        jest.doMock('../../shared/logger', () => ({ ...mockLogger, createLogger: jest.fn(() => mockLogger) }));
        jest.doMock('../../jobs/revision-deadline-checker', () => ({
            checkExpiredDeadlines: jest.fn(async () => ({})),
        }));
        jest.doMock('../../jobs/work-activity-sla-monitor', () => ({
            checkOverdueActivities: jest.fn(async () => ({})),
        }));
        jest.doMock('../../cron/renewal-reminder-cron', () => ({
            run: jest.fn(async () => ({})),
        }));
        // The scheduler block lazy-requires the job (light-mocks idiom) —
        // intercept it so the callback probe below observes the call.
        jest.doMock('../../jobs/payment-reminder-job', () => ({
            runPaymentReminderSweep: (...args) => mockSweep(...args),
        }));
        return require(path.resolve(__dirname, '../../jobs/scheduler.js'));
    }

    beforeEach(() => {
        mockCronSchedule.mockClear();
        mockSweep.mockClear();
    });

    test('registers the payment-reminder block: 13 blocks total, last 0 9 * * * Asia/Bangkok drives the sweep', async () => {
        const scheduler = loadScheduler();
        scheduler.start();

        // 9 pre-existing blocks + the W3-41 payment-reminder block + the R2 M5
        // payment-closure block (daily 03:00 BKK — not a 09:00 morning call) +
        // the Task 5 settlement-reconcile block (every 10 min — not a 09:00
        // morning call either) + the G1 item 4 DTAM remittance batch (monthly,
        // 1st 02:00 BKK — not a morning call either). Was 13, then 12 when M3
        // (operator 2026-08-23, "ไม่มีค่าสมาชิก") deleted the subscription
        // auto-renewal block, and 13 again since the remittance batch landed.
        // 12 since the Slip SLA Monitor cron was removed with the slip subsystem (2026-09-06).
        // 11 ตั้งแต่ 2026-09-11 — งาน Subscription Expiry ถูกลบพร้อมพื้นผิวแพ็กเกจสมาชิก
        // ทั้งชุด (operator: แพลตฟอร์มไม่มีบริการนี้) ตาราง subscriptions ถูก drop ใน
        // 20260911140000_retire_subscriptions_and_slips จึงไม่มีแถวให้หมดอายุอีก
        // 11 since 2026-09-29: +1 stale PENDING pre-check sweep (every 5 min), −1 DTAM remittance
        // monthly batch (removed; operator 2026-09-11 "ถอดออกทั้งระบบ").
        // 10 since 2026-10-07: −1 daily 00:00 certificate-expiry job (renewal-reminder-cron
        // alone reminds, once per tier).
        // 11 since 2026-10-09: + the hourly correction-deadline sweep (moved in from the HTTP cron door).
        // 12 since 2026-10-09: + the hourly field-visit reminder (order 56(1) 3.3).
        // 13 since 2026-10-09: + the hourly ask for the person on site (order 65(2)).
        // 12 since 2026-10-13: − the field-visit reminder until the reschedule request of order 65(3) lands with it.
        // 13 since 2026-10-27: + the hourly (:50) sweep of unsent CAR evidence files (order 129(3)).
        expect(mockCronSchedule).toHaveBeenCalledTimes(13);

        const morningCalls = mockCronSchedule.mock.calls.filter((call) => {
            const opts = call[2];
            return call[0] === '0 9 * * *' && opts && opts.timezone === 'Asia/Bangkok';
        });
        // Renewal reminder + payment reminder. Subscription auto-renewal was
        // the third until M3 deleted it.
        expect(morningCalls.length).toBe(2);

        // The payment-reminder block is registered LAST (appended, additive).
        const callback = morningCalls[morningCalls.length - 1][1];
        await callback();
        expect(mockSweep).toHaveBeenCalledTimes(1);

        scheduler.stop();
    });

    test('sweep failure is swallowed and logged — the cron never throws', async () => {
        mockSweep.mockRejectedValueOnce(new Error('boom'));
        const scheduler = loadScheduler();
        scheduler.start();

        const morningCalls = mockCronSchedule.mock.calls.filter((call) => {
            const opts = call[2];
            return call[0] === '0 9 * * *' && opts && opts.timezone === 'Asia/Bangkok';
        });
        const callback = morningCalls[morningCalls.length - 1][1];

        await expect(callback()).resolves.toBeUndefined();
        expect(mockLogger.error).toHaveBeenCalledWith(
            '[Cron] Payment Reminder Sweep failed:', expect.any(Error),
        );

        scheduler.stop();
    });
});
