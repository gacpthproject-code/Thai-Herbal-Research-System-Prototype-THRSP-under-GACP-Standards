'use strict';

/**
 * The correction-deadline sweep runs in the backend's own scheduler, every hour (the
 * dispatcher-defaults memo: the reminders lived behind an HTTP door nothing on staging called).
 */

const path = require('path');

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockCronSchedule = jest.fn(() => ({ stop: jest.fn() }));
const mockSweep = jest.fn(async () => ({ checked: 0, skipped: 0, remindersSentCount: 0, cancelledCount: 0 }));

function loadScheduler() {
    jest.resetModules();
    jest.doMock('node-cron', () => ({ schedule: (...args) => mockCronSchedule(...args) }));
    jest.doMock('../../shared/logger', () => ({ ...mockLogger, createLogger: jest.fn(() => mockLogger) }));
    jest.doMock('../../jobs/revision-deadline-checker', () => ({ checkExpiredDeadlines: jest.fn(async () => ({})) }));
    jest.doMock('../../jobs/work-activity-sla-monitor', () => ({ checkOverdueActivities: jest.fn(async () => ({})) }));
    jest.doMock('../../cron/renewal-reminder-cron', () => ({ run: jest.fn(async () => ({})) }));
    jest.doMock('../../jobs/correction-deadline-sweep', () => ({ runCorrectionDeadlineSweep: (...args) => mockSweep(...args) }));
    return require(path.resolve(__dirname, '../../jobs/scheduler.js'));
}

test('an hourly block runs the correction-deadline sweep on the Bangkok clock', async () => {
    const scheduler = loadScheduler();
    scheduler.start();
    const block = mockCronSchedule.mock.calls.find((call) => call[0] === '45 * * * *');
    expect(block).toBeDefined();
    expect(block[2]).toMatchObject({ timezone: 'Asia/Bangkok' });
    await block[1]();
    expect(mockSweep).toHaveBeenCalledTimes(1);
    scheduler.stop();
});
