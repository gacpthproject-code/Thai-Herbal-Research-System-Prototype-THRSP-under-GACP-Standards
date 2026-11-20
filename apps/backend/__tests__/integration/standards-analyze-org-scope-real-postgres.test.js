'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const ORIGINAL_SCOPE = process.env.TENANT_READ_ORG_SCOPE;

d('ประตูวิเคราะห์มาตรฐาน: เจ้าหน้าที่อ่านข้ามองค์กรไม่ได้ และอ่านเฉพาะงานของตัวเอง (real auth, real Postgres)', () => {
    let prisma;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { orgs: {}, users: [], tokens: {}, apps: {}, entityB: null };
    const digits13 = (seed) => seed.replace(/\D/g, '').padEnd(13, '7').slice(0, 13);
    const THAI = /[฀-๿]/;

    async function org(label) {
        const row = await prisma.organization.create({
            data: { name: `so-${label}-${sfx}`, slug: `so-${label}-${sfx}`, code: `SO_${label}_${sfx}`.toUpperCase() },
        });
        fx.orgs[label] = row.id;
        return row.id;
    }

    async function staff(name, role, organizationId) {
        const id = crypto.randomUUID();
        await prisma.user.create({
            data: {
                id, canonicalId: `so-${name}-${sfx}`, email: `so-${name}-${sfx}@example.test`, password: 'x',
                firstName: 'ทดสอบ', lastName: name, role, organizationId, status: 'ACTIVE',
                accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: digits13(id),
            },
        });
        fx.users.push(id);
        fx.tokens[name] = require('../../config/jwt-security').generateToken(
            { id, userId: id, role, canonicalRole: role, authType: 'PROVIDER_ID', organizationId },
            'provider',
        );
        return id;
    }

    async function applicationOfB(label, filer, data) {
        const row = await prisma.application.create({
            data: {
                applicationNumber: `APP-SO-${label}-${sfx}`, healthId: filer.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgs.B, entityId: fx.entityB, submitterId: filer.id, ...data,
            },
        });
        fx.apps[label] = row.id;
        return row.id;
    }

    const analyzeAs = (name, applicationId) => request(app)
        .get(`/api/standards/WHO/analyze/${applicationId}`)
        .set('Authorization', `Bearer ${fx.tokens[name]}`);

    beforeAll(async () => {
        ({ prisma } = require('../../services/prisma-database'));
        await org('A');
        await org('B');
        await staff('reviewerA', 'document_reviewer', fx.orgs.A);
        const reviewerBId = await staff('reviewerB', 'document_reviewer', fx.orgs.B);
        await staff('reviewerB2', 'document_reviewer', fx.orgs.B);
        await staff('financePlatformB', 'finance_officer_platform', fx.orgs.B);
        await staff('financeDtamB', 'finance_officer_dtam', fx.orgs.B);
        await staff('dispatcherB', 'dispatcher', fx.orgs.B);
        const inspectorBId = await staff('inspectorB', 'field_inspector', fx.orgs.B);
        await staff('approverB', 'certificate_approver', fx.orgs.B);
        await staff('dtamAdminA', 'system_admin_dtam', fx.orgs.A);
        await staff('dtamAdminB', 'system_admin_dtam', fx.orgs.B);

        const filer = { id: crypto.randomUUID(), canonicalId: `so-filerB-${sfx}` };
        await prisma.user.create({
            data: {
                id: filer.id, canonicalId: filer.canonicalId, email: `${filer.canonicalId}@example.test`, password: 'x',
                firstName: 'ผู้ยื่น', lastName: 'องค์กร B', role: 'health', organizationId: fx.orgs.B, status: 'ACTIVE',
                authType: 'HEALTH_ID', healthId: digits13(filer.id),
            },
        });
        fx.users.push(filer.id);
        fx.tokens.filerB = require('../../config/jwt-security').generateToken(
            { id: filer.id, userId: filer.id, role: 'health', canonicalRole: 'health', authType: 'HEALTH_ID', organizationId: fx.orgs.B },
            'public',
        );
        const entity = await prisma.entity.create({
            data: { type: 'INDIVIDUAL', displayName: `ผู้ถือ B ${sfx}`, organizationId: fx.orgs.B },
        });
        fx.entityB = entity.id;
        await prisma.entityMembership.create({
            data: { userId: filer.id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgs.B },
        });

        const appB = await applicationOfB('B', filer, {
            status: 'SUBMITTED', reviewerId: reviewerBId, formData: { harvestData: { dryingMethod: 'RACK' } },
        });
        await prisma.applicationDocument.create({
            data: { applicationId: appB, documentType: 'WATER_TEST', fileName: 'WATER_TEST.pdf', fileUrl: `/uploads/so/${sfx}/WATER_TEST.pdf` },
        });
        await applicationOfB('B2', filer, { status: 'PENDING_DOC_FEE' });
        await applicationOfB('B-DOC-FEE-PAID', filer, { status: 'DOC_FEE_PAID' });
        await applicationOfB('B-CAR-ARMED', filer, { status: 'CAR_REVIEWING', formData: { reinspection: { status: 'REQUESTED' } } });
        await applicationOfB('B-CAR-UNARMED', filer, { status: 'CAR_REVIEWING', formData: {} });
        await applicationOfB('B-AUDIT-CONFIRMED', filer, { status: 'AUDIT_CONFIRMED', auditorId: inspectorBId });
        await applicationOfB('B-AUDIT-PASSED', filer, { status: 'AUDIT_PASSED' });

        app = express();
        app.use('/api/standards', require('../../routes/api/certificates/standards'));
    });

    afterAll(async () => {
        if (ORIGINAL_SCOPE === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = ORIGINAL_SCOPE; }
        if (!prisma) { return; }
        const appIds = Object.values(fx.apps);
        await prisma.applicationDocument.deleteMany({ where: { applicationId: { in: appIds } } });
        await prisma.application.deleteMany({ where: { id: { in: appIds } } });
        if (fx.entityB) {
            await prisma.entityMembership.deleteMany({ where: { entityId: fx.entityB } });
            await prisma.entity.deleteMany({ where: { id: fx.entityB } });
        }
        await prisma.user.deleteMany({ where: { id: { in: fx.users } } });
        await prisma.organization.deleteMany({ where: { id: { in: Object.values(fx.orgs) } } });
    });

    const expectRefusedWithoutData = (res) => {
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ success: false, error: 'APPLICATION_NOT_FOUND' });
        expect(res.body.message).toMatch(THAI);
        expect(res.body.data).toBeUndefined();
    };

    const expectAnalyzed = (res, label, status) => {
        expect(res.status).toBe(200);
        expect(res.body.data.application).toEqual({ id: fx.apps[label], applicationNumber: `APP-SO-${label}-${sfx}`, status });
    };

    describe.each([
        ['tenant read scope ค่าตั้งต้น (เปิด)', undefined],
        ['tenant read scope ปิด (kill-switch)', 'false'],
    ])('%s', (_label, scopeFlag) => {
        beforeAll(() => {
            if (scopeFlag === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = scopeFlag; }
        });

        test('เจ้าหน้าที่องค์กร A วิเคราะห์คำขอขององค์กร B ได้ 404 และไม่มีข้อมูลคำขอในคำตอบ', async () => {
            expectRefusedWithoutData(await analyzeAs('reviewerA', fx.apps.B));
        });

        test('ผู้ตรวจเอกสารที่ได้รับมอบหมายวิเคราะห์คำขอของตัวเองได้ 200 พร้อมผลรายหัวข้อ', async () => {
            const res = await analyzeAs('reviewerB', fx.apps.B);
            expectAnalyzed(res, 'B', 'SUBMITTED');
            expect(res.body.data.requirements.find((r) => r.id === 'WATER')).toMatchObject({
                status: 'NEEDS_REVIEW',
                evidence: expect.stringContaining('WATER_TEST'),
            });
        });

        test('ผู้ตรวจเอกสารองค์กรเดียวกันที่ไม่ได้รับมอบหมายได้ 404 และไม่มีข้อมูลคำขอในคำตอบ', async () => {
            expectRefusedWithoutData(await analyzeAs('reviewerB2', fx.apps.B));
        });

        test.each(['financePlatformB', 'financeDtamB'])(
            'ฝ่ายการเงิน (%s) ได้ 404 แม้คำขออยู่ในช่วงรอชำระที่การเงินอ่านบิลได้',
            async (name) => {
                expectRefusedWithoutData(await analyzeAs(name, fx.apps.B2));
            },
        );

        test('ผู้จัดคิวองค์กรเดียวกันได้ 404 เมื่อคำขออยู่นอกขาสถานะของตัวเอง (SUBMITTED)', async () => {
            expectRefusedWithoutData(await analyzeAs('dispatcherB', fx.apps.B));
        });

        test('ผู้จัดคิวองค์กรเดียวกันได้ 200 เมื่อคำขออยู่ในขาสถานะของตัวเอง (DOC_FEE_PAID)', async () => {
            expectAnalyzed(await analyzeAs('dispatcherB', fx.apps['B-DOC-FEE-PAID']), 'B-DOC-FEE-PAID', 'DOC_FEE_PAID');
        });

        test('ผู้จัดคิวได้ 404 บนคำขอ CAR_REVIEWING ที่ผู้ตรวจพื้นที่ยังไม่ขอตรวจซ้ำ', async () => {
            expectRefusedWithoutData(await analyzeAs('dispatcherB', fx.apps['B-CAR-UNARMED']));
        });

        test('ผู้จัดคิวได้ 200 บนคำขอ CAR_REVIEWING ที่ผู้ตรวจพื้นที่ขอตรวจซ้ำแล้ว', async () => {
            expectAnalyzed(await analyzeAs('dispatcherB', fx.apps['B-CAR-ARMED']), 'B-CAR-ARMED', 'CAR_REVIEWING');
        });

        test('ผู้ตรวจพื้นที่ที่ไม่ได้รับมอบหมายได้ 404 และไม่มีข้อมูลคำขอในคำตอบ', async () => {
            expectRefusedWithoutData(await analyzeAs('inspectorB', fx.apps.B));
        });

        test('ผู้ตรวจพื้นที่ที่ได้รับมอบหมายหลังชำระค่าตรวจได้ 200', async () => {
            expectAnalyzed(await analyzeAs('inspectorB', fx.apps['B-AUDIT-CONFIRMED']), 'B-AUDIT-CONFIRMED', 'AUDIT_CONFIRMED');
        });

        test('ผู้ดูแลระบบกรมขององค์กร A วิเคราะห์คำขอขององค์กร B ได้ 404 และไม่มีข้อมูลคำขอในคำตอบ', async () => {
            expectRefusedWithoutData(await analyzeAs('dtamAdminA', fx.apps.B));
        });

        test('ผู้ดูแลระบบกรมขององค์กรเดียวกันได้ 200 แม้ไม่ได้รับมอบหมาย', async () => {
            expectAnalyzed(await analyzeAs('dtamAdminB', fx.apps.B), 'B', 'SUBMITTED');
        });

        test('ผู้อนุมัติใบรับรองได้ 404 เมื่อคำขออยู่นอกขาสถานะของตัวเอง (SUBMITTED)', async () => {
            expectRefusedWithoutData(await analyzeAs('approverB', fx.apps.B));
        });

        test('ผู้อนุมัติใบรับรองได้ 200 เมื่อคำขอรอการตัดสิน (AUDIT_PASSED)', async () => {
            expectAnalyzed(await analyzeAs('approverB', fx.apps['B-AUDIT-PASSED']), 'B-AUDIT-PASSED', 'AUDIT_PASSED');
        });

        test('ผู้ยื่นที่เป็นสมาชิกผู้ถือของคำขอวิเคราะห์คำขอตัวเองได้ 200', async () => {
            expectAnalyzed(await analyzeAs('filerB', fx.apps.B), 'B', 'SUBMITTED');
        });
    });
});
