/**
 * เครื่องมือของผู้อนุมัติใบรับรอง (real Postgres) — คำสั่ง 29 และ 34(4), operator 2026-10-07
 *
 * ที่มา: reports/role-workflow-auditor/2026-10-06-approver-finance-audit.md (A2-A13)
 *   1. อนุมัติแล้วจบที่ CERTIFIED ทันทีที่ออกใบ ในธุรกรรมเดียว แจ้งผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นพร้อมเลขใบ
 *   2. แฟ้มตัดสินอ่านที่ตั้งจาก farmData ผลตรวจที่บันทึกจริง ผู้ถือ ขอบข่าย วัตถุประสงค์
 *   3. อนุมัติได้เมื่อผู้อนุมัติคนนั้นเปิดแฟ้มแล้ว และต้องมีเหตุผล (เก็บไว้ ไม่ส่งถึงผู้ยื่น)
 *   4. ไม่ให้การรับรอง: เหตุจากรายการตายตัว → REJECTED แจ้งผู้ยื่นและผู้ถือด้วยข้อความของเหตุ
 *   5. พักใช้ / เพิกถอน / คืนสภาพ โดยผู้อนุมัติ เหตุจากรายการตายตัว · ผู้ดูแลกรมเพิกถอนไม่ได้ ·
 *      ประตู interoperability ต้องมีเหตุจากรายการ
 *   6. แจ้งเตือนของผู้อนุมัติถูกอ่านแล้วหลังตัดสิน และลิงก์ยังเปิดได้
 *   7. ผู้อนุมัติต้องไม่ใช่ผู้ตรวจเอกสารของคำขอนั้น (เทียบตัวตน)
 */

'use strict';

const { completeHolderEntity } = require('../../test-support/complete-holder');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { setAppealSetup, clearAppealSetup, TEST_APPEAL_SETUP } = require('../../test-support/appeal-setup');
const { ERROR_CODES } = require('../../shared/error-codes');

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

const auditOnsiteService = require('../../services/audit-onsite-service');
const { resolveTraceByGenericQr } = require('../../services/trace-service');
const { PLANT_SLUG_TO_CODE } = require('../../config/plant-species-slugs');
const {
    CERTIFICATION_REFUSAL_REASONS,
    CERTIFICATE_SUSPENSION_REASONS,
    CERTIFICATE_REVOCATION_REASONS,
} = require('../../shared/certification-decision-reasons');

