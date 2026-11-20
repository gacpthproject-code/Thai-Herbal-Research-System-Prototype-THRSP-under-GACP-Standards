'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { seedHolderScopeFixture, cleanupHolderScopeFixture } = require('./fixtures/holder-scope-fixture');

const TEST_ACTOR = 'TEST-M2A';
const TEST_SLOT = 'land_rights';

d('M2a submit enforcement (real Postgres)', () => {
    let raw;
    let fx;
    let svc;
    const rules = [];

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await seedHolderScopeFixture(raw);
        svc = require('../../services/application-document-requirements');
    }, 120000);

    afterEach(async () => {
        await raw.requirementRule.deleteMany({ where: { id: { in: rules.splice(0) } } });
    });

    afterAll(async () => {
        if (raw) {
            await cleanupHolderScopeFixture(raw, fx);
            await raw.$disconnect();
        }
    });

    async function fileRule(data = {}) {
        const rule = await raw.requirementRule.create({
            data: {
                slotId: TEST_SLOT, holderType: 'JURISTIC', landTenure: 'STATE_PERMITTED', isRequired: true,
                effectiveFrom: new Date(Date.now() - 86400000), createdBy: TEST_ACTOR, ...data,
            },
        });
        rules.push(rule.id);
        return rule;
    }

    async function seedFiling(entityKey, formData = {}) {
        const application = await raw.application.create({
            data: {
                applicationNumber: `M2A-${crypto.randomUUID().slice(0, 8)}`, healthId: fx.users.A.canonicalId,
                areaType: 'OUTDOOR', organizationId: fx.orgId, entityId: fx.entities[entityKey],
                submitterId: fx.users.A.id, status: 'DRAFT',
                formData: {
                    plantId: 'cannabis', certificationPurposes: ['EXPORT'], farmData: { landOwnership: 'STATE' },
                    ...formData,
                },
            },
        });
        await attach(application, 'LICENCE_PT10');
        if (entityKey === 'C') { await attach(application, 'COMPANY_REG'); }
        return application;
    }

    const attach = (application, documentType) => raw.applicationDocument.create({
        data: { applicationId: application.id, documentType, fileUrl: `/uploads/test/m2a-${documentType}.pdf` },
    });

    async function rulesInForceFor(application) {
        const { resolveApplicationRequirements } = require('../../services/application-requirements-service');
        const holder = await raw.entity.findUnique({ where: { id: application.entityId }, select: { type: true } });
        const documentRows = await raw.applicationDocument.findMany({
            where: { applicationId: application.id }, select: { documentType: true, supersededAt: true },
        });
        const { appliedRules } = await resolveApplicationRequirements(application, documentRows, {
            at: new Date(), holderType: holder.type, requirePurpose: true,
        });
        return appliedRules.map((r) => r.id);
    }

    async function missingAtFirstSubmit(application) {
        try {
            await svc.assertRequiredDocumentsPresent({ application, mode: 'first-submit' });
            return [];
        } catch (err) {
            if (err.code !== 'APPLICATION_INCOMPLETE') { throw err; }
            return err.missingSlots.map((slot) => slot.slotId);
        }
    }

    it('AC1: a JURISTIC filing with no document on file is refused, naming the slot', async () => {
        await fileRule();
        const application = await seedFiling('C');

        await expect(svc.assertRequiredDocumentsPresent({ application, mode: 'first-submit' }))
            .rejects.toMatchObject({
                status: 422,
                code: 'APPLICATION_INCOMPLETE',
                missingSlots: expect.arrayContaining([{ slotId: TEST_SLOT, labelTH: expect.any(String) }]),
            });
    });

    it('AC1: the same law asks nothing of an INDIVIDUAL filing', async () => {
        const rule = await fileRule();
        const application = await seedFiling('PA');

        expect(await rulesInForceFor(application)).not.toContain(rule.id);
    });

    it('AC2: a client flag is not evidence, an ApplicationDocument row is', async () => {
        await fileRule();
        const application = await seedFiling('C', { documents: [{ slotId: TEST_SLOT, uploaded: true }] });

        expect(await missingAtFirstSubmit(application)).toContain(TEST_SLOT);

        await attach(application, 'LAND_RIGHTS');

        expect(await missingAtFirstSubmit(application)).not.toContain(TEST_SLOT);
    });

    it('AC3: a rule filed after the stamp cannot refuse the resubmit', async () => {
        const application = await seedFiling('C', {
            serverRequirementSnapshot: { stampedAt: new Date().toISOString(), ruleIds: [], slotIds: [] },
        });
        await fileRule({ effectiveFrom: new Date() });

        await expect(svc.assertRequiredDocumentsPresent({ application, mode: 'resubmit' }))
            .resolves.toMatchObject({ appliedRules: [] });
    });

    it('AC3: closing a rule stops it firing for filings made afterwards', async () => {
        const rule = await fileRule();
        const application = await seedFiling('C');

        expect(await rulesInForceFor(application)).toContain(rule.id);

        const { closeRule } = require('../../services/requirement-rule-service');
        await closeRule(rule.id, TEST_ACTOR, 'integration test');

        expect(await rulesInForceFor(application)).not.toContain(rule.id);
    });
});
