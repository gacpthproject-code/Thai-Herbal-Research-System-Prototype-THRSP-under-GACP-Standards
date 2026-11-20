'use strict';

/**
 * The holder record and the login identity behind it (orders 134 task 2 and 142).
 *
 *   - partnership is a holder type of its own, created through POST /api/entities;
 *   - the holder page writes the record once (PUT /api/entities/:id/holder) and every
 *     reader gets it back from GET /api/entities/:id;
 *   - an individual holder typed in after a password registration is SELF_DECLARED, and
 *     staff read "not verified" on the application; a later ThaiD login with the same ID
 *     upgrades it, fills the name from the ID card and locks it;
 *   - a ThaiD login with a different ID changes nothing.
 *
 * Real Postgres.
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

const CITIZEN_ID = '1101700207030';
const OTHER_CITIZEN_ID = '3609900123459';
const SIGNATORY_ID = '3100600123450';
const PARTNERSHIP_ID = '0103555123458';
const COMPANY_ID = '0105555123450';
const LEGACY_COMPANY_WITH_PARTNERSHIP_NO = '0102555123457';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

d('the holder record and the identity behind it (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [] };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgId = (await raw.organization.create({ data: { name: `hr-${sfx}`, slug: `hr-${sfx}`, code: `HR_${sfx}`.toUpperCase() } })).id;

        fx.farmerId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.farmerId, canonicalId: `hr-farmer-${sfx}`, healthId: CITIZEN_ID, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `hr-farmer-${sfx}@example.test`, firstName: 'พิมพ์เอง', lastName: 'ตอนสมัคร', organizationId: fx.orgId,
            },
        });
        fx.userIds.push(fx.farmerId);
        const entityService = require('../../services/entity-service');
        const personal = await entityService.ensurePersonalIndividualEntity({
            user: { id: fx.farmerId, healthId: CITIZEN_ID, organizationId: fx.orgId, firstName: 'พิมพ์เอง', lastName: 'ตอนสมัคร' },
        });
        fx.personalId = personal.entity.id;
        fx.entityIds.push(fx.personalId);

        fx.reviewerId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.reviewerId, canonicalId: `hr-rev-${sfx}`, providerId: `hr-rev-${sfx}`, password: 'x', role: 'document_reviewer',
                accountType: 'PROVIDER', authType: 'PROVIDER_ID', email: `hr-rev-${sfx}@example.test`, firstName: 'ผู้ตรวจ', lastName: 'เอกสาร',
                organizationId: fx.orgId,
            },
        });
        fx.userIds.push(fx.reviewerId);

        fx.appId = (await raw.application.create({
            data: {
                applicationNumber: `APP-HR-${sfx}`, healthId: `hr-farmer-${sfx}`, areaType: 'OUTDOOR', organizationId: fx.orgId,
                entityId: fx.personalId, submitterId: fx.farmerId, reviewerId: fx.reviewerId, status: 'ASSIGNED_FOR_REVIEW',
                formData: { applicantType: 'INDIVIDUAL', farmData: { siteName: 'แปลง', siteAddress: '1', areaSqm: '1600' } },
            },
        })).id;
        fx.appIds.push(fx.appId);

        app = express();
        app.use(express.json());
        app.use('/api/entities', require('../../routes/api/entities'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.application.deleteMany({ where: { id: { in: fx.appIds } } }).catch(() => {});
        await raw.entityMembershipEvent.deleteMany({ where: { entityId: { in: fx.entityIds } } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: { in: fx.entityIds } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: fx.entityIds } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    const asFarmer = () => {
        mockActor.current = {
            id: fx.farmerId, canonicalId: `hr-farmer-${sfx}`, healthId: CITIZEN_ID, role: 'health', canonicalRole: 'health', organizationId: fx.orgId,
        };
    };
    const asReviewer = () => {
        mockActor.current = {
            id: fx.reviewerId, canonicalId: `hr-rev-${sfx}`, role: 'document_reviewer', canonicalRole: 'document_reviewer', organizationId: fx.orgId,
        };
    };

    test('a partnership is created as its own holder type, with its signatory named in two fields', async () => {
        asFarmer();
        const res = await request(app).post('/api/entities').send({
            type: 'PARTNERSHIP',
            registrationNo: PARTNERSHIP_ID,
            holder: {
                legalName: 'ห้างหุ้นส่วนจำกัด สองพี่น้อง',
                signatory: { title: 'นาง', firstName: 'มาลี', lastName: 'ศรีสุข', idCard: SIGNATORY_ID, nationality: 'ไทย' },
                contact: { address: '1 หมู่ 2 ต.ริมใต้', phone: '0812345678', email: '' },
            },
        });
        expect(res.status).toBe(200);
        fx.entityIds.push(res.body.data.id);
        const row = await raw.entity.findUnique({ where: { id: res.body.data.id } });
        expect(row.type).toBe('PARTNERSHIP');
        expect(row.displayName).toBe('ห้างหุ้นส่วนจำกัด สองพี่น้อง');
        expect(row.identitySource).toBe('SELF_DECLARED');

        const read = await request(app).get(`/api/entities/${res.body.data.id}`);
        expect(read.body.data.holder).toMatchObject({
            type: 'PARTNERSHIP',
            legalName: 'ห้างหุ้นส่วนจำกัด สองพี่น้อง',
            signatory: { title: 'นาง', firstName: 'มาลี', lastName: 'ศรีสุข', nationality: 'ไทย' },
            missing: [],
        });
        expect(read.body.data.holder.signatory.idCard).not.toBe(SIGNATORY_ID);
    });

    test('a company number typed as a partnership is refused by the DBD kind digit, naming the type to pick (order 145)', async () => {
        asFarmer();
        const res = await request(app).post('/api/entities').send({
            type: 'PARTNERSHIP', registrationNo: COMPANY_ID,
            holder: { legalName: 'ห้างหุ้นส่วนจำกัด ผิดเลข', signatory: {}, contact: {} },
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('HOLDER_VALIDATION_FAILED');
        expect(res.body.validationErrors).toEqual([
            { path: 'registrationNo', message: expect.stringContaining('บริษัทจำกัด') },
        ]);
        expect(await raw.entity.count({ where: { juristicId: COMPANY_ID } })).toBe(0);
    });

    test('a legacy company row whose number the owner now picks as a partnership is refused naming the registered type, not handed back (review F5)', async () => {
        // Created by the old door, which took any 0-leading number for a company.
        const legacy = await raw.entity.create({
            data: {
                type: 'JURISTIC', displayName: `บริษัท เลขห้าง ${sfx} จำกัด`, organizationId: fx.orgId,
                juristicId: LEGACY_COMPANY_WITH_PARTNERSHIP_NO, juristicIdHash: sha256(LEGACY_COMPANY_WITH_PARTNERSHIP_NO),
            },
        });
        fx.entityIds.push(legacy.id);
        await raw.entityMembership.create({ data: { userId: fx.farmerId, entityId: legacy.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId } });

        asFarmer();
        const res = await request(app).post('/api/entities').send({
            type: 'PARTNERSHIP', registrationNo: LEGACY_COMPANY_WITH_PARTNERSHIP_NO,
            holder: {
                legalName: 'ห้างหุ้นส่วนจำกัด เลขเดียวกัน',
                signatory: { title: 'นาง', firstName: 'มาลี', lastName: 'ศรีสุข', idCard: '', nationality: 'ไทย' },
                contact: { address: '1 หมู่ 2 ต.ริมใต้', phone: '0812345678', email: '' },
            },
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('HOLDER_VALIDATION_FAILED');
        expect(res.body.validationErrors).toEqual([
            { path: 'registrationNo', message: expect.stringContaining('ลงทะเบียนไว้แล้วเป็นบริษัท') },
        ]);
        expect(await raw.entity.count({ where: { juristicId: LEGACY_COMPANY_WITH_PARTNERSHIP_NO } })).toBe(1);
    });

    test('a password registration\'s holder is self-declared: the owner writes it, staff read it as not verified', async () => {
        asFarmer();
        const put = await request(app).put(`/api/entities/${fx.personalId}/holder`).send({
            person: { title: 'นาย', firstName: 'พิมพ์เอง', lastName: 'ตอนสมัคร', nationality: 'ไทย' },
            contact: { address: 'บ้านเลขที่ที่พิมพ์เอง', phone: '0899999999', email: '' },
        });
        expect(put.status).toBe(200);
        expect(put.body.data.holder).toMatchObject({ identitySource: 'SELF_DECLARED', verified: false, missing: [] });

        asReviewer();
        const detail = await request(app).get(`/api/provider/applications/${fx.appId}`);
        expect(detail.status).toBe(200);
        expect(detail.body.data.holder).toMatchObject({ type: 'INDIVIDUAL', identitySource: 'SELF_DECLARED', verified: false });
    });

    test('a ThaiD login with another person\'s ID changes nothing', async () => {
        const { upgradeHolderFromVerifiedLogin } = require('../../services/holder-identity-service');
        const out = await upgradeHolderFromVerifiedLogin({
            userId: fx.farmerId,
            source: 'THAID',
            claims: { pid: OTHER_CITIZEN_ID, title: 'นาง', given_name: 'คนอื่น', family_name: 'ไม่ใช่เจ้าของ' },
        });
        expect(out.upgraded).toBe(false);
        const row = await raw.entity.findUnique({ where: { id: fx.personalId } });
        expect(row.identitySource).toBe('SELF_DECLARED');
        expect(row.displayName).toBe('พิมพ์เอง ตอนสมัคร');
    });

    test('a ThaiD login with the same ID upgrades the holder, fills it from the ID card and locks it', async () => {
        const { upgradeHolderFromVerifiedLogin } = require('../../services/holder-identity-service');
        const out = await upgradeHolderFromVerifiedLogin({
            userId: fx.farmerId,
            source: 'THAID',
            claims: {
                pid: CITIZEN_ID, title: 'นาย', given_name: 'สมชาย', family_name: 'ตามบัตร',
                address: { formatted: '12 หมู่ 3 ต.แม่ริม อ.แม่ริม จ.เชียงใหม่' },
            },
        });
        expect(out.upgraded).toBe(true);

        const row = await raw.entity.findUnique({ where: { id: fx.personalId } });
        expect(row.identitySource).toBe('THAID');
        expect(row.identityVerifiedAt).not.toBeNull();
        expect(row.displayName).toBe('สมชาย ตามบัตร');

        asReviewer();
        const detail = await request(app).get(`/api/provider/applications/${fx.appId}`);
        expect(detail.body.data.holder).toMatchObject({ identitySource: 'THAID', verified: true });

        asFarmer();
        const locked = await request(app).put(`/api/entities/${fx.personalId}/holder`).send({
            person: { title: 'นาย', firstName: 'แก้เอง', lastName: 'ตามบัตร', nationality: 'ไทย' },
            contact: { address: '12 หมู่ 3 ต.แม่ริม อ.แม่ริม จ.เชียงใหม่', phone: '0811111111', email: '' },
        });
        expect(locked.status).toBe(409);
        expect(locked.body.code).toBe('HOLDER_FIELD_LOCKED');

        const phoneOnly = await request(app).put(`/api/entities/${fx.personalId}/holder`).send({
            person: { title: 'นาย', firstName: 'สมชาย', lastName: 'ตามบัตร', nationality: 'ไทย' },
            contact: { address: '12 หมู่ 3 ต.แม่ริม อ.แม่ริม จ.เชียงใหม่', phone: '0811111111', email: '' },
        });
        expect(phoneOnly.status).toBe(200);
        expect(phoneOnly.body.data.holder.contact.phone).toBe('0811111111');
    });
});
