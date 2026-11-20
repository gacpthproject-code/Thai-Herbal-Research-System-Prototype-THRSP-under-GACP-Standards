/**
 * คำขอที่กติกาเปลี่ยนใต้เท้า: เจ้าหน้าที่ส่งกลับ ผู้ยื่นแก้ แล้วส่งกลับมาในคำขอเดิม (real Postgres)
 *
 * คำสั่ง operator 2026-10-06 (ข้อ 16) · ข้อบกพร่อง D5 + D6 จากรอบเดินจริงบน staging วันเดียวกัน:
 * คำขอที่ยื่นด้วยวัตถุประสงค์ MEDICAL ก่อนถูกถอด ไปถึงขั้นตรวจเอกสารแล้วค้างตาย เจ้าหน้าที่เห็น
 * รายการว่าง กด "รับคำขอ" ได้ 409 DOCUMENT_CHECK_INCOMPLETE กด "ขอเอกสารเพิ่ม" ได้ 409
 * DOCUMENT_CHECK_NOTHING_REQUESTED
 *
 * เดินทั้งวงผ่าน router จริงบน Postgres จริง ไม่ mock service ไม่ mock prisma: ประตูของเจ้าหน้าที่
 * ประตูบันทึกร่างของผู้ยื่น (ช่องทางเดียวกับวิซาร์ดแก้ไข) และประตูยื่นคำขอ
 */

'use strict';

const { dropConsentRows } = require('../../test-support/consent-history');
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
jest.mock('../../middleware/consent-manager', () => ({
    ...jest.requireActual('../../middleware/consent-manager'),
    requireConsent: (_req, _res, next) => next(),
}));
jest.mock('../../services/queue-service', () => ({
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-rule-change' }) }),
    getPdfQueue: () => null,
}));
jest.mock('../../services/pdf/invoice-template-service', () => ({
    ...jest.requireActual('../../services/pdf/invoice-template-service'),
    generateQuotationPdf: async () => Buffer.from('%PDF-1.4 quotation'),
}));

