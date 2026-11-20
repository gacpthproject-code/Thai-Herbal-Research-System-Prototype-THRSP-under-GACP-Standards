'use strict';

/**
 * คำสั่ง 118(3): ตัวรันงานปิดคำขอ (scripts/ops/run-closing-jobs.js) เรียกงานเดียวกับที่ scheduler ลงทะเบียนไว้
 * ด้วยอาร์กิวเมนต์เดียวกัน (นาฬิกาจริง) และไม่เรียกงานอื่นของ scheduler เลย
 */

const path = require('path');

const calls = [];
const spy = (name) => jest.fn(async (...args) => { calls.push([name, args]); return { scanned: 0 }; });

const JOB_MODULES = {
    '../../jobs/revision-deadline-checker': { checkExpiredDeadlines: 'checkExpiredDeadlines' },
    '../../services/special-holiday-service': { refreshSpecialHolidays: 'refreshSpecialHolidays' },
    '../../jobs/correction-deadline-sweep': { runCorrectionDeadlineSweep: 'runCorrectionDeadlineSweep' },
    '../../jobs/payment-closure-job': { runPaymentClosureSweep: 'runPaymentClosureSweep' },
    '../../jobs/work-activity-sla-monitor': { checkOverdueActivities: 'checkOverdueActivities' },
    '../../cron/renewal-reminder-cron': { run: 'renewalReminder' },
    '../../jobs/site-contact-request-job': { runSiteContactRequests: 'runSiteContactRequests' },
    '../../jobs/pdpa-retention-job': { runPdpaRetentionSweep: 'runPdpaRetentionSweep' },
    '../../services/audit-trail': { runScheduledChainVerification: 'runScheduledChainVerification' },
    '../../jobs/waiver-sla-escalation-job': { runWaiverSlaEscalation: 'runWaiverSlaEscalation' },
    '../../jobs/payment-reminder-job': { runPaymentReminderSweep: 'runPaymentReminderSweep' },
    '../../jobs/settlement-reconcile-job': { runSettlementReconcile: 'runSettlementReconcile' },
    '../../jobs/document-precheck-stale-sweep': { runStalePrecheckSweep: 'runStalePrecheckSweep' },
    '../../services/car-staged-files-sweep': { runCarStagedFilesSweep: 'runCarStagedFilesSweep' },
};

const scheduled = [];
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function loadWithEveryJobRecorded() {
    jest.resetModules();
    jest.doMock('node-cron', () => ({ schedule: (expr, callback) => { scheduled.push({ expr, callback }); return { stop: jest.fn() }; } }));
    jest.doMock('../../shared/logger', () => ({ ...mockLogger, createLogger: jest.fn(() => mockLogger) }));
    jest.doMock('../../services/prisma-database', () => ({ prisma: {}, disconnect: jest.fn(async () => {}) }));
    Object.entries(JOB_MODULES).forEach(([modulePath, exportsToNames]) => {
        jest.doMock(modulePath, () => Object.fromEntries(Object.entries(exportsToNames).map(([key, name]) => [key, spy(name)])));
    });
    const scheduler = require(path.resolve(__dirname, '../../jobs/scheduler.js'));
    const entry = require(path.resolve(__dirname, '../../scripts/ops/run-closing-jobs.js'));
    return { scheduler, entry };
}

async function callsOf(run) {
    calls.length = 0;
    await run();
    return calls.splice(0);
}

test('the entry runs exactly the revision-deadline, correction-deadline, unpaid-closure and unsent-CAR-file blocks of the scheduler, with the same arguments, and no other job', async () => {
    const { scheduler, entry } = loadWithEveryJobRecorded();
    scheduler.start();
    const blocks = [];
    for (const { expr, callback } of scheduled) {
        blocks.push({ expr, calls: await callsOf(callback) });
    }
    scheduler.stop();

    const closingNames = new Set(['checkExpiredDeadlines', 'runCorrectionDeadlineSweep', 'runPaymentClosureSweep', 'runCarStagedFilesSweep']);
    const closingBlocks = blocks.filter((block) => block.calls.some(([name]) => closingNames.has(name)));
    expect(closingBlocks.map((block) => block.expr)).toEqual(['15 * * * *', '45 * * * *', '0 3 * * *', '50 * * * *']);

    const entryCalls = await callsOf(() => entry.runClosingJobs());
    expect(entryCalls).toEqual(closingBlocks.flatMap((block) => block.calls));
    expect(entryCalls).toEqual([
        ['refreshSpecialHolidays', []],
        ['checkExpiredDeadlines', []],
        ['runCorrectionDeadlineSweep', []],
        ['runPaymentClosureSweep', []],
        ['runCarStagedFilesSweep', []],
    ]);
});

test('the summary carries job names and integer counts only, and one failing job fails the run without stopping the next', async () => {
    const { entry } = loadWithEveryJobRecorded();
    const correction = require('../../jobs/correction-deadline-sweep');
    correction.runCorrectionDeadlineSweep.mockRejectedValueOnce(new Error('APP-SECRET-0001 boom'));
    require('../../jobs/payment-closure-job').runPaymentClosureSweep.mockResolvedValueOnce({ scanned: 4, closed: 1, note: 'APP-SECRET-0002', ids: ['x'] });
    require('../../jobs/revision-deadline-checker').checkExpiredDeadlines.mockResolvedValueOnce({ processed: 2, expired: 1, errors: 0 });
    const result = await entry.runClosingJobs();
    expect(result).toEqual({
        ok: false,
        summary: 'closing-jobs revisionDeadlineChecker:processed=2,expired=1,errors=0 correctionDeadlineSweep:failed paymentClosureSweep:scanned=4,closed=1 carStagedFilesSweep:scanned=0',
    });
});
