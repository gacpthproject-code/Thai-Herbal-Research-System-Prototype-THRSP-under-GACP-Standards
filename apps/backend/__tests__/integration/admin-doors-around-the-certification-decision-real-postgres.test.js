/**
 * ประตูของผู้ดูแลรอบการตัดสินให้การรับรอง (real Postgres) — คำสั่ง 31, 56(2), 78(2) ค8
 *
 * คำขอที่ไม่ได้รับการรับรองจบด้วยคำสั่งของคนพร้อมหนังสือราชการ ไม่ได้ค้างเพราะระบบผิดพลาด
 * ประตูกู้สถานการณ์ทั้งสี่ประตูจึงพาคำขอออกจาก REJECTED ไม่ได้ ทางออกเดียวคือขาของบทบาทเอง
 * (การอุทธรณ์ของผู้ยื่นในหน่วย U4) ด่านอยู่ที่ตัวเขียนสถานะ จึงปิดทุกประตูพร้อมกัน:
 * - POST  /api/provider/admin/status-override
 * - PATCH /api/admin/applications/:id/status
 * - POST  /api/admin/applications/:id/force-status
 * - POST  /api/admin/applications/:id/revert-last-transition
 *
 * แถวตั้งต้นสองแบบ (สเปก ส่วนที่ 6 หน่วย U1):
 * - แบบแรก REJECTED ที่ขาล่าสุดมาจาก AUDIT_CONFIRMED และมีหนังสือแจ้งคำสั่งแล้ว คือรูปที่ประตูผู้ตรวจ
 *   พื้นที่ทิ้งไว้ก่อน U1 เขียนตรงลงแถว เพราะ U1 ลบประตูนั้น
 * - แบบที่สอง ผู้อนุมัติไม่ให้การรับรองจาก AUDIT_PASSED ผ่านประตูจริง
 * ประตู revert คำนวณปลายทางจากขาล่าสุด จึงยิงกับแถวแบบแรก
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { setAppealSetup, clearAppealSetup } = require('../../test-support/appeal-setup');

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
const { PLANT_SLUG_TO_CODE } = require('../../config/plant-species-slugs');

d('ประตูของผู้ดูแลรอบการตัดสินให้การรับรอง (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], auditIds: [] };
    let seq = 0;

    async function person(role, accountType = 'PROVIDER') {
        const id = crypto.randomUUID();
        seq += 1;
        const key = `adc-${seq}-${sfx}`;
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
    const snapshot = async (id) => {
        const row = await raw.application.findUnique({ where: { id }, select: { status: true, version: true } });
        const letters = await raw.notification.count({
            where: { kind: 'OFFICIAL_LETTER', metadata: { path: ['applicationId'], equals: id } },
        });
        return { ...row, letters };
    };

    function farmFormData(workflowState) {
        return {
            workflowState, plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
            farmData: {
                farmName: 'ฟาร์มทดสอบ', address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
                subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai',
                gpsLat: '13.12', gpsLng: '100.65',
            },
            plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
        };
    }

    async function seat(status, { history = [], formData = farmFormData(status) } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-ADC-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status,
                auditorId: fx.inspector.id, reviewerId: fx.reviewer.id, certificationPurposes: ['RESEARCH'],
                formData, workflowHistory: history,
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, row);
        return row.id;
    }

    /** แบบแรก: ประตูผู้ตรวจพื้นที่ก่อน U1 ปฏิเสธจาก AUDIT_CONFIRMED และออกหนังสือแจ้งคำสั่งแล้ว */
    async function refusedByTheOldInspectorDoor() {
        const at = new Date().toISOString();
        const id = await seat('REJECTED', {
            history: [{
                timestamp: at, action: 'WORKFLOW_TRANSITION', fromState: 'AUDIT_CONFIRMED', toState: 'REJECTED',
                fromStatus: 'AUDIT_CONFIRMED', toStatus: 'REJECTED', actorId: fx.inspector.id, actorRole: 'field_inspector',
            }],
        });
        await raw.notification.create({
            data: {
                userId: fx.applicant.id, kind: 'OFFICIAL_LETTER', type: 'ERROR', organizationId: fx.org,
                title: 'หนังสือแจ้งคำสั่งไม่รับรอง', message: 'คำขอนี้เป็นอันสิ้นสุด',
                metadata: { applicationId: id, letterType: 'TERMINAL_DECISION' },
            },
        });
        return id;
    }

    /** แบบที่สอง: ผู้ตรวจพื้นที่ให้ผ่านด้วยหลักฐานครบ แล้วผู้อนุมัติไม่ให้การรับรองผ่านประตูจริง */
    async function refusedByTheApprover() {
        const id = await seat('AUDIT_CONFIRMED');
        const audit = await raw.auditChecklist.create({
            data: {
                applicationId: id, templateName: 'GACP_GENERAL', sections: [],
                auditorId: fx.inspector.id, organizationId: fx.org, status: 'IN_PROGRESS',
            },
        });
        fx.auditIds.push(audit.id);
        for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
            await auditOnsiteService.submitChecklistItem({
                auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: fx.inspector.id, prisma: raw,
            });
        }
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            await auditOnsiteService.uploadPhoto({
                auditId: audit.id, fileBuffer: Buffer.from(`adc-${audit.id}-${i}`), fileName: `e-${i}.jpg`,
                gpsLat: 13.12 + i * 1e-5, gpsLng: 100.65 + i * 1e-5, capturedAt: new Date(),
                uploadedBy: fx.inspector.id, organizationId: fx.org, prisma: raw,
            });
        }
        await auditOnsiteService.submitDecision({
            auditId: audit.id, decision: 'PASS', summary: 'ผ่านทุกข้อ แปลงตรงตามที่ยื่น', actorId: fx.inspector.id,
            actorRole: 'field_inspector', prisma: raw,
        });
        as(fx.approver);
        expect((await request(app).get(`/api/provider/auditor/applications/${id}/decision-file`)).status).toBe(200);
        expect((await request(app).post(`/api/provider/auditor/applications/${id}/decision-file/opened`)).status).toBe(200);
        const refused = await request(app).post(`/api/provider/auditor/applications/${id}/certification-refusals`)
            .send({ reasonCode: 'CRITICAL_NONCONFORMITY', consideration: 'ข้อบกพร่องที่พบกระทบการควบคุมผลผลิตโดยตรง', note: 'บันทึกภายใน' });
        expect(refused.status).toBe(200);
        expect((await snapshot(id)).status).toBe('REJECTED');
        return id;
    }

    const doors = {
        'POST /api/provider/admin/status-override': (id, to) => request(app).post('/api/provider/admin/status-override')
            .send({ applicationId: id, newStatus: to, reason: 'ตรวจพื้นที่ใหม่' }),
        'PATCH /api/admin/applications/:id/status': (id, to) => request(app).patch(`/api/admin/applications/${id}/status`)
            .send({ status: to, reasonCode: 'DATA_CORRECTION', comment: 'ตรวจพื้นที่ใหม่' }),
        'POST /api/admin/applications/:id/force-status': (id, to) => request(app).post(`/api/admin/applications/${id}/force-status`)
            .send({ toStatus: to, reasonCode: 'DATA_CORRECTION', reason: 'ส่งกลับไปตรวจพื้นที่ใหม่' }),
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        await setAppealSetup(raw);
        const org = await raw.organization.create({ data: { name: `adc-${sfx}`, slug: `adc-${sfx}`, code: `ADC_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.orgIds.push(org.id);
        fx.reviewer = await person('document_reviewer');
        fx.inspector = await person('field_inspector');
        fx.approver = await person('certificate_approver');
        fx.admin = await person('system_admin_dtam');
        fx.applicant = await person('health', 'HEALTH');
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท adc ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.entity);
        await raw.entityMembership.create({
            data: { userId: fx.applicant.id, entityId: fx.entity, role: 'OWNER', permissions: [], status: 'ACTIVE', organizationId: fx.org },
        });
        const plantCode = PLANT_SLUG_TO_CODE.cannabis;
        if (!(await raw.plantSpecies.findUnique({ where: { code: plantCode } }))) {
            fx.plantId = (await raw.plantSpecies.create({ data: { code: plantCode, nameTH: 'กัญชา', nameEN: 'Cannabis' } })).id;
        }

        app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.user = { ...mockActor.current }; next(); });
        app.use('/api/admin/applications', require('../../routes/api/admin/applications'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        await wipe('certificate', byApp);
        await wipe('farmAuditPhoto', { auditId: { in: fx.auditIds } });
        await wipe('farmAuditChecklistItem', { auditId: { in: fx.auditIds } });
        await wipe('auditChecklist', { id: { in: fx.auditIds } });
        for (const model of ['checkoutOrder', 'workActivity', 'applicationDocumentReview', 'revisionDeadline', 'correctionRound']) {
            await wipe(model, byApp);
        }
        await wipe('invoice', byApp);
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('attachment', { organizationId: { in: fx.orgIds } });
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

    describe('คำขอที่ไม่ได้รับการรับรอง ประตูกู้สถานการณ์พาออกไม่ได้ (ค8)', () => {
        const shapes = {
            'ผู้ตรวจพื้นที่ปฏิเสธก่อน U1 พร้อมหนังสือ': refusedByTheOldInspectorDoor,
            'ผู้อนุมัติไม่ให้การรับรองผ่านประตูจริง': refusedByTheApprover,
        };
        for (const [shape, make] of Object.entries(shapes)) {
            for (const [door, fire] of Object.entries(doors)) {
                it(`${door} ไป AUDIT_CONFIRMED = 409 CERTIFICATION_TRACK_LOCKED · ${shape}`, async () => {
                    const id = await make();
                    const before = await snapshot(id);
                    expect(before.letters).toBeGreaterThan(0);
                    as(fx.admin);
                    const res = await fire(id, 'AUDIT_CONFIRMED');
                    expect([res.status, res.body.code]).toEqual([409, 'CERTIFICATION_TRACK_LOCKED']);
                    expect(await snapshot(id)).toEqual(before);
                });
            }
        }

        it('POST /api/admin/applications/:id/revert-last-transition = 409 CERTIFICATION_TRACK_LOCKED · ผู้ตรวจพื้นที่ปฏิเสธก่อน U1 พร้อมหนังสือ', async () => {
            const id = await refusedByTheOldInspectorDoor();
            const before = await snapshot(id);
            as(fx.admin);
            const res = await request(app).post(`/api/admin/applications/${id}/revert-last-transition`)
                .send({ reason: 'ผู้ตรวจกดผิด ขอให้ตรวจพื้นที่ใหม่' });
            expect([res.status, res.body.code]).toEqual([409, 'CERTIFICATION_TRACK_LOCKED']);
            expect(await snapshot(id)).toEqual(before);
        });
    });

    describe('แฟ้มที่รอผู้อนุมัติ ผู้ดูแลกู้ได้ทางเดียวคือส่งกลับไปตรวจพื้นที่ใหม่ (คำสั่ง 31)', () => {
        const override = (id, to, extra = {}) => {
            as(fx.admin);
            return request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: to, reason: 'ตรวจพื้นที่ใหม่', ...extra });
        };

        it('AUDIT_NOT_PASSED ไป CAR_REVIEWING = 409 CERTIFICATION_TRACK_LOCKED (ผู้อนุมัติต้องตัดสินแฟ้มที่ไม่ผ่านเอง)', async () => {
            const id = await seat('AUDIT_NOT_PASSED');
            const before = await snapshot(id);
            const res = await override(id, 'CAR_REVIEWING');
            expect([res.status, res.body.code]).toEqual([409, 'CERTIFICATION_TRACK_LOCKED']);
            expect(await snapshot(id)).toEqual(before);
        });

        it('AUDIT_NOT_PASSED ไป CANCELLED = 409 CERTIFICATION_TRACK_LOCKED (ไม่มีใครปิดแฟ้มที่รอการตัดสิน)', async () => {
            const id = await seat('AUDIT_NOT_PASSED');
            const res = await override(id, 'CANCELLED', { closureReasonCode: 'DUPLICATE_APPLICATION' });
            expect([res.status, res.body.code]).toEqual([409, 'CERTIFICATION_TRACK_LOCKED']);
            expect((await snapshot(id)).status).toBe('AUDIT_NOT_PASSED');
        });

        it.each(['AUDIT_PASSED', 'AUDIT_NOT_PASSED'])('%s ไป EXPIRED = 400 (นอก ALLOWED_FORCE_STATUSES ปิดคำขอโดยไม่มีคำสั่งไม่ได้)', async (from) => {
            const id = await seat(from);
            const res = await override(id, 'EXPIRED');
            expect(res.status).toBe(400);
            expect((await snapshot(id)).status).toBe(from);
        });

        it('AUDIT_NOT_PASSED ไป AUDIT_CONFIRMED = 200 (ส่งกลับไปตรวจพื้นที่ใหม่ ยังทำได้)', async () => {
            const id = await seat('AUDIT_NOT_PASSED');
            const res = await override(id, 'AUDIT_CONFIRMED');
            expect(res.status).toBe(200);
            expect((await snapshot(id)).status).toBe('AUDIT_CONFIRMED');
        });

        it('force-status เข้า AUDIT_NOT_PASSED = 409 DECISION_STATE_NOT_FORCEABLE (ผลตรวจเป็นของผู้ตรวจพื้นที่)', async () => {
            const id = await seat('AUDIT_CONFIRMED');
            const before = await snapshot(id);
            as(fx.admin);
            const res = await doors['POST /api/admin/applications/:id/force-status'](id, 'AUDIT_NOT_PASSED');
            expect([res.status, res.body.code]).toEqual([409, 'DECISION_STATE_NOT_FORCEABLE']);
            expect(await snapshot(id)).toEqual(before);
        });
    });
});
