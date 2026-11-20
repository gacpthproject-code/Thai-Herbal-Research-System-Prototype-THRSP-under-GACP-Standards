/**
 * ส่งกลับแก้เอกสารสองรอบ — แต่ละรอบเป็นของตัวเอง (step 5, กติกา: 5 วันทำการต่อรอบ ไม่จำกัดรอบ
 * เลยกำหนด = ยกเลิกอัตโนมัติ ไม่เก็บค่าธรรมเนียมซ้ำ)
 *
 * เดิน router จริงผ่าน supertest บน Postgres จริง: ผู้ตรวจส่งกลับ → ผู้ยื่นส่งกลับมา → ผู้ตรวจส่งกลับอีก
 * แล้วดูว่ารอบสองมีเลขรอบ เหตุผล และกำหนดส่งของตัวเอง รอบแรกยังอยู่ในประวัติที่ผู้ตรวจและผู้อนุมัติเห็น
 * การยกเลิกอัตโนมัติผูกกับกำหนดของรอบปัจจุบัน และไม่มีใบแจ้งหนี้หรือคำสั่งชำระใหม่
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { filedFormData, filedHolderInput } = require('../../test-support/filed-application');
const { addWorkingDays, minusWorkingDays, isWorkingDay } = require('../../utils/working-days');
const { PAYMENT } = require('../../config/business-rules');
const { thaiIdCheckDigit } = require('@gacp/validation/thai-id-checksum');

d('ส่งกลับแก้เอกสารสองรอบ: แต่ละรอบมีเหตุผลและกำหนดส่งของตัวเอง (real Postgres)', () => {
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

    const R1 = 'รอบแรก: สำเนาอ่านไม่ออก กรุณาถ่ายใหม่ให้เห็นทั้งฉบับ';
    const R2 = 'รอบสอง: ฉบับใหม่ยังไม่มีลายมือชื่อผู้รับรอง กรุณาส่งฉบับที่ลงนามแล้ว';
    const WINDOW = PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS;
    let slotToAccept;
    let feeRowsBefore;
    let D1;
    let D2;

    const feeRows = async () => ({
        orders: await prisma.checkoutOrder.count({ where: { applicationId: ctx.appId } }),
        invoices: await prisma.invoice.count({ where: { applicationId: ctx.appId } }),
    });

    async function officerReturns(reason) {
        asOfficer();
        const check = await request(app).get(`/api/provider/applications/${ctx.appId}/document-check`);
        expect(check.status).toBe(200);
        slotToAccept = slotToAccept
            || check.body.data.slots.find((s) => s.slotId !== REQUIRED_SLOT && s.satisfied).slotId;
        const accept = await request(app).post(`/api/provider/applications/${ctx.appId}/document-reviews`)
            .send({ slotId: slotToAccept, verdict: 'ACCEPTED' });
        expect(accept.status).toBe(200);
        const more = await request(app).post(`/api/provider/applications/${ctx.appId}/document-reviews`)
            .send({ slotId: REQUIRED_SLOT, verdict: 'MORE_REQUESTED', reason });
        expect(more.status).toBe(200);
        const decide = await request(app).post(`/api/provider/applications/${ctx.appId}/document-decision`)
            .send({ action: 'REQUEST_MORE' });
        expect(decide.status).toBe(200);
        expect(decide.body.data.status).toBe('REVISION_REQUESTED');
        return { check: check.body.data, more: more.body.data, decide: decide.body.data };
    }

    async function applicantSees() {
        asFarmer();
        const res = await request(app).get(`/api/applications/${ctx.appId}/requirements?includeReviews=1`);
        expect(res.status).toBe(200);
        return res.body.data.requestedDocuments;
    }

    const roundRows = (round) => prisma.applicationDocumentReview.findMany({
        where: { applicationId: ctx.appId, round }, orderBy: { slotId: 'asc' },
    });

    test('1. รอบแรก: ผู้ตรวจส่งกลับ เป็นรอบที่ 1', async () => {
        feeRowsBefore = await feeRows();
        const r = await officerReturns(R1);
        expect(r.check.round).toBe(1);
        expect(r.more.round).toBe(1);
        expect(r.decide.round).toBe(1);

        // รอบแรกเกิดเมื่อสามวันทำการก่อน — กำหนดส่งของสองรอบจึงเป็นคนละวันจริง
        // (ถ้าสองรอบเกิดในวินาทีเดียวกัน กำหนดส่งจะตรงกันและเทสต์แยกไม่ออกว่ารอบสองได้วันของตัวเองหรือยืมของรอบแรก)
        const askedAt = new Date(minusWorkingDays(new Date(), 3).getTime() + 10 * 3600 * 1000);
        D1 = addWorkingDays(askedAt, WINDOW);
        const row = await prisma.application.findUnique({ where: { id: ctx.appId }, select: { formData: true } });
        await prisma.application.update({
            where: { id: ctx.appId },
            data: {
                formData: {
                    ...row.formData,
                    revisionRequestedAt: askedAt.toISOString(), revision_requested_at: askedAt.toISOString(),
                    revisionDueAt: D1.toISOString(), revision_due_at: D1.toISOString(),
                },
            },
        });
        await prisma.applicationDocumentReview.updateMany({
            where: { applicationId: ctx.appId, round: 1 },
            data: { createdAt: new Date(askedAt.getTime() - 60 * 1000) },
        });
        await prisma.applicationDocumentReview.updateMany({
            where: { applicationId: ctx.appId, round: 1, verdict: 'MORE_REQUESTED' },
            data: { dueDate: D1 },
        });
        await prisma.revisionDeadline.update({ where: { applicationId: ctx.appId }, data: { revisionDue: D1 } });
    });

    test('2. ผู้ยื่นเห็นคำขอของรอบแรก เหตุผลและกำหนดส่งของรอบแรก', async () => {
        const asked = await applicantSees();
        expect(asked.map((a) => [a.slotId, a.reason, new Date(a.dueDate).toISOString()]))
            .toEqual([[REQUIRED_SLOT, R1, D1.toISOString()]]);
    });

    test('3. ผู้ยื่นแนบฉบับใหม่แล้วส่งกลับ ได้ 200 และไม่มีค่าธรรมเนียมใหม่', async () => {
        await attachFile(REQUIRED_SLOT, 'round-1-answer.pdf');
        asFarmer();
        const res = await request(app).post(`/api/applications/${ctx.appId}/revision-resubmit`).send({});
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('ASSIGNED_FOR_REVIEW');
        expect(await feeRows()).toEqual(feeRowsBefore);
    });

    test('4. ผู้ตรวจเปิดหน้าตรวจ: เป็นรอบที่ 2 ช่องว่างทั้งหมด และเห็นคำขอของรอบแรกในประวัติ', async () => {
        asOfficer();
        const res = await request(app).get(`/api/provider/applications/${ctx.appId}/document-check`);
        expect(res.status).toBe(200);
        expect(res.body.data.round).toBe(2);
        expect(res.body.data.slots.every((s) => s.verdict === null)).toBe(true);
        expect(res.body.data.revisionHistory).toEqual([{
            round: 1,
            requests: [expect.objectContaining({
                slotId: REQUIRED_SLOT, reason: R1, dueDate: D1.toISOString(),
            })],
        }]);
        expect(res.body.data.revisionHistory[0].requests[0].labelTH).toMatch(/[ก-๙]/);
    });

    test('5. รอบสอง: ผู้ตรวจส่งกลับอีก แถวของรอบแรกไม่ถูกเขียนทับ รอบสองมีเหตุผลและกำหนดส่งของตัวเอง', async () => {
        const r = await officerReturns(R2);
        expect(r.check.round).toBe(2);
        expect(r.more.round).toBe(2);
        expect(r.decide.round).toBe(2);

        const first = await roundRows(1);
        expect(first.map((x) => [x.slotId, x.verdict, x.reason])).toEqual(
            [[slotToAccept, 'ACCEPTED', null], [REQUIRED_SLOT, 'MORE_REQUESTED', R1]]
                .sort((a, b) => a[0].localeCompare(b[0])),
        );
        expect(first.find((x) => x.slotId === REQUIRED_SLOT).dueDate.toISOString()).toBe(D1.toISOString());

        const row = await prisma.application.findUnique({ where: { id: ctx.appId }, select: { formData: true } });
        D2 = new Date(row.formData.revisionDueAt);
        // วันทำการกรุงเทพฯ นับจากวันที่ส่งกลับรอบสอง ไม่ใช่รอบแรก
        expect(D2.toISOString()).toBe(addWorkingDays(new Date(row.formData.revisionRequestedAt), WINDOW).toISOString());
        expect(isWorkingDay(D2, 'Asia/Bangkok')).toBe(true);
        expect(D2.getTime()).toBeGreaterThan(D1.getTime());

        const second = await roundRows(2);
        expect(second.find((x) => x.slotId === REQUIRED_SLOT)).toEqual(expect.objectContaining({
            verdict: 'MORE_REQUESTED', reason: R2,
        }));
        expect(second.find((x) => x.slotId === REQUIRED_SLOT).dueDate.toISOString()).toBe(D2.toISOString());
    });

    test('6. ผู้ยื่นเห็นเฉพาะคำขอของรอบสอง ด้วยเหตุผลและกำหนดส่งของรอบสอง', async () => {
        const asked = await applicantSees();
        expect(asked.map((a) => [a.slotId, a.reason, new Date(a.dueDate).toISOString()]))
            .toEqual([[REQUIRED_SLOT, R2, D2.toISOString()]]);
    });

    test('7. ส่งกลับสองรอบแล้วยังไม่มีใบแจ้งหนี้หรือคำสั่งชำระใหม่', async () => {
        expect(await feeRows()).toEqual(feeRowsBefore);
    });

    test('8. ผู้อนุมัติเห็นคำขอแก้เอกสารทั้งสองรอบในแฟ้มคำขอ', async () => {
        const { buildDecisionFile } = require('../../services/certification-decision-file-service');
        const application = await prisma.application.findUnique({
            where: { id: ctx.appId },
            include: {
                applicant: { select: { firstName: true, lastName: true } },
                auditor: { select: { firstName: true, lastName: true } },
                entity: true,
            },
        });
        const file = await buildDecisionFile({ prisma, application });
        expect(file.revisionHistory.map((r) => [r.round, r.requests.map((q) => [q.slotId, q.reason, q.dueDate])]))
            .toEqual([
                [1, [[REQUIRED_SLOT, R1, D1.toISOString()]]],
                [2, [[REQUIRED_SLOT, R2, D2.toISOString()]]],
            ]);
    });

    test('9. ยกเลิกอัตโนมัติอ่านกำหนดของรอบปัจจุบัน: เลยกำหนดรอบแรกแล้วยังไม่ยกเลิก เลยกำหนดรอบสองจึงยกเลิก', async () => {
        const clock = await prisma.revisionDeadline.findUnique({ where: { applicationId: ctx.appId } });
        expect(clock.revisionDue.toISOString()).toBe(D2.toISOString());
        expect(clock.status).toBe('PENDING');
        expect(clock.revisionCount).toBe(2);

        const { checkExpiredDeadlines } = require('../../jobs/revision-deadline-checker');
        const onlyDate = ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
            'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
            'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'];
        const status = async () => (await prisma.application.findUnique({ where: { id: ctx.appId }, select: { status: true } })).status;
        try {
            jest.useFakeTimers({ doNotFake: onlyDate, now: new Date(D1.getTime() + 3600 * 1000) });
            await checkExpiredDeadlines();
            expect(await status()).toBe('REVISION_REQUESTED');

            jest.setSystemTime(new Date(D2.getTime() + 3600 * 1000));
            await checkExpiredDeadlines();
            expect(await status()).toBe('EXPIRED');
        } finally {
            jest.useRealTimers();
        }
    });
});
