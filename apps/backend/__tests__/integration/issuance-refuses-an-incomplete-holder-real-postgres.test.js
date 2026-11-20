'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { completeHolderPayload } = require('../../test-support/complete-holder');

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
const certificateService = require('../../services/certificate-service');
const { PLANT_SLUG_TO_CODE } = require('../../config/plant-species-slugs');

d('ออกใบรับรองไม่ได้เมื่อข้อมูลผู้ถือไม่ครบ (real Postgres)', () => {
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
                id, canonicalId: `ih-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `ih-${seq}-${sfx}`, email: `ih-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function entity(data) {
        const row = await raw.entity.create({ data: { organizationId: fx.orgA, ...data } });
        fx.entityIds.push(row.id);
        return row.id;
    }

    async function settled(applicationId, milestone) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-IH-${seq}-${sfx}`, applicationId, healthId: fx.applicant.canonicalId,
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

    async function passedWithEvidence(entityId) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-IH-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgA, entityId, submitterId: fx.applicant.id, status: 'AUDIT_CONFIRMED',
                auditorId: fx.inspector.id, reviewerId: fx.reviewer.id,
                formData: {
                    workflowState: 'AUDIT_CONFIRMED', plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
                    farmData: {
                        farmName: `ฟาร์มผู้ถือ ${seq}`, address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
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
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            await auditOnsiteService.uploadPhoto({
                auditId: audit.id, fileBuffer: Buffer.from(`ih-${audit.id}-${i}`), fileName: `e-${i}.jpg`,
                gpsLat: 13.75 + i * 1e-4, gpsLng: 100.5 + i * 1e-4, capturedAt: new Date(),
                uploadedBy: fx.inspector.id, organizationId: fx.orgA, prisma: raw,
            });
        }
        await auditOnsiteService.submitDecision({
            auditId: audit.id, decision: 'PASS', summary: 'ผ่านการตรวจ', actorId: fx.inspector.id,
            actorRole: 'field_inspector', prisma: raw,
        });
        expect(await statusOf(row.id)).toBe('AUDIT_PASSED');
        return row.id;
    }

    const approve = async (id) => {
        mockActor.current = { ...fx.approver };
        await require('../../services/certification-decision-service').markDecisionFileViewed({ prisma: raw, applicationRef: id, organizationId: fx.approver.organizationId, approverId: fx.approver.id });
        return request(app).post(`/api/provider/auditor/applications/${id}/final-approvals`).send({ reason: 'หลักฐานครบ' });
    };
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;
    const certificatesOf = (id) => raw.certificate.count({ where: { applicationId: id } });
    const farmsOf = async (id) => {
        const { formData } = await raw.application.findUnique({ where: { id }, select: { formData: true } });
        return raw.farm.count({ where: { farmName: formData.farmData.farmName, organizationId: fx.orgA } });
    };
    const refusalOf = async (call) => {
        try { await call(); } catch (error) { return error; }
        throw new Error('issuance was not refused');
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `ih-${sfx}`, slug: `ih-${sfx}`, code: `IH_${sfx}`.toUpperCase() } });
        fx.orgIds.push(org.id);
        fx.orgA = org.id;
        fx.reviewer = await staff('document_reviewer', fx.orgA);
        fx.inspector = await staff('field_inspector', fx.orgA);
        fx.approver = await staff('certificate_approver', fx.orgA);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `ih-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `ih-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);

        const plantCode = PLANT_SLUG_TO_CODE.cannabis;
        if (!(await raw.plantSpecies.findUnique({ where: { code: plantCode } }))) {
            fx.plantId = (await raw.plantSpecies.create({ data: { code: plantCode, nameTH: 'กัญชา', nameEN: 'Cannabis' } })).id;
        }

        app = express();
        app.use(express.json());
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        await wipe('certificateScope', { certificate: byApp });
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

    test('ผู้อนุมัติกดอนุมัติ บริษัทที่ไม่มีข้อมูลผู้ลงนาม ที่อยู่ และโทรศัพท์: 422 บอกช่องที่ขาด ไม่มีใบรับรอง ไม่มีฟาร์ม · กรอกครบแล้วอนุมัติได้', async () => {
        const holderId = await entity({ type: 'JURISTIC', displayName: `บริษัท ผู้ถือขาด ${sfx} จำกัด` });
        const id = await passedWithEvidence(holderId);

        const refused = await approve(id);
        expect(refused.status).toBe(422);
        expect(refused.body.code).toBe('CERTIFICATE_HOLDER_INCOMPLETE');
        expect(refused.body.messageTh).toBe(
            'ไม่สามารถออกใบรับรองได้ เนื่องจากข้อมูลผู้ถือใบรับรองไม่ครบถ้วน (ขาด เลขทะเบียนนิติบุคคล, '
            + 'คำนำหน้าชื่อกรรมการผู้มีอำนาจลงนาม, ชื่อกรรมการผู้มีอำนาจลงนาม, นามสกุลกรรมการผู้มีอำนาจลงนาม, '
            + 'เลขประจำตัวประชาชนกรรมการผู้มีอำนาจลงนาม, สัญชาติกรรมการผู้มีอำนาจลงนาม, ที่อยู่, โทรศัพท์) '
            + 'ระบบไม่ได้บันทึกการเปลี่ยนแปลงใด ๆ แจ้งผู้ยื่นให้กรอกข้อมูลผู้ถือใบรับรองให้ครบ แล้วจึงออกใบรับรอง',
        );
        expect(await statusOf(id)).toBe('AUDIT_PASSED');
        expect(await certificatesOf(id)).toBe(0);
        expect(await farmsOf(id)).toBe(0);

        await raw.entity.update({ where: { id: holderId }, data: { juristicId: '0105561000017', payload: completeHolderPayload('JURISTIC') } });
        const approved = await approve(id);
        expect(approved.status).toBe(200);
        expect(await statusOf(id)).toBe('CERTIFIED');
        const cert = await raw.certificate.findFirst({ where: { applicationId: id }, select: { holderDisplayName: true, holderType: true } });
        expect(cert).toEqual({ holderDisplayName: `บริษัท ผู้ถือขาด ${sfx} จำกัด`, holderType: 'JURISTIC' });
    });

    test('บุคคลธรรมดาที่ไม่ได้ระบุสัญชาติ: ปฏิเสธก่อนเขียนฟาร์ม แม้เรียกนอกธุรกรรม', async () => {
        const payload = completeHolderPayload('INDIVIDUAL');
        payload.holder.person.nationality = '';
        const holderId = await entity({ type: 'INDIVIDUAL', displayName: 'นาย สมชาย ปลูกดี', thaiCitizenId: '1101700203451', payload });
        const id = await passedWithEvidence(holderId);

        const error = await refusalOf(() => certificateService.generateCertificate(id, fx.approver.id, { prisma: raw }));
        expect(error.code).toBe('CERTIFICATE_HOLDER_INCOMPLETE');
        expect(error.statusCode).toBe(422);
        expect(error.missingFields).toEqual(['person.nationality']);
        expect(error.message).toContain('(ขาด สัญชาติ)');
        expect(await certificatesOf(id)).toBe(0);
        expect(await farmsOf(id)).toBe(0);
    });

    test('คำขอที่ไม่มีผู้ถือ: ปฏิเสธ ไม่ออกใบในชื่อคนที่ล็อกอิน', async () => {
        const id = await passedWithEvidence(null);

        const error = await refusalOf(() => certificateService.generateCertificate(id, fx.approver.id, { prisma: raw }));
        expect(error.code).toBe('CERTIFICATE_HOLDER_INCOMPLETE');
        expect(error.missingFields).toEqual(['holder']);
        expect(await certificatesOf(id)).toBe(0);
        expect(await farmsOf(id)).toBe(0);
    });
});
