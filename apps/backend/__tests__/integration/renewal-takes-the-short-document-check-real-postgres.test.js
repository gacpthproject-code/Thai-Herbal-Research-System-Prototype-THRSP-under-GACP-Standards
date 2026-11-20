/**
 * ต่ออายุไม่ข้ามการตรวจเอกสาร (operator คำสั่ง 25(11), 2026-10-06) · real Postgres, ประตูจริง
 *
 * D9 (audit 2026-10-07): หน้าต่ออายุสร้างคำขอที่มีราคาทันทีที่เปิดหน้า · ต่ออายุข้ามการตรวจเอกสาร ·
 * สองทางสร้างคำขอต่ออายุเขียนสถานะนอกเครื่องสถานะ (สร้างแถวที่ PENDING_AUDIT_FEE ตรง ๆ และ
 * SUBMITTED → PENDING_AUDIT_FEE ไม่อยู่ใน ALLOWED_TRANSITIONS)
 *
 * เส้นที่ถูก: ยื่นผ่าน wizard (requestType RENEWAL) พร้อมคำรับรองการเปลี่ยนแปลง → DOC_FEE_PAID
 * (ไม่มีค่าตรวจเอกสาร) → มอบผู้ตรวจเอกสาร → เอกสารผ่าน → PENDING_AUDIT_FEE → ชำระค่าต่ออายุ →
 * AUDIT_FEE_PAID · ทุกขาผ่าน writeApplicationStatus ที่ assert ขา
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const { dropConsentRows } = require('../../test-support/consent-history');
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

const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

function renewalFormData() {
    return {
        plantId: 'cannabis',
        serviceType: 'NEW',
        certificationPurposes: ['EXPORT'],
        locationType: 'OUTDOOR',
        cultivationMethods: ['outdoor'],
        consentedPDPA: true,
        acknowledgedStandards: true,
        applicantData: {
            applicantType: 'JURISTIC', companyName: 'บริษัท ต่ออายุสั้น จำกัด', registrationNumber: '0105560000001',
            directorName: 'สมชาย ใจดี', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '1100000000008',
            phone: '0812345678', email: 'somchai@example.com', address: '123 หมู่ 4',
        },
        farmData: {
            farmName: 'ฟาร์มสมชาย', address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
            subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai',
            landOwnership: 'OWN', gpsLat: '13.12', gpsLng: '100.65',
            siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
        },
        plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
        productionData: { propagationType: ['SEED'], plantParts: ['FLOWER'] },
        harvestData: { harvestMethod: 'MANUAL', dryingMethod: 'SUN', storageSystem: 'AMBIENT' },
        documents: [{ name: 'doc.pdf', url: '/uploads/doc.pdf', type: 'LAND_RIGHT' }],
        workflowState: 'DRAFT',
    };
}

d('ต่ออายุเดินผ่านการตรวจเอกสารแบบสั้น ทุกขาอยู่ในเครื่องสถานะ (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { entityIds: [], appIds: [], userIds: [] };
    const { writeApplicationStatus } = require('../../services/application-status-writer');

    async function user(label, role, extra = {}) {
        const id = crypto.randomUUID();
        const key = `rs-${label}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId: key, password: 'x', role, organizationId: fx.org, email: `${key}@example.test`,
                firstName: label, lastName: 'ทดสอบ', status: 'ACTIVE', ...extra,
            },
        });
        fx.userIds.push(id);
        return { id, canonicalId: key, role, canonicalRole: role, organizationId: fx.org };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        require('../../services/payment/mock-payment-adapter').__reset();
        fx.org = (await raw.organization.create({ data: { name: `rs-${sfx}`, slug: `rs-${sfx}`, code: `RS_${sfx}`.toUpperCase() } })).id;
        fx.X = await user('x', 'health', { healthId: `rs-x-${sfx}`, authType: 'EMAIL_LEGACY' });
        fx.dispatcher = await user('disp', 'dispatcher', { providerId: `rs-disp-${sfx}`, authType: 'PROVIDER_ID', accountType: 'PROVIDER' });
        fx.reviewer = await user('rev', 'document_reviewer', { providerId: `rs-rev-${sfx}`, authType: 'PROVIDER_ID', accountType: 'PROVIDER' });
        for (const category of [ConsentCategory.TERMS_OF_SERVICE, ConsentCategory.PRIVACY_POLICY, ConsentCategory.PAYMENT_TERMS]) {
            await raw.userConsent.create({
                data: { userId: fx.X.id, organizationId: fx.org, category, version: ConsentVersions[category] || '1.0', granted: true, grantedAt: new Date() },
            });
        }
        fx.C = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท rs ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.C);
        await raw.entityMembership.create({ data: { userId: fx.X.id, entityId: fx.C, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });
        fx.farm = (await raw.farm.create({
            data: {
                ownerId: fx.X.id, farmName: `ฟาร์ม rs ${sfx}`, farmType: 'CULTIVATION', address: '1', province: 'สมุทรปราการ',
                district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', totalArea: 1, cultivationArea: 1,
                cultivationMethod: 'OUTDOOR', organizationId: fx.org, entityId: fx.C,
            },
        })).id;
        const source = await raw.application.create({
            data: {
                applicationNumber: `APP-RS-SRC-${sfx}`, healthId: fx.X.canonicalId, areaType: 'OUTDOOR', organizationId: fx.org,
                entityId: fx.C, submitterId: fx.X.id, status: 'CERTIFIED',
                formData: { plantId: 'cannabis', cultivationMethods: ['outdoor'], workflowState: 'CERTIFIED' },
            },
        });
        fx.appIds.push(source.id);
        fx.certNumber = `GACP-RS-${sfx}`;
        fx.cert = (await raw.certificate.create({
            data: {
                certificateNumber: fx.certNumber, verificationCode: `V-RS-${sfx}`, qrData: 'qr', applicationId: source.id, userId: fx.X.id,
                farmId: fx.farm, farmName: 'ฟาร์ม', applicantName: 'ทดสอบ', cropType: 'cannabis', farmSize: 1, province: 'สมุทรปราการ',
                district: 'บางพลี', subDistrict: 'บางพลีใหญ่', standardId: 'std', standardName: 'GACP', validityMonths: 12,
                expiryDate: new Date(Date.now() + 20 * 86400e3), issuedBy: fx.X.id, status: 'active', organizationId: fx.org,
                holderDisplayName: `บริษัท rs ${sfx} จำกัด`, holderType: 'JURISTIC', submittedByUserId: fx.X.id,
            },
        })).id;

        mockActor.current = { ...fx.X, healthId: fx.X.canonicalId };
        app = express();
        app.use(express.json());
        app.use('/api/applications/renewals', require('../../routes/api/applications/renewals'));
        app.use('/api/applications', require('../../routes/api/applications/applications'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const appIds = (await raw.application.findMany({ where: { organizationId: fx.org }, select: { id: true } })).map((r) => r.id);
        const wipe = (model, where) => (raw[model] ? raw[model].deleteMany({ where }).catch(() => {}) : null);
        await wipe('certificate', { id: fx.cert });
        await wipe('farm', { organizationId: fx.org });
        await wipe('checkoutDocument', { checkoutOrder: { applicationId: { in: appIds } } });
        await wipe('checkoutOrder', { applicationId: { in: appIds } });
        for (const model of ['paymentTransaction', 'invoice', 'quotation', 'documentPrecheck', 'applicationDocument', 'workActivity', 'notification']) {
            await wipe(model, { applicationId: { in: appIds } });
        }
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('auditLog', { resourceId: { in: appIds } });
        await wipe('application', { id: { in: appIds } });
        await dropConsentRows(raw, { in: fx.userIds }).catch(() => {});
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: fx.org });
        await raw.$disconnect();
    });

    async function renewalDraft(label) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-RS-${label}-${sfx}`, healthId: fx.X.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.C, submitterId: fx.X.id, status: 'DRAFT', formData: renewalFormData(),
            },
        });
        fx.appIds.push(row.id);
        const claimed = await request(app).post('/api/applications/draft')
            .send({ applicationId: row.id, formData: { requestType: 'RENEWAL', previousCertificateNumber: fx.certNumber } });
        expect({ status: claimed.status, requestType: claimed.body?.data?.requestType }).toEqual({ status: 200, requestType: 'RENEWAL' });
        for (const [documentType, slotId] of [['JURISTIC_REG_6M', 'juristic_reg_6m'], ['LICENCE_PT10', 'licence_pt10'], ['LAND_RIGHTS', 'land_rights']]) {
            await raw.applicationDocument.create({
                data: { applicationId: row.id, documentType, slotId, fileName: `${slotId}.pdf`, fileUrl: `/uploads/${slotId}.pdf`, currentForSlot: slotId },
            });
        }
        return row.id;
    }

    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;

    test('ประตูสร้างคำขอต่ออายุแบบเปิดหน้าแล้วได้คำขอมีราคา ไม่มีแล้ว', async () => {
        const res = await request(app).post('/api/applications/renewals').send({ originalCertificateId: fx.cert });
        expect(res.status).toBe(404);
        expect(await raw.application.count({ where: { organizationId: fx.org, status: 'PENDING_AUDIT_FEE' } })).toBe(0);
    });

    test('ยื่นต่ออายุโดยไม่มีคำรับรองการเปลี่ยนแปลง → 422 และยังเป็นร่าง', async () => {
        const draft = await renewalDraft('NODECL');
        const res = await request(app).post('/api/applications/submit').send({ applicationId: draft, declarationsAccepted: true });
        expect({ status: res.status, code: res.body?.code }).toEqual({ status: 422, code: 'RENEWAL_CHANGE_DECLARATION_REQUIRED' });
        expect(await statusOf(draft)).toBe('DRAFT');
        await raw.application.update({ where: { id: draft }, data: { isDeleted: true } });
    });

    test('ต่ออายุเดินครบ: ยื่น → คิวตรวจเอกสาร → ผ่าน → ชำระค่าต่ออายุ → AUDIT_FEE_PAID', async () => {
        const draft = await renewalDraft('FULL');
        const submitted = await request(app).post('/api/applications/submit').send({
            applicationId: draft, declarationsAccepted: true,
            renewalChangeDeclaration: { changed: true, details: 'เพิ่มแปลงปลูกกลางแจ้งอีกหนึ่งแปลงทางทิศเหนือ' },
        });
        expect({ status: submitted.status, next: submitted.body?.nextRequiredAction, body: submitted.status === 200 ? null : submitted.body })
            .toEqual({ status: 200, next: 'WAIT_FOR_REVIEW', body: null });
        const filed = await raw.application.findUnique({ where: { id: draft } });
        expect(filed.status).toBe('DOC_FEE_PAID');
        expect(filed.formData.renewalChangeDeclaration).toMatchObject({ changed: true, details: 'เพิ่มแปลงปลูกกลางแจ้งอีกหนึ่งแปลงทางทิศเหนือ' });
        expect(await raw.invoice.count({ where: { applicationId: draft } })).toBe(0);
        expect(await raw.checkoutOrder.count({ where: { applicationId: draft } })).toBe(0);

        await writeApplicationStatus({
            prisma: raw, applicationId: draft, fromStatus: 'DOC_FEE_PAID', toStatus: 'ASSIGNED_FOR_REVIEW',
            actorId: fx.dispatcher.id, actorRole: 'dispatcher', reason: 'ASSIGN_REVIEWER', assertTransition: true,
            additionalData: { reviewerId: fx.reviewer.id },
        });
        await writeApplicationStatus({
            prisma: raw, applicationId: draft, fromStatus: 'ASSIGNED_FOR_REVIEW', toStatus: 'DOC_APPROVED',
            actorId: fx.reviewer.id, actorRole: 'document_reviewer', reason: 'DOCUMENTS_APPROVED', assertTransition: true,
        });
        const { applyDocumentApprovalConsequences } = require('../../routes/api/provider/handlers/workflow-side-effects');
        const approved = await raw.application.findUnique({ where: { id: draft } });
        const chain = await applyDocumentApprovalConsequences({
            prisma: raw, applicationId: draft, actorId: fx.reviewer.id, actorRole: 'document_reviewer',
            formData: approved.formData, workflowHistory: approved.workflowHistory,
            writeApplicationStatus, bulkUpdateRevisionDeadlineStatus: async () => {}, logger: console,
        });
        expect(chain).toMatchObject({ chained: true });
        expect(await statusOf(draft)).toBe('PENDING_AUDIT_FEE');

        const quotationService = require('../../services/quotation-service');
        const [qt] = await raw.quotation.findMany({ where: { applicationId: draft, isDeleted: false } });
        expect((qt.installments || []).map((i) => i.phase)).toEqual(['PHASE_2']);
        await quotationService.markQuotationAccepted(qt.id, { acceptedBy: null, snapshot: quotationService.buildAcceptanceSnapshot(qt) });
        const { createCheckoutForApplication } = require('../../services/checkout/stripe-checkout-service');
        const checkout = await createCheckoutForApplication({
            applicationId: draft, milestone: 'M2',
            actor: { id: fx.X.id, healthId: fx.X.canonicalId, role: 'health', holderScope: { userId: fx.X.id, readIds: [fx.C], editIds: [fx.C] } },
        });
        const order = await raw.checkoutOrder.findUnique({ where: { id: checkout.checkoutOrderId } });
        const { settleFromPaymentIntent } = require('../../services/checkout/checkout-settlement-service');
        await settleFromPaymentIntent({
            paymentIntent: {
                id: checkout.paymentIntentId, status: 'succeeded',
                amount_received: Math.round(Number(order.totalPayableAmount) * 100), metadata: { checkoutOrderId: order.id },
            },
            eventId: `evt-rs-${sfx}`,
        });
        expect(await statusOf(draft)).toBe('AUDIT_FEE_PAID');
    });

    test('ขา SUBMITTED → DOC_FEE_PAID ใช้ได้กับการต่ออายุเท่านั้น (ตัวควบคุมฝั่งลบ)', async () => {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-RS-NEW-${sfx}`, healthId: fx.X.canonicalId, areaType: 'OUTDOOR', organizationId: fx.org,
                entityId: fx.C, submitterId: fx.X.id, status: 'SUBMITTED', formData: { workflowState: 'SUBMITTED', requestType: 'NEW' },
            },
        });
        fx.appIds.push(row.id);
        await expect(writeApplicationStatus({
            prisma: raw, applicationId: row.id, fromStatus: 'SUBMITTED', toStatus: 'DOC_FEE_PAID',
            actorId: fx.X.id, actorRole: 'system', reason: 'X', assertTransition: true,
        })).rejects.toMatchObject({ code: 'PAYMENT_NOT_SETTLED' });
        expect(await statusOf(row.id)).toBe('SUBMITTED');
    });
});
