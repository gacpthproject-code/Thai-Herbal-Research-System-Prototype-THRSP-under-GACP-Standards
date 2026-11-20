'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');

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
jest.mock('../../services/application-service', () => {
    const actual = jest.requireActual('../../services/application-service');
    actual.resolveHealthIdentity = async () => mockActor.current.identity;
    return actual;
});

const SOILLESS_REASON = 'ผู้ยื่นระบุว่าปลูกในอาคารแบบไม่ใช้ดิน รอผู้เชี่ยวชาญตัดสินว่าหัวข้อดินเกี่ยวข้องหรือไม่';

function site(over = {}) {
    return {
        siteName: 'อาคารปลูกบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '400', province: 'สมุทรปราการ',
        district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540',
        landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '12345' },
        coordinates: '13.6069, 100.7061', plantsPerCycle: '200', cyclesPerYear: '4',
        ...over,
    };
}

function draftPayload({ applicationId, entityId, farmData }) {
    return {
        ...(applicationId ? { applicationId } : { entityId }),
        plantId: 'cannabis',
        step: 3,
        currentStep: 3,
        formData: {
            requestType: 'NEW',
            certScope: 'PLANTING',
            applicantType: 'JURISTIC',
            plantId: 'cannabis',
            certificationPurposes: ['RESEARCH'],
            farmData,
        },
    };
}

d('order 159 soil follow-up 2: the growing-medium answer goes in through the draft door and every reader gets it back (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const ruleIds = [];
    const as = (actor) => { mockActor.current = { ...actor }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'gmrt' });
        const { buildHerbRuleRows } = require('../../scripts/seed-herb-requirement-rules');
        for (const row of buildHerbRuleRows('cannabis', { effectiveFrom: '2026-09-02T00:00:00Z' })) {
            ruleIds.push((await world.raw.requirementRule.create({ data: { ...row, createdBy: 'growing-medium-round-trip' } })).id);
        }
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
    });

    afterAll(async () => {
        await world.raw.requirementRule.deleteMany({ where: { id: { in: ruleIds } } });
        await world.cleanup();
    });

    const applicant = () => ({
        id: fx.applicant.id, role: 'health', canonicalRole: 'health', canonicalId: fx.applicant.canonicalId,
        organizationId: fx.orgA, identity: { userId: fx.applicant.id, healthId: fx.applicant.canonicalId },
    });

    async function saveDraft(farmData, applicationId) {
        as(applicant());
        const res = await request(app).post('/api/applications/draft').send(draftPayload({ applicationId, entityId: fx.entityA, farmData }));
        expect(res.status).toBe(200);
        const id = res.body.data.id;
        if (!world.made.appIds.includes(id)) { world.made.appIds.push(id); }
        return id;
    }

    async function slotIdsOf(applicationId) {
        as(applicant());
        const res = await request(app).get(`/api/applications/${applicationId}/requirements`);
        expect(res.status).toBe(200);
        expect(res.body.data.blockingIssues).toEqual([]);
        return res.body.data.slots.map((slot) => slot.slotId);
    }

    test('indoor + ไม่ใช้ดิน: stored, no soil_test slot, printed on the กทล.1 as additional information, analyzer waits for the expert', async () => {
        const id = await saveDraft(site({ areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' }));

        const stored = await world.raw.application.findUnique({ where: { id }, select: { formData: true } });
        expect(stored.formData.farmData).toMatchObject({ areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' });

        const slots = await slotIdsOf(id);
        expect(slots).toContain('water_test');
        expect(slots).not.toContain('soil_test');

        as(applicant());
        const k1 = await request(app).get(`/api/applications/${id}/katorlor1`);
        expect(k1.status).toBe(200);
        expect(k1.body.data.html).toMatch(/วัสดุปลูกในอาคารระบบปิด/);
        expect(k1.body.data.html).toMatch(/ไม่ใช้ดิน/);
        expect(k1.body.data.html).toMatch(/ข้อมูลเพิ่มเติม ไม่อยู่ในแบบ กทล ๑/);

        const { analyzeApplication } = require('../../services/standards-analyzer-service');
        const result = await analyzeApplication(id, 'THAI_GACP', { actor: { canonicalRole: 'health', canonicalId: fx.applicant.canonicalId } });
        const soil = result.requirements.find((r) => r.id === 'SOIL');
        expect(soil).toMatchObject({ status: 'NEEDS_REVIEW', evidence: SOILLESS_REASON, recommendation: null });
    });

    test('changing the answer to ปลูกในดิน on the same draft brings the soil_test slot back', async () => {
        const id = await saveDraft(site({ areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' }));
        expect(await slotIdsOf(id)).not.toContain('soil_test');

        await saveDraft(site({ areaTypes: ['INDOOR'], growingMedium: 'SOIL' }), id);
        const stored = await world.raw.application.findUnique({ where: { id }, select: { formData: true } });
        expect(stored.formData.farmData.growingMedium).toBe('SOIL');
        expect(await slotIdsOf(id)).toContain('soil_test');
    });

    test('unticking อาคารระบบปิด saves a filing without the answer', async () => {
        const id = await saveDraft(site({ areaTypes: ['OUTDOOR', 'INDOOR'], growingMedium: 'SOILLESS' }));
        expect(await slotIdsOf(id)).toContain('soil_test');

        await saveDraft(site({ areaTypes: ['OUTDOOR'] }), id);
        const stored = await world.raw.application.findUnique({ where: { id }, select: { formData: true } });
        expect(stored.formData.farmData).not.toHaveProperty('growingMedium');
    });

    test.each([
        ['the document reviewer', () => fx.reviewerA],
        ['the dispatcher, whose read withholds every contact', () => fx.dispatcherA],
    ])('%s reads the answer on the staff detail door', async (_who, staff) => {
        const row = await world.settledInto('AUDIT_FEE_PAID', {
            reviewerId: fx.reviewerA.id,
            formData: { plantId: 'cannabis', farmData: site({ areaTypes: ['INDOOR'], growingMedium: 'SOILLESS', sitePhone: '0865556666' }) },
        });
        as(staff());
        const res = await request(app).get(`/api/provider/applications/${row.id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.formData.farmData.growingMedium).toBe('SOILLESS');
    });
});
