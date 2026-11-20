'use strict';

/**
 * ต้นแบบที่ 1 บน Postgres จริง ผ่านประตู HTTP จริงของ /api/standards
 *
 * - ตารางเทียบและ CSV เปิดได้เมื่อล็อกอินเป็นเจ้าหน้าที่ (401 ของผู้ไม่ล็อกอินพิสูจน์ด้วย middleware จริงใน
 *   unit/standards-comparison-requires-login.test.js)
 * - วิเคราะห์คำขอ: อ่านเอกสารที่แนบจริงในตาราง application_documents (ชื่อเก่าที่เปลี่ยนชื่อแล้วด้วย)
 *   และสถานะคำขอจริง แล้วตัดสินทีละหัวข้อ
 */

process.env.TENANT_READ_ORG_SCOPE = 'false';

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

d('ต้นแบบที่ 1: ตารางเทียบและวิเคราะห์คำขอ (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: [], apps: [], entities: [] };

    async function user(label, role, accountType) {
        const id = crypto.randomUUID();
        const canonicalId = `sa-${label}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, password: 'x', role,
                authType: accountType === 'PROVIDER' ? 'PROVIDER_ID' : 'EMAIL_LEGACY',
                ...(accountType === 'PROVIDER' ? { providerId: canonicalId } : { healthId: canonicalId }),
                email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: label,
                organizationId: fx.orgId, status: 'ACTIVE', accountType,
            },
        });
        fx.users.push(id);
        return { id, canonicalId, role, canonicalRole: role, organizationId: fx.orgId };
    }

    async function application(label, status, documentTypes, formData = {}) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-SA-${label}-${sfx}`, healthId: fx.filer.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entityId, submitterId: fx.filer.id, status, formData,
                reviewerId: fx.reviewer.id,
            },
        });
        fx.apps.push(row.id);
        for (const documentType of documentTypes) {
            await raw.applicationDocument.create({
                data: {
                    applicationId: row.id, documentType, fileName: `${documentType}.pdf`,
                    fileUrl: `/uploads/sa/${row.id.slice(0, 8)}/${documentType}.pdf`,
                },
            });
        }
        return row.id;
    }

    const as = (actor) => { mockActor.current = actor; };
    const analyze = (code, id) => request(app).get(`/api/standards/${code}/analyze/${id}`);
    const topic = (res, id) => res.body.data.requirements.find((r) => r.id === id);

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({
            data: { name: `sa-${sfx}`, slug: `sa-${sfx}`, code: `SA_${sfx}`.toUpperCase() },
        });
        fx.orgId = org.id;
        fx.filer = await user('filer', 'health', 'HEALTH');
        fx.stranger = await user('stranger', 'health', 'HEALTH');
        fx.reviewer = await user('reviewer', 'document_reviewer', 'PROVIDER');
        const entity = await raw.entity.create({ data: { type: 'INDIVIDUAL', displayName: 'ทดสอบ filer', organizationId: fx.orgId } });
        fx.entityId = entity.id;
        fx.entities.push(entity.id);
        await raw.entityMembership.create({
            data: { userId: fx.filer.id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId },
        });
        fx.submitted = await application('sub', 'SUBMITTED', ['WATER_TEST', 'LAND_DEED', 'SOP_PEST'], {
            harvestData: { dryingMethod: 'RACK' },
        });
        fx.audited = await application('aud', 'AUDIT_PASSED', []);

        app = express();
        app.use(express.json());
        app.use('/api/standards', require('../../routes/api/certificates/standards'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.applicationDocument.deleteMany({ where: { applicationId: { in: fx.apps } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: fx.apps } } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: { in: fx.entities } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: fx.entities } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.users } } }).catch(() => {});
        if (fx.orgId) { await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {}); }
        await raw.$disconnect();
    });

    test('เจ้าหน้าที่เปิดตารางเทียบได้ มีสามมาตรฐานและแหล่งอ้างอิง', async () => {
        as(fx.reviewer);
        const res = await request(app).get('/api/standards/comparison');
        expect(res.status).toBe(200);
        expect(res.body.data.standards.map((s) => s.code)).toEqual(['THAI_GACP', 'WHO', 'ASEAN']);
        expect(res.body.data.sources.map((s) => s.id)).toEqual(
            expect.arrayContaining(['WHO_GACP_2003', 'ACFS_3502_2561', 'DTAM_CANNABIS_GACP_2568', 'ASEAN_GAP_2006']),
        );
    });

    test('เจ้าหน้าที่ดาวน์โหลด CSV ได้และมีแถวเลขข้อของ WHO', async () => {
        as(fx.reviewer);
        const res = await request(app).get('/api/standards/comparison/export.csv');
        expect(res.status).toBe(200);
        expect(res.text).toContain('WHO GACP ข้อ 2.3.5');
    });

    test('เจ้าหน้าที่วิเคราะห์คำขอจากเอกสารที่แนบจริง', async () => {
        as(fx.reviewer);
        const res = await analyze('WHO', fx.submitted);
        expect(res.status).toBe(200);
        expect(topic(res, 'WATER')).toMatchObject({ status: 'NEEDS_REVIEW', evidence: expect.stringContaining('WATER_TEST') });
        expect(topic(res, 'WATER').evidence).toContain('โรคที่มีพาหะนำ');
        expect(topic(await analyze('THAI_GACP', fx.submitted), 'WATER')).toMatchObject({ status: 'MET', evidence: expect.stringContaining('WATER_TEST') });
        expect(topic(res, 'SOIL').status).toBe('NOT_MET');
        expect(topic(res, 'SITE')).toMatchObject({ status: 'NEEDS_REVIEW', evidence: expect.stringContaining('LAND_DEED') });
        expect(topic(res, 'RECORDS').status).toBe('NEEDS_REVIEW');
        expect(topic(res, 'POST_HARVEST').evidence).toContain('harvestData.dryingMethod');
    });

    test('คำขอที่ผ่านตรวจแปลงแล้ว หัวข้อที่ยืนยันที่แปลงผ่าน', async () => {
        as(fx.reviewer);
        const res = await analyze('ASEAN', fx.audited);
        expect(res.status).toBe(200);
        expect(topic(res, 'PERSONNEL')).toMatchObject({ status: 'NEEDS_REVIEW', evidence: expect.stringContaining('บันทึกการอบรม') });
        expect(topic(await analyze('THAI_GACP', fx.audited), 'PERSONNEL').status).toBe('MET');
        expect(topic(res, 'WILD_COLLECTION')).toBeUndefined();
        expect(res.body.data.application.status).toBe('AUDIT_PASSED');
    });

    test('ผู้ยื่นที่ไม่ใช่เจ้าของได้ 404 ส่วนเจ้าของอ่านได้', async () => {
        as(fx.stranger);
        expect((await analyze('WHO', fx.submitted)).status).toBe(404);
        as(fx.filer);
        expect((await analyze('WHO', fx.submitted)).status).toBe(200);
    });

    test('มาตรฐานที่ไม่อยู่ในตารางเทียบได้ 404', async () => {
        as(fx.reviewer);
        const res = await analyze('FDA', fx.submitted);
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('STANDARD_NOT_FOUND');
    });
});
