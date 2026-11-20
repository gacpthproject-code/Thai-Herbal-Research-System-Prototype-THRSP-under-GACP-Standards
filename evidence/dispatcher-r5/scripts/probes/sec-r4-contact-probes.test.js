/**
 * Security re-review round 4 (fix/dispatcher-tools 00ca57348) — independent probes on real Postgres.
 * Written by the reviewer; NOT part of the branch. Run from /tmp/sec-r4/tree-head/apps/backend.
 *
 *   P1  GET /api/provider/certificates/dashboard hands certificate holders' email/phone to the
 *       dispatcher, the field inspector and finance (orders 14, 29, 56(3)).
 *   P2  GET /api/provider/applications/:id/audit-timelines hands the dispatcher and the field
 *       inspector the applicant's old and new phone/email after a reviewer corrected them.
 *   P3  the site-contact door: role gate, every view logged, fail-closed on a REAL failed insert.
 *   P5  the dispatcher's once-per-round claim is erased by a stale full-formData write from a real
 *       door (reviewer form-fields PATCH in REVISION_REQUESTED), so a second reminder goes out.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = process.env.PROBE_ORG_SCOPE || 'false';

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
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
    applicantData: { fullName: 'ผู้ยื่นทดสอบ', phone: '0813334444', email: 'filed.contact@example.test', lineId: 'filed-line' },
    farmData: {
        siteName: 'แปลงโพรบ', siteAddress: '1 หมู่ 1', subDistrict: 'แม่ริม', district: 'แม่ริม', province: 'เชียงใหม่',
        sitePhone: '0865556666', siteContactName: 'นายหน้างาน โพรบ',
    },
};
const DAY = 24 * 60 * 60 * 1000;
const out = (label, value) => { process.stdout.write(`PROBE ${label}: ${JSON.stringify(value)}\n`); };

d('sec-r4 probes (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const extra = { certificates: [], farms: [] };
    const as = (user) => { mockActor.current = { ...user }; };
    const leaks = (body, values) => { const text = JSON.stringify(body); return values.filter((v) => v && text.includes(v)); };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'secr4' });
        ({ fx } = world);
        fx.financeA = await world.staff('finance_officer_dtam', fx.orgA);
        fx.platformAdmin = await world.staff('system_admin_platform', fx.orgA);
        const account = await world.raw.user.findUnique({ where: { id: fx.applicant.id }, select: { email: true } });
        fx.applicant.email = account.email;
        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/certificates', require('../../routes/api/provider/certificates'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
    });

    afterAll(async () => {
        await world.raw.$executeRawUnsafe('DROP TRIGGER IF EXISTS sec_r4_block ON audit_logs').catch(() => {});
        await world.raw.certificate.deleteMany({ where: { id: { in: extra.certificates } } }).catch(() => {});
        await world.raw.farm.deleteMany({ where: { id: { in: extra.farms } } }).catch(() => {});
        await world.cleanup();
    });

    async function certificateFor({ org, userId }) {
        const farm = await world.raw.farm.create({
            data: {
                ownerId: userId, farmName: 'ฟาร์มโพรบ', farmType: 'CULTIVATION', address: '1', province: 'เชียงใหม่', district: 'x', subDistrict: 'x',
                postalCode: '50000', totalArea: 1, cultivationArea: 1, cultivationMethod: 'OUTDOOR', organizationId: org,
            },
        });
        extra.farms.push(farm.id);
        const appRow = await world.application('CERTIFIED', { milestones: ['M1', 'M2'], org });
        const cert = await world.raw.certificate.create({
            data: {
                certificateNumber: `PROBE-${crypto.randomUUID().slice(0, 8)}`, verificationCode: 'x', qrData: 'x', applicationId: appRow.id, userId,
                farmId: farm.id, farmName: 'ฟาร์มโพรบ', applicantName: 'ผู้ถือโพรบ', cropType: 'x', farmSize: 1, province: 'เชียงใหม่', district: 'x',
                subDistrict: 'x', standardId: 'x', standardName: 'GACP', status: 'active', expiryDate: new Date(Date.now() + 30 * DAY),
                validityMonths: 12, issuedBy: 'probe', organizationId: org,
            },
        });
        extra.certificates.push(cert.id);
        return cert;
    }

    test('P1 certificates dashboard: holder email/phone to dispatcher, inspector, finance', async () => {
        const holderB = await world.healthUser('holderB', fx.orgB, { email: 'holder.b.mail@example.test', phoneNumber: '0807770000' });
        await certificateFor({ org: fx.orgA, userId: fx.applicant.id });
        await certificateFor({ org: fx.orgB, userId: holderB.id });
        const wanted = [fx.applicant.email, '0891112222', 'holder.b.mail@example.test', '0807770000'];
        const result = {};
        for (const [who, user] of Object.entries({ dispatcherA: fx.dispatcherA, inspectorA: fx.inspectorA, financeA: fx.financeA, reviewerA: fx.reviewerA })) {
            as(user);
            const res = await request(app).get('/api/provider/certificates/dashboard');
            result[who] = { status: res.status, leaked: leaks(res.body, wanted) };
        }
        out(`P1 (TENANT_READ_ORG_SCOPE=${process.env.TENANT_READ_ORG_SCOPE})`, result);
        expect(result.dispatcherA.status).toBe(200);
    });

    test('P2 audit timeline: reviewer-corrected contact reaches dispatcher and inspector', async () => {
        const row = await world.application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: FILED });
        as(fx.reviewerA);
        const edit = await request(app).patch(`/api/provider/applications/${row.id}/form-fields`).send({
            changes: { applicantData: { phone: '0819990000', email: 'corrected.mail@example.test' }, farmData: { sitePhone: '0861112222' } },
        });
        out('P2 reviewer edit status', edit.status);
        // the workflow moves on to a booked visit (seated directly: the probe is about what is read later)
        await world.raw.application.update({
            where: { id: row.id },
            data: { status: 'AUDIT_CONFIRMED', auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: { ...FILED, workflowState: 'AUDIT_CONFIRMED' } },
        });
        await world.raw.$executeRawUnsafe(`UPDATE applications SET "formData" = jsonb_set("formData", '{applicantData,phone}', '"0819990000"') WHERE id = '${row.id}'`);
        const wanted = ['0813334444', '0819990000', 'filed.contact@example.test', 'corrected.mail@example.test', '0865556666', '0861112222'];
        const result = {};
        for (const [who, user] of Object.entries({ dispatcherA: fx.dispatcherA, inspectorA: fx.inspectorA })) {
            as(user);
            const timeline = await request(app).get(`/api/provider/applications/${row.id}/audit-timelines`);
            const detail = await request(app).get(`/api/provider/applications/${row.id}`);
            result[who] = {
                timeline: { status: timeline.status, leaked: leaks(timeline.body, wanted) },
                detailControl: { status: detail.status, leaked: leaks(detail.body, wanted) },
            };
        }
        const views = await world.raw.auditLog.count({ where: { resourceId: row.id, action: 'SITE_CONTACT_VIEWED' } });
        out('P2', { ...result, siteContactViewedRows: views });
        expect(edit.status).toBe(200);
    });

    test('P2b audit timeline: a corrected national ID that fails the checksum leaves unmasked', async () => {
        const checkDigit = (twelve) => { let sum = 0; for (let i = 0; i < 12; i += 1) { sum += Number(twelve[i]) * (13 - i); } return (11 - (sum % 11)) % 10; };
        const base = '310050012345';
        const good = `${base}${checkDigit(base)}`;
        const typo = `${base}${(checkDigit(base) + 1) % 10}`;
        const typoFormatted = `${typo[0]}-${typo.slice(1, 5)}-${typo.slice(5, 10)}-${typo.slice(10, 12)}-${typo[12]}`;
        const row = await world.application('ASSIGNED_FOR_REVIEW', {
            milestones: ['M1'], reviewerId: fx.reviewerA.id,
            formData: { ...FILED, applicantData: { ...FILED.applicantData, idCard: typo, presidentIdCard: typoFormatted } },
        });
        as(fx.reviewerA);
        const edit = await request(app).patch(`/api/provider/applications/${row.id}/form-fields`).send({ changes: { applicantData: { idCard: good, presidentIdCard: good } } });
        await world.raw.application.update({ where: { id: row.id }, data: { status: 'AUDIT_CONFIRMED', auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot() } });
        const result = { edit: edit.status };
        for (const [who, user] of Object.entries({ reviewerA: fx.reviewerA, dispatcherA: fx.dispatcherA, inspectorA: fx.inspectorA })) {
            as(user);
            const timeline = await request(app).get(`/api/provider/applications/${row.id}/audit-timelines`);
            const text = JSON.stringify(timeline.body);
            result[who] = { status: timeline.status, typoShown: text.includes(typo), typoFormattedShown: text.includes(typoFormatted), validShownWhole: text.includes(good) };
            if (who === 'dispatcherA') {
                const editRow = (timeline.body.data.auditLogs || []).find((entry) => entry.action === 'APPLICATION_FORMDATA_EDITED_BY_REVIEWER');
                result.editRowChangedFields = editRow ? editRow.metadata.changedFields : 'no edit row';
            }
        }
        out('P2b', result);
        expect(edit.status).toBe(200);
    });

    test('P6 detail door: legacy contact keys of older filings pass the withholding list', async () => {
        const legacy = {
            applicantData: {
                fullName: 'บริษัทเก่า', applicantType: 'JURISTIC', companyPhone: '021112222', directorPhone: '0899990001',
                directorEmail: 'director.legacy@example.test', coordinatorPhone: '0899990002', coordinatorLineId: 'coord-line-legacy', presidentPhone: '0899990003',
            },
            farmData: FILED.farmData,
        };
        const row = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: legacy,
        });
        const wanted = ['021112222', '0899990001', 'director.legacy@example.test', '0899990002', 'coord-line-legacy', '0899990003'];
        const result = {};
        for (const [who, user] of Object.entries({ dispatcherA: fx.dispatcherA, inspectorA: fx.inspectorA })) {
            as(user);
            const res = await request(app).get(`/api/provider/applications/${row.id}`);
            result[who] = { status: res.status, leaked: leaks(res.body, wanted) };
        }
        out('P6', result);
        expect(result.dispatcherA.status).toBe(200);
    });

    test('P8 the inspector\'s own action doors answer with the whole filing, contact included', async () => {
        const row = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(), formData: FILED,
        });
        const wanted = ['0813334444', 'filed.contact@example.test', 'filed-line', '0865556666', 'นายหน้างาน โพรบ'];
        as(fx.inspectorA);
        const started = await request(app).post(`/api/provider/auditor/applications/${row.id}/inspection-starts`).send({});
        const decided = await request(app).post(`/api/provider/auditor/applications/${row.id}/audit-decisions`).send({
            decision: 'MINOR', notes: 'พบข้อบกพร่องเล็กน้อย', findings: [{ nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ย', correctiveAction: 'จัดทำบันทึกการใช้ปุ๋ย', category: 'MINOR' }],
        });
        const views = await world.raw.auditLog.count({ where: { resourceId: row.id, action: 'SITE_CONTACT_VIEWED' } });
        out('P8', {
            inspectionStart: { status: started.status, leaked: leaks(started.body, wanted), error: started.body.error || null },
            auditDecision: { status: decided.status, leaked: leaks(decided.body, wanted), error: decided.body.error || null, code: decided.body.code || null },
            siteContactViewedRows: views,
        });
        expect(started.status).toBe(200);
    });

    test('P3 site-contact door: roles, logging, real insert failure', async () => {
        const booking = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: FILED });
        const door = (id) => request(app).get(`/api/provider/applications/${id}/site-contact`);
        const result = { roles: {} };
        for (const [who, user] of Object.entries({
            adminA: fx.adminA, approverA: fx.approverA, reviewerA: fx.reviewerA, financeA: fx.financeA, platformAdmin: fx.platformAdmin, applicant: { id: fx.applicant.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgA },
        })) {
            as(user);
            const res = await door(booking.id);
            result.roles[who] = { status: res.status, leaked: leaks(res.body, ['0865556666']) };
        }
        // a real failed audit insert (trigger), then the negative control once it is gone
        await world.raw.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION sec_r4_block_site_contact() RETURNS trigger AS $$
            BEGIN IF NEW.action = 'SITE_CONTACT_VIEWED' THEN RAISE EXCEPTION 'sec-r4 probe: audit write refused'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
        await world.raw.$executeRawUnsafe('CREATE TRIGGER sec_r4_block BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION sec_r4_block_site_contact()');
        as(fx.dispatcherA);
        const blocked = await door(booking.id);
        await world.raw.$executeRawUnsafe('DROP TRIGGER IF EXISTS sec_r4_block ON audit_logs');
        const before = await world.raw.auditLog.count({ where: { resourceId: booking.id, action: 'SITE_CONTACT_VIEWED' } });
        const open1 = await door(booking.id);
        const open2 = await door(booking.id);
        const after = await world.raw.auditLog.count({ where: { resourceId: booking.id, action: 'SITE_CONTACT_VIEWED' } });
        result.realInsertFailure = { status: blocked.status, code: blocked.body.code, leaked: leaks(blocked.body, ['0865556666', 'นายหน้างาน โพรบ']) };
        result.control = { statuses: [open1.status, open2.status], rowsBefore: before, rowsAfter: after };
        // CAR_REVIEWING: the dispatcher reads only where a second visit was asked for
        const plainCar = await world.application('CAR_REVIEWING', { milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: FILED });
        const armedCar = await world.application('CAR_REVIEWING', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: { ...FILED, reinspection: { status: 'REQUESTED' } },
        });
        result.dispatcherCarReviewing = { plain: (await door(plainCar.id)).status, armed: (await door(armedCar.id)).status };
        // the inspector: assigned in CAR_PENDING yes; after the decision moved on (AUDIT_PASSED) no; another inspector no
        const carPending = await world.application('CAR_PENDING', { milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: FILED });
        const passed = await world.application('AUDIT_PASSED', { milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: FILED });
        as(fx.inspectorA);
        result.inspector = { carPending: (await door(carPending.id)).status, auditPassed: (await door(passed.id)).status };
        as(fx.inspectorA2);
        result.otherInspector = { carPending: (await door(carPending.id)).status };
        out('P3', result);
        expect(blocked.status).toBe(503);
    });

    test('P5 once-per-round claim erased by a stale reviewer edit (REVISION_REQUESTED)', async () => {
        const due = new Date(Date.now() + 3 * DAY).toISOString();
        const row = await world.application('REVISION_REQUESTED', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: { ...FILED, revisionDueAt: due } });
        const remind = () => { as(fx.dispatcherA); return request(app).post(`/api/provider/scheduler/applications/${row.id}/send-reminder`).send({}); };
        // control: twice in a row, the second is refused
        const control = await world.application('REVISION_REQUESTED', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: { ...FILED, revisionDueAt: due } });
        as(fx.dispatcherA);
        const c1 = await request(app).post(`/api/provider/scheduler/applications/${control.id}/send-reminder`).send({});
        const c2 = await request(app).post(`/api/provider/scheduler/applications/${control.id}/send-reminder`).send({});
        // race: the reviewer's edit reads the filing, the dispatcher's reminder claims, the edit writes its stale copy
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
        const afterEdit = await world.rowOf(row.id);
        const second = await remind();
        const notices = await world.raw.notification.count({ where: { userId: fx.applicant.id, title: 'แจ้งเตือนจากผู้จัดคิว', metadata: { path: ['applicationNumber'], equals: row.applicationNumber } } }).catch((e) => `count failed: ${e.message}`);
        out('P5', {
            control: [c1.status, c2.status, c2.body.code],
            race: { firstReminder: first && first.status, edit: edit.status, claimAfterEdit: afterEdit.formData.dispatcherReminder || null, secondReminder: second.status },
            applicantNoticesThisRound: notices,
        });
        expect(c2.status).toBe(409);
    });
});
