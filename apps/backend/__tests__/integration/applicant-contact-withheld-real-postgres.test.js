/**
 * The dispatcher and the field inspector never receive the applicant's email or phone, neither the
 * account's nor the filing's (orders 29 and 56(3), security re-review 2026-10-09 M3). They read only
 * the on-site contact name and phone, the dispatcher on the booking screen and the inspector on its
 * audit pages, through one door that writes an audit row for every view. Real Postgres.
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

const FILED = {
    applicantData: {
        fullName: 'สมหญิง ปลูกดี', phone: '0813334444', email: 'somying.filed@example.test', lineId: 'somying-line', contactName: 'คุณสมหญิง',
    },
    farmData: {
        siteName: 'แปลงสาธิตดอยคำ', siteAddress: '12 หมู่ 3', subDistrict: 'แม่ริม', district: 'แม่ริม', province: 'เชียงใหม่',
        sitePhone: '0865556666', siteContactName: 'นายสมศักดิ์ ดูแลแปลง',
    },
};

d('the applicant\'s contact is withheld from the dispatcher and the field inspector (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'acw' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
        app.use('/api/audits', require('../../routes/api/audit/audits'));
    });

    afterAll(async () => { await world.cleanup(); });

    const accountEmail = () => fx.applicant.email;
    const contactLeaks = (body) => {
        const text = JSON.stringify(body);
        return ['0891112222', '0813334444', 'somying.filed@example.test', 'somying-line', 'คุณสมหญิง', '0865556666', 'นายสมศักดิ์ ดูแลแปลง', accountEmail()]
            .filter((value) => value && text.includes(value));
    };
    const viewsOf = (applicationId) => world.raw.auditLog.findMany({ where: { resourceId: applicationId, action: 'SITE_CONTACT_VIEWED' } });

    beforeAll(async () => {
        const account = await world.raw.user.findUnique({ where: { id: fx.applicant.id }, select: { email: true } });
        fx.applicant.email = account.email;
    });

    describe('the application detail door', () => {
        test('the dispatcher reads the filing without any contact of the applicant or of the site', async () => {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: FILED });
            as(fx.dispatcherA);
            const res = await request(app).get(`/api/provider/applications/${row.id}`);
            expect(res.status).toBe(200);
            expect(contactLeaks(res.body)).toEqual([]);
            expect(res.body.data.health).toEqual({ firstName: 'applicant', lastName: 'ทดสอบ' });
            expect(res.body.data.formData.applicantData).toMatchObject({ fullName: 'สมหญิง ปลูกดี' });
            expect(res.body.data.formData.farmData).toMatchObject({ siteName: 'แปลงสาธิตดอยคำ', province: 'เชียงใหม่' });
        });

        test('the field inspector assigned to the visit reads it the same way', async () => {
            const row = await world.application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: FILED,
            });
            as(fx.inspectorA);
            const res = await request(app).get(`/api/provider/applications/${row.id}`);
            expect(res.status).toBe(200);
            expect(contactLeaks(res.body)).toEqual([]);
            const audit = await request(app).get(`/api/audits/${row.id}`);
            expect(audit.status).toBe(200);
            expect(contactLeaks(audit.body)).toEqual([]);
        });

        test('an older filing\'s contact keys, and keys no screen knows, never reach the dispatcher or the inspector (L-A)', async () => {
            const legacyContact = {
                companyPhone: '021112222', directorPhone: '0899990001', directorEmail: 'director.legacy@example.test',
                coordinatorName: 'ผู้ประสานงาน เก่า', coordinatorPhone: '0899990002', coordinatorLineId: 'coord-line-legacy',
                presidentPhone: '0899990003', contactPhone: '0899990004', contactEmail: 'contact.legacy@example.test',
                whatsappNumber: '0899990005',
            };
            const legacy = {
                applicantData: {
                    applicantType: 'JURISTIC', companyName: 'บริษัท สมุนไพรเก่า จำกัด', authorizedSignatory: 'นายผู้มีอำนาจ ลงนาม',
                    directorName: 'นายประธาน กรรมการ', taxId: '0105556123451', ...legacyContact,
                },
                farmData: { ...FILED.farmData, areaSqm: '1600', landOwnership: 'OWNED', landlinePhone: '053111222' },
                phone: '0899990006', email: 'flat.legacy@example.test', lineId: 'flat-line-legacy',
                consentLetter: { witnesses: [{ name: 'พยาน หนึ่ง' }] },
            };
            const leaked = (body) => {
                const text = JSON.stringify(body);
                return [...Object.values(legacyContact), '053111222', '0899990006', 'flat.legacy@example.test', 'flat-line-legacy', '0865556666', 'นายสมศักดิ์ ดูแลแปลง']
                    .filter((value) => text.includes(value));
            };
            const row = await world.application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: legacy,
            });
            for (const user of [fx.dispatcherA, fx.inspectorA]) {
                as(user);
                const res = await request(app).get(`/api/provider/applications/${row.id}`);
                expect([user.role, res.status, leaked(res.body)]).toEqual([user.role, 200, []]);
                expect(res.body.data.formData.applicantData).toMatchObject({
                    applicantType: 'JURISTIC', companyName: 'บริษัท สมุนไพรเก่า จำกัด', authorizedSignatory: 'นายผู้มีอำนาจ ลงนาม', directorName: 'นายประธาน กรรมการ',
                });
                expect(res.body.data.formData.farmData).toMatchObject({ siteName: 'แปลงสาธิตดอยคำ', areaSqm: '1600', landOwnership: 'OWNED' });
                expect(res.body.data.formData.consentLetter.witnesses[0].name).toBe('พยาน หนึ่ง');
            }
        });

        test('the document reviewer still reads the applicant\'s contact', async () => {
            const row = await world.application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: FILED });
            as(fx.reviewerA);
            const res = await request(app).get(`/api/provider/applications/${row.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.health).toMatchObject({ phone: '0891112222' });
            expect(res.body.data.formData.applicantData).toMatchObject({ phone: '0813334444' });
        });
    });

    describe('the audit timeline (security re-review M-B)', () => {
        test('a reviewer\'s correction of contact fields reaches the dispatcher and the inspector as the field\'s name only', async () => {
            const row = await world.application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: FILED });
            as(fx.reviewerA);
            const edit = await request(app).patch(`/api/provider/applications/${row.id}/form-fields`).send({
                changes: {
                    applicantData: { phone: '0819990000', email: 'corrected.mail@example.test' },
                    farmData: { sitePhone: '0861112222', siteName: 'แปลงสาธิตดอยคำใหม่' },
                },
            });
            expect(edit.status).toBe(200);
            await world.raw.application.update({
                where: { id: row.id },
                data: { status: 'AUDIT_CONFIRMED', auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot() },
            });
            const corrected = ['0819990000', 'corrected.mail@example.test', '0861112222'];
            const editRow = (body) => (body.data.auditLogs || []).find((entry) => entry.action === 'APPLICATION_FORMDATA_EDITED_BY_REVIEWER');

            for (const user of [fx.dispatcherA, fx.inspectorA]) {
                as(user);
                const timeline = await request(app).get(`/api/provider/applications/${row.id}/audit-timelines`);
                expect([user.role, timeline.status, contactLeaks(timeline.body), corrected.filter((v) => JSON.stringify(timeline.body).includes(v))])
                    .toEqual([user.role, 200, [], []]);
                expect(editRow(timeline.body).metadata.changedFields).toEqual(expect.arrayContaining([
                    { path: 'applicantData.phone', changed: true },
                    { path: 'applicantData.email', changed: true },
                    { path: 'farmData.sitePhone', changed: true },
                    { path: 'farmData.siteName', old: 'แปลงสาธิตดอยคำ', new: 'แปลงสาธิตดอยคำใหม่' },
                ]));
            }
            as(fx.adminA);
            const admin = await request(app).get(`/api/provider/applications/${row.id}/audit-timelines`);
            expect(editRow(admin.body).metadata.changedFields).toEqual(expect.arrayContaining([
                { path: 'applicantData.phone', old: '0813334444', new: '0819990000' },
            ]));
            expect(await viewsOf(row.id)).toHaveLength(0);
        });
    });

    describe('the field inspector\'s own action doors (security re-review M-A)', () => {
        test('starting the inspection and recording the decision answer the number and status only', async () => {
            const row = await world.application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: FILED,
            });
            as(fx.inspectorA);
            const started = await request(app).post(`/api/provider/auditor/applications/${row.id}/inspection-starts`).send({});
            expect(started.status).toBe(200);
            expect(started.body.data).toEqual({ id: row.id, applicationNumber: row.applicationNumber, status: 'AUDIT_CONFIRMED' });
            expect(contactLeaks(started.body)).toEqual([]);

            const decided = await request(app).post(`/api/provider/auditor/applications/${row.id}/audit-decisions`).send({
                decision: 'MINOR',
                notes: 'พบข้อบกพร่องเล็กน้อย',
                findings: [{ nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ย', correctiveAction: 'จัดทำบันทึกการใช้ปุ๋ย', category: 'MINOR' }],
            });
            expect(decided.status).toBe(200);
            expect(decided.body.data).toEqual({ id: row.id, applicationNumber: row.applicationNumber, status: 'CAR_PENDING' });
            expect(contactLeaks(decided.body)).toEqual([]);
            expect(await viewsOf(row.id)).toHaveLength(0);
        });
    });

    describe('a filing that names no one on site (order 65(2))', () => {
        test('the dispatcher\'s queues say whether the filing names someone on site, and carry no contact', async () => {
            const named = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: FILED });
            const unnamed = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const dashboard = await request(app).get('/api/provider/scheduler/dashboard');
            const queue = await request(app).get('/api/audit/scheduling/queue');
            expect([dashboard.status, queue.status]).toEqual([200, 200]);
            const fromDashboard = (row) => dashboard.body.data.queues.readyToSchedule.items.find((item) => item.applicationId === row.id);
            const fromQueue = (row) => queue.body.data.items.find((item) => item.applicationId === row.id);
            expect([fromDashboard(named).siteContactGiven, fromDashboard(unnamed).siteContactGiven]).toEqual([true, false]);
            expect([fromQueue(named).siteContactGiven, fromQueue(unnamed).siteContactGiven]).toEqual([true, false]);
            expect(contactLeaks(dashboard.body)).toEqual([]);
            expect(contactLeaks(queue.body)).toEqual([]);
        });
    });

    describe('the on-site contact door', () => {
        const siteContact = (row) => request(app).get(`/api/provider/applications/${row.id}/site-contact`);

        test('the dispatcher reads the name and phone of the person on site while booking, and every view is logged', async () => {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: FILED });
            as(fx.dispatcherA);
            const first = await siteContact(row);
            expect(first.status).toBe(200);
            expect(first.body.data).toEqual({ applicationNumber: row.applicationNumber, siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '0865556666' });
            // No browser or proxy keeps a copy of a view that was logged once (security re-review I-E).
            expect(first.headers['cache-control']).toBe('no-store');
            expect(JSON.stringify(first.body)).not.toContain('0891112222');
            await siteContact(row);
            const views = await viewsOf(row.id);
            expect(views).toHaveLength(2);
            expect(views[0]).toMatchObject({ actorId: fx.dispatcherA.id, organizationId: fx.orgA, category: 'DATA_ACCESS' });
        });

        test('the field inspector assigned to the visit reads it on its audit pages; an inspector not assigned does not', async () => {
            const row = await world.application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: FILED,
            });
            as(fx.inspectorA);
            expect((await siteContact(row)).body.data).toMatchObject({ sitePhone: '0865556666' });
            as(fx.inspectorA2);
            expect((await siteContact(row)).status).toBe(404);
            expect(await viewsOf(row.id)).toHaveLength(1);
        });

        test('outside the booking stages, in another organization, or for another role, nothing is read and nothing is logged', async () => {
            const notYetPaid = await world.settledInto('DOC_FEE_PAID', { formData: FILED });
            as(fx.dispatcherA);
            expect((await siteContact(notYetPaid)).status).toBe(404);
            as(fx.dispatcherB);
            const elsewhere = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: FILED });
            expect((await siteContact(elsewhere)).status).toBe(404);
            as(fx.reviewerA);
            expect((await siteContact(elsewhere)).status).toBe(403);
            expect([...(await viewsOf(notYetPaid.id)), ...(await viewsOf(elsewhere.id))]).toHaveLength(0);
        });

        test('a view that cannot be logged shows nothing', async () => {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: FILED });
            const { auditLogger } = require('../../middleware/audit-logger');
            const spy = jest.spyOn(auditLogger, 'log').mockResolvedValueOnce(null);
            as(fx.dispatcherA);
            const res = await siteContact(row);
            spy.mockRestore();
            expect(res.status).toBe(503);
            expect(contactLeaks(res.body)).toEqual([]);
        });

        test('a filing that names no one on site says so', async () => {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const res = await siteContact(row);
            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ siteContactName: null, sitePhone: null });
        });
    });
});
