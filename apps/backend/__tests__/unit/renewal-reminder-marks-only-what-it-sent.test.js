'use strict';

const PUBLIC_URL_KEYS = ['APP_PUBLIC_URL', 'STAGING_PUBLIC_URL', 'APP_URL', 'PUBLIC_APP_URL'];

const certificate = {
    id: 'cert-1',
    userId: 'user-1',
    applicationId: 'app-1',
    certificateNumber: 'TH-GACP 87/2568',
    farmName: 'ไร่ตัวอย่าง',
    expiryDate: '2027-01-15T00:00:00.000Z',
    daysLeft: 30,
};
const now = new Date('2026-12-16T02:00:00.000Z');

function loadCron({ alreadySent = false } = {}) {
    jest.resetModules();
    const renewalService = {
        REMINDER_DAYS: [60, 30, 15],
        REMINDER_TYPE_BY_DAYS: { 60: 'D60', 30: 'D30', 15: 'D15' },
        getApplicationsForRenewalReminder: jest.fn(async () => [certificate]),
        hasRenewalReminderBeenSent: jest.fn(async () => alreadySent),
        markRenewalReminderSent: jest.fn(async () => ({ alreadySent: false })),
    };
    const parties = { fanoutToApplicationParties: jest.fn(async () => ({ recipients: ['user-1'], delivered: 1, failed: 0 })) };
    jest.doMock('../../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
    jest.doMock('../../services/renewal-service', () => renewalService);
    jest.doMock('../../services/notification/application-parties', () => parties);
    const { _internals: { _processTier } } = require('../../cron/renewal-reminder-cron');
    return { processTier: _processTier, renewalService, parties };
}

describe('เครื่องหมาย "ส่งแล้ว" ของจดหมายเตือนต่ออายุ', () => {
    const savedEnv = {};

    beforeEach(() => {
        savedEnv.NODE_ENV = process.env.NODE_ENV;
        for (const key of PUBLIC_URL_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        process.env.NODE_ENV = savedEnv.NODE_ENV;
        for (const key of PUBLIC_URL_KEYS) {
            if (savedEnv[key] === undefined) { delete process.env[key]; } else { process.env[key] = savedEnv[key]; }
        }
    });

    it('production ที่ไม่ได้ตั้ง APP_PUBLIC_URL: ปฏิเสธการส่ง และไม่เขียนว่าส่งแล้ว', async () => {
        process.env.NODE_ENV = 'production';
        const { processTier, renewalService, parties } = loadCron();

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect(summary).toMatchObject({ found: 1, sent: 0, failed: 1 });
        expect(parties.fanoutToApplicationParties).not.toHaveBeenCalled();
        expect(renewalService.markRenewalReminderSent).not.toHaveBeenCalled();
    });

    it('ส่งสำเร็จ: เขียนว่าส่งแล้วหลังส่งถึงมือ ด้วยใบและขั้นเตือนนั้น', async () => {
        process.env.APP_PUBLIC_URL = 'https://web.example.test';
        const { processTier, renewalService, parties } = loadCron();

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect(summary).toMatchObject({ found: 1, sent: 1, failed: 0 });
        expect(parties.fanoutToApplicationParties).toHaveBeenCalledWith(
            'app-1',
            expect.objectContaining({ type: 'CERTIFICATE_EXPIRING_SOON' }),
        );
        expect(renewalService.markRenewalReminderSent).toHaveBeenCalledTimes(1);
        expect(renewalService.markRenewalReminderSent).toHaveBeenCalledWith({
            certificateId: 'cert-1',
            reminderType: 'D30',
            sentAt: now,
        });
        const [dispatchOrder] = parties.fanoutToApplicationParties.mock.invocationCallOrder;
        const [markOrder] = renewalService.markRenewalReminderSent.mock.invocationCallOrder;
        expect(dispatchOrder).toBeLessThan(markOrder);
    });

    it('ขั้นเตือนนี้ส่งไปแล้ว: ข้าม ไม่ส่งซ้ำ ไม่เขียนซ้ำ', async () => {
        process.env.APP_PUBLIC_URL = 'https://web.example.test';
        const { processTier, renewalService, parties } = loadCron({ alreadySent: true });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect(summary).toMatchObject({ found: 1, sent: 0, skipped: 1, failed: 0 });
        expect(parties.fanoutToApplicationParties).not.toHaveBeenCalled();
        expect(renewalService.markRenewalReminderSent).not.toHaveBeenCalled();
    });
});
