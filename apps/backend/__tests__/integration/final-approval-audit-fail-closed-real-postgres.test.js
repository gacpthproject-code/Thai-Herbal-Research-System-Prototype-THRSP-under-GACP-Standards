/**
 * การอนุมัติใบรับรองต้องมีแถวบันทึกการเปลี่ยนสถานะเสมอ (real Postgres)
 *
 * ตั้งแต่ 2026-10-07 (คำสั่ง 29) การอนุมัติจบที่ CERTIFIED ในธุรกรรมเดียวกัน
 *
 * F-FINAL-APPROVAL-NO-AUDIT: ประตู final-approvals ออกใบรับรองในธุรกรรมเดียวกับการเปลี่ยนสถานะ
 * AUDIT_PASSED → APPROVED ถ้าเขียนแถว APPLICATION_STATUS_TRANSITION ไม่ได้ ทั้งธุรกรรมต้องถอย
 * ไม่มี APPROVED และไม่มีใบรับรอง (เดิมตัวเขียนกลืนข้อผิดพลาดของ audit ใน savepoint จึงหลุดได้)
 *
 * บังคับให้การเขียน audit ล้มด้วย trigger ของ Postgres จริง เฉพาะคำขอที่อยู่ในตาราง poison
 */

'use strict';

const { completeHolderEntity } = require('../../test-support/complete-holder');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

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