/** แบบคำขอที่ครบทุกช่อง ยื่นไว้ก่อนวันที่ MEDICAL ถูกถอด */
function filedBeforeTheRuleChanged() {
    return {
        plantId: 'cannabis',
        serviceType: 'NEW',
        requestType: 'NEW',
        certificationPurposes: ['MEDICAL'],
        locationType: 'OUTDOOR',
        cultivationMethods: ['outdoor'],
        consentedPDPA: true,
        acknowledgedStandards: true,
        declarationsAcceptedAt: '2026-10-01T03:00:00.000Z',
        applicantData: {
            applicantType: 'JURISTIC',
            companyName: 'บริษัท กติกาเปลี่ยน จำกัด',
            registrationNumber: '0105560000001',
            directorName: 'สมชาย ใจดี',
            firstName: 'สมชาย',
            lastName: 'ใจดี',
            idCard: '1100000000008',
            phone: '0812345678',
            email: 'somchai@example.com',
            address: '123 หมู่ 4',
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
        documents: [{ name: 'sop.pdf', url: '/uploads/sop.pdf', type: 'SOP_MANUAL' }],
        workflowState: 'ASSIGNED_FOR_REVIEW',
    };
}

const REQUIRED_SLOT = 'sop_manual';

d('คำขอที่กติกาเปลี่ยน: ส่งกลับ แก้ ส่งใหม่ในคำขอเดิม ไม่เก็บค่าบริการซ้ำ (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], ruleIds: [] };

    const asOfficer = () => {
        mockActor.current = {
            id: fx.officer, role: 'document_reviewer', canonicalRole: 'document_reviewer', organizationId: fx.org,
        };
    };
    const asApplicant = () => {
        mockActor.current = {
            id: fx.A.id, canonicalId: fx.A.canonicalId, healthId: fx.A.canonicalId,
            role: 'health', canonicalRole: 'health', organizationId: fx.org,
        };
    };
    const attach = async (slotId, applicationId = fx.app) => {
        const { documentTypesOfSlot } = require('../../services/application-document-sync');
        await raw.applicationDocument.create({
            data: {
                applicationId, documentType: documentTypesOfSlot(slotId)[0], slotId, fileName: `${slotId}.pdf`,
                fileUrl: `/uploads/${slotId}.pdf`, currentForSlot: slotId,
            },
        });
    };
    const statusOf = async () => (await raw.application.findUnique({ where: { id: fx.app }, select: { status: true } })).status;
    const moneyRows = async () => ({
        quotations: await raw.quotation.count({ where: { applicationId: fx.app } }),
        checkoutOrders: await raw.checkoutOrder.count({ where: { applicationId: fx.app } }),
        invoices: await raw.invoice.count({ where: { applicationId: fx.app } }),
    });

    /** งวดแรกที่ชำระแล้วจริง: คำขอที่อยู่ขั้นตรวจเอกสารได้ต้องผ่านการชำระงวดแรกมาแล้ว */
    const paidFirstMilestone = (applicationId) => settleMilestones(
        raw, { id: applicationId, healthId: fx.A.canonicalId, organizationId: fx.org }, ['M1'],
    );

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const { deriveDimensions } = require('../../services/application-requirements-service');
        const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

        fx.org = (await raw.organization.create({ data: { name: `rc-${sfx}`, slug: `rc-${sfx}`, code: `RC_${sfx}`.toUpperCase() } })).id;

        fx.officer = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.officer, canonicalId: `rc-off-${sfx}`, password: 'x', role: 'document_reviewer',
                authType: 'PROVIDER_ID', providerId: `rc-off-${sfx}`,
                email: `rc-off-${sfx}@example.test`, firstName: 'เจ้าหน้าที่', lastName: 'ตรวจเอกสาร', organizationId: fx.org,
            },
        });
        fx.userIds.push(fx.officer);

        const applicantId = crypto.randomUUID();
        fx.A = { id: applicantId, canonicalId: `rc-a-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.A.canonicalId, healthId: fx.A.canonicalId, password: 'x', role: 'health',
                authType: 'EMAIL_LEGACY', email: `rc-a-${sfx}@example.test`, firstName: 'ผู้ยื่น', lastName: 'ทดสอบ',
                organizationId: fx.org,
            },
        });
        fx.userIds.push(applicantId);

        fx.C = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท rc ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.C);
        await raw.entityMembership.create({ data: { userId: applicantId, entityId: fx.C, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });
        await raw.userConsent.create({
            data: {
                userId: applicantId, organizationId: fx.org, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });

        const app0 = await raw.application.create({
            data: {
                applicationNumber: `APP-RC-${sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.C, submitterId: applicantId,
                status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.officer,
                formData: filedBeforeTheRuleChanged(),
            },
        });
        fx.app = app0.id;
        fx.appIds.push(fx.app);
        await paidFirstMilestone(fx.app);

        // ผู้ถือเป็นบุคคล แต่คำขอประกาศว่าเป็นนิติบุคคล: ผู้ถือของคำขอที่ยื่นแล้วเปลี่ยนไม่ได้ ผู้ยื่นจึงแก้เองไม่ได้
        fx.person = (await raw.entity.create({ data: { type: 'INDIVIDUAL', displayName: `บุคคล rc ${sfx}`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.person);
        const holderApp = await raw.application.create({
            data: {
                applicationNumber: `APP-RC-H-${sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.person, submitterId: applicantId,
                status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.officer,
                formData: { ...filedBeforeTheRuleChanged(), certificationPurposes: ['RESEARCH'], applicantType: 'JURISTIC' },
            },
        });
        fx.holderApp = holderApp.id;
        fx.appIds.push(fx.holderApp);
        await paidFirstMilestone(fx.holderApp);

        // กฎหนึ่งข้อที่บังคับจริง: ถ้าไม่มี ACCEPT_ALL ตอนท้ายจะปฏิเสธเพราะ "ไม่มีเอกสารให้ตรวจ" และ
        // บททดสอบนี้จะพิสูจน์ไม่ได้ว่าคำขอเดินต่อได้จริง
        const plantCode = deriveDimensions({ id: 'probe', areaType: 'OUTDOOR', formData: { plantId: 'cannabis' } }).plantCode;
        const rule = await raw.requirementRule.create({
            data: {
                plantCode, slotId: REQUIRED_SLOT, isRequired: true, effectiveFrom: new Date('2020-01-01'),
                createdBy: fx.officer, reason: 'fixture: one required paper so the decision has something to hold',
            },
        });
        fx.ruleIds.push(rule.id);
        // เอกสารที่คำขอนี้ยื่นไว้แล้วตั้งแต่ต้น: ฉบับที่กฎข้างบนบังคับ และหนังสือรับรองนิติบุคคลที่ผู้ถือแบบบริษัทต้องมี
        for (const slotId of [REQUIRED_SLOT, 'juristic_reg_6m']) { await attach(slotId); }

        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/document-reviews'));
        app.use('/api/applications', require('../../routes/api/applications/applications'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        await wipe('notification', { userId: { in: fx.userIds } });
        for (const model of ['applicationDocumentReview', 'revisionDeadline', 'applicationDocument', 'workActivity',
            'quotation', 'checkoutOrder', 'invoice', 'documentPrecheck']) {
            await wipe(model, byApp);
        }
        await wipe('auditLog', { organizationId: fx.org });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('requirementRule', { id: { in: fx.ruleIds } });
        await wipe('farm', { entityId: { in: fx.entityIds } });
        await dropConsentRows(raw, { in: fx.userIds }).catch(() => {});
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: fx.org });
        await raw.$disconnect();
    });

    let moneyBefore;

    test('1. เจ้าหน้าที่เห็นเหตุที่คำขอติดเป็นภาษาไทย ไม่ใช่รายการว่าง', async () => {
        moneyBefore = await moneyRows();
        asOfficer();
        const res = await request(app).get(`/api/provider/applications/${fx.app}/document-check`);
        expect(res.status).toBe(200);
        const issues = res.body.data.blockingIssues;
        expect(issues.map((i) => i.code)).toEqual(['CERTIFICATION_PURPOSE_INVALID']);
        expect(issues[0].messageTH).toMatch(/วัตถุประสงค์/);
    });

    test('2. รับคำขอไม่ได้ และคำตอบบอกให้ส่งกลับ', async () => {
        asOfficer();
        const res = await request(app).post(`/api/provider/applications/${fx.app}/document-decision`).send({ action: 'ACCEPT_ALL' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_CHECK_BLOCKED');
        expect(await statusOf()).toBe('ASSIGNED_FOR_REVIEW');
    });

    test('3. ส่งกลับให้ผู้ยื่นได้ คำขอไปที่ REVISION_REQUESTED พร้อมเหตุภาษาไทยที่ผู้ยื่นอ่านได้', async () => {
        asOfficer();
        const res = await request(app).post(`/api/provider/applications/${fx.app}/document-decision`).send({ action: 'REQUEST_MORE' });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('REVISION_REQUESTED');
        expect(res.body.data.blockingCodes).toEqual(['CERTIFICATION_PURPOSE_INVALID']);
        expect(await statusOf()).toBe('REVISION_REQUESTED');

        const row = await raw.application.findUnique({ where: { id: fx.app }, select: { formData: true } });
        expect(row.formData.revisionDueAt).toBeTruthy();
        expect(row.formData._lastReviewComment).toMatch(/วัตถุประสงค์/);
        expect(await raw.revisionDeadline.count({ where: { applicationId: fx.app } })).toBeGreaterThan(0);
    });

    test('3b. ผู้ยื่นเขียนทับบันทึกของเจ้าหน้าที่ผ่าน /prepare ไม่ได้', async () => {
        const before = (await raw.application.findUnique({ where: { id: fx.app }, select: { formData: true } })).formData;
        asApplicant();
        const res = await request(app).post('/api/applications/prepare').send({
            applicationId: fx.app,
            _lastReviewComment: 'เจ้าหน้าที่ไม่ได้ขออะไร',
            reviewProgress: { forged: true },
            auditDecisions: [{ decision: 'PASS' }],
            reviewerName: 'ผู้ยื่นเอง',
        });
        expect(res.body).toMatchObject({ success: true });
        const after = (await raw.application.findUnique({ where: { id: fx.app }, select: { formData: true } })).formData;
        expect(after._lastReviewComment).toBe(before._lastReviewComment);
        expect(after._lastReviewComment).toMatch(/วัตถุประสงค์/);
        expect(after.reviewProgress).toEqual(before.reviewProgress);
        expect(after.auditDecisions).toEqual(before.auditDecisions);
        expect(after.reviewerName).toEqual(before.reviewerName);
    });

    test('4. ผู้ยื่นเปลี่ยนวัตถุประสงค์และแนบใบอนุญาตที่วัตถุประสงค์ใหม่ต้องใช้ แล้วยื่นกลับในคำขอเดิม', async () => {
        asApplicant();
        const saved = await request(app).post('/api/applications/draft').send({
            applicationId: fx.app,
            formData: { certificationPurposes: ['RESEARCH'] },
        });
        expect(saved.body).toMatchObject({ success: true });

        await attach('licence_pt09');

        const submitted = await request(app).post('/api/applications/submit').send({ applicationId: fx.app });
        expect(submitted.body).toMatchObject({ success: true });
        expect(submitted.body.data.id).toBe(fx.app);
        expect(await statusOf()).toBe('ASSIGNED_FOR_REVIEW');
        const row = await raw.application.findUnique({ where: { id: fx.app }, select: { formData: true } });
        expect(row.formData._lastReviewComment).toBeNull();
    });

    test('5. การยื่นกลับไม่สร้างใบเสนอราคา คำสั่งชำระ หรือใบแจ้งหนี้ใหม่', async () => {
        expect(await moneyRows()).toEqual(moneyBefore);
    });

    test('6. เจ้าหน้าที่เห็นคำขอที่แก้แล้วโดยไม่มีข้อติด รับเอกสาร แล้วรับคำขอได้', async () => {
        asOfficer();
        const check = await request(app).get(`/api/provider/applications/${fx.app}/document-check`);
        expect(check.status).toBe(200);
        expect(check.body.data.blockingIssues).toEqual([]);
        const required = check.body.data.slots.filter((s) => s.required && s.satisfied);
        expect(required.length).toBeGreaterThan(0);

        for (const slot of check.body.data.slots.filter((s) => s.required)) {
            const r = await request(app).post(`/api/provider/applications/${fx.app}/document-reviews`)
                .send({ slotId: slot.slotId, verdict: 'ACCEPTED' });
            expect(r.body).toMatchObject({ success: true });
        }
        const res = await request(app).post(`/api/provider/applications/${fx.app}/document-decision`).send({ action: 'ACCEPT_ALL' });
        expect(res.body).toMatchObject({ success: true, data: { status: 'DOC_APPROVED' } });
        expect(['DOC_APPROVED', 'PENDING_AUDIT_FEE']).toContain(await statusOf());
    });

    test('7. ตลอดทั้งวงไม่มีค่าบริการงวดแรกครั้งที่สอง', async () => {
        const m1Orders = await raw.checkoutOrder.count({ where: { applicationId: fx.app, milestone: 'M1' } });
        expect(m1Orders).toBe(moneyBefore.checkoutOrders);
        expect(await raw.invoice.count({ where: { applicationId: fx.app } })).toBe(moneyBefore.invoices);
    });

    test('8. ข้อที่ผู้ยื่นแก้เองไม่ได้: เจ้าหน้าที่เห็นว่าต้องให้ผู้ดูแลระบบจัดการ และส่งกลับไม่ได้', async () => {
        asOfficer();
        const check = await request(app).get(`/api/provider/applications/${fx.holderApp}/document-check`);
        expect(check.status).toBe(200);
        expect(check.body.data.blockingIssues).toEqual([
            expect.objectContaining({ code: 'APPLICANT_TYPE_NOT_THE_HOLDER', applicantCanFix: false }),
        ]);
        const res = await request(app).post(`/api/provider/applications/${fx.holderApp}/document-decision`).send({ action: 'REQUEST_MORE' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_CHECK_NEEDS_ADMIN');
        const row = await raw.application.findUnique({ where: { id: fx.holderApp }, select: { status: true } });
        expect(row.status).toBe('ASSIGNED_FOR_REVIEW');
    });

    test('9. คำขอที่ถูกส่งกลับโดยไม่เคยจ่ายงวดแรก ยื่นกลับเข้าขั้นตรวจไม่ได้ จนกว่าจะจ่าย', async () => {
        // สถานะที่ประตู batch เคยพาไปได้โดยไม่ผ่านการชำระ (รีวิวความปลอดภัย 2026-10-06 F1)
        const unpaid = await raw.application.create({
            data: {
                applicationNumber: `APP-RC-U-${sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.C, submitterId: fx.A.id,
                status: 'REVISION_REQUESTED', reviewerId: fx.officer,
                formData: { ...filedBeforeTheRuleChanged(), certificationPurposes: ['RESEARCH'], workflowState: 'REVISION_REQUESTED' },
            },
        });
        fx.appIds.push(unpaid.id);
        for (const slotId of [REQUIRED_SLOT, 'juristic_reg_6m', 'licence_pt09']) { await attach(slotId, unpaid.id); }
        const statusOfUnpaid = async () => (await raw.application.findUnique({ where: { id: unpaid.id }, select: { status: true } })).status;

        asApplicant();
        const refused = await request(app).post('/api/applications/submit').send({ applicationId: unpaid.id });
        expect(refused.status).toBe(409);
        expect(refused.body.code).toBe('MILESTONE_NOT_PAID');
        expect(await statusOfUnpaid()).toBe('REVISION_REQUESTED');

        await paidFirstMilestone(unpaid.id);
        const submitted = await request(app).post('/api/applications/submit').send({ applicationId: unpaid.id });
        expect(submitted.body).toMatchObject({ success: true });
        expect(await statusOfUnpaid()).toBe('ASSIGNED_FOR_REVIEW');
    });
});
