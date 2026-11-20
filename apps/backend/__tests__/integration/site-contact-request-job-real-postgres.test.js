/**
 * Operator order 65(2), 2026-10-09: a filed application that names no one on site asks the applicant
 * and the holder to add one, in the channel the system already uses for asks (an in-app notice), once
 * per application, while the contact can still be changed (before the visit). Real Postgres; the job
 * reads every application in the database, so its read is narrowed to this file's rows.
 *
 * The dispatcher's card says when the applicant was asked, so an application counts as asked only
 * once a notice reached somebody: a notice that throws, or a run that dies before its notice goes
 * out, never leaves it marked as asked (review of rounds 5-6, M-1).
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SITE = { siteName: 'แปลงทดสอบ', siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true };

const mockNotice = { throwFor: null, hangFor: null, hung: null };
jest.mock('../../services/notification/application-parties', () => {
    const actual = jest.requireActual('../../services/notification/application-parties');
    return {
        ...actual,
        notifyApplicationParties: async (applicationId, ...rest) => {
            if (applicationId === mockNotice.throwFor) {
                mockNotice.throwFor = null;
                throw new Error('test: the notice store is unavailable');
            }
            if (applicationId === mockNotice.hangFor) {
                mockNotice.hangFor = null;
                return new Promise((resolve, reject) => { mockNotice.hung = { resolve, reject }; });
            }
            return actual.notifyApplicationParties(applicationId, ...rest);
        },
    };
});

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

d('the applicant is asked to add the person on site (real Postgres)', () => {
    let world;
    let fx;
    let app;

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'contactask' });
        ({ fx } = world);
        jest.doMock('../../services/prisma-database', () => {
            const actual = jest.requireActual('../../services/prisma-database');
            return { ...actual, prisma: world.narrowedToThisWorld(actual.prisma) };
        });
        app = express();
        app.use(express.json());
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
    });
    afterAll(async () => { await world.cleanup(); });

    const asksOf = (row) => world.raw.notification.findMany({
        where: { type: 'SITE_CONTACT_REQUESTED', metadata: { path: ['applicationNumber'], equals: row.applicationNumber } },
        select: { userId: true, title: true, message: true },
    });
    const askedParties = async (row) => (await asksOf(row)).map((notice) => notice.userId).sort();

    /** The row of the dispatcher's queue that the booking card is drawn from. */
    async function queueItemOf(row) {
        mockActor.current = { ...fx.dispatcherA };
        const res = await request(app).get('/api/audit/scheduling/queue');
        expect(res.status).toBe(200);
        return res.body.data.items.find((item) => item.applicationId === row.id);
    }

    /** The row of the dispatcher's calendar, which also lists booked visits. */
    async function calendarItemOf(row) {
        mockActor.current = { ...fx.dispatcherA };
        const res = await request(app).get('/api/provider/scheduler/audits/schedules');
        expect(res.status).toBe(200);
        return res.body.data.find((item) => item.applicationId === row.id);
    }

    test('a filing without one asks the applicant and the holder once; filings with one, past their visit, or decided are not asked', async () => {
        const { runSiteContactRequests } = require('../../jobs/site-contact-request-job');
        const missing = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: { siteName: 'แปลงไม่มีผู้ติดต่อ' } } });
        const named = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: SITE } });
        const visited = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() - DAY),
            formData: { farmData: { siteName: 'แปลงที่ตรวจแล้ว' } },
        });
        const decided = await world.application('CERTIFIED', { milestones: ['M1', 'M2'], formData: { farmData: { siteName: 'แปลงที่ได้ใบแล้ว' } } });

        await runSiteContactRequests();
        const asked = await asksOf(missing);
        expect(asked.map((n) => n.userId).sort()).toEqual([fx.applicant.id, fx.holderMember.id].sort());
        expect(asked[0]).toMatchObject({ title: 'กรุณาเพิ่มผู้ติดต่อหน้างาน' });
        expect(asked[0].message).toContain(missing.applicationNumber);
        expect((await world.rowOf(missing.id)).formData.siteContactRequest).toMatchObject({ sentAt: expect.any(String) });
        for (const row of [named, visited, decided]) {
            expect([row.applicationNumber, (await asksOf(row)).length]).toEqual([row.applicationNumber, 0]);
        }

        await runSiteContactRequests();
        expect(await asksOf(missing)).toHaveLength(2);
    });

    test('a notice that throws leaves the application unasked: the dispatcher is not told it was asked, and the next run asks', async () => {
        const { runSiteContactRequests } = require('../../jobs/site-contact-request-job');
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: { siteName: 'แปลงที่แจ้งไม่ถึง' } } });

        mockNotice.throwFor = row.id;
        await runSiteContactRequests();
        expect(mockNotice.throwFor).toBeNull();
        expect(await askedParties(row)).toEqual([]);
        expect(await queueItemOf(row)).toMatchObject({ siteContactGiven: false, siteContactRequestedAt: null });

        await runSiteContactRequests();
        expect(await askedParties(row)).toEqual([fx.applicant.id, fx.holderMember.id].sort());
        expect((await queueItemOf(row)).siteContactRequestedAt).toEqual(expect.any(String));
    });

    test('a run that dies before its notice goes out leaves the application unasked, and a later run asks it', async () => {
        const { runSiteContactRequests } = require('../../jobs/site-contact-request-job');
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: { siteName: 'แปลงที่รอบก่อนค้าง' } } });

        mockNotice.hangFor = row.id;
        const abandoned = runSiteContactRequests();
        for (let tries = 0; tries < 250 && !mockNotice.hung; tries += 1) { await new Promise((resolve) => { setTimeout(resolve, 20); }); }
        expect(mockNotice.hung).not.toBeNull();
        expect(await queueItemOf(row)).toMatchObject({ siteContactGiven: false, siteContactRequestedAt: null });

        await runSiteContactRequests();
        expect(await askedParties(row)).toEqual([]);

        await runSiteContactRequests({ now: new Date(Date.now() + 2 * HOUR) });
        expect(await askedParties(row)).toEqual([fx.applicant.id, fx.holderMember.id].sort());
        expect((await queueItemOf(row)).siteContactRequestedAt).toEqual(expect.any(String));

        mockNotice.hung.reject(new Error('test: the abandoned run ends'));
        await abandoned;
        expect(await asksOf(row)).toHaveLength(2);
        expect((await world.rowOf(row.id)).formData.siteContactRequest).toMatchObject({ sentAt: expect.any(String) });
    });

    test('the dispatcher is promised an ask only where the job will make one, and the job counts the filings it cannot read', async () => {
        const { runSiteContactRequests } = require('../../jobs/site-contact-request-job');
        const waiting = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: { siteName: 'แปลงที่รอแจ้ง' } } });
        const visitPassed = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() - DAY),
            formData: { farmData: { siteName: 'แปลงที่เลยวันนัดแล้ว' } },
        });
        const unreadable = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
        await world.raw.$executeRaw`UPDATE applications SET "formData" = '[]'::jsonb WHERE id = ${unreadable.id}`;

        expect(await queueItemOf(waiting)).toMatchObject({ siteContactGiven: false, siteContactRequestedAt: null, siteContactRequestPending: true });
        expect(await queueItemOf(unreadable)).toMatchObject({ siteContactGiven: false, siteContactRequestedAt: null, siteContactRequestPending: false });
        expect(await calendarItemOf(visitPassed)).toMatchObject({ siteContactGiven: false, siteContactRequestedAt: null, siteContactRequestPending: false });

        expect(await runSiteContactRequests()).toMatchObject({ asked: 1, skipped: 1 });
        expect(await askedParties(unreadable)).toEqual([]);
        expect(await askedParties(visitPassed)).toEqual([]);
        expect(await queueItemOf(waiting)).toMatchObject({ siteContactRequestedAt: expect.any(String), siteContactRequestPending: false });
    });
});
