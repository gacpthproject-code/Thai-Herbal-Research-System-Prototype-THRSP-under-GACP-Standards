/**
 * ผู้ตรวจพื้นที่บันทึก "ไม่ผ่าน" แล้วคำขอรอผู้อนุมัติ ไม่ปิด (real Postgres) — คำสั่ง 56(2)
 *
 * ตารางผลตรวจเดียว (shared/inspection-verdicts.js) และตัวเขียนเดียว (recordInspectionResult)
 * ใช้ทั้งประตูใบงาน (POST /api/provider/auditor/applications/:id/audit-decisions) และประตูภาคสนาม
 * (POST /api/audit/onsite/:auditId/decision):
 *   PASS → AUDIT_PASSED · MINOR / MAJOR → CAR_PENDING · FAIL → AUDIT_NOT_PASSED
 * ไม่ผ่านต้องมีข้อบกพร่องอย่างน้อยหนึ่งข้อ ไม่ออกหนังสือแจ้งคำสั่ง ไม่ปิดคำขอ แจ้งผู้อนุมัติทุกคนของ
 * องค์กร และแจ้งผู้ยื่นกับผู้ถือพร้อมข้อบกพร่อง (ISO/IEC 17065 7.4.6) · ผลที่ไม่ใช่ PASS ทุกผลล้างตรา
 * ผ่านที่ค้างจากการลงพื้นที่ครั้งก่อน · การดูหลักฐานแก้ไขบนโต๊ะให้ผลไม่ผ่านไม่ได้
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');

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

const FINDING = { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ยย้อนหลัง 3 เดือน', correctiveAction: 'จัดทำสมุดบันทึกการใช้ปัจจัยการผลิต' };

d('ผู้ตรวจพื้นที่บันทึกไม่ผ่าน คำขอรอผู้อนุมัติ (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], auditIds: [] };
    let seq = 0;

    async function person(role, accountType = 'PROVIDER') {
        const id = crypto.randomUUID();
        seq += 1;
        const key = `inp-${seq}-${sfx}`;
        const health = accountType === 'HEALTH';
        await raw.user.create({
            data: {
                id, canonicalId: key, healthId: health ? key : null, password: 'x', role,
                authType: health ? 'EMAIL_LEGACY' : 'PROVIDER_ID', providerId: health ? null : key,
                email: `${key}@example.test`, firstName: 'คน', lastName: role, organizationId: fx.org, status: 'ACTIVE',
                ...(health ? {} : { accountType: 'PROVIDER' }),
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.org, canonicalId: key };
    }

    const as = (actor) => { mockActor.current = { ...actor }; };
    const rowOf = (id) => raw.application.findUnique({ where: { id }, select: { status: true, auditResult: true, formData: true, version: true } });
    const lettersOf = (id) => raw.notification.count({ where: { kind: 'OFFICIAL_LETTER', metadata: { path: ['applicationId'], equals: id } } });
    const noticesAbout = async (userId, id) => (await raw.notification.findMany({ where: { userId } }))
        .filter((n) => n.metadata && n.metadata.applicationId === id);

    /** คำขอที่นัดตรวจแล้ว จ่ายครบสองงวด · stalePass = ตราผ่านที่ค้างจากการลงพื้นที่ครั้งก่อน */
    async function booked({ status = 'AUDIT_CONFIRMED', stalePass = false, formData = {} } = {}) {
        seq += 1;
        const at = new Date(Date.now() - 86400000).toISOString();
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-INP-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status,
                auditorId: fx.inspector.id, reviewerId: fx.reviewer.id, certificationPurposes: ['RESEARCH'],
                scheduledDate: new Date(),
                ...(stalePass ? { auditResult: 'PASS' } : {}),
                formData: { workflowState: status, ...(stalePass ? { auditResult: 'PASS', auditedAt: at } : {}), ...formData },
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, row);
        return row.id;
    }

    async function onsiteVisit(applicationId) {
        const audit = await raw.auditChecklist.create({
            data: {
                applicationId, templateName: 'GACP_GENERAL', sections: [],
                auditorId: fx.inspector.id, organizationId: fx.org, status: 'IN_PROGRESS',
            },
        });
        fx.auditIds.push(audit.id);
        return audit.id;
    }

    const jobSheet = (id, body) => {
        as(fx.inspector);
        return request(app).post(`/api/provider/auditor/applications/${id}/audit-decisions`).send(body);
    };
    const fieldDoor = (auditId, body) => {
        as(fx.inspector);
        return request(app).post(`/api/audit/onsite/${auditId}/decision`).send(body);
    };
    const genericDoor = (id, body, actor = fx.inspector) => {
        as(actor);
        return request(app).post(`/api/provider/applications/${id}/workflow-transitions`).send(body);
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `inp-${sfx}`, slug: `inp-${sfx}`, code: `INP_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.orgIds.push(org.id);
        fx.reviewer = await person('document_reviewer');
        fx.inspector = await person('field_inspector');
        fx.approver = await person('certificate_approver');
        fx.approver2 = await person('certificate_approver');
        fx.applicant = await person('health', 'HEALTH');
        fx.colleague = await person('health', 'HEALTH');
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท inp ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.entity);
        for (const [user, role, permissions] of [[fx.applicant, 'OWNER', []], [fx.colleague, 'MANAGER', ['SUBMIT_APPLICATION']]]) {
            await raw.entityMembership.create({
                data: { userId: user.id, entityId: fx.entity, role, permissions, status: 'ACTIVE', organizationId: fx.org },
            });
        }

        app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.user = { ...mockActor.current }; next(); });
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/audit/onsite', require('../../routes/api/audit/onsite'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        await wipe('farmAuditPhoto', { auditId: { in: fx.auditIds } });
        await wipe('farmAuditChecklistItem', { auditId: { in: fx.auditIds } });
        await wipe('auditChecklist', { id: { in: fx.auditIds } });
        for (const model of ['checkoutOrder', 'workActivity', 'revisionDeadline', 'correctionRound', 'applicationComment']) {
            await wipe(model, byApp);
        }
        await wipe('invoice', byApp);
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    describe('ประตูใบงาน: ไม่ผ่านจาก AUDIT_CONFIRMED', () => {
        let id;
        let res;
        beforeAll(async () => {
            id = await booked({ stalePass: true });
            res = await jobSheet(id, { decision: 'FAIL', notes: 'แปลงยังไม่พร้อม', findings: [FINDING] });
        });

        it('คำขอไปรอผู้อนุมัติที่ AUDIT_NOT_PASSED ไม่ปิด และไม่มีหนังสือแจ้งคำสั่ง', async () => {
            expect([res.status, res.body.data && res.body.data.status]).toEqual([200, 'AUDIT_NOT_PASSED']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
            expect(await lettersOf(id)).toBe(0);
        });

        it('ตราผ่านที่ค้างถูกล้าง: auditResult เป็น FAIL ทั้งคอลัมน์และในแฟ้ม และไม่มี auditedAt', async () => {
            const row = await rowOf(id);
            expect(row.auditResult).toBe('FAIL');
            expect(row.formData.auditResult).toBe('FAIL');
            expect(row.formData).not.toHaveProperty('auditedAt');
            expect(row.formData.auditDecision).toMatchObject({ decision: 'FAIL', findings: [expect.objectContaining(FINDING)] });
        });

        it('ผู้อนุมัติทุกคนขององค์กรได้แจ้งเตือนว่ามีแฟ้มที่ไม่ผ่านรอตัดสิน', async () => {
            for (const approver of [fx.approver, fx.approver2]) {
                const notices = await noticesAbout(approver.id, id);
                expect(notices.map((n) => n.title)).toEqual(['มีคำขอที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน รอคุณตัดสิน']);
                expect(notices[0].metadata.actionUrl).toBe(`/provider/certification-decisions/${id}`);
            }
        });

        it('ผู้ยื่นและสมาชิกผู้ถือได้แจ้งผลไม่ผ่านพร้อมข้อบกพร่อง และรู้ว่าจะได้แจ้งผล โดยไม่บอกว่าใครเป็นผู้ตัดสิน (คำสั่ง 91)', async () => {
            for (const party of [fx.applicant, fx.colleague]) {
                const notices = await noticesAbout(party.id, id);
                expect(notices).toHaveLength(1);
                expect(notices[0].message).toContain('ไม่ผ่าน');
                expect(notices[0].message).toContain(FINDING.nonConformity);
                expect(notices[0].message).toContain('คำขอนี้อยู่ระหว่างการพิจารณาผล และจะแจ้งผลให้ทราบ');
                expect(notices[0].message).not.toContain('ผู้อนุมัติ');
            }
        });

        it('คิวของผู้อนุมัติแสดงแฟ้มที่ไม่ผ่าน และแฟ้มเปิดอ่านได้', async () => {
            as(fx.approver);
            const queue = await request(app).get('/api/provider/auditor/final-approval-queue');
            expect(queue.status).toBe(200);
            expect(queue.body.data.items.filter((item) => item.id === id).map((item) => item.status)).toEqual(['AUDIT_NOT_PASSED']);
            const file = await request(app).get(`/api/provider/auditor/applications/${id}/decision-file`);
            expect(file.status).toBe(200);
        });
    });

    it('ประตูใบงาน: การลงพื้นที่ซ้ำที่ไม่ผ่าน ได้ผลเดียวกัน', async () => {
        const id = await booked({
            stalePass: true,
            formData: {
                reinspection: { status: 'BOOKED', requestedBy: 'x' },
                auditDecisions: [{ decision: 'MAJOR', findings: [FINDING], decidedAt: new Date(Date.now() - 864e6).toISOString() }],
            },
        });
        const res = await jobSheet(id, { decision: 'FAIL', notes: 'แก้ไขแล้วยังไม่ผ่าน', findings: [FINDING] });
        expect(res.status).toBe(200);
        const row = await rowOf(id);
        expect([row.status, row.auditResult]).toEqual(['AUDIT_NOT_PASSED', 'FAIL']);
        expect(row.formData).not.toHaveProperty('auditedAt');
        expect(await lettersOf(id)).toBe(0);
    });

    it('ประตูภาคสนาม: ไม่ผ่าน = AUDIT_NOT_PASSED ไม่ใช่ CAR_PENDING', async () => {
        const id = await booked({ stalePass: true });
        const auditId = await onsiteVisit(id);
        const res = await fieldDoor(auditId, { decision: 'FAIL', summary: 'แปลงยังไม่พร้อม', findings: [FINDING] });
        expect(res.status).toBe(200);
        const row = await rowOf(id);
        expect([row.status, row.auditResult, row.formData.auditResult]).toEqual(['AUDIT_NOT_PASSED', 'FAIL', 'FAIL']);
        expect(row.formData).not.toHaveProperty('auditedAt');
        expect(row.formData).not.toHaveProperty('carDueAt');
        expect(row.formData.onsiteAuditId).toBe(auditId);
        expect(await lettersOf(id)).toBe(0);
        expect((await noticesAbout(fx.approver.id, id)).map((n) => n.title)).toEqual(['มีคำขอที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน รอคุณตัดสิน']);
    });

    describe('คำปฏิเสธที่ประตูผลตรวจ', () => {
        it('ใบงาน: ไม่ผ่านโดยไม่มีข้อบกพร่อง = 400 FINDINGS_REQUIRED สถานะไม่เปลี่ยน', async () => {
            const id = await booked();
            const res = await jobSheet(id, { decision: 'FAIL', notes: 'ไม่ผ่าน', findings: [] });
            expect([res.status, res.body.code]).toEqual([400, 'FINDINGS_REQUIRED']);
            expect((await rowOf(id)).status).toBe('AUDIT_CONFIRMED');
        });

        it('ภาคสนาม: ไม่ผ่านโดยไม่มีข้อบกพร่อง = 400 FINDINGS_REQUIRED สถานะไม่เปลี่ยน', async () => {
            const id = await booked();
            const res = await fieldDoor(await onsiteVisit(id), { decision: 'FAIL', summary: 'ไม่ผ่าน' });
            expect([res.status, res.body.code]).toEqual([400, 'FINDINGS_REQUIRED']);
            expect((await rowOf(id)).status).toBe('AUDIT_CONFIRMED');
        });

        it('F-A8-04: ภาคสนาม: ผ่านโดยหลักฐานยังไม่ครบ = 422 พร้อมข้อความไทยจากแคตตาล็อก ไม่ใช่ข้อความภายในภาษาอังกฤษ', async () => {
            const id = await booked();
            const res = await fieldDoor(await onsiteVisit(id), { decision: 'PASS', summary: 'ผ่าน' });
            expect(res.status).toBe(422);
            expect(['INSUFFICIENT_PHOTOS', 'INCOMPLETE_CHECKLIST', 'EVIDENCE_CAPTURE_UNAVAILABLE']).toContain(res.body.code);
            expect(String(res.body.error)).toMatch(/^[^A-Za-z]*[ก-๙]/);
            expect(String(res.body.error)).not.toMatch(/assertOnsiteEvidenceSufficient/);
            expect((await rowOf(id)).status).toBe('AUDIT_CONFIRMED');
        });

        it('ใบงาน: คำว่า REJECT เลิกใช้แล้ว = 400 สถานะไม่เปลี่ยน', async () => {
            const id = await booked();
            const res = await jobSheet(id, { decision: 'REJECT', notes: 'ปฏิเสธ' });
            expect(res.status).toBe(400);
            expect((await rowOf(id)).status).toBe('AUDIT_CONFIRMED');
            expect(await lettersOf(id)).toBe(0);
        });

        it('ดูหลักฐานแก้ไขบนโต๊ะ (CAR_REVIEWING) ให้ไม่ผ่านไม่ได้ = 400 CAR_REVIEW_CANNOT_FAIL', async () => {
            const id = await booked({ status: 'CAR_REVIEWING' });
            const res = await jobSheet(id, { decision: 'FAIL', notes: 'ไม่ผ่าน', findings: [FINDING] });
            expect([res.status, res.body.code]).toEqual([400, 'CAR_REVIEW_CANNOT_FAIL']);
            expect((await rowOf(id)).status).toBe('CAR_REVIEWING');
        });

        it('F-A8-05: ยอมรับหลักฐานแก้ไข (ผ่าน) ทั้งที่ผู้ยื่นยังไม่ส่งหลักฐานในรอบนี้ = 422 CAR_EVIDENCE_MISSING', async () => {
            const askedAt = new Date(Date.now() - 3600000).toISOString();
            const before = new Date(Date.now() - 7200000).toISOString();
            const id = await booked({
                status: 'CAR_REVIEWING',
                formData: {
                    carRequestedAt: askedAt,
                    carDocuments: [{ originalName: 'old.pdf', path: '/uploads/car/CAR-old.pdf', uploadedAt: before }],
                },
            });
            const res = await jobSheet(id, { decision: 'PASS', notes: 'หลักฐานครบ' });
            expect([res.status, res.body.code]).toEqual([422, 'CAR_EVIDENCE_MISSING']);
            expect(String(res.body.error)).toMatch(/[ก-๙]/);
            expect((await rowOf(id)).status).toBe('CAR_REVIEWING');
        });

        it('F-A8-05: ประตูเปลี่ยนสถานะทั่วไป CAR_REVIEWING → AUDIT_PASSED โดยไม่มีหลักฐานรอบนี้ = 422 CAR_EVIDENCE_MISSING', async () => {
            const id = await booked({
                status: 'CAR_REVIEWING',
                formData: { carRequestedAt: new Date(Date.now() - 3600000).toISOString(), carDocuments: [] },
            });
            const res = await genericDoor(id, { toState: 'AUDIT_PASSED', comment: 'หลักฐานครบ' });
            expect([res.status, res.body.code]).toEqual([422, 'CAR_EVIDENCE_MISSING']);
            expect(String(res.body.error)).toMatch(/[ก-๙]/);
            expect((await rowOf(id)).status).toBe('CAR_REVIEWING');
        });

        it('F-A8-05: แฟ้มผ่านที่ผู้อนุมัติส่งกลับโดยไม่เคยมีรอบแก้ไข ไม่ถูกปฏิเสธว่าไม่มีหลักฐาน', async () => {
            const id = await booked({ status: 'CAR_REVIEWING' });
            const res = await jobSheet(id, { decision: 'PASS', notes: 'ยืนยันผลผ่านเดิม' });
            expect(res.body.code).not.toBe('CAR_EVIDENCE_MISSING');
        });

        const sentThisRound = (views) => ({
            carRequestedAt: new Date(Date.now() - 3600000).toISOString(),
            carDocuments: [{ id: 'CAR-fix.pdf', originalName: 'fix.pdf', path: '/uploads/car/CAR-fix.pdf', uploadedAt: new Date().toISOString(), findingNo: 1 }],
            ...(views ? { carEvidenceViews: { 'CAR-fix.pdf': views } } : {}),
        });

        it('F-A8-05: หลักฐานรอบนี้ที่ผู้ตรวจยังไม่เปิดดู บันทึกผ่านไม่ได้ทั้งใบงานและประตูเปลี่ยนสถานะทั่วไป = 422 CAR_EVIDENCE_NOT_OPENED', async () => {
            const id = await booked({ status: 'CAR_REVIEWING', formData: sentThisRound(null) });
            const res = await jobSheet(id, { decision: 'PASS', notes: 'หลักฐานครบ' });
            expect([res.status, res.body.code]).toEqual([422, 'CAR_EVIDENCE_NOT_OPENED']);
            expect(String(res.body.error)).toMatch(/เปิดดูทุกไฟล์/);
            const generic = await genericDoor(id, { toState: 'AUDIT_PASSED', comment: 'หลักฐานครบ' });
            expect([generic.status, generic.body.code]).toEqual([422, 'CAR_EVIDENCE_NOT_OPENED']);
            expect((await rowOf(id)).status).toBe('CAR_REVIEWING');
        });

        it('F-A8-05: การเปิดดูของผู้ตรวจคนอื่นไม่นับ', async () => {
            const id = await booked({ status: 'CAR_REVIEWING', formData: sentThisRound({ 'someone-else': new Date().toISOString() }) });
            const res = await jobSheet(id, { decision: 'PASS', notes: 'หลักฐานครบ' });
            expect([res.status, res.body.code]).toEqual([422, 'CAR_EVIDENCE_NOT_OPENED']);
        });

        it('F-A8-05: หลักฐานรอบนี้ที่ผู้ตรวจเปิดดูครบแล้ว ผ่านด่านนี้ไปถึงด่านหลักฐานภาคสนาม', async () => {
            const id = await booked({ status: 'CAR_REVIEWING', formData: sentThisRound({ [fx.inspector.id]: new Date().toISOString() }) });
            const res = await jobSheet(id, { decision: 'PASS', notes: 'หลักฐานครบ' });
            expect(['CAR_EVIDENCE_MISSING', 'CAR_EVIDENCE_NOT_OPENED']).not.toContain(res.body.code);
        });
    });

    it('ผลข้อบกพร่องสำคัญหลังการลงพื้นที่ที่เคยผ่าน ล้างตราผ่าน', async () => {
        const id = await booked({ stalePass: true });
        const res = await jobSheet(id, { decision: 'MAJOR', notes: 'ต้องแก้ไข', findings: [FINDING] });
        expect(res.status).toBe(200);
        const row = await rowOf(id);
        expect([row.status, row.auditResult, row.formData.auditResult]).toEqual(['CAR_PENDING', 'MAJOR', 'MAJOR']);
        expect(row.formData).not.toHaveProperty('auditedAt');
    });

    describe('ประตูเปลี่ยนสถานะทั่วไปไม่ใช่ทางบันทึกผลตรวจหรือทางตัดสิน', () => {
        it('ผู้ตรวจพื้นที่ส่ง REJECTED = 422 (ขานี้ไม่มีแล้ว)', async () => {
            const id = await booked();
            const res = await genericDoor(id, { toState: 'REJECTED', comment: 'แปลงไม่ผ่าน' });
            expect(res.status).toBe(422);
            expect((await rowOf(id)).status).toBe('AUDIT_CONFIRMED');
            expect(await lettersOf(id)).toBe(0);
        });

        it('ผู้ตรวจพื้นที่ส่ง AUDIT_NOT_PASSED = 409 INSPECTION_RESULT_USE_RESULT_DOOR (ต้องมีข้อบกพร่อง)', async () => {
            const id = await booked();
            const res = await genericDoor(id, { toState: 'AUDIT_NOT_PASSED', comment: 'ไม่ผ่าน' });
            expect([res.status, res.body.code]).toEqual([409, 'INSPECTION_RESULT_USE_RESULT_DOOR']);
            expect((await rowOf(id)).status).toBe('AUDIT_CONFIRMED');
        });

        it.each(['REJECTED', 'CAR_PENDING'])('ผู้อนุมัติส่ง AUDIT_NOT_PASSED ไป %s = 409 CERTIFICATION_DECISION_USE_FILE', async (to) => {
            const id = await booked({ status: 'AUDIT_NOT_PASSED' });
            const res = await genericDoor(id, { toState: to, comment: 'ตัดสินจากที่นี่' }, fx.approver);
            expect([res.status, res.body.code]).toEqual([409, 'CERTIFICATION_DECISION_USE_FILE']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
        });
    });
});
