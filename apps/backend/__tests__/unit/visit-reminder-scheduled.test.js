'use strict';

/**
 * The reminder before a field visit (operator order 56(1) 3.3) tells the applicant to ask for another
 * date through the application page. That request is order 65(3), and 65(3) says the two deploy
 * together, so until the request exists no block of the scheduler runs the reminder. The branch that
 * adds the request flips the first test in the same change. The job and its rule stay.
 */

const path = require('path');

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockCronSchedule = jest.fn(() => ({ stop: jest.fn() }));
const mockVisitReminders = jest.fn(async () => ({ checked: 0, skipped: 0, reminded: 0 }));

/** Every module a block of the scheduler loads, each a no-op, so every block can run here. */
const BLOCK_MODULES = {
    '../../services/special-holiday-service': { refreshSpecialHolidays: async () => {} },
    '../../jobs/correction-deadline-sweep': { runCorrectionDeadlineSweep: async () => ({}) },
    '../../jobs/site-contact-request-job': { runSiteContactRequests: async () => ({}) },
    '../../jobs/pdpa-retention-job': { runPdpaRetentionSweep: async () => ({}) },
    '../../services/audit-trail': { runScheduledChainVerification: async () => ({}) },
    '../../jobs/waiver-sla-escalation-job': { runWaiverSlaEscalation: async () => ({}) },
    '../../jobs/payment-reminder-job': { runPaymentReminderSweep: async () => ({}) },
    '../../jobs/payment-closure-job': { runPaymentClosureSweep: async () => ({}) },
    '../../jobs/settlement-reconcile-job': { runSettlementReconcile: async () => ({}) },
    '../../jobs/document-precheck-stale-sweep': { runStalePrecheckSweep: async () => ({}) },
};

function loadScheduler() {
    jest.resetModules();
    jest.doMock('node-cron', () => ({ schedule: (...args) => mockCronSchedule(...args) }));
    jest.doMock('../../shared/logger', () => ({ ...mockLogger, createLogger: jest.fn(() => mockLogger) }));
    jest.doMock('../../jobs/revision-deadline-checker', () => ({ checkExpiredDeadlines: jest.fn(async () => ({})) }));
    jest.doMock('../../jobs/work-activity-sla-monitor', () => ({ checkOverdueActivities: jest.fn(async () => ({})) }));
    jest.doMock('../../cron/renewal-reminder-cron', () => ({ run: jest.fn(async () => ({})) }));
    jest.doMock('../../jobs/visit-reminder-job', () => ({ runVisitReminders: (...args) => mockVisitReminders(...args) }));
    for (const [modulePath, stub] of Object.entries(BLOCK_MODULES)) { jest.doMock(modulePath, () => stub); }
    return require(path.resolve(__dirname, '../../jobs/scheduler.js'));
}

test('no block runs the visit reminder while the applicant cannot ask for another date (order 65(3))', async () => {
    const scheduler = loadScheduler();
    scheduler.start();
    expect(mockCronSchedule.mock.calls.length).toBeGreaterThan(0);
    for (const [, runBlock] of mockCronSchedule.mock.calls) { await runBlock(); }
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockVisitReminders).not.toHaveBeenCalled();
    scheduler.stop();
});

test('nobody can mute it', () => {
    const { ALWAYS_ON_TYPES } = jest.requireActual('../../services/notification-preferences-service');
    expect(ALWAYS_ON_TYPES).toContain('AUDIT_VISIT_REMINDER');
});
