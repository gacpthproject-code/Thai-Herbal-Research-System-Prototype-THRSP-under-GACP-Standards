/**
 * คำสั่ง 118(3) บน real Postgres: ตัวรันงานปิดคำขอเรียกงานของ scheduler บนนาฬิกาจริง
 * ไม่เลื่อนเวลา ไม่แก้เวลาในฐานข้อมูลระหว่างรัน แถวที่ถูกสร้างให้เลยกำหนดมาแล้วจึงถูกปิด
 * แถวที่ยังไม่ถึงกำหนดอยู่เหมือนเดิม
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const path = require('path');
const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d, getTestDatabase } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

const DAY_MS = 86400e3;
const ENTRY = path.resolve(__dirname, '../../scripts/ops/run-closing-jobs.js');

d('run-closing-jobs: the scheduler\'s closing jobs on the real clock (real Postgres)', () => {
    let raw;
    let fx;
    let seq = 0;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'closing');
    });

    afterAll(async () => {
        await raw.paymentReminderLog.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);
    const statusOf = (id) => raw.application.findUnique({ where: { id }, select: { status: true, closedReason: true } });

    async function revisionWithDeadline(due) {
        const application = await fx.makeApplication({ status: 'REVISION_REQUESTED', reviewerId: fx.reviewer.id });
        await raw.revisionDeadline.create({ data: { applicationId: application.id, organizationId: fx.orgId, revisionDue: due, status: 'PENDING', revisionCount: 1 } });
        return application;
    }

    const carStampedDue = (due) => fx.makeApplication({ status: 'CAR_PENDING', reviewerId: fx.reviewer.id, formData: { carDueAt: due.toISOString() } });

    async function unpaidM1({ quotedDaysAgo, remindedDaysAgo }) {
        seq += 1;
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE', reviewerId: fx.reviewer.id });
        await raw.quotation.create({
            data: {
                applicationId: application.id, issuerType: 'PLATFORM', quotationNumber: `QT-CLOSING-${seq}-${fx.sfx}`,
                subtotal: 5500, vat: 385, totalAmount: 5885, status: 'SENT', organizationId: fx.orgId, createdAt: daysAgo(quotedDaysAgo),
            },
        });
        if (remindedDaysAgo !== null) {
            for (const [i, reminderType] of ['PRE_DUE', 'DUE_DATE', 'OVERDUE_NOTICE'].entries()) {
                const at = daysAgo(remindedDaysAgo + 2 - i);
                await raw.paymentReminderLog.create({
                    data: { applicationId: application.id, milestone: 'M1', reminderType, intendedDate: at, sentAt: at, organizationId: fx.orgId },
                });
            }
        }
        return application;
    }

    async function seedWorld() {
        return {
            revisionOverdue: await revisionWithDeadline(daysAgo(10)),
            revisionOpen: await revisionWithDeadline(new Date(Date.now() + 10 * DAY_MS)),
            carOverdue: await carStampedDue(daysAgo(3)),
            carOpen: await carStampedDue(new Date(Date.now() + 10 * DAY_MS)),
            unpaidPastGrace: await unpaidM1({ quotedDaysAgo: 120, remindedDaysAgo: 30 }),
            unpaidWithinGrace: await unpaidM1({ quotedDaysAgo: 120, remindedDaysAgo: 2 }),
            unpaidNeverReminded: await unpaidM1({ quotedDaysAgo: 120, remindedDaysAgo: null }),
        };
    }

    async function expectClosedOnTheRealClock(world) {
        expect(await statusOf(world.revisionOverdue.id)).toEqual({ status: 'EXPIRED', closedReason: 'CORRECTION_DEADLINE_EXPIRED' });
        expect((await statusOf(world.carOverdue.id)).status).toBe('EXPIRED');
        expect(await statusOf(world.unpaidPastGrace.id)).toEqual({ status: 'EXPIRED', closedReason: 'PAYMENT_ABANDONED' });
        expect((await statusOf(world.revisionOpen.id)).status).toBe('REVISION_REQUESTED');
        expect((await statusOf(world.carOpen.id)).status).toBe('CAR_PENDING');
        expect((await statusOf(world.unpaidWithinGrace.id)).status).toBe('PENDING_DOC_FEE');
        expect((await statusOf(world.unpaidNeverReminded.id)).status).toBe('PENDING_DOC_FEE');
    }

    test('in process: the entry calls the scheduler\'s four closing jobs once each with no clock argument, no other job, and closes only what is overdue', async () => {
        const world = await seedWorld();
        const jobs = {
            checkExpiredDeadlines: require('../../jobs/revision-deadline-checker'),
            runCorrectionDeadlineSweep: require('../../jobs/correction-deadline-sweep'),
            runPaymentClosureSweep: require('../../jobs/payment-closure-job'),
            runCarStagedFilesSweep: require('../../services/car-staged-files-sweep'),
            runPaymentReminderSweep: require('../../jobs/payment-reminder-job'),
            runSiteContactRequests: require('../../jobs/site-contact-request-job'),
            runSettlementReconcile: require('../../jobs/settlement-reconcile-job'),
            runStalePrecheckSweep: require('../../jobs/document-precheck-stale-sweep'),
            checkOverdueActivities: require('../../jobs/work-activity-sla-monitor'),
        };
        const spies = Object.fromEntries(Object.entries(jobs).map(([name, mod]) => [name, jest.spyOn(mod, name)]));

        const result = await require(ENTRY).runClosingJobs();

        expect(result.ok).toBe(true);
        expect(result.summary).toMatch(/^closing-jobs revisionDeadlineChecker:\S+ correctionDeadlineSweep:\S+ paymentClosureSweep:\S+ carStagedFilesSweep:\S+$/);
        const called = Object.fromEntries(Object.entries(spies).map(([name, s]) => [name, s.mock.calls]));
        expect(called).toEqual({
            checkExpiredDeadlines: [[]],
            runCorrectionDeadlineSweep: [[]],
            runPaymentClosureSweep: [[]],
            runCarStagedFilesSweep: [[]],
            runPaymentReminderSweep: [],
            runSiteContactRequests: [],
            runSettlementReconcile: [],
            runStalePrecheckSweep: [],
            checkOverdueActivities: [],
        });
        Object.values(spies).forEach((s) => s.mockRestore());
        await expectClosedOnTheRealClock(world);
    });

    test('the command line closes what is overdue on the real clock, exits 0, and prints a summary of names and counts', async () => {
        const world = await seedWorld();
        const env = { ...process.env, DATABASE_URL: getTestDatabase().url };
        const run = spawnSync(process.execPath, [ENTRY], { env, encoding: 'utf8', timeout: 120000 });
        expect({ status: run.status, stderr: run.stderr.split('\n').filter((line) => /failed|Error/.test(line)) }).toEqual({ status: 0, stderr: [] });
        const last = run.stdout.split('\n').filter((line) => line.startsWith('closing-jobs ')).pop();
        expect(last).toMatch(/^closing-jobs revisionDeadlineChecker:[a-zA-Z]+=\d+(,[a-zA-Z]+=\d+)* correctionDeadlineSweep:[a-zA-Z]+=\d+(,[a-zA-Z]+=\d+)* paymentClosureSweep:[a-zA-Z]+=\d+(,[a-zA-Z]+=\d+)* carStagedFilesSweep:[a-zA-Z]+=\d+(,[a-zA-Z]+=\d+)*$/);
        expect(last).toMatch(/paymentClosureSweep:\S*closed=[1-9]/);
        await expectClosedOnTheRealClock(world);
    });
});