d('เครื่องมือของผู้อนุมัติใบรับรอง (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], invoiceIds: [], auditIds: [] };
    let seq = 0;

    async function person({ role, organizationId, status = 'ACTIVE', isDeleted = false, accountType = 'PROVIDER' }) {
        const id = crypto.randomUUID();
        seq += 1;
        const key = `adt-${seq}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId: key, healthId: accountType === 'HEALTH' ? key : null, password: 'x', role,
                authType: accountType === 'HEALTH' ? 'EMAIL_LEGACY' : 'PROVIDER_ID',
                providerId: accountType === 'HEALTH' ? null : key, email: `${key}@example.test`,
                firstName: 'คน', lastName: role, organizationId, status, isDeleted,
                ...(accountType === 'HEALTH' ? {} : { accountType: 'PROVIDER' }),
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId, canonicalId: key };
    }

    async function member(user, { role = 'OWNER', permissions = [], status = 'ACTIVE' } = {}) {
        await raw.entityMembership.create({
            data: { userId: user.id, entityId: fx.entity, role, permissions, status, organizationId: fx.orgA },
        });
    }

    async function settled(applicationId, milestone) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-ADT-${seq}-${sfx}`, applicationId, healthId: fx.applicant.canonicalId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgA, metadata: {},
            },
        });
        fx.invoiceIds.push(invoice.id);
        await raw.checkoutOrder.create({
            data: {
                applicationId, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0,
                totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id,
                organizationId: fx.orgA,
            },
        });
    }

    /**
     * คำขอที่ผ่านการตรวจแปลงจริงผ่านประตูของผู้ตรวจ (หลักฐานครบ) จ่ายครบสองงวด รอผู้อนุมัติ
     * `checkIn` เดินประตูเช็คอิน GPS ก่อนถ่ายภาพ แบบเดียวกับหน้าผู้ตรวจ ทำให้ช่วงเวลาตรวจเริ่มนับ
     */
    async function passedWithEvidence({ reviewerId = fx.reviewer.id, checkIn = false } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-ADT-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgA, entityId: fx.entity, submitterId: fx.applicant.id, status: 'AUDIT_CONFIRMED',
                auditorId: fx.inspector.id, reviewerId, certificationPurposes: ['RESEARCH'],
                formData: {
                    workflowState: 'AUDIT_CONFIRMED', plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
                    farmData: {
                        farmName: 'ฟาร์มทดสอบ', address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
                        subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai',
                        gpsLat: '13.12', gpsLng: '100.65',
                    },
                    plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
                },
            },
        });
        fx.appIds.push(row.id);
        await settled(row.id, 'M1');
        await settled(row.id, 'M2');
        const audit = await raw.auditChecklist.create({
            data: {
                applicationId: row.id, templateName: 'GACP_GENERAL', sections: [],
                auditorId: fx.inspector.id, organizationId: fx.orgA, status: 'IN_PROGRESS',
            },
        });
        fx.auditIds.push(audit.id);
        for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
            await auditOnsiteService.submitChecklistItem({
                auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: fx.inspector.id, prisma: raw,
            });
        }
        if (checkIn) {
            await auditOnsiteService.startInspection({
                auditId: audit.id, auditorId: fx.inspector.id, gpsLat: 13.12, gpsLng: 100.65, gpsAccuracy: 5, prisma: raw,
            });
        }
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            await auditOnsiteService.uploadPhoto({
                auditId: audit.id, fileBuffer: Buffer.from(`adt-${audit.id}-${i}`), fileName: `e-${i}.jpg`,
                gpsLat: 13.12 + i * 1e-5, gpsLng: 100.65 + i * 1e-5, capturedAt: new Date(),
                uploadedBy: fx.inspector.id, organizationId: fx.orgA, prisma: raw,
            });
        }
        await auditOnsiteService.submitDecision({
            auditId: audit.id, decision: 'PASS', summary: 'ผ่านทุกข้อ แปลงตรงตามที่ยื่น', actorId: fx.inspector.id,
            actorRole: 'field_inspector', prisma: raw,
        });
        expect(await statusOf(row.id)).toBe('AUDIT_PASSED');
        return row.id;
    }

    const as = (actor) => { mockActor.current = { ...actor }; };
    const readFile = (id, actor = fx.approver) => {
        as(actor);
        return request(app).get(`/api/provider/auditor/applications/${id}/decision-file`);
    };
    const markOpened = (id, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/decision-file/opened`);
    };
    /** What the web page does: load the file, then record that it rendered. */
    const openFile = async (id, actor = fx.approver) => {
        const res = await readFile(id, actor);
        if (res.status === 200 && res.body.data?.decidable) { await markOpened(id, actor); }
        return res;
    };
    const returnToInspector = (id, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/reject-to-auditor`).send({ comment: 'ภาพถ่ายแปลงไม่ชัด ขอให้ทบทวน' });
    };
    const approve = (id, body = { reason: 'หลักฐานครบ ผลตรวจผ่านทุกข้อ' }, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/final-approvals`).send(body);
    };
    const CONSIDERATION = 'หลักฐานในแฟ้มไม่พอยืนยันว่าแปลงเป็นไปตามมาตรฐาน GACP ตามเหตุที่เลือก';
    const refuse = (id, body, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/certification-refusals`).send({ consideration: CONSIDERATION, ...body });
    };
    const lettersAbout = async (userId, applicationId) => (await noticesAbout(userId, applicationId)).filter((n) => n.kind === 'OFFICIAL_LETTER');
    const certAction = (certId, action, body, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/certificates/${certId}/${action}`).send(body);
    };
    /** A status some other door committed, placed behind the writer for the fixture. */
    const placeAt = (id, status) => raw.$executeRaw`UPDATE applications SET status = ${status} WHERE id = ${id}`;
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;
    const noticesOf = (userId) => raw.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    const noticesAbout = async (userId, applicationId, notice) => (await noticesOf(userId))
        .filter((n) => n.metadata && n.metadata.applicationId === applicationId && (!notice || n.metadata.notice === notice));
    const issued = (userId, applicationId) => noticesAbout(userId, applicationId, 'CERTIFICATE_ISSUED');

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        await setAppealSetup(raw);
        const org = await raw.organization.create({ data: { name: `adt-${sfx}`, slug: `adt-${sfx}`, code: `ADT_${sfx}`.toUpperCase() } });
        fx.orgIds.push(org.id);
        fx.orgA = org.id;
        fx.reviewer = await person({ role: 'document_reviewer', organizationId: fx.orgA });
        fx.inspector = await person({ role: 'field_inspector', organizationId: fx.orgA });
        fx.approver = await person({ role: 'certificate_approver', organizationId: fx.orgA });
        fx.approver2 = await person({ role: 'certificate_approver', organizationId: fx.orgA });
        fx.dtamAdmin = await person({ role: 'system_admin_dtam', organizationId: fx.orgA });

        fx.entity = (await raw.entity.create({ data: completeHolderEntity('JURISTIC', { displayName: `บริษัท ผู้ถือ ${sfx} จำกัด`, organizationId: fx.orgA }) })).id;
        fx.entityIds.push(fx.entity);
        fx.applicant = await person({ role: 'health', organizationId: fx.orgA, accountType: 'HEALTH' });
        fx.colleague = await person({ role: 'health', organizationId: fx.orgA, accountType: 'HEALTH' });
        fx.viewerOnly = await person({ role: 'health', organizationId: fx.orgA, accountType: 'HEALTH' });
        fx.removed = await person({ role: 'health', organizationId: fx.orgA, accountType: 'HEALTH' });
        fx.suspendedAccount = await person({ role: 'health', organizationId: fx.orgA, accountType: 'HEALTH', status: 'SUSPENDED' });
        await member(fx.applicant);
        await member(fx.colleague, { role: 'MANAGER', permissions: ['SUBMIT_APPLICATION'] });
        await member(fx.viewerOnly, { role: 'MANAGER' });
        await member(fx.removed, { status: 'REVOKED' });
        await member(fx.suspendedAccount);

        const plantCode = PLANT_SLUG_TO_CODE.cannabis;
        if (!(await raw.plantSpecies.findUnique({ where: { code: plantCode } }))) {
            fx.plantId = (await raw.plantSpecies.create({ data: { code: plantCode, nameTH: 'กัญชา', nameEN: 'Cannabis' } })).id;
        }

        app = express();
        app.use(express.json());
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/provider/certificates', require('../../routes/api/provider/certificates'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/admin/certificates', require('../../routes/api/admin/certificates'));
        app.use('/api/interoperability', require('../../routes/api/integration/interoperability'));
        app.use('/api/trace', require('../../routes/api/trace/trace'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        await wipe('certificate', byApp);
        await wipe('farmAuditPhoto', { auditId: { in: fx.auditIds } });
        await wipe('gpsVerificationLog', { entityId: { in: fx.auditIds } });
        await wipe('farmAuditChecklistItem', { auditId: { in: fx.auditIds } });
        await wipe('auditChecklist', { id: { in: fx.auditIds } });
        for (const model of ['checkoutOrder', 'workActivity', 'applicationDocumentReview']) {
            await wipe(model, byApp);
        }
        await wipe('invoice', { id: { in: fx.invoiceIds } });
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('attachment', { organizationId: { in: fx.orgIds } });
        await wipe('lot', { organizationId: { in: fx.orgIds } });
        await wipe('harvestBatch', { organizationId: { in: fx.orgIds } });
        await wipe('plantingCycle', { organizationId: { in: fx.orgIds } });
        await wipe('plot', { organizationId: { in: fx.orgIds } });
        await wipe('farm', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        if (fx.plantId) { await wipe('plantSpecies', { id: fx.plantId }); }
        await clearAppealSetup(raw);
        await raw.$disconnect();
    });

    describe('ข้อ 1: อนุมัติแล้วจบที่ CERTIFIED และแจ้งผู้ยื่นกับผู้ถือ', () => {
        let id;
        let res;
        beforeAll(async () => {
            id = await passedWithEvidence();
            expect((await openFile(id)).status).toBe(200);
            res = await approve(id);
        });

        test('สถานะ CERTIFIED พร้อมใบรับรองหนึ่งใบ', async () => {
            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('CERTIFIED');
            expect(await statusOf(id)).toBe('CERTIFIED');
            const certs = await raw.certificate.findMany({ where: { applicationId: id } });
            expect(certs).toHaveLength(1);
            expect(res.body.data.certificateNumber).toBe(certs[0].certificateNumber);
        });

        test('ผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นได้รับแจ้งพร้อมเลขใบ คนละหนึ่งฉบับ', async () => {
            const cert = await raw.certificate.findFirst({ where: { applicationId: id } });
            for (const who of [fx.applicant, fx.colleague]) {
                const mine = await issued(who.id, id);
                expect(mine).toHaveLength(1);
                expect(mine[0].message).toContain(cert.certificateNumber);
            }
        });

        test('สมาชิกที่ไม่มีสิทธิ์ยื่น ถูกถอดออก หรือบัญชีถูกระงับ ไม่ได้รับแจ้ง', async () => {
            for (const who of [fx.viewerOnly, fx.removed, fx.suspendedAccount]) {
                expect(await issued(who.id, id)).toHaveLength(0);
            }
        });

        test('กดซ้ำ: ไม่ออกใบซ้ำ ไม่แจ้งซ้ำ', async () => {
            const again = await approve(id);
            expect(again.status).toBe(409);
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(1);
            const { notifyCertificateIssued } = require('../../services/certification-decision-service');
            await notifyCertificateIssued(id);
            expect(await issued(fx.applicant.id, id)).toHaveLength(1);
            expect(await issued(fx.colleague.id, id)).toHaveLength(1);
        });

        test('เหตุผลการอนุมัติอยู่ในบันทึกตรวจสอบ ไม่อยู่ในประวัติหรือแจ้งเตือนที่ผู้ยื่นเห็น', async () => {
            const row = await raw.application.findUnique({ where: { id }, select: { workflowHistory: true } });
            expect(JSON.stringify(row.workflowHistory)).not.toContain('หลักฐานครบ ผลตรวจผ่านทุกข้อ');
            const notices = await issued(fx.applicant.id, id);
            expect(JSON.stringify(notices)).not.toContain('หลักฐานครบ ผลตรวจผ่านทุกข้อ');
            const logs = await raw.auditLog.findMany({ where: { resourceId: id } });
            expect(logs.some((l) => String(l.metadata).includes('หลักฐานครบ ผลตรวจผ่านทุกข้อ'))).toBe(true);
        });

        test('ประตูเปลี่ยนสถานะทั่วไปตัดสินแทนแฟ้มไม่ได้', async () => {
            const other = await passedWithEvidence();
            await openFile(other);
            as(fx.approver);
            const generic = await request(app)
                .post(`/api/provider/applications/${other}/workflow-transitions`)
                .send({ toState: 'APPROVED', comment: 'x' });
            expect(generic.status).toBe(409);
            expect(generic.body.code).toBe('CERTIFICATION_DECISION_USE_FILE');
            expect(await statusOf(other)).toBe('AUDIT_PASSED');
        });
    });

    describe('F2 (live walk 2026-10-07): งานอนุมัติเป็นของผู้อนุมัติ และไม่ค้างหลังออกใบ', () => {
        const openTasks = (applicationId) => raw.workActivity.findMany({
            where: { applicationId, completedAt: null, cancelledAt: null }, select: { workType: true, candidateGroup: true },
        });

        test('งาน "อนุมัติออกใบรับรอง" ที่ AUDIT_PASSED ไปที่คิวผู้อนุมัติ ไม่ใช่ผู้ตรวจพื้นที่', async () => {
            const id = await passedWithEvidence();
            const finalApproval = (await openTasks(id)).filter((t) => t.workType === 'FINAL_APPROVAL');
            expect(finalApproval).toHaveLength(1);
            expect(finalApproval[0].candidateGroup).toBe('certificate_approver');
            await openFile(id);
            expect((await approve(id)).status).toBe(200);
            expect(await openTasks(id)).toEqual([]);
        });

        test('สคริปต์ซ่อม: APPROVED ที่ถือใบแล้ว → CERTIFIED ปิดงานค้าง · รันซ้ำไม่ทำอะไร · APPROVED ที่ไม่มีใบไม่แตะ', async () => {
            const { planHeal, applyHeal } = require('../../scripts/heal-approved-with-certificate');
            const stuck = await passedWithEvidence();
            await openFile(stuck);
            expect((await approve(stuck)).status).toBe(200);
            await placeAt(stuck, 'APPROVED');
            await raw.workActivity.create({
                data: {
                    applicationId: stuck, workType: 'SCHEDULING', candidateGroup: 'dispatcher',
                    triggeredAtStage: 'AUDIT_FEE_PAID', organizationId: fx.orgA,
                },
            });
            const noCert = await passedWithEvidence();
            await placeAt(noCert, 'APPROVED');
            // CERTIFIED is the approver's decision state: with no approver on record the
            // script has no one to write it as, so it refuses rather than write as SYSTEM.
            const noApprover = await passedWithEvidence();
            await openFile(noApprover);
            expect((await approve(noApprover)).status).toBe(200);
            await placeAt(noApprover, 'APPROVED');
            await raw.application.update({ where: { id: noApprover }, data: { headAuditorId: null } });

            const before = await planHeal(raw);
            expect(before.rows.map((r) => r.id)).toContain(stuck);
            expect(before.rows.map((r) => r.id)).not.toContain(noCert);

            const out = await applyHeal(raw);
            expect(out.refused).toBe(1);
            expect(await statusOf(noApprover)).toBe('APPROVED');
            expect(await statusOf(stuck)).toBe('CERTIFIED');
            expect(await openTasks(stuck)).toEqual([]);
            expect(await statusOf(noCert)).toBe('APPROVED');

            const again = await planHeal(raw);
            expect(again.rows.map((r) => r.id)).not.toContain(stuck);
        });
    });

    describe('ข้อ 2: แฟ้มตัดสินแสดงข้อมูลที่บันทึกจริง', () => {
        test('ที่ตั้งจาก farmData ผลตรวจจากประตูผู้ตรวจ ผู้ถือ ขอบข่าย วัตถุประสงค์', async () => {
            const id = await passedWithEvidence();
            const res = await openFile(id);
            expect(res.status).toBe(200);
            const { application, inspectorSummary } = res.body.data;
            expect(application.farmAddress).toContain('123 หมู่ 4');
            expect(application.farmAddress).toContain('บางพลี');
            expect(application.farmLatitude).toBeCloseTo(13.12);
            expect(application.farmLongitude).toBeCloseTo(100.65);
            expect(application.holder).toEqual({ name: `บริษัท ผู้ถือ ${sfx} จำกัด`, typeLabel: 'นิติบุคคล' });
            expect(application.scope).toEqual({ cultivationTypes: ['กลางแจ้ง'], plantName: 'กัญชา' });
            expect(application.purposes).toEqual(['ศึกษาวิจัย (ภ.ท. 09)']);
            expect(inspectorSummary.decision).toBe('PASS');
            expect(inspectorSummary.notes).toBe('ผ่านทุกข้อ แปลงตรงตามที่ยื่น');
            expect(inspectorSummary.decidedAt).toBeTruthy();
            expect(res.body.data.refusalReasons.map((r) => r.code)).toEqual(Object.keys(CERTIFICATION_REFUSAL_REASONS));
            expect(res.body.data.decidable).toBe(true);
        });

        // staging 110d5ed96 (2026-10-29): the same file printed "พิกัดแปลง 13.862100, 100.514400" and,
        // on every photograph, "ฟาร์มไม่มีพิกัดในทะเบียน จึงเทียบตำแหน่งไม่ได้" — the place check read a
        // field (locationData) the six-step wizard never writes.
        test('ภาพถ่ายวัดระยะจากพิกัดแปลงเดียวกับที่แฟ้มพิมพ์ ไม่ใช่ "ฟาร์มไม่มีพิกัดในทะเบียน"', async () => {
            const id = await passedWithEvidence();
            const res = await openFile(id);
            expect(res.status).toBe(200);
            const { application, onsite } = res.body.data;
            expect(application.farmLatitude).toBeCloseTo(13.12);
            expect(onsite.photos).toHaveLength(auditOnsiteService.DEFAULT_MIN_PHOTOS);
            for (const photo of onsite.photos) {
                expect(photo.flags).not.toContain('PLACE_FARM_LOCATION_UNKNOWN');
                expect(photo.place.status).toBe('MEASURED');
                expect(photo.place.distanceMeters).toBeLessThan(50);
            }
        });

        test('เช็คอินแล้วถ่าย: เช็คอินวัดระยะได้ และภาพอยู่ในช่วงเวลาตรวจ', async () => {
            const id = await passedWithEvidence({ checkIn: true });
            const res = await openFile(id);
            expect(res.status).toBe(200);
            const { onsite } = res.body.data;
            expect(onsite.gps.checkIn).toBeTruthy();
            expect(onsite.gps.unknownFarmLocation).toBe(false);
            expect(onsite.gps.distanceMeters).toBeLessThan(50);
            expect(onsite.gps.withinTolerance).toBe(true);
            for (const photo of onsite.photos) {
                expect(photo.time.windowSource).toBe('INSPECTION_START');
                expect(photo.time.status).toBe('INSIDE');
                // The fixture bytes are not an image, so the appearance layer stays unrecorded here.
                expect(photo.flags.filter((f) => /^(TIME|PLACE)_/.test(f))).toEqual([]);
            }
        });
    });

    describe('ข้อ 3: อนุมัติได้จากในแฟ้มเท่านั้น', () => {
        test('ยังไม่เปิดแฟ้ม: ปฏิเสธ ไม่มีใบรับรอง', async () => {
            const id = await passedWithEvidence();
            const res = await approve(id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DECISION_FILE_NOT_OPENED');
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
        });

        test('ผู้อนุมัติอีกคนเปิดแฟ้ม ไม่นับเป็นของผู้กด', async () => {
            const id = await passedWithEvidence();
            await openFile(id, fx.approver2);
            const res = await approve(id, undefined, fx.approver);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DECISION_FILE_NOT_OPENED');
        });

        test('ไม่มีเหตุผล: ปฏิเสธ', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            const res = await approve(id, { reason: '   ' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('CERTIFICATION_DECISION_REASON_REQUIRED');
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });
    });

    describe('ข้อ 4: ไม่ให้การรับรอง', () => {
        test('เหตุนอกรายการ: ปฏิเสธ สถานะไม่เปลี่ยน', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            const res = await refuse(id, { reasonCode: 'BECAUSE_I_SAID_SO', note: 'x' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('CERTIFICATION_REFUSAL_REASON_REQUIRED');
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('ยังไม่เปิดแฟ้ม: ปฏิเสธ', async () => {
            const id = await passedWithEvidence();
            const res = await refuse(id, { reasonCode: Object.keys(CERTIFICATION_REFUSAL_REASONS)[0] });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DECISION_FILE_NOT_OPENED');
        });

        test('เหตุจากรายการ: REJECTED ไม่มีใบ ผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นได้หนังสือแจ้งคำสั่งคนละฉบับพร้อมข้อความของเหตุ ไม่มีบันทึกภายใน', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            const [code, label] = Object.entries(CERTIFICATION_REFUSAL_REASONS)[0];
            const res = await refuse(id, { reasonCode: code, note: 'บันทึกภายในห้ามหลุด' });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('REJECTED');
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
            const letters = [...await lettersAbout(fx.applicant.id, id), ...await lettersAbout(fx.colleague.id, id)];
            expect(letters).toHaveLength(2);
            for (const n of letters) {
                expect(n.message).toContain(label);
                expect(JSON.stringify(n)).not.toContain('บันทึกภายในห้ามหลุด');
            }
            for (const who of [fx.applicant, fx.colleague, fx.viewerOnly]) {
                expect(await noticesAbout(who.id, id, 'CERTIFICATION_REFUSED')).toHaveLength(0);
            }
            expect(await lettersAbout(fx.viewerOnly.id, id)).toHaveLength(0);
        });
    });

    describe('ข้อ 5: พักใช้ เพิกถอน คืนสภาพ', () => {
        let certId;
        let appId;
        beforeAll(async () => {
            appId = await passedWithEvidence();
            await openFile(appId);
            expect((await approve(appId)).status).toBe(200);
            certId = (await raw.certificate.findFirst({ where: { applicationId: appId } })).id;
            lot = await lotUnder(certId);
        });
        let lot;

        /** A lot packed while the certificate was valid: farm, cycle under the certificate, batch, lot. */
        async function lotUnder(certificateId) {
            const farm = await raw.farm.create({
                data: {
                    ownerId: fx.applicant.id, organizationId: fx.orgA, farmName: `ฟาร์มล็อต ${sfx}`, farmType: 'CULTIVATION',
                    address: '1 หมู่ 1', subDistrict: 'บางพลีใหญ่', district: 'บางพลี', province: 'สมุทรปราการ', postalCode: '10540',
                    totalArea: 1000, cultivationArea: 800, cultivationMethod: 'OUTDOOR', status: 'ACTIVE',
                },
            });
            const plant = await raw.plantSpecies.findUnique({ where: { code: PLANT_SLUG_TO_CODE.cannabis } });
            const cycle = await raw.plantingCycle.create({
                data: {
                    farmId: farm.id, plantSpeciesId: plant.id, organizationId: fx.orgA, certificateId,
                    cycleName: `รอบ ${sfx}`, startDate: new Date('2026-01-01'), status: 'HARVESTED', cultivationType: 'OUTDOOR',
                },
            });
            const batch = await raw.harvestBatch.create({
                data: {
                    farmId: farm.id, cycleId: cycle.id, organizationId: fx.orgA, batchNumber: `HB-ADT-${sfx}`,
                    harvestDate: new Date('2026-06-01'), freshWeight: 10, dryWeight: 3, plantCode: PLANT_SLUG_TO_CODE.cannabis, status: 'HARVESTED',
                },
            });
            return raw.lot.create({
                data: {
                    batchId: batch.id, organizationId: fx.orgA, lotNumber: `LOT-ADT-${sfx}`, packageType: 'BAG',
                    quantity: 1, unitWeight: 1, totalWeight: 1, qrCode: `qr-adt-${sfx}`, status: 'PACKAGED',
                },
            });
        }
        /** What a buyer scanning the lot gets, from the buyer's page door and the generic QR door. */
        async function scanLot() {
            const page = await request(app).get(`/api/trace/lot/${encodeURIComponent(lot.lotNumber)}`);
            const generic = await resolveTraceByGenericQr(lot.qrCode, { requestIp: '127.0.0.1', userAgent: 'jest' });
            return { page: page.status, generic: generic.status };
        }
        const statusOfCert = async () => (await raw.certificate.findUnique({ where: { id: certId }, select: { status: true } })).status;
        const [suspendCode, suspendLabel] = Object.entries(CERTIFICATE_SUSPENSION_REASONS)[0];
        const [revokeCode, revokeLabel] = Object.entries(CERTIFICATE_REVOCATION_REASONS)[0];

        test('ก่อนพักใช้: ล็อตขึ้นว่ารับรองทั้งสองประตู (ตัวควบคุม)', async () => {
            expect(await scanLot()).toEqual({ page: 200, generic: 200 });
        });

        test('ผู้ดูแลกรมพักใช้ไม่ได้ และประตูเพิกถอนเดิมของผู้ดูแลถูกถอด', async () => {
            const res = await certAction(certId, 'suspensions', { reasonCode: suspendCode }, fx.dtamAdmin);
            expect(res.status).toBe(403);
            as(fx.dtamAdmin);
            const old = await request(app).post(`/api/admin/certificates/${certId}/revoke`).send({ reason: 'x' });
            expect(old.status).toBe(404);
            expect(await statusOfCert()).toBe('active');
        });

        test('พักใช้ด้วยเหตุนอกรายการ: ปฏิเสธ', async () => {
            const res = await certAction(certId, 'suspensions', { reasonCode: 'NOPE' });
            expect(res.status).toBe(400);
            expect(await statusOfCert()).toBe('active');
        });

        test('พักใช้: ใบเป็น suspended มีบันทึกตรวจสอบ แจ้งผู้ถือด้วยข้อความของเหตุ', async () => {
            const res = await certAction(certId, 'suspensions', { reasonCode: suspendCode, note: 'โน้ตภายใน' });
            expect(res.status).toBe(200);
            expect(await statusOfCert()).toBe('suspended');
            const logs = await raw.auditLog.findMany({ where: { resourceId: certId, action: 'CERTIFICATE_SUSPENDED' } });
            expect(logs).toHaveLength(1);
            const notices = (await noticesAbout(fx.colleague.id, appId)).filter((n) => n.metadata.notice === 'CERTIFICATE_SUSPENDED');
            expect(notices).toHaveLength(1);
            expect(notices[0].message).toContain(suspendLabel);
            expect(JSON.stringify(notices[0])).not.toContain('โน้ตภายใน');
        });

        test('พักใช้: ล็อตที่ผลิตไว้ก่อนไม่ขึ้นว่ารับรอง ทั้งหน้าผู้ซื้อและประตู QR ทั่วไป (คำสั่ง 25(4))', async () => {
            expect(await statusOfCert()).toBe('suspended');
            expect(await scanLot()).toEqual({ page: 410, generic: 410 });
        });

        test('คืนสภาพ: กลับเป็น active และล็อตเดิมกลับมาแสดงว่ารับรอง', async () => {
            const res = await certAction(certId, 'reinstatements', { note: 'แก้ไขแล้ว' });
            expect(res.status).toBe(200);
            expect(await statusOfCert()).toBe('active');
            expect(await scanLot()).toEqual({ page: 200, generic: 200 });
        });

        test('interoperability: เพิกถอนต้องมีเหตุจากรายการ และผู้ดูแลกรมใช้ไม่ได้', async () => {
            const cert = await raw.certificate.findUnique({ where: { id: certId } });
            as(fx.approver);
            const freeText = await request(app)
                .post(`/api/interoperability/v1/certificates/${encodeURIComponent(cert.certificateNumber)}/revoke`)
                .send({ reason: 'อะไรก็ได้' });
            expect(freeText.status).toBe(400);
            as(fx.dtamAdmin);
            const admin = await request(app)
                .post(`/api/interoperability/v1/certificates/${encodeURIComponent(cert.certificateNumber)}/revoke`)
                .send({ reasonCode: revokeCode });
            expect(admin.status).toBe(403);
            expect(await statusOfCert()).toBe('active');
        });

        test('เพิกถอน: ใบเป็น revoked แจ้งผู้ถือ กดซ้ำได้ 409', async () => {
            const res = await certAction(certId, 'revocations', { reasonCode: revokeCode, note: 'โน้ต' });
            expect(res.status).toBe(200);
            expect(await statusOfCert()).toBe('revoked');
            const cert = await raw.certificate.findUnique({ where: { id: certId } });
            expect(cert.revokedReason).toBe(revokeLabel);
            const notices = (await noticesAbout(fx.applicant.id, appId)).filter((n) => n.metadata.notice === 'CERTIFICATE_REVOKED');
            expect(notices).toHaveLength(1);
            expect(notices[0].message).toContain(revokeLabel);
            expect((await certAction(certId, 'revocations', { reasonCode: revokeCode })).status).toBe(409);
        });

        test('เพิกถอน: ล็อตที่ผลิตไว้ก่อนไม่มีใบรับรองที่ใช้ได้ให้ผู้ซื้อเห็น', async () => {
            const page = await request(app).get(`/api/trace/lot/${encodeURIComponent(lot.lotNumber)}`);
            const claimsValid = page.status === 200 && page.body?.data?.certificate?.isValid === true;
            expect(claimsValid).toBe(false);
            expect(JSON.stringify(page.body)).not.toContain('"isValid":true');
        });
    });

    describe('ข้อ 6: แจ้งเตือนของผู้อนุมัติหลังตัดสิน', () => {
        test('ถูกอ่านแล้ว และลิงก์ยังเปิดแฟ้มได้ (ไม่ 404)', async () => {
            const id = await passedWithEvidence();
            const before = await noticesAbout(fx.approver.id, id);
            expect(before).toHaveLength(1);
            expect(before[0].isRead).toBe(false);
            await openFile(id);
            expect((await approve(id)).status).toBe(200);
            for (const who of [fx.approver, fx.approver2]) {
                const after = await noticesAbout(who.id, id);
                expect(after.every((n) => n.isRead)).toBe(true);
            }
            const link = before[0].metadata.actionUrl;
            expect(link).toBe(`/provider/certification-decisions/${id}`);
            const res = await openFile(id);
            expect(res.status).toBe(200);
            expect(res.body.data.decidable).toBe(false);
            expect(res.body.data.decision).toEqual(expect.objectContaining({ outcome: 'APPROVED' }));
        });
    });

    describe('ข้อ 7: ผู้อนุมัติต้องไม่ใช่ผู้ตรวจเอกสารของคำขอนั้น', () => {
        test('เป็นผู้ตรวจเอกสารที่ถูกมอบหมาย: ปฏิเสธ', async () => {
            const id = await passedWithEvidence({ reviewerId: fx.approver.id });
            await openFile(id);
            const res = await approve(id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DOCUMENT_REVIEWER_CANNOT_DECIDE');
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
            const refused = await refuse(id, { reasonCode: Object.keys(CERTIFICATION_REFUSAL_REASONS)[0] });
            expect(refused.status).toBe(409);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('เคยบันทึกผลตรวจเอกสารรายฉบับ (แม้ไม่ใช่ผู้ถูกมอบหมาย): ปฏิเสธ', async () => {
            const id = await passedWithEvidence();
            await raw.applicationDocumentReview.create({
                data: { applicationId: id, slotId: 'sop_manual', verdict: 'ACCEPTED', round: 1, reviewerId: fx.approver2.id, organizationId: fx.orgA },
            });
            await openFile(id, fx.approver2);
            const res = await approve(id, undefined, fx.approver2);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DOCUMENT_REVIEWER_CANNOT_DECIDE');
        });

        test('ตัวควบคุม: ผู้อนุมัติที่ไม่ได้ตรวจอะไรเลย อนุมัติได้', async () => {
            const id = await passedWithEvidence();
            await openFile(id, fx.approver2);
            expect((await approve(id, undefined, fx.approver2)).status).toBe(200);
        });
    });

    describe('F1 (security review ca8aaad12): สองการตัดสินพร้อมกันบนคำขอเดียว', () => {
        const { refuseCertification } = require('../../services/certification-decision-service');
        const { writeApplicationStatus } = require('../../services/application-status-writer');
        const refuseCode = Object.keys(CERTIFICATION_REFUSAL_REASONS)[0];

        async function untilSomeoneWaitsOnALock() {
            for (let i = 0; i < 200; i += 1) {
                const [{ n }] = await raw.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock' AND datname = current_database()`;
                if (n > 0) { return; }
                await new Promise((r) => { setTimeout(r, 25); });
            }
            throw new Error('the second decision never waited for the first one');
        }

        /**
         * The refusal runs for real (fx.approver2), but its transaction commits only on release():
         * everything it writes is done and the row lock is held while the other decision starts.
         */
        async function refusalHeldOpen(id) {
            let release;
            const gate = new Promise((r) => { release = r; });
            let written;
            const holding = new Promise((r) => { written = r; });
            const heldPrisma = {
                $transaction: (fn) => raw.$transaction(async (tx) => {
                    const out = await fn(tx);
                    written();
                    await gate;
                    return out;
                }, { timeout: 30000 }),
            };
            const done = refuseCertification({
                applicationRef: id, actor: fx.approver2, reasonCode: refuseCode, consideration: CONSIDERATION, prisma: heldPrisma,
            });
            await holding;
            return { release, done };
        }

        test('ไม่ให้การรับรอง commit ขณะที่การอนุมัติรอ: อนุมัติได้ 409 ไม่มีใบรับรอง สถานะ REJECTED', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            await openFile(id, fx.approver2);
            const refusal = await refusalHeldOpen(id);
            const approving = approve(id).then((r) => r);
            await untilSomeoneWaitsOnALock();
            refusal.release();
            await refusal.done;
            const res = await approving;
            expect(res.status).toBe(409);
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
            expect(await statusOf(id)).toBe('REJECTED');
        });

        test('ไม่ให้การรับรอง commit ขณะที่การส่งกลับผู้ตรวจรอ: ส่งกลับได้ 409 สถานะ REJECTED', async () => {
            const id = await passedWithEvidence();
            await openFile(id, fx.approver2);
            const refusal = await refusalHeldOpen(id);
            const returning = returnToInspector(id).then((r) => r);
            await untilSomeoneWaitsOnALock();
            refusal.release();
            await refusal.done;
            const res = await returning;
            expect(res.status).toBe(409);
            expect(await statusOf(id)).toBe('REJECTED');
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.certificationDecision.outcome).toBe('REFUSED');
        });

        // A refusal committed first: the stale write never lands. Leaving REJECTED is refused as such
        // (a refused application leaves only along its own edge, order 78(2) ค8); a write onto the same
        // status is refused as a stale read.
        test.each([
            ['APPROVED', 'CERTIFICATION_TRACK_LOCKED'],
            ['CERTIFIED', 'CERTIFICATION_TRACK_LOCKED'],
            ['REJECTED', 'APPLICATION_STATE_CHANGED'],
            ['CAR_REVIEWING', 'CERTIFICATION_TRACK_LOCKED'],
        ])('ตัวเขียนสถานะ: ผู้อนุมัติเขียน %s จากสถานะที่ไม่ใช่สถานะจริงของแถว (REJECTED) = 409 %s', async (toStatus, code) => {
            const id = await passedWithEvidence();
            await placeAt(id, 'REJECTED');
            const fromStatus = toStatus === 'CERTIFIED' ? 'APPROVED' : 'AUDIT_PASSED';
            const attempt = raw.$transaction((tx) => writeApplicationStatus({
                prisma: tx, applicationId: id, fromStatus, toStatus,
                actorId: fx.approver2.id, actorRole: 'certificate_approver', reason: 'TEST', autoIssueCertificate: false,
            }));
            await expect(attempt).rejects.toMatchObject({ code, statusCode: 409 });
            expect(await statusOf(id)).toBe('REJECTED');
        });

        test('ตัวควบคุม: อนุมัติคนเดียวไม่มีใครแข่ง ออกใบได้', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            const res = await approve(id);
            expect(res.status).toBe(200);
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(1);
            expect(await statusOf(id)).toBe('CERTIFIED');
        });
    });

    describe('F3: การเปิดแฟ้มนับเฉพาะรอบที่คำขออยู่ในคิวตัดสินครั้งนี้', () => {
        const passAgainAsInspector = async (id) => {
            as(fx.inspector);
            const res = await request(app)
                .post(`/api/provider/auditor/applications/${id}/audit-decisions`)
                .send({ decision: 'PASS', notes: 'ทบทวนแล้ว ผ่าน' });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        };

        test('เปิดแฟ้มรอบแรก ส่งกลับผู้ตรวจ ผ่านใหม่ แล้วอนุมัติโดยไม่เปิดแฟ้มรอบใหม่: 409', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            expect((await returnToInspector(id)).status).toBe(200);
            await passAgainAsInspector(id);
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.decisionFileViews).toBeUndefined();
            const res = await approve(id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DECISION_FILE_NOT_OPENED');
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
        });

        test('ตัวควบคุม: เปิดแฟ้มรอบใหม่แล้วอนุมัติได้', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            expect((await returnToInspector(id)).status).toBe(200);
            await passAgainAsInspector(id);
            await openFile(id);
            expect((await approve(id)).status).toBe(200);
        });
    });

    describe('F5: อ่านแฟ้มไม่เขียนอะไร · การเปิดแฟ้มบันทึกด้วย POST แยก', () => {
        test('GET อย่างเดียวไม่นับว่าเปิดแฟ้ม: อนุมัติได้ 409', async () => {
            const id = await passedWithEvidence();
            expect((await readFile(id)).status).toBe(200);
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.decisionFileViews).toBeUndefined();
            const res = await approve(id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('DECISION_FILE_NOT_OPENED');
        });

        test('POST opened หลังแฟ้มแสดงผล: อนุมัติได้', async () => {
            const id = await passedWithEvidence();
            expect((await readFile(id)).status).toBe(200);
            expect((await markOpened(id)).status).toBe(200);
            expect((await approve(id)).status).toBe(200);
        });

        test('POST opened กับคำขอที่ไม่อยู่ในคิว หรือโดยผู้ที่ไม่ใช่ผู้อนุมัติ: ไม่บันทึก', async () => {
            const id = await passedWithEvidence();
            expect((await markOpened(id, fx.inspector)).status).toBe(403);
            await placeAt(id, 'CAR_REVIEWING');
            expect((await markOpened(id)).status).toBe(404);
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.decisionFileViews).toBeUndefined();
        });
    });

    describe('F7: ส่งกลับผู้ตรวจเป็นของผู้อนุมัติเท่านั้น', () => {
        test('ผู้ตรวจพื้นที่ใช้ประตู reject-to-auditor ไม่ได้ และไม่มีบันทึกการตัดสิน', async () => {
            const id = await passedWithEvidence();
            const res = await returnToInspector(id, fx.inspector);
            expect(res.status).toBe(403);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.certificationDecision).toBeUndefined();
        });

        test('ตัวควบคุม: ผู้อนุมัติส่งกลับได้ บันทึกผล RETURNED', async () => {
            const id = await passedWithEvidence();
            const res = await returnToInspector(id);
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('CAR_REVIEWING');
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.certificationDecision).toEqual(expect.objectContaining({ outcome: 'RETURNED', decidedBy: fx.approver.id }));
        });

        test('F-A8b-08: เหตุผลที่ส่งกลับถึงผู้ตรวจพื้นที่ (บนบันทึก แจ้งเตือน และแฟ้มตัดสินครั้งถัดไป)', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            const reason = 'ภาพถ่ายแปลงไม่ชัด ขอให้ทบทวน';
            expect((await returnToInspector(id)).status).toBe(200);

            const row = await raw.application.findUnique({ where: { id }, select: { formData: true, applicationNumber: true } });
            expect(row.formData.certificationDecision.comment).toBe(reason);

            const [notice] = await noticesAbout(fx.inspector.id, id);
            expect(notice).toEqual(expect.objectContaining({
                title: 'ผู้อนุมัติส่งคำขอกลับให้ทบทวน',
                message: expect.stringContaining(reason),
                priority: 2,
            }));
            expect(notice.message).toContain(row.applicationNumber);
            expect(notice.metadata.actionUrl).toBe(`/provider/audits/${id}`);

            const file = await readFile(id);
            expect(file.status).toBe(200);
            expect(file.body.data.approverReturns).toEqual([
                expect.objectContaining({
                    returnedBy: { id: fx.approver.id, name: 'คน certificate_approver' },
                    reason,
                }),
            ]);
            expect(Date.parse(file.body.data.approverReturns[0].returnedAt)).not.toBeNaN();
        });
    });

    describe('F2: เพิกถอนผ่าน interoperability เป็นของผู้อนุมัติขององค์กรเดียวกันเท่านั้น', () => {
        let certNumber;
        let certId;
        const [revokeCode] = Object.keys(CERTIFICATE_REVOCATION_REASONS);
        const interopRevoke = (actor) => {
            as(actor);
            return request(app)
                .post(`/api/interoperability/v1/certificates/${encodeURIComponent(certNumber)}/revoke`)
                .send({ reasonCode: revokeCode });
        };
        const certStatus = async () => (await raw.certificate.findUnique({ where: { id: certId }, select: { status: true } })).status;

        beforeAll(async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            expect((await approve(id)).status).toBe(200);
            const cert = await raw.certificate.findFirst({ where: { applicationId: id } });
            certNumber = cert.certificateNumber;
            certId = cert.id;
            const orgB = await raw.organization.create({ data: { name: `adt-b-${sfx}`, slug: `adt-b-${sfx}`, code: `ADTB_${sfx}`.toUpperCase() } });
            fx.orgIds.push(orgB.id);
            fx.platformAdmin = await person({ role: 'system_admin_platform', organizationId: orgB.id });
            fx.otherOrgApprover = await person({ role: 'certificate_approver', organizationId: orgB.id });
        });

        test('ผู้ดูแลแพลตฟอร์ม: 403 ใบยังใช้ได้', async () => {
            expect((await interopRevoke(fx.platformAdmin)).status).toBe(403);
            expect(await certStatus()).toBe('active');
        });

        test('ผู้อนุมัติขององค์กรอื่น: ไม่พบ ใบยังใช้ได้', async () => {
            expect((await interopRevoke(fx.otherOrgApprover)).status).toBe(404);
            expect(await certStatus()).toBe('active');
        });

        test('ตัวควบคุม: ผู้อนุมัติขององค์กรเดียวกันเพิกถอนได้', async () => {
            expect((await interopRevoke(fx.approver)).status).toBe(200);
            expect(await certStatus()).toBe('revoked');
        });
    });

    describe('F4: สคริปต์ซ่อม APPROVED → CERTIFIED ตรวจผู้อนุมัติและจำนวนใบก่อนเขียน', () => {
        const { applyHeal } = require('../../scripts/heal-approved-with-certificate');

        async function stuckApproved(decider = fx.approver) {
            const id = await passedWithEvidence();
            await openFile(id, decider);
            expect((await approve(id, undefined, decider)).status).toBe(200);
            await placeAt(id, 'APPROVED');
            return id;
        }

        test('ใบที่ยังใช้ได้มากกว่าหนึ่งใบ ผู้อนุมัติถูกระงับ หรือผู้อนุมัติอยู่องค์กรอื่น: ไม่แตะ · แถวปกติซ่อมพร้อมบันทึก executedBy script', async () => {
            const twoCerts = await stuckApproved();
            const cert = await raw.certificate.findFirst({ where: { applicationId: twoCerts } });
            const { id: _id, uuid: _uuid, certificateNumber, ...rest } = cert;
            await raw.certificate.create({ data: { ...rest, certificateNumber: `${certificateNumber}-DUP` } });

            const suspendedApprover = await person({ role: 'certificate_approver', organizationId: fx.orgA });
            const bySuspended = await stuckApproved(suspendedApprover);
            await raw.user.update({ where: { id: suspendedApprover.id }, data: { status: 'SUSPENDED' } });

            const orgC = await raw.organization.create({ data: { name: `adt-c-${sfx}`, slug: `adt-c-${sfx}`, code: `ADTC_${sfx}`.toUpperCase() } });
            fx.orgIds.push(orgC.id);
            const elsewhere = await person({ role: 'certificate_approver', organizationId: orgC.id });
            const byElsewhere = await stuckApproved();
            await raw.application.update({ where: { id: byElsewhere }, data: { headAuditorId: elsewhere.id } });

            const healthy = await stuckApproved();

            await applyHeal(raw);
            expect(await statusOf(twoCerts)).toBe('APPROVED');
            expect(await statusOf(bySuspended)).toBe('APPROVED');
            expect(await statusOf(byElsewhere)).toBe('APPROVED');
            expect(await statusOf(healthy)).toBe('CERTIFIED');
            const logs = await raw.auditLog.findMany({ where: { resourceId: healthy } });
            const healLog = logs.map((l) => (typeof l.metadata === 'string' ? JSON.parse(l.metadata) : l.metadata))
                .find((m) => m && m.reasonCode === 'HEAL_APPROVED_WITH_CERTIFICATE');
            expect(healLog).toEqual(expect.objectContaining({ executedBy: 'script' }));
        });
    });

    describe('F6: ประตูอ่านของผู้ยื่นไม่ส่งตัวตนเจ้าหน้าที่ผู้ตัดสิน', () => {
        test('หลังอนุมัติ: ฐานข้อมูลมีรหัสผู้อนุมัติ (ตัวควบคุม) แต่ทุกประตูอ่านของผู้ยื่นไม่มี · เครื่องหมายเปิดแฟ้มถูกล้างเมื่อออกจากคิว', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            expect((await approve(id)).status).toBe(200);
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.certificationDecision.decidedBy).toBe(fx.approver.id);
            expect(row.formData.decisionFileViews).toBeUndefined();

            const applicantApp = express();
            applicantApp.use(express.json());
            applicantApp.use('/api/applications', require('../../routes/api/applications/applications'));
            as({ ...fx.applicant, healthId: fx.applicant.canonicalId });
            for (const path of ['/', '/my', '/my/statuses', `/${id}`, `/${id}/status`, `/${id}/history`]) {
                const res = await request(applicantApp).get(`/api/applications${path}`);
                expect({ path, status: res.status }).toEqual({ path, status: 200 });
                expect({ path, leaks: JSON.stringify(res.body).includes(fx.approver.id) }).toEqual({ path, leaks: false });
                expect({ path, leaks: JSON.stringify(res.body).includes('decisionFileViews') }).toEqual({ path, leaks: false });
            }
        });
    });

    describe('คำสั่ง 118(1): ไม่ให้การรับรองได้เมื่อการตั้งค่าการอุทธรณ์มีผลแล้วเท่านั้น', () => {
        const reasonCode = Object.keys(CERTIFICATION_REFUSAL_REASONS)[0];
        afterEach(() => setAppealSetup(raw));

        test('ยังไม่ตั้ง: แฟ้มแสดงปุ่มที่ถูกพักพร้อมเหตุ ประตูปฏิเสธด้วยรหัสในแคตตาล็อก สถานะไม่เปลี่ยน ไม่มีหนังสือ', async () => {
            await clearAppealSetup(raw);
            const id = await passedWithEvidence();
            const file = await openFile(id);
            expect(file.body.data.actions).toContain('REFUSE');
            expect(file.body.data.refusalHold).toEqual({
                code: 'REFUSAL_AWAITS_APPEAL_SETUP', message: ERROR_CODES.REFUSAL_AWAITS_APPEAL_SETUP.messageTh,
            });
            const res = await refuse(id, { reasonCode });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('REFUSAL_AWAITS_APPEAL_SETUP');
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
            expect(await lettersAbout(fx.applicant.id, id)).toHaveLength(0);
        });

        test('ตั้งไว้แต่ยังไม่ถึงวันมีผล: ยังพักอยู่', async () => {
            await setAppealSetup(raw, [{ ...TEST_APPEAL_SETUP, effectiveFrom: '2999-01-01' }]);
            const id = await passedWithEvidence();
            expect((await openFile(id)).body.data.refusalHold).toMatchObject({ code: 'REFUSAL_AWAITS_APPEAL_SETUP' });
            const res = await refuse(id, { reasonCode });
            expect(res.status).toBe(409);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('ประตูตั้งค่าทั่วไปเขียนค่านี้ไม่ได้ ทั้งสองประตู', async () => {
            await clearAppealSetup(raw);
            const doors = express();
            doors.use(express.json());
            doors.use('/api/admin/config', require('../../routes/api/admin/config'));
            doors.put('/api/system-config/:key', require('../../controllers/system-config-controller').updateConfig);
            const value = JSON.stringify([TEST_APPEAL_SETUP]);
            const patched = await request(doors).patch('/api/admin/config/appeal.setup').send({ value, type: 'JSON' });
            const put = await request(doors).put('/api/system-config/appeal.setup').send({ value });
            for (const res of [patched, put]) {
                expect(res.status).toBe(403);
                expect(res.body.code).toBe('CONFIG_KEY_SET_BY_SCRIPT_ONLY');
            }
            expect(await raw.systemConfig.count({ where: { key: 'appeal.setup' } })).toBe(0);
        });

        test('มีผลแล้ว: ปุ่มไม่ถูกพัก ไม่ให้การรับรองได้ และหนังสือแจ้งระยะเวลาและช่องทางอุทธรณ์ตามที่ตั้ง', async () => {
            await setAppealSetup(raw);
            const id = await passedWithEvidence();
            expect((await openFile(id)).body.data.refusalHold).toBeNull();
            const res = await refuse(id, { reasonCode });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('REJECTED');
            const [letter] = await lettersAbout(fx.applicant.id, id);
            expect(letter.message).toContain(`ท่านมีสิทธิ์อุทธรณ์คำสั่งนี้ภายใน ${TEST_APPEAL_SETUP.timeLimitDays} วันนับแต่วันที่ได้รับแจ้งคำสั่ง`);
            expect(letter.message).toContain(`ช่องทางการอุทธรณ์: ${TEST_APPEAL_SETUP.channel}`);
            expect(letter.metadata.appeal).toEqual(TEST_APPEAL_SETUP);
            const stored = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(stored.formData.certificationDecision.appeal).toEqual(TEST_APPEAL_SETUP);
        });
    });

    describe('เหตุ "อื่น ๆ (โปรดระบุ)" (operator 2026-10-08): ต้องพิมพ์เหตุผล และเหตุที่พิมพ์คือสิ่งที่ผู้ยื่นและผู้ถือเห็น', () => {
        const typed = 'แปลงปลูกจริงอยู่คนละตำแหน่งกับที่ยื่น <b>ตรวจพบ</b> & ไม่แจ้ง';
        const missingText = [
            ['ไม่มีข้อความ', {}],
            ['ช่องว่างล้วน', { reasonText: '          ' }],
            ['9 ตัวอักษรหลังตัดช่องว่าง', { reasonText: '  ๑๒๓๔๕๖๗๘๙  ' }],
            ['501 ตัวอักษร', { reasonText: 'ก'.repeat(501) }],
            ['ไม่ใช่ข้อความ', { reasonText: { text: 'แปลงไม่ตรงกับที่ยื่นไว้' } }],
        ];

        test('ทั้งสามรายการมี OTHER ต่อท้าย และรายการตายตัวเดิมไม่เปลี่ยน', () => {
            for (const reasons of [CERTIFICATION_REFUSAL_REASONS, CERTIFICATE_SUSPENSION_REASONS, CERTIFICATE_REVOCATION_REASONS]) {
                const codes = Object.keys(reasons);
                expect(codes[codes.length - 1]).toBe('OTHER');
                expect(reasons.OTHER).toBe('อื่น ๆ (โปรดระบุ)');
            }
            expect(Object.keys(CERTIFICATION_REFUSAL_REASONS)).toEqual([
                'CRITICAL_NONCONFORMITY', 'FALSE_INFORMATION', 'LICENCE_NOT_VALID', 'SITE_NOT_ELIGIBLE', 'SCOPE_NOT_SUPPORTED', 'OTHER',
            ]);
        });

        test.each(missingText)('ไม่ให้การรับรองด้วย OTHER (%s): 400 DECISION_REASON_TEXT_REQUIRED สถานะไม่เปลี่ยน', async (_name, extra) => {
            const id = fx.otherRefusalAppId || (fx.otherRefusalAppId = await passedWithEvidence());
            await openFile(id);
            const res = await refuse(id, { reasonCode: 'OTHER', note: 'x', ...extra });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('DECISION_REASON_TEXT_REQUIRED');
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('ไม่ให้การรับรองด้วย OTHER พร้อมเหตุ: บันทึกเหตุที่พิมพ์ (ตัดช่องว่างหัวท้าย) หนังสือแจ้งคำสั่งถึงผู้ยื่นและผู้ถือ และแฟ้มแสดงเหตุนั้นตามตัวอักษร ไม่มีบันทึกภายใน', async () => {
            const id = fx.otherRefusalAppId || (fx.otherRefusalAppId = await passedWithEvidence());
            await openFile(id);
            const res = await refuse(id, { reasonCode: 'OTHER', reasonText: `  ${typed}\n`, note: 'บันทึกภายในห้ามหลุด' });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('REJECTED');
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.certificationDecision).toEqual(expect.objectContaining({ reasonCode: 'OTHER', reasonText: typed }));
            const letters = [...await lettersAbout(fx.applicant.id, id), ...await lettersAbout(fx.colleague.id, id)];
            expect(letters).toHaveLength(2);
            for (const n of letters) {
                expect(n.message).toContain(typed);
                expect(n.message).not.toContain('&lt;');
                expect(JSON.stringify(n)).not.toContain('บันทึกภายในห้ามหลุด');
                expect(n.message).not.toContain('อื่น ๆ (โปรดระบุ)');
            }
            const file = await readFile(id);
            expect(file.body.data.decision.reasonLabel).toBe(typed);
        });

        const boundaryText = [['10 ตัวอักษรพอดี', 'ก'.repeat(10)], ['500 ตัวอักษรพอดี', 'ข'.repeat(500)]];

        test.each(boundaryText)('ไม่ให้การรับรองด้วย OTHER (%s): ผ่าน บันทึกเหตุตามตัวอักษร', async (_name, text) => {
            const id = await passedWithEvidence();
            await openFile(id);
            const res = await refuse(id, { reasonCode: 'OTHER', reasonText: text });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('REJECTED');
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.certificationDecision.reasonText).toBe(text);
        });

        test('รายการตายตัวไม่อ่านช่อง reasonText: เหตุที่บันทึกและที่ผู้ถือเห็นคือข้อความของรายการ', async () => {
            const id = await passedWithEvidence();
            await openFile(id);
            const [code, label] = Object.entries(CERTIFICATION_REFUSAL_REASONS)[1];
            const res = await refuse(id, { reasonCode: code, reasonText: 'ข้อความนี้ต้องไม่ถูกเก็บหรือส่ง' });
            expect(res.status).toBe(200);
            const row = await raw.application.findUnique({ where: { id }, select: { formData: true } });
            expect(row.formData.certificationDecision.reasonText).toBeUndefined();
            const colleague = await lettersAbout(fx.colleague.id, id);
            expect(colleague).toHaveLength(1);
            expect(colleague[0].message).toContain(label);
            expect(JSON.stringify(colleague)).not.toContain('ข้อความนี้ต้องไม่ถูกเก็บหรือส่ง');
        });

        describe('พักใช้และเพิกถอน', () => {
            let certId;
            let certNumber;
            let appId;
            const statusOfCert = async () => (await raw.certificate.findUnique({ where: { id: certId }, select: { status: true } })).status;
            beforeAll(async () => {
                appId = await passedWithEvidence();
                await openFile(appId);
                expect((await approve(appId)).status).toBe(200);
                const cert = await raw.certificate.findFirst({ where: { applicationId: appId } });
                certId = cert.id;
                certNumber = cert.certificateNumber;
            });

            test.each(missingText)('พักใช้ด้วย OTHER (%s): 400 ใบยังใช้ได้', async (_name, extra) => {
                const res = await certAction(certId, 'suspensions', { reasonCode: 'OTHER', ...extra });
                expect(res.status).toBe(400);
                expect(res.body.code).toBe('DECISION_REASON_TEXT_REQUIRED');
                expect(await statusOfCert()).toBe('active');
            });

            test('พักใช้ด้วย OTHER พร้อมเหตุ: suspendedReason คือเหตุที่พิมพ์ ผู้ถือได้แจ้งด้วยเหตุนั้น ไม่มีโน้ตภายใน', async () => {
                const res = await certAction(certId, 'suspensions', { reasonCode: 'OTHER', reasonText: typed, note: 'โน้ตภายในพักใช้' });
                expect(res.status).toBe(200);
                const cert = await raw.certificate.findUnique({ where: { id: certId } });
                expect(cert.status).toBe('suspended');
                expect(cert.suspendedReason).toBe(typed);
                const notices = await noticesAbout(fx.colleague.id, appId, 'CERTIFICATE_SUSPENDED');
                expect(notices).toHaveLength(1);
                expect(notices[0].message).toContain(`เนื่องจาก${typed}`);
                expect(JSON.stringify(notices[0])).not.toContain('โน้ตภายในพักใช้');
                expect((await certAction(certId, 'reinstatements', { note: 'แก้ไขแล้ว' })).status).toBe(200);
            });

            test.each(boundaryText)('พักใช้ด้วย OTHER (%s): ผ่าน suspendedReason ตามตัวอักษร แล้วคืนสภาพได้', async (_name, text) => {
                const res = await certAction(certId, 'suspensions', { reasonCode: 'OTHER', reasonText: text });
                expect(res.status).toBe(200);
                const cert = await raw.certificate.findUnique({ where: { id: certId } });
                expect(cert.status).toBe('suspended');
                expect(cert.suspendedReason).toBe(text);
                expect((await certAction(certId, 'reinstatements', { note: 'แก้ไขแล้ว' })).status).toBe(200);
            });

            const interopRevoke = (body) => {
                as(fx.approver);
                return request(app).post(`/api/interoperability/v1/certificates/${encodeURIComponent(certNumber)}/revoke`).send(body);
            };

            test.each(missingText)('เพิกถอนผ่าน interoperability ด้วย OTHER (%s): 400 ใบยังใช้ได้', async (_name, extra) => {
                const res = await interopRevoke({ reasonCode: 'OTHER', ...extra });
                expect(res.status).toBe(400);
                expect(res.body.code).toBe('DECISION_REASON_TEXT_REQUIRED');
                expect(await statusOfCert()).toBe('active');
            });

            test.each(missingText)('เพิกถอนด้วย OTHER ที่ประตูผู้อนุมัติ (%s): 400 ใบยังใช้ได้', async (_name, extra) => {
                const res = await certAction(certId, 'revocations', { reasonCode: 'OTHER', ...extra });
                expect(res.status).toBe(400);
                expect(res.body.code).toBe('DECISION_REASON_TEXT_REQUIRED');
                expect(await statusOfCert()).toBe('active');
            });

            test('เพิกถอนผ่าน interoperability ด้วย OTHER พร้อมเหตุ: revokedReason คือเหตุที่พิมพ์ ประตูตอบเหตุนั้น ผู้ยื่นได้แจ้ง', async () => {
                const res = await interopRevoke({ reasonCode: 'OTHER', reasonText: typed, note: 'โน้ตภายในเพิกถอน' });
                expect(res.status).toBe(200);
                expect(res.body.data.revokedReason).toBe(typed);
                const cert = await raw.certificate.findUnique({ where: { id: certId } });
                expect(cert.status).toBe('revoked');
                expect(cert.revokedReason).toBe(typed);
                const notices = await noticesAbout(fx.applicant.id, appId, 'CERTIFICATE_REVOKED');
                expect(notices).toHaveLength(1);
                expect(notices[0].message).toContain(`เนื่องจาก${typed}`);
                expect(JSON.stringify(notices[0])).not.toContain('โน้ตภายในเพิกถอน');
            });
        });
    });
});
