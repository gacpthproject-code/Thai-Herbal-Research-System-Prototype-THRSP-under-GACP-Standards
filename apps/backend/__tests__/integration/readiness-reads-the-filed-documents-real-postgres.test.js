'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d, getTestDatabase } = require('../../test-support/test-database');
const { filedHolderData } = require('../../test-support/filed-application');

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

d('the readiness door reads the filed documents and the registered farm (real Postgres)', () => {
    const sfx = crypto.randomUUID().slice(0, 8);
    let raw;
    let app;
    let orgId;
    const users = {};
    const entities = {};
    const drafts = {};

    const itemsById = (body) => Object.fromEntries(body.data.items.map((item) => [item.id, item]));
    const readinessOf = async (user) => {
        mockActor.current = { id: user.id, userId: user.id, canonicalId: user.canonicalId, canonicalRole: 'health', role: 'health', organizationId: orgId };
        const res = await request(app).get('/api/applications/readiness');
        expect(res.status).toBe(200);
        return res.body;
    };

    const mkUser = async (key) => {
        const id = crypto.randomUUID();
        const canonicalId = `rd-${key}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `rd-${key}-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: key, organizationId: orgId, status: 'ACTIVE',
            },
        });
        const entity = await raw.entity.create({
            data: { type: 'INDIVIDUAL', displayName: `ทดสอบ ${key} ${sfx}`, organizationId: orgId, createdBy: id, ...filedHolderData('INDIVIDUAL') },
        });
        await raw.entityMembership.create({ data: { userId: id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: orgId } });
        const draft = await raw.application.create({
            data: {
                applicationNumber: `APP-RD-${key}-${sfx}`, healthId: canonicalId, areaType: 'OUTDOOR', organizationId: orgId,
                entityId: entity.id, submitterId: id, status: 'DRAFT', formData: { plantId: 'turmeric', workflowState: 'DRAFT' },
            },
        });
        users[key] = { id, canonicalId };
        entities[key] = entity.id;
        drafts[key] = draft.id;
    };

    const upload = (key, slotId, { live = true } = {}) => raw.applicationDocument.create({
        data: {
            applicationId: drafts[key], slotId, documentType: slotId.toUpperCase(), fileName: `${slotId}.pdf`,
            fileUrl: `/uploads/rd-${sfx}/${slotId}.pdf`,
            currentForSlot: live ? slotId.toUpperCase() : null, supersededAt: live ? null : new Date(),
        },
    });

    beforeAll(async () => {
        raw = new PrismaClient({ datasources: { db: { url: getTestDatabase().url } } });
        orgId = (await raw.organization.create({ data: { name: `rd-${sfx}`, slug: `rd-${sfx}`, code: `RD_${sfx}`.toUpperCase() } })).id;
        await mkUser('filer');
        await mkUser('empty');

        for (const slotId of ['sop_cultivation', 'id_card', 'house_reg', 'water_test']) { await upload('filer', slotId); }
        await upload('filer', 'soil_test', { live: false });
        await raw.farm.create({
            data: {
                ownerId: users.filer.id, entityId: entities.filer, organizationId: orgId, farmName: `แปลงทดสอบ ${sfx}`,
                farmType: 'CULTIVATION', address: '1 หมู่ 1', province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่',
                postalCode: '10540', totalArea: 5, cultivationArea: 3, cultivationMethod: 'OUTDOOR', status: 'ACTIVE',
            },
        });

        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const userIds = Object.values(users).map((u) => u.id);
        await raw.applicationDocument.deleteMany({ where: { applicationId: { in: Object.values(drafts) } } });
        await raw.application.deleteMany({ where: { id: { in: Object.values(drafts) } } });
        await raw.farm.deleteMany({ where: { ownerId: { in: userIds } } });
        await raw.sOPDocument.deleteMany({ where: { userId: { in: userIds } } });
        await raw.entityMembership.deleteMany({ where: { userId: { in: userIds } } });
        await raw.entity.deleteMany({ where: { id: { in: Object.values(entities) } } });
        await raw.user.deleteMany({ where: { id: { in: userIds } } });
        await raw.organization.delete({ where: { id: orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    test('live uploads in the SOP, identity and water slots plus a registered farm make every counted item ready', async () => {
        const body = await readinessOf(users.filer);
        const items = itemsById(body);
        expect(items.profile.ready).toBe(true);
        expect(items.farm.ready).toBe(true);
        expect(items.sop.ready).toBe(true);
        expect(items.documents.ready).toBe(true);
        expect(items.water_test).toMatchObject({ ready: true, optional: true });
        expect(body.data).toMatchObject({ ready: true, readyCount: body.data.totalCount });
    });

    test('a superseded upload no longer fills its slot', async () => {
        const items = itemsById(await readinessOf(users.filer));
        expect(items.soil_test).toMatchObject({ ready: false, optional: true });
    });

    test('an SOP written in the SOP builder counts the same as an SOP uploaded into the draft', async () => {
        await raw.sOPDocument.create({ data: { userId: users.empty.id, sopType: 'cultivation', title: 'SOP การปลูก', organizationId: orgId } });
        const items = itemsById(await readinessOf(users.empty));
        expect(items.sop.ready).toBe(true);
    });

    test('another applicant\'s rows never reach a user with nothing of their own', async () => {
        await raw.sOPDocument.deleteMany({ where: { userId: users.empty.id } });
        const body = await readinessOf(users.empty);
        const items = itemsById(body);
        expect(items.profile.ready).toBe(true);
        expect(Object.values(items).filter((item) => item.id !== 'profile').every((item) => item.ready === false)).toBe(true);
        expect(body.data).toMatchObject({ ready: false, readyCount: 1 });
    });
});
