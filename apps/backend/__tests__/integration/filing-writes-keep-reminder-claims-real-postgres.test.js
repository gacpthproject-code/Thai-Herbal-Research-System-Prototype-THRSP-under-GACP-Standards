/**
 * A write that rebuilds the whole filing never erases a reminder claimed while it was in flight
 * (security re-review 2026-10-09 L-C, the reviewer's P5 race on real doors and real Postgres): the
 * reviewer's form-fields edit reads the filing, the dispatcher's once-per-round reminder claims it,
 * and the edit then wrote its stale copy back, so the second press of the round was sent too.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');

const mockActor = { current: null };
jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const { tenantContextMiddleware } = jest.requireActual('../../middleware/tenant-context-middleware');
    const bindTenant = tenantContextMiddleware();
    const attach = (req, res, next) => {
        req.user = { ...mockActor.current };
        return bindTenant(req, res, next);
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});

const DAY = 24 * 60 * 60 * 1000;
const FILED = {
    applicantData: { fullName: 'ผู้ยื่นทดสอบ', phone: '0813334444' },
    farmData: { siteName: 'แปลงทดสอบ', siteAddress: '1 หมู่ 1', subDistrict: 'แม่ริม', district: 'แม่ริม', province: 'เชียงใหม่' },
};

d('a filing write keeps the reminder claimed while it was in flight (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'claimkeep' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
    });
    afterAll(async () => { await world.cleanup(); });

    test('the reviewer\'s edit keeps the dispatcher\'s reminder claim; the second press of the round is refused and the applicant is told once', async () => {
        const due = new Date(Date.now() + 3 * DAY).toISOString();
        const row = await world.application('REVISION_REQUESTED', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: { ...FILED, revisionDueAt: due } });
        const remind = () => { as(fx.dispatcherA); return request(app).post(`/api/provider/scheduler/applications/${row.id}/send-reminder`).send({}); };

        // The race: the edit has read the filing and is about to write it when the reminder claims it.
        const applicationService = require('../../services/application-service');
        const original = applicationService.updateApplicationColumns;
        let first = null;
        const spy = jest.spyOn(applicationService, 'updateApplicationColumns').mockImplementation(async (...args) => {
            if (!first) { first = await remind(); }
            return original.apply(applicationService, args);
        });
        as(fx.reviewerA);
        const edit = await request(app).patch(`/api/provider/applications/${row.id}/form-fields`).send({ changes: { harvestData: { note: 'แก้ข้อความ' } } });
        spy.mockRestore();

        const stored = (await world.rowOf(row.id)).formData;
        const second = await remind();
        const notices = await world.raw.notification.count({
            where: { userId: fx.applicant.id, title: 'แจ้งเตือนจากผู้จัดคิว', metadata: { path: ['applicationNumber'], equals: row.applicationNumber } },
        });
        expect([first && first.status, edit.status]).toEqual([200, 200]);
        expect(stored.harvestData).toMatchObject({ note: 'แก้ข้อความ' });
        expect(stored.dispatcherReminder).toMatchObject({ sentBy: fx.dispatcherA.id });
        expect([second.status, second.body.code]).toEqual([409, 'REMINDER_ALREADY_SENT_THIS_ROUND']);
        expect(notices).toBe(1);
    });
});