d('การอนุมัติใบรับรองไม่มีวันเกิดโดยไม่มีแถวบันทึก (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], invoiceIds: [], auditIds: [] };
    let seq = 0;

    async function staff(role, organizationId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `fa-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `fa-${seq}-${sfx}`, email: `fa-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function settled(applicationId, milestone) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-FA-${seq}-${sfx}`, applicationId, healthId: fx.applicant.canonicalId,
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

    /** คำขอที่ผ่านการตรวจแปลงจริง (หลักฐานครบ) จ่ายครบสองงวด รอผู้อนุมัติ */
    async function passedWithEvidence() {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-FA-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgA, entityId: fx.entity, submitterId: fx.applicant.id, status: 'AUDIT_CONFIRMED',
                auditorId: fx.inspector.id, reviewerId: fx.reviewer.id,
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
            // eslint-disable-next-line no-await-in-loop
            await auditOnsiteService.submitChecklistItem({
                auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: fx.inspector.id, prisma: raw,
            });
        }
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await auditOnsiteService.uploadPhoto({
                auditId: audit.id, fileBuffer: Buffer.from(`fa-${audit.id}-${i}`), fileName: `e-${i}.jpg`,
                gpsLat: 13.75 + i * 1e-4, gpsLng: 100.5 + i * 1e-4, capturedAt: new Date(),
                uploadedBy: fx.inspector.id, organizationId: fx.orgA, prisma: raw,
            });
        }
        await auditOnsiteService.submitDecision({
            auditId: audit.id, decision: 'PASS', summary: 'ผ่านการตรวจ', actorId: fx.inspector.id,
            actorRole: 'field_inspector', prisma: raw,
        });
        expect((await raw.application.findUnique({ where: { id: row.id }, select: { status: true } })).status).toBe('AUDIT_PASSED');
        return row.id;
    }

    const approve = async (id) => {
        mockActor.current = { ...fx.approver };
        await require('../../services/certification-decision-service').markDecisionFileViewed({ prisma: raw, applicationRef: id, organizationId: fx.approver.organizationId, approverId: fx.approver.id });
        return request(app).post(`/api/provider/auditor/applications/${id}/final-approvals`).send({ reason: 'หลักฐานครบ' });
    };
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;
    /** แถวบันทึก AUDIT_PASSED → APPROVED · metadata ถูกเก็บเป็นสตริง JSON จึงกรองฝั่ง JS */
    const transitionRows = async (id) => (await raw.auditLog.findMany({
        where: { resourceId: id, action: 'APPLICATION_STATUS_TRANSITION' }, select: { metadata: true },
    })).filter((row) => JSON.parse(row.metadata).toStatus === 'APPROVED').length;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `fa-${sfx}`, slug: `fa-${sfx}`, code: `FA_${sfx}`.toUpperCase() } });
        fx.orgIds.push(org.id);
        fx.orgA = org.id;
        fx.reviewer = await staff('document_reviewer', fx.orgA);
        fx.inspector = await staff('field_inspector', fx.orgA);
        fx.approver = await staff('certificate_approver', fx.orgA);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `fa-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `fa-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: completeHolderEntity('JURISTIC', { displayName: `บริษัท fa ${sfx} จำกัด`, organizationId: fx.orgA }) })).id;
        fx.entityIds.push(fx.entity);

        const plantCode = PLANT_SLUG_TO_CODE.cannabis;
        if (!(await raw.plantSpecies.findUnique({ where: { code: plantCode } }))) {
            fx.plantId = (await raw.plantSpecies.create({ data: { code: plantCode, nameTH: 'กัญชา', nameEN: 'Cannabis' } })).id;
        }

        await raw.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS test_audit_poison (resource_id text PRIMARY KEY)');
        await raw.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION test_audit_poison_fn() RETURNS trigger AS $$
            BEGIN
                IF NEW."action" = 'APPLICATION_STATUS_TRANSITION'
                   AND EXISTS (SELECT 1 FROM test_audit_poison WHERE resource_id = NEW."resourceId") THEN
                    RAISE EXCEPTION 'test: audit write forced to fail';
                END IF;
                RETURN NEW;
            END $$ LANGUAGE plpgsql`);
        await raw.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_audit_poison_trg ON audit_logs');
        await raw.$executeRawUnsafe('CREATE TRIGGER test_audit_poison_trg BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_audit_poison_fn()');

        app = express();
        app.use(express.json());
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
    });

    afterAll(async () => {
        await raw.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_audit_poison_trg ON audit_logs').catch(() => {});
        await raw.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_audit_poison_fn()').catch(() => {});
        await raw.$executeRawUnsafe('DROP TABLE IF EXISTS test_audit_poison').catch(() => {});
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        await wipe('certificate', byApp);
        await wipe('farmAuditPhoto', { auditId: { in: fx.auditIds } });
        await wipe('farmAuditChecklistItem', { auditId: { in: fx.auditIds } });
        await wipe('auditChecklist', { id: { in: fx.auditIds } });
        for (const model of ['checkoutOrder', 'workActivity']) {
            await wipe(model, byApp);
        }
        await wipe('invoice', { id: { in: fx.invoiceIds } });
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('attachment', { organizationId: { in: fx.orgIds } });
        await wipe('plot', { organizationId: { in: fx.orgIds } });
        await wipe('farm', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        if (fx.plantId) { await wipe('plantSpecies', { id: fx.plantId }); }
        await raw.$disconnect();
    });

    test('จ่ายครบสองงวด หลักฐานครบ: อนุมัติแล้วได้ CERTIFIED พร้อมใบรับรอง และแถวบันทึกหนึ่งแถว', async () => {
        const id = await passedWithEvidence();
        const res = await approve(id);
        expect(res.status).toBe(200);
        expect(await statusOf(id)).toBe('CERTIFIED');
        expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(1);
        expect(await transitionRows(id)).toBe(1);
    });

    test('เขียนแถวบันทึกไม่ได้: ทั้งธุรกรรมถอย ไม่มี APPROVED และไม่มีใบรับรอง', async () => {
        const id = await passedWithEvidence();
        await raw.$executeRawUnsafe('INSERT INTO test_audit_poison (resource_id) VALUES ($1)', id);
        const res = await approve(id);
        expect(res.status).toBe(500);
        expect(await statusOf(id)).toBe('AUDIT_PASSED');
        expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
        expect(await transitionRows(id)).toBe(0);
    });
});
