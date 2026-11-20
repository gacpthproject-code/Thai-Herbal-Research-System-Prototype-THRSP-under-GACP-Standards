/**
 * Operator order 65(2), 2026-10-09: the applicant keeps the on-site contact current until the visit,
 * through PATCH /api/applications/:id/site-contact, under the same rule the wizard and the submit door
 * run (a name, a Thai phone, and a confirmation when the contact is someone else). The dispatcher's
 * site-contact door then reads the new contact. Real doors, real Postgres.
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
const SITE = {
    siteName: 'แปลงสาธิตดอยคำ', siteAddress: '12 หมู่ 3', subDistrict: 'แม่ริม', district: 'แม่ริม', province: 'เชียงใหม่',
    siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
};
const SOMEONE_ELSE = { siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666', siteContactIsApplicant: false, siteContactInformed: true };

d('the applicant keeps the on-site contact current until the visit (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };
    const asApplicant = () => as({
        id: fx.applicant.id, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId,
        role: 'health', canonicalRole: 'health', organizationId: fx.orgA,
    });
    const update = (id, body) => { asApplicant(); return request(app).patch(`/api/applications/${id}/site-contact`).send(body); };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'sitecontact' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/application-site-contact'));
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
    });
    afterAll(async () => { await world.cleanup(); });

    test('waiting to be booked: someone else, confirmed as told, replaces the contact; the dispatcher reads it; the log keeps no value', async () => {
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: SITE } });
        const res = await update(row.id, SOMEONE_ELSE);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666', siteContactIsApplicant: false });
        const stored = (await world.rowOf(row.id)).formData.farmData;
        expect(stored).toMatchObject({ ...SITE, ...SOMEONE_ELSE });

        as(fx.dispatcherA);
        const read = await request(app).get(`/api/provider/applications/${row.id}/site-contact`);
        expect(read.body.data).toMatchObject({ siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666' });

        const logged = await world.raw.auditLog.findMany({ where: { resourceId: row.id, action: 'SITE_CONTACT_UPDATED' } });
        expect(logged).toHaveLength(1);
        expect(JSON.stringify(logged[0].metadata)).not.toMatch(/0865556666|086-555-6666|สมศักดิ์/);
    });

    test('a contact the rule refuses is not written: no name, a phone that is not Thai, someone else not confirmed as told', async () => {
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: SITE } });
        const answers = [
            await update(row.id, { ...SOMEONE_ELSE, siteContactName: ' ' }),
            await update(row.id, { ...SOMEONE_ELSE, sitePhone: '12345' }),
            await update(row.id, { ...SOMEONE_ELSE, siteContactInformed: false }),
        ];
        expect(answers.map((res) => [res.status, res.body.code])).toEqual([
            [400, 'SITE_CONTACT_INVALID'], [400, 'SITE_CONTACT_INVALID'], [400, 'SITE_CONTACT_INVALID'],
        ]);
        expect(answers[1].body.data.gaps).toEqual(['phone']);
        expect((await world.rowOf(row.id)).formData.farmData).toMatchObject(SITE);
    });

    test('a booked visit still ahead can take a new contact; after the visit, or once inspected, it cannot', async () => {
        const ahead = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: { farmData: SITE },
        });
        const passedVisit = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() - DAY), formData: { farmData: SITE },
        });
        const inspected = await world.application('AUDIT_PASSED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: { farmData: SITE },
        });
        expect((await update(ahead.id, SOMEONE_ELSE)).status).toBe(200);
        const late = await update(passedVisit.id, SOMEONE_ELSE);
        const done = await update(inspected.id, SOMEONE_ELSE);
        expect([[late.status, late.body.code], [done.status, done.body.code]]).toEqual([[409, 'SITE_CONTACT_LOCKED'], [409, 'SITE_CONTACT_LOCKED']]);
        expect((await world.rowOf(passedVisit.id)).formData.farmData).toMatchObject(SITE);
    });

    test('a defect found on site keeps the contact open: CAR_PENDING and CAR_REVIEWING take a new contact, a second visit can still be booked from there', async () => {
        const answering = await world.application('CAR_PENDING', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: { farmData: SITE },
        });
        const answered = await world.application('CAR_REVIEWING', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: { farmData: SITE },
        });
        expect((await update(answering.id, SOMEONE_ELSE)).status).toBe(200);
        expect((await update(answered.id, SOMEONE_ELSE)).status).toBe(200);
        expect((await world.rowOf(answering.id)).formData.farmData).toMatchObject({ ...SITE, ...SOMEONE_ELSE });
        const read = async (id) => { asApplicant(); return (await request(app).get(`/api/applications/${id}`)).body.data.siteContact; };
        expect(await read(answered.id)).toMatchObject({ editable: true });
    });

    test('another holder\'s application is not found', async () => {
        const elsewhere = await world.settledInto('AUDIT_FEE_PAID', { org: fx.orgB, formData: { farmData: SITE } });
        expect((await update(elsewhere.id, SOMEONE_ELSE)).status).toBe(404);
    });

    test('the application page is told the contact, whether it is missing, and whether it can still be changed', async () => {
        const read = async (id) => { asApplicant(); return (await request(app).get(`/api/applications/${id}`)).body.data.siteContact; };
        const missing = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: { siteName: 'แปลงไม่มีผู้ติดต่อ' } } });
        const given = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: { farmData: SITE } });
        const passedVisit = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() - DAY), formData: { farmData: SITE },
        });
        expect(await read(missing.id)).toEqual({ siteContactName: null, sitePhone: null, siteContactIsApplicant: false, missing: true, editable: true });
        expect(await read(given.id)).toEqual({ siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true, missing: false, editable: true });
        expect(await read(passedVisit.id)).toMatchObject({ missing: false, editable: false });
    });
});
