/**
 * วงจรตรวจเอกสารทั้งวง — เดินจริงตามลำดับที่คนทำงานจริงเดิน บนฐานข้อมูลจริง
 *
 * สัญญาสามใบก่อนหน้าปัก **ขอบเขต** ว่าใครเห็นอะไรได้แค่ไหน · ไฟล์นี้ปักคนละเรื่อง:
 * **ลำดับงานเดินครบวงจริงหรือไม่** — เจ้าหน้าที่รับบางใบ ขอเพิ่มบางใบ เกษตรกรเห็นเฉพาะใบที่ถูกขอ
 * แก้แล้วส่งกลับ เจ้าหน้าที่เห็นรอบที่สอง แล้วรับคำขอ
 *
 * ทำไมต้องเดินทั้งวง ไม่ใช่ทดสอบทีละประตู: ความผิดพลาดที่แพงที่สุดของเส้นทางนี้ไม่ได้อยู่
 * ในประตูใดประตูหนึ่ง แต่อยู่ **ระหว่าง** ประตู — เหมือนบั๊ก reviewerId ที่เจอเมื่อวาน
 * (ประตูเขียนสิ่งที่มันบอกว่าเขียน ตัวกรองอ่านสิ่งที่มันบอกว่าอ่าน แต่ประกอบกันแล้วงานหาย)
 *
 * เดินผ่าน "ชั้นเดียวกับที่เบราว์เซอร์เรียก": router จริง ผ่าน supertest บน Postgres จริง
 * ไม่ mock service ไม่ mock prisma
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { filedFormData, filedHolderInput } = require('../../test-support/filed-application');
const { addWorkingDays } = require('../../utils/working-days');
const { thaiIdCheckDigit } = require('@gacp/validation/thai-id-checksum');

d('วงจรตรวจเอกสาร: รับบาง ขอเพิ่มบาง แก้ แล้วรับ (real Postgres)', () => {
    let prisma;
    let app;
    const created = { orgs: [], users: [], entities: [], apps: [], rules: [] };
    const uid = () => crypto.randomUUID();
    const digits13 = (s) => s.replace(/\D/g, '').padEnd(13, '7').slice(0, 13);

    function juristicRegistrationNumber() {
        const randomDigits = (n) => Array.from({ length: n }, () => crypto.randomInt(10)).join('');
        const first12 = `0${randomDigits(2)}5${randomDigits(8)}`;
        return `${first12}${thaiIdCheckDigit(first12)}`;
    }

    let ctx = {};
    /** ใครเป็นผู้เรียกในคำขอถัดไป — ตั้งก่อนยิงทุกครั้ง */
    let actor = null;

    const nextWorkingDay = () => addWorkingDays(new Date(), 1);

    async function attachFile(slotId, fileName) {
        const { syncApplicationDocument } = require('../../services/application-document-sync');
        return syncApplicationDocument(prisma, {
            applicationId: ctx.appId, documentId: uid(), slotId,
            fileName, fileUrl: `/uploads/round-trip/${ctx.appId.slice(0, 8)}/${fileName}`,
            mimeType: 'application/pdf', uploadedBy: ctx.farmerId,
        });
    }

    beforeAll(async () => {
        ({ prisma } = require('../../services/prisma-database'));

        // ผู้เรียกถูกสวมโดยตรง — บททดสอบนี้ว่าด้วย *ลำดับงาน* ไม่ใช่การพิสูจน์ตัวตน
        // (ซึ่งมีสวีทของตัวเองอยู่แล้ว) · สิทธิ์ยังเป็นของจริง เพราะ requireCanonicalPermission
        // อ่าน canonicalRole ที่สวมเข้าไป
        jest.doMock('../../middleware/auth-middleware', () => {
            const inject = (req, _res, next) => { req.user = actor; next(); };
            return {
                authenticateProvider: inject, authenticateHealth: inject, authenticateAny: inject,
                requireRole: () => (_q, _s, n) => n(),
            };
        });
        jest.doMock('../../middleware/consent-manager', () => ({
            ...jest.requireActual('../../middleware/consent-manager'),
            requireConsent: (_req, _res, next) => next(),
        }));

        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/document-reviews'));
        app.use('/api/applications', require('../../routes/api/applications/revision-resubmit'));
        app.use('/api/applications', require('../../routes/api/applications/requirements'));
    });

    afterAll(async () => {
        // ลำดับการเก็บกวาดสะท้อนของจริง: ประตูตัดสินใจ *แจ้งเตือนเกษตรกรจริง* และ audit row
        // อ้างถึงผู้ใช้ ⇒ ลบ user ก่อนจะชน FK · การที่มันชนคือหลักฐานว่าวงจรเดินถึงปลายทาง
        for (const id of created.users) { await prisma.notification.deleteMany({ where: { userId: id } }); }
        for (const id of created.apps) {
            await prisma.applicationDocumentReview.deleteMany({ where: { applicationId: id } });
            await prisma.revisionDeadline.deleteMany({ where: { applicationId: id } }).catch(() => {});
            await prisma.applicationDocument.deleteMany({ where: { applicationId: id } });
        }
        for (const id of created.orgs) { await prisma.auditLog.deleteMany({ where: { organizationId: id } }).catch(() => {}); }
        // ประตูตัดสินใจบันทึกกิจกรรมงานลงสมุดมอบหมายด้วย — อีกร่องรอยหนึ่งที่บอกว่าวงจร
        // เดินถึงปลายทางจริง ไม่ใช่แค่เขียนสถานะ
        for (const id of created.apps) {
            await prisma.workActivity.deleteMany({ where: { applicationId: id } }).catch(() => {});
            await prisma.checkoutOrder.deleteMany({ where: { applicationId: id } }).catch(() => {});
            await prisma.invoice.deleteMany({ where: { applicationId: id } }).catch(() => {});
        }
        for (const id of created.apps) { await prisma.application.deleteMany({ where: { id } }); }
        for (const id of created.entities) { await prisma.entity.deleteMany({ where: { id } }); }
        for (const id of created.rules) { await prisma.requirementRule.deleteMany({ where: { id } }); }
        // สมุดมอบหมายผูกกับตัวคน — ลบก่อนลบผู้ใช้ · รายการนี้ยาวขึ้นเรื่อย ๆ ตามจำนวนสิ่งที่
        // วงจรนี้แตะจริง ซึ่งเป็นข้อมูลในตัวมันเอง: การตัดสินหนึ่งครั้งเขียนสถานะ แจ้งเตือน
        // บันทึกตรวจสอบ กิจกรรมงาน และสมุดมอบหมาย
        for (const id of created.users) {
            await prisma.assignmentLedgerEntry.deleteMany({ where: { assigneeUserId: id } }).catch(() => {});
            await prisma.assignmentLedgerEntry.deleteMany({ where: { assignedByUserId: id } }).catch(() => {});
        }
        for (const id of created.users) { await prisma.user.deleteMany({ where: { id } }); }
        for (const id of created.orgs) { await prisma.organization.deleteMany({ where: { id } }); }
    });

    beforeAll(async () => {
        // ให้ระบบเป็นคนตัดสินว่า canonicalId ควรเป็นอะไร แทนที่จะประดิษฐ์เอง —
        // ธง APP_FK_USE_TOKEN เปลี่ยนคำตอบ และคอลัมน์ applications.healthId เป็น FK ไปที่
        // users.canonicalId ⇒ fixture ที่เดาเองจะตรงแค่โหมดเดียว
        const { resolveCanonicalIdForWrite } = require('../../shared/fk-token');
        const { deriveDimensions, resolveApplicationRequirements } = require('../../services/application-requirements-service');
        const { createOrganisationHolder } = require('../../services/entity-service');

        const orgId = uid();
        await prisma.organization.create({
            data: { id: orgId, name: `org-${orgId.slice(0, 8)}`, slug: `org-${orgId.slice(0, 8)}`, code: `ORG_${orgId.slice(0, 8).toUpperCase()}` },
        });
        created.orgs.push(orgId);

        const officerId = uid();
        const officerNationalId = digits13(officerId);
        await prisma.user.create({
            data: {
                id: officerId,
                canonicalId: resolveCanonicalIdForWrite({ actualIdentifier: officerNationalId, isProvider: true, userId: officerId }),
                email: `off-${officerId.slice(0, 8)}@example.test`, password: 'x',
                firstName: 'เจ้าหน้าที่', lastName: 'ตรวจเอกสาร',
                role: 'document_reviewer', organizationId: orgId,
                authType: 'PROVIDER_ID', providerId: officerNationalId,
            },
        });
        created.users.push(officerId);

        const farmerId = uid();
        const farmerNationalId = digits13(farmerId);
        const farmerCanonicalId = resolveCanonicalIdForWrite({
            actualIdentifier: farmerNationalId, userId: farmerId,
        });
        await prisma.user.create({
            data: {
                id: farmerId, canonicalId: farmerCanonicalId,
                email: `farm-${farmerId.slice(0, 8)}@example.test`, password: 'x',
                firstName: 'เกษตรกร', lastName: 'ทดสอบ', role: 'health', organizationId: orgId,
                authType: 'HEALTH_ID', healthId: farmerNationalId,
            },
        });
        created.users.push(farmerId);

        const { entity } = await createOrganisationHolder({
            user: { id: farmerId, organizationId: orgId },
            type: 'JURISTIC',
            registrationNo: juristicRegistrationNumber(),
            holder: { ...filedHolderInput('JURISTIC'), legalName: `บริษัท ทดสอบวงจรตรวจเอกสาร ${farmerId.slice(0, 6)} จำกัด` },
        });
        created.entities.push(entity.id);

        const appId = uid();
        await prisma.application.create({
            data: {
                id: appId, applicationNumber: `APP-RT-${appId.slice(0, 8)}`,
                healthId: farmerCanonicalId, entityId: entity.id, status: 'ASSIGNED_FOR_REVIEW',
                serviceType: 'CERTIFICATION', areaType: 'OUTDOOR',
                organizationId: orgId, reviewerId: officerId,
                formData: { ...filedFormData(), serverRequirementSnapshot: undefined },
            },
        });
        created.apps.push(appId);
        // A filing in document review has paid its first milestone (the writer refuses DOC_APPROVED otherwise).
        await settleMilestones(prisma, { id: appId, healthId: farmerCanonicalId, organizationId: orgId }, ['M1']);

        // กฎที่ทำให้เอกสารใบหนึ่ง **บังคับ** จริง — ถ้าไม่มี ทุก slot จะเป็นตัวเลือก และ
        // ด่าน "รับคำขอไม่ได้ถ้ายังไม่ครบ" จะไม่มีอะไรให้ปิดกั้น · เทสที่เดินผ่านฐานที่ไม่มีกฎ
        // จะดูเหมือนผ่านทั้งที่ไม่เคยทดสอบเงื่อนไขที่สำคัญที่สุดของประตูนี้เลย
        const ruleId = uid();
        await prisma.requirementRule.create({
            data: {
                id: ruleId,
                // ค่าที่ **ระบบสรุปเอง** จากคำขอ ไม่ใช่รหัสที่ผมเดา — deriveDimensions คืน
                // 'cannabis' (slug) ไม่ใช่ 'CAN' (รหัส master) และกฎที่ไม่แมตช์ก็เท่ากับไม่มีกฎ
                plantCode: deriveDimensions({ id: 'probe', areaType: 'OUTDOOR', formData: { plantId: 'cannabis' } }).plantCode,
                slotId: REQUIRED_SLOT, isRequired: true,
                effectiveFrom: new Date('2020-01-01'), createdBy: officerId,
                reason: 'fixture: one genuinely required paper so the gate has something to hold',
            },
        });
        created.rules.push(ruleId);

        ctx = { orgId, officerId, farmerId, farmerCanonicalId, entityId: entity.id, appId };

        const filing = await prisma.application.findUnique({ where: { id: appId }, include: { entity: true } });
        const lens = await resolveApplicationRequirements(filing, []);
        const optional = lens.slots.find((s) => !s.required);
        const firstRound = lens.slots.filter((s) => s.required).map((s) => s.slotId).concat(optional ? [optional.slotId] : []);
        for (const slotId of firstRound) { await attachFile(slotId, `${slotId}-first.pdf`); }
    });

    const asOfficer = () => { actor = { id: ctx.officerId, role: 'document_reviewer', canonicalRole: 'document_reviewer', organizationId: ctx.orgId }; };
    const asFarmer = () => { actor = { id: ctx.farmerId, role: 'health', canonicalRole: 'health', organizationId: ctx.orgId }; };

    /** เอกสารที่กฎบังคับไว้จริง — ตัวที่ทำให้ด่าน "ยังไม่ครบ" มีความหมาย */
    const REQUIRED_SLOT = 'sop_manual';
    let slotToAccept;
    let slotToQuery;

    test('1. เจ้าหน้าที่เปิดหน้าตรวจ และเห็นรายการเอกสารของคำขอนี้', async () => {
        asOfficer();
        const res = await request(app).get(`/api/provider/applications/${ctx.appId}/document-check`);
        expect(res.status).toBe(200);
        const slots = (res.body.data && res.body.data.slots) || res.body.data?.requirements?.slots || [];
        expect(slots.length).toBeGreaterThanOrEqual(2);
        // ใบที่ถูกขอเพิ่ม = ใบที่กฎบังคับ ⇒ ตอนรอบสองมันจะเป็นตัวที่กั้นการรับคำขอจริง
        const required = slots.filter((s) => s.required);
        expect(required.map((s) => s.slotId)).toContain(REQUIRED_SLOT);
        expect(slots.find((s) => s.slotId === REQUIRED_SLOT).satisfied).toBe(true);
        slotToQuery = REQUIRED_SLOT;
        slotToAccept = slots.find((s) => s.slotId !== REQUIRED_SLOT && s.satisfied).slotId;
    });

    test('2. ขอเอกสารเพิ่มโดยไม่บอกเหตุผล = ถูกปฏิเสธ — ผู้ยื่นต้องรู้ว่าต้องแก้อะไร', async () => {
        asOfficer();
        const res = await request(app)
            .post(`/api/provider/applications/${ctx.appId}/document-reviews`)
            .send({ slotId: slotToQuery, verdict: 'MORE_REQUESTED', dueDate: nextWorkingDay().toISOString() });
        // **ไม่ใช่ `>= 400`** — 500 ก็ผ่านเกณฑ์นั้น และ 500 ไม่ใช่ "ระบบปฏิเสธอย่างสุภาพ"
        // แต่คือระบบพัง · เกณฑ์ที่หลวมแบบนั้นทำให้ mutation ที่ปิดกฎนี้ทิ้ง "ผ่าน" ได้
        // (พิสูจน์แล้ว: ปิดกฎ → ประตูตอบ 500 → เทศเดิมยังเขียว) · ต้องระบุคำปฏิเสธที่ตั้งใจ
        expect([400, 422]).toContain(res.status);
        expect(res.body.code).toBe('REVIEW_REASON_REQUIRED');
        expect(String(res.body.messageTh || res.body.message || '')).toMatch(/[ก-๙]/);
    });

    test('3. รับใบหนึ่ง และขอเพิ่มอีกใบพร้อมเหตุผลและวันครบกำหนดที่เป็นวันทำการ', async () => {
        asOfficer();
        const accept = await request(app)
            .post(`/api/provider/applications/${ctx.appId}/document-reviews`)
            .send({ slotId: slotToAccept, verdict: 'ACCEPTED' });
        expect(accept.status).toBe(200);
        expect(accept.body.data.review.verdict).toBe('ACCEPTED');

        const more = await request(app)
            .post(`/api/provider/applications/${ctx.appId}/document-reviews`)
            .send({
                slotId: slotToQuery, verdict: 'MORE_REQUESTED',
                reason: 'เอกสารที่แนบมาอ่านไม่ออก กรุณาถ่ายใหม่ให้เห็นทั้งฉบับ',
                dueDate: nextWorkingDay().toISOString(),
            });
        expect(more.status).toBe(200);
        expect(more.body.data.review.verdict).toBe('MORE_REQUESTED');
    });

    test('4. เกษตรกรเห็น **เฉพาะ** ใบที่ถูกขอ ไม่ใช่บันทึกภายในของใบที่รับไปแล้ว', async () => {
        asFarmer();
        const res = await request(app).get(`/api/applications/${ctx.appId}/requirements?includeReviews=1`);
        expect(res.status).toBe(200);
        const asked = res.body.data?.requestedDocuments || res.body.requestedDocuments || [];
        expect(asked.map((r) => r.slotId)).toEqual([slotToQuery]);
        // เหตุผลต้องถึงมือเขา ไม่งั้นคำขอแก้ไขก็ไร้ความหมาย
        expect(String(asked[0].reason || '')).toMatch(/[ก-๙]/);
        expect(asked[0].dueDate).toBeNull();
        // และต้องไม่มีร่องรอยของผู้ตรวจติดมากับใบที่เขา "รับ" ไปแล้ว
        expect(JSON.stringify(res.body)).not.toContain(ctx.officerId);
    });

    test('5. ส่งกลับโดยยังไม่แก้อะไร = ถูกปฏิเสธ และบอกชื่อใบที่ยังค้าง', async () => {
        // ประตูตัดสินใจต้องพาไป REVISION_REQUESTED ก่อน
        asOfficer();
        const decide = await request(app)
            .post(`/api/provider/applications/${ctx.appId}/document-decision`)
            .send({ action: 'REQUEST_MORE' });
        expect(decide.status).toBe(200);
        expect(decide.body.data.status).toBe('REVISION_REQUESTED');
        const open = await prisma.application.findUnique({ where: { id: ctx.appId }, select: { formData: true } });
        expect(String(open.formData._lastReviewComment || '')).toMatch(/[ก-๙]/);

        asFarmer();
        const shown = await request(app).get(`/api/applications/${ctx.appId}/requirements?includeReviews=1`);
        const enforced = await prisma.revisionDeadline.findUnique({ where: { applicationId: ctx.appId } });
        expect(shown.body.data.requestedDocuments.map((r) => new Date(r.dueDate).toISOString()))
            .toEqual([new Date(open.formData.revisionDueAt).toISOString()]);
        expect(new Date(enforced.revisionDue).toISOString()).toBe(new Date(open.formData.revisionDueAt).toISOString());
        const asked = await prisma.applicationDocumentReview.findMany({ where: { applicationId: ctx.appId, verdict: 'MORE_REQUESTED' } });
        expect(asked.map((r) => r.dueDate.toISOString())).toEqual([new Date(open.formData.revisionDueAt).toISOString()]);

        asFarmer();
        const res = await request(app).post(`/api/applications/${ctx.appId}/revision-resubmit`).send({});
        // เช่นเดียวกัน: คำปฏิเสธที่ตั้งใจ ไม่ใช่ "อะไรก็ได้ที่ไม่ใช่ 2xx"
        expect([400, 409, 422]).toContain(res.status);
        expect(res.body.code).toBe('REVISION_INCOMPLETE');
        expect(JSON.stringify(res.body)).toContain(slotToQuery);
        const clock = await prisma.revisionDeadline.findUnique({ where: { applicationId: ctx.appId } });
        expect(clock.status).toBe('PENDING');
    });

    test('6. แนบไฟล์ใหม่แล้วส่งกลับ = ผ่าน และคำขอกลับเข้าคิวตรวจ', async () => {
        // ไฟล์ที่ "ใหม่กว่าคำขอของเจ้าหน้าที่" คือเงื่อนไขจริงของประตูนี้ — ประตูเทียบเวลา
        // ไม่ได้เทียบว่ามีไฟล์อยู่ไหม เพราะไฟล์เดิมที่อ่านไม่ออกก็ยังอยู่ตรงนั้น
        await attachFile(slotToQuery, 'fixed.pdf');

        asFarmer();
        const res = await request(app).post(`/api/applications/${ctx.appId}/revision-resubmit`).send({});
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('ASSIGNED_FOR_REVIEW');

        const after = await prisma.application.findUnique({
            where: { id: ctx.appId }, select: { status: true },
        });
        expect(after.status).toBe('ASSIGNED_FOR_REVIEW');
    });

    test('6.1 ส่งกลับแล้ว นาฬิกาแก้ไขของรอบนี้หยุด: revision_deadlines เป็น SUBMITTED เหมือนประตูทั่วไป (คำสั่ง 28)', async () => {
        const deadline = await prisma.revisionDeadline.findUnique({ where: { applicationId: ctx.appId } });
        expect(deadline.status).toBe('SUBMITTED');
    });

    test('6.2 ส่งกลับแล้ว บันทึกที่ตอบไปแล้วหายจากหน้าแก้ไข: formData._lastReviewComment ว่าง เหมือน /submit', async () => {
        const row = await prisma.application.findUnique({ where: { id: ctx.appId }, select: { formData: true } });
        expect(row.formData._lastReviewComment).toBeNull();
        expect(row.formData.plantId).toBe('cannabis');
    });

    test('6.5 รับคำขอทั้งที่ยังมีเอกสารจำเป็นค้าง = ถูกปฏิเสธ พร้อมชี้ว่าใบไหนค้าง', async () => {
        // รอบใหม่เริ่มจากศูนย์ ⇒ ตอนนี้ยังไม่มีใบไหนถูกรับในรอบนี้เลย · ถ้าประตูยอมให้ผ่าน
        // คำขอจะได้รับการอนุมัติโดยที่ไม่มีใครดูเอกสารในรอบนี้แม้แต่ใบเดียว
        asOfficer();
        const res = await request(app)
            .post(`/api/provider/applications/${ctx.appId}/document-decision`)
            .send({ action: 'ACCEPT_ALL' });

        expect([400, 409, 422]).toContain(res.status);
        expect(res.body.code).toBe('DOCUMENT_CHECK_INCOMPLETE');
        // ต้องบอกว่าใบไหน ไม่ใช่ให้เจ้าหน้าที่ไล่อ่านเองทั้งหน้า
        expect(Array.isArray(res.body.slotIds) || Array.isArray(res.body.meta?.slotIds)).toBe(true);
    });

    test('7. เจ้าหน้าที่เห็นรอบที่สอง และรับคำขอได้เมื่อรับครบทุกใบที่จำเป็น', async () => {
        asOfficer();
        const check = await request(app).get(`/api/provider/applications/${ctx.appId}/document-check`);
        expect(check.status).toBe(200);

        const slots = (check.body.data && check.body.data.slots) || [];
        const required = slots.filter((s) => s.required);
        // รอบใหม่เริ่มจากศูนย์ — คำตัดสินของรอบก่อนไม่ตามมา นั่นคือความหมายของ "รอบ"
        expect(required.every((s) => s.verdict === null)).toBe(true);
        for (const slot of required) {
            const accept = await request(app)
                .post(`/api/provider/applications/${ctx.appId}/document-reviews`)
                .send({ slotId: slot.slotId, verdict: 'ACCEPTED' });
            expect(accept.status).toBe(200);
            expect(accept.body.data.round).toBe(2);
        }

        const firstAsk = await prisma.applicationDocumentReview.findUnique({
            where: { applicationId_slotId_round: { applicationId: ctx.appId, slotId: slotToQuery, round: 1 } },
        });
        expect(firstAsk.verdict).toBe('MORE_REQUESTED');
        expect(String(firstAsk.reason || '')).toMatch(/[ก-๙]/);

        const decide = await request(app)
            .post(`/api/provider/applications/${ctx.appId}/document-decision`)
            .send({ action: 'ACCEPT_ALL' });
        expect(decide.status).toBe(200);

        const after = await prisma.application.findUnique({
            where: { id: ctx.appId }, select: { status: true },
        });
        // DOC_APPROVED แล้วโซ่อัตโนมัติพาไปขอค่าตรวจงวดสอง (workflow-side-effects)
        expect(['DOC_APPROVED', 'PENDING_AUDIT_FEE']).toContain(after.status);
    });
});
