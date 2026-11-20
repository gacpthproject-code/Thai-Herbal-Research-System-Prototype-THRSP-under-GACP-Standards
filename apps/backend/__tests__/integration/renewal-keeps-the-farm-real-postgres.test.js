'use strict';

/**
 * F-A8c-08 (A8 round 1c, staging 9bd6053ea): a renewal is the same farm.
 *
 * The walk certified 61/2569, opened a planting cycle under it, renewed it to 63/2569, and
 * the cycle stayed on 61/2569 with "ยังไม่ผูกใบรับรองที่ใช้งานได้" and no harvest. The renewal's
 * submit minted a second Farm, the renewal certificate named it, and the open cycle (on the
 * first farm) was never moved.
 *
 * Real Postgres, the real draft and submit doors, real issuance, the real harvest service.
 * Only authentication is attached by hand.
 */

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const { dropConsentRows } = require('../../test-support/consent-history');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { filedFormData, filedHolderData } = require('../../test-support/filed-application');
const { runWithTenantContext } = require('../../services/tenant-context');

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
jest.mock('../../services/pdf/pdf-generator.service', () => ({
    initialize: async () => {},
    warmUp: async () => {},
    close: async () => {},
    generatePDF: async () => Buffer.from('%PDF-1.4 t'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 t'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));
jest.mock('../../services/queue-service', () => ({
    ...jest.requireActual('../../services/queue-service'),
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-t' }) }),
    getPdfQueue: () => null,
}));

const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

const DAY_MS = 24 * 3600e3;
const PAPERS = [['JURISTIC_REG_6M', 'juristic_reg_6m'], ['LICENCE_PT10', 'licence_pt10'], ['LAND_RIGHTS', 'land_rights']];

d('F-A8c-08: a renewal is the same farm, and the open cycle follows the new certificate (real Postgres)', () => {
    let raw;
    let app;
    let certificateService;
    let auditOnsiteService;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { entityIds: [], auditIds: [] };
    let seq = 0;

    const save = (body) => request(app).post('/api/applications/draft').send({ saveSession: `rkf-${sfx}`, saveSeq: ++seq, ...body });
    const submit = (applicationId, renewal) => request(app).post('/api/applications/submit').send({
        applicationId, declarationsAccepted: true, ...(renewal ? { renewalChangeDeclaration: { changed: false } } : {}),
    });
    const farmsOf = (entityId) => raw.farm.count({ where: { entityId, isDeleted: false } });
    const cycleCertificate = async (id) => (await raw.plantingCycle.findUnique({ where: { id }, select: { certificateId: true } })).certificateId;

    async function attachPapers(applicationId) {
        for (const [documentType, slotId] of PAPERS) {
            await raw.applicationDocument.create({
                data: { applicationId, documentType, slotId, fileName: `${slotId}.pdf`, fileUrl: `/uploads/${slotId}.pdf`, currentForSlot: slotId },
            });
        }
    }

    /** The onsite audit passed, with its checklist and photographs, as the inspector door records it. */
    async function auditPassed(applicationId) {
        // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the payments, scheduling and onsite audit between submit and issuance are other suites' doors
        await raw.application.update({ where: { id: applicationId }, data: { status: 'AUDIT_PASSED', auditResult: 'PASS' } });
        const audit = await raw.auditChecklist.create({
            data: { applicationId, templateName: 'GACP_GENERAL', sections: [], auditorId: fx.auditorId, organizationId: fx.org, status: 'IN_PROGRESS' },
        });
        fx.auditIds.push(audit.id);
        for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
            await auditOnsiteService.submitChecklistItem({
                onlyDuringVisit: false, auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: fx.auditorId, prisma: raw,
            });
        }
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            await auditOnsiteService.uploadPhoto({
                onlyDuringVisit: false, auditId: audit.id, fileBuffer: Buffer.from(`rkf-${audit.id}-${i}`, 'utf8'),
                fileName: `rkf-${i}.jpg`, gpsLat: 13.6069 + i * 0.0001, gpsLng: 100.7061 + i * 0.0001,
                capturedAt: new Date(), uploadedBy: fx.auditorId, organizationId: fx.org, prisma: raw,
            });
        }
    }

    const issue = (applicationId) => certificateService.generateCertificate(applicationId, fx.auditorId, { prisma: raw });

    /** A NEW filing of `entityId`, submitted through the real door, audited, and certified. */
    async function certifiedThroughTheDoors(label, entityId, siteName) {
        const draft = await raw.application.create({
            data: {
                applicationNumber: `APP-RKF-${label}-${sfx}`, healthId: fx.X.canonicalId, areaType: 'OUTDOOR', organizationId: fx.org,
                entityId, submitterId: fx.X.id, status: 'DRAFT',
                formData: filedFormData({
                    requestType: 'NEW', certScope: 'PLANTING', workflowState: 'DRAFT',
                    farmData: { ...filedFormData().farmData, siteName, landOwnership: 'OWNED' },
                    declarationsAcceptedAt: undefined, serverRequirementSnapshot: undefined,
                }),
            },
        });
        await attachPapers(draft.id);
        const submitted = await submit(draft.id, false);
        if (submitted.status !== 200) { throw new Error(`original submit ${submitted.status}: ${JSON.stringify(submitted.body)}`); }
        await auditPassed(draft.id);
        return issue(draft.id);
    }

    async function openCycleOn(certificate) {
        const species = await raw.plantSpecies.findFirst({ where: { code: 'CAN' } });
        const plot = await raw.plot.create({
            data: { farmId: certificate.farmId, organizationId: fx.org, name: 'แปลงที่ปลูกอยู่', area: 100, areaSqm: 100, solarSystem: 'OUTDOOR' },
        });
        const cycle = await raw.plantingCycle.create({
            data: {
                farmId: certificate.farmId, plantSpeciesId: species.id, organizationId: fx.org, cycleName: 'รอบที่ยังไม่เก็บเกี่ยว',
                startDate: new Date(Date.now() - 60 * DAY_MS), status: 'GROWING', cultivationType: 'OUTDOOR',
                certificateId: certificate.id, plotId: plot.id,
            },
        });
        const cyclePlot = await raw.plantingCyclePlot.create({
            data: { cycleId: cycle.id, plotId: plot.id, allocatedAreaSqm: 100, plannedPlantCount: 0, organizationId: fx.org },
        });
        return { ...cycle, cyclePlotId: cyclePlot.id };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        certificateService = require('../../services/certificate-service');
        auditOnsiteService = require('../../services/audit-onsite-service');
        await require('../../services/prisma-database').connect();
        if (!(await raw.plantSpecies.findFirst({ where: { code: 'CAN' } }))) {
            await raw.plantSpecies.create({ data: { code: 'CAN', nameTH: 'กัญชา', nameEN: 'Cannabis' } });
        }
        fx.org = (await raw.organization.create({ data: { name: `rkf-${sfx}`, slug: `rkf-${sfx}`, code: `RKF_${sfx}`.toUpperCase() } })).id;
        const id = crypto.randomUUID();
        const canonicalId = `rkf-x-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `rkf-x-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: 'ต่ออายุ', organizationId: fx.org,
            },
        });
        fx.X = { id, canonicalId };
        fx.auditorId = (await raw.user.create({
            data: {
                canonicalId: `rkf-auditor-${sfx}`, password: 'x', organizationId: fx.org, authType: 'EMAIL_LEGACY',
                role: 'auditor', firstName: 'ผู้ตรวจ', lastName: 'ทดสอบ',
            },
        })).id;
        for (const category of [ConsentCategory.TERMS_OF_SERVICE, ConsentCategory.PRIVACY_POLICY, ConsentCategory.PAYMENT_TERMS]) {
            await raw.userConsent.create({
                data: { userId: id, organizationId: fx.org, category, version: ConsentVersions[category] || '1.0', granted: true, grantedAt: new Date() },
            });
        }
        for (const key of ['C', 'D']) {
            fx[key] = (await raw.entity.create({
                data: { type: 'JURISTIC', displayName: `บริษัท rkf-${key} ${sfx} จำกัด`, organizationId: fx.org, createdBy: id, ...filedHolderData('JURISTIC') },
            })).id;
            fx.entityIds.push(fx[key]);
            await raw.entityMembership.create({ data: { userId: id, entityId: fx[key], role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });
        }

        mockActor.current = { id, canonicalId, healthId: canonicalId, role: 'health', canonicalRole: 'health', organizationId: fx.org };
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
    }, 120000);

    afterAll(async () => {
        if (!raw) { return; }
        const appIds = (await raw.application.findMany({ where: { organizationId: fx.org }, select: { id: true } })).map((r) => r.id);
        const wipe = (model, where) => (raw[model] ? raw[model].deleteMany({ where }).catch(() => {}) : null);
        await wipe('lot', { organizationId: fx.org });
        await wipe('harvestBatch', { organizationId: fx.org });
        await wipe('plantingCyclePlot', { organizationId: fx.org });
        await wipe('plantingCycle', { organizationId: fx.org });
        await wipe('certificate', { applicationId: { in: appIds } });
        await wipe('farmAuditPhoto', { auditId: { in: fx.auditIds } });
        await wipe('farmAuditChecklistItem', { auditId: { in: fx.auditIds } });
        await wipe('auditChecklist', { id: { in: fx.auditIds } });
        await wipe('attachment', { organizationId: fx.org });
        for (const model of ['paymentTransaction', 'invoice', 'quotation', 'documentPrecheck', 'applicationDocument', 'workActivity', 'notification']) {
            await wipe(model, { applicationId: { in: appIds } });
        }
        await wipe('auditLog', { resourceId: { in: appIds } });
        await wipe('application', { id: { in: appIds } });
        await wipe('plot', { organizationId: fx.org });
        await wipe('farm', { organizationId: fx.org });
        await dropConsentRows(raw, fx.X?.id).catch(() => {});
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { organizationId: fx.org });
        await wipe('organization', { id: fx.org });
        await raw.$disconnect();
    });

    describe('renew a certificate while a cycle is growing under it', () => {
        let old;
        let otherHolderOld;
        let cycle;
        let otherHolderCycle;
        let renewalId;
        let renewal;
        let farmsBefore;

        beforeAll(async () => {
            old = await certifiedThroughTheDoors('OLD', fx.C, 'แปลงบางพลี');
            otherHolderOld = await certifiedThroughTheDoors('OTHER', fx.D, 'แปลงบางพลี');
            cycle = await openCycleOn(old);
            otherHolderCycle = await openCycleOn(otherHolderOld);
            farmsBefore = await farmsOf(fx.C);

            const started = await save({
                entityId: fx.C, step: 2,
                formData: { requestType: 'RENEWAL', previousCertificateNumber: old.certificateNumber, certScope: null, plantId: null, farmData: null },
            });
            renewalId = started.body?.data?.draftId;
            if (started.status !== 200 || !renewalId) { throw new Error(`renewal draft ${started.status}: ${JSON.stringify(started.body)}`); }
            const filled = (await raw.application.findUnique({ where: { id: renewalId } })).formData;
            await save({ applicationId: renewalId, step: 4, renewalPrefillLoaded: true, formData: { farmData: { ...filled.farmData, siteContactInformed: true } } });
            await attachPapers(renewalId);
            const submitted = await submit(renewalId, true);
            if (submitted.status !== 200) { throw new Error(`renewal submit ${submitted.status}: ${JSON.stringify(submitted.body)}`); }
        }, 300000);

        test('the renewal filing names the farm of the certificate it renews, and no second farm is born', async () => {
            const filed = (await raw.application.findUnique({ where: { id: renewalId } })).formData;
            expect({ renewalOf: filed.renewalOf, farmId: filed.farmId, farms: await farmsOf(fx.C) })
                .toEqual({ renewalOf: old.id, farmId: old.farmId, farms: farmsBefore });
        });

        test('the renewal certificate names the same farm, and the open cycle moves to it', async () => {
            await auditPassed(renewalId);
            renewal = await issue(renewalId);
            const chain = await raw.certificate.findUnique({ where: { id: old.id }, select: { status: true, renewedCertificateId: true } });
            expect({
                farmId: renewal.farmId,
                chain,
                cycle: await cycleCertificate(cycle.id),
                farms: await farmsOf(fx.C),
            }).toEqual({
                farmId: old.farmId,
                chain: { status: 'renewed', renewedCertificateId: renewal.id },
                cycle: renewal.id,
                farms: farmsBefore,
            });
        }, 300000);

        test('the moved cycle harvests under the renewal', async () => {
            const { createHarvestBatches } = require('../../services/planting-cycle-service');
            const harvest = await runWithTenantContext({ organizationId: fx.org }, () => createHarvestBatches(cycle.id, {
                harvestDate: new Date().toISOString(),
                plotHarvests: [{ cyclePlotId: cycle.cyclePlotId, freshWeightKg: 5, packagingRows: [{ packageType: 'BAG', quantity: 2, unitWeight: 1 }] }],
            }, { userId: fx.X.id }));
            expect({ status: harvest.status, success: harvest.body?.success, code: harvest.body?.code ?? null })
                .toEqual({ status: 201, success: true, code: null });
        }, 120000);

        test("another holder's cycle on the same site name stays on its own certificate", async () => {
            expect({ cycle: await cycleCertificate(otherHolderCycle.id), farmDiffers: otherHolderOld.farmId !== old.farmId })
                .toEqual({ cycle: otherHolderOld.id, farmDiffers: true });
        });

        test('running the supersede again refuses and leaves the chain and the cycle where they are', async () => {
            const renewalSupersede = require('../../services/certificate/renewal-supersede');
            await expect(renewalSupersede.supersede(raw, { oldCertificateId: old.id, newCertificateId: renewal.id, holderEntityId: fx.C }))
                .rejects.toMatchObject({ code: 'RENEWAL_SOURCE_ALREADY_RENEWED' });
            const chain = await raw.certificate.findUnique({ where: { id: old.id }, select: { status: true, renewedCertificateId: true } });
            expect({ chain, cycle: await cycleCertificate(cycle.id) })
                .toEqual({ chain: { status: 'renewed', renewedCertificateId: renewal.id }, cycle: renewal.id });
        });
    });

    describe('materialising a renewal filing', () => {
        const { materializeFarmForFiling } = require('../../services/application-service/application-farm-materialization');
        let source;

        beforeAll(async () => {
            source = await certifiedThroughTheDoors('SRC', fx.C, 'แปลงต้นทาง');
        }, 300000);

        test('is idempotent: the same farm every time, and no row written', async () => {
            const before = await raw.farm.count({ where: { organizationId: fx.org } });
            const formData = { ...filedFormData(), requestType: 'RENEWAL', renewalOf: source.id };
            const args = { client: raw, formData, ownerId: fx.X.id, entityId: fx.C, organizationId: fx.org };
            const first = await materializeFarmForFiling(args);
            const second = await materializeFarmForFiling(args);
            expect({ first: first.farmId, second: second.farmId, rows: await raw.farm.count({ where: { organizationId: fx.org } }) })
                .toEqual({ first: source.farmId, second: source.farmId, rows: before });
        });

        test("never hands another holder's farm to a filing that names its certificate", async () => {
            const formData = { ...filedFormData(), requestType: 'RENEWAL', renewalOf: source.id };
            const result = await materializeFarmForFiling({ client: raw, formData, ownerId: fx.X.id, entityId: fx.D, organizationId: fx.org });
            expect(result.farmId).not.toBe(source.farmId);
        });
    });

    describe('a renewal submitted before the fix, its filing pointed at a second farm', () => {
        let old;
        let cycle;
        let renewal;
        let secondFarmId;

        beforeAll(async () => {
            old = await certifiedThroughTheDoors('INFLIGHT', fx.C, 'แปลงยื่นค้าง');
            cycle = await openCycleOn(old);
            const previous = await raw.application.findUnique({ where: { id: old.applicationId }, select: { formData: true } });
            const { materializeFarmForFiling } = require('../../services/application-service/application-farm-materialization');
            const { renewalOf: _none, farmId: _old, ...asNew } = previous.formData;
            ({ farmId: secondFarmId } = await materializeFarmForFiling({
                client: raw, formData: asNew, ownerId: fx.X.id, entityId: fx.C, organizationId: fx.org,
            }));
            const filed = await raw.application.create({
                data: {
                    applicationNumber: `APP-RKF-INFLIGHT-R-${sfx}`, healthId: fx.X.canonicalId, areaType: 'OUTDOOR', organizationId: fx.org,
                    entityId: fx.C, submitterId: fx.X.id, status: 'DRAFT',
                    formData: { ...previous.formData, requestType: 'RENEWAL', renewalOf: old.id, farmId: secondFarmId },
                },
            });
            await auditPassed(filed.id);
            renewal = await issue(filed.id);
        }, 300000);

        test('is issued on the farm of the certificate it renews, and the open cycle moves to it', async () => {
            expect({ secondFarm: secondFarmId !== old.farmId, farmId: renewal.farmId, cycle: await cycleCertificate(cycle.id) })
                .toEqual({ secondFarm: true, farmId: old.farmId, cycle: renewal.id });
        });
    });

    describe('moving the open cycles at supersede', () => {
        let old;
        let successor;
        let staying;
        let detached;

        beforeAll(async () => {
            old = await certifiedThroughTheDoors('RACE-OLD', fx.C, 'แปลงแข่งเขียน');
            successor = await certifiedThroughTheDoors('RACE-NEW', fx.C, 'แปลงแข่งเขียน');
            staying = await openCycleOn(old);
            detached = await openCycleOn(old);
        }, 300000);

        test('a cycle taken off the renewed certificate between the read and the write is not moved', async () => {
            const renewalSupersede = require('../../services/certificate/renewal-supersede');
            const racing = new Proxy(raw, {
                get(target, prop) {
                    if (prop !== 'plantingCycle') { return target[prop]; }
                    return {
                        findMany: async (query) => {
                            const rows = await target.plantingCycle.findMany(query);
                            await target.plantingCycle.update({ where: { id: detached.id }, data: { certificateId: null } });
                            return rows;
                        },
                        updateMany: (query) => target.plantingCycle.updateMany(query),
                    };
                },
            });
            await renewalSupersede.supersede(racing, { oldCertificateId: old.id, newCertificateId: successor.id, holderEntityId: fx.C });
            expect({ staying: await cycleCertificate(staying.id), detached: await cycleCertificate(detached.id) })
                .toEqual({ staying: successor.id, detached: null });
        });
    });

    describe('scripts/heal-stranded-renewal-cycles.js on a renewal issued before the fix, naming a second farm', () => {
        const heal = require('../../scripts/heal-stranded-renewal-cycles');
        let old;
        let renewal;
        let cycle;
        let closedCycle;
        let secondFarmId;
        let firstPlan;
        const ours = (plan) => ({
            moves: plan.moves.filter((move) => move.from.id === old.id),
            skipped: plan.skipped.filter((row) => row.renewedCertificate === old.certificateNumber),
            secondFarms: plan.secondFarms.filter((row) => row.renewalCertificate === renewal.certificateNumber),
        });
        const placeOf = async () => {
            const row = await raw.plantingCycle.findUnique({
                where: { id: cycle.id },
                select: { certificateId: true, farmId: true, plot: { select: { farmId: true } }, batches: { select: { farmId: true } } },
            });
            return { certificateId: row.certificateId, farmId: row.farmId, plotFarmId: row.plot.farmId, batchFarmIds: row.batches.map((b) => b.farmId) };
        };

        beforeAll(async () => {
            old = await certifiedThroughTheDoors('STRANDED', fx.C, 'แปลงค้างรอบ');
            const previous = await raw.application.findUnique({ where: { id: old.applicationId }, select: { formData: true } });
            const filed = await raw.application.create({
                data: {
                    applicationNumber: `APP-RKF-STRANDED-R-${sfx}`, healthId: fx.X.canonicalId, areaType: 'OUTDOOR', organizationId: fx.org,
                    entityId: fx.C, submitterId: fx.X.id, status: 'DRAFT',
                    formData: { ...previous.formData, requestType: 'RENEWAL', renewalOf: old.id },
                },
            });
            await auditPassed(filed.id);
            renewal = await issue(filed.id);
            cycle = await openCycleOn(old);
            closedCycle = await openCycleOn(old);
            await raw.plantingCycle.update({ where: { id: closedCycle.id }, data: { status: 'HARVESTED' } });
            await raw.harvestBatch.create({
                data: { batchNumber: `RKF-B-${sfx}`, farmId: old.farmId, cycleId: cycle.id, freshWeight: 1, organizationId: fx.org },
            });
            secondFarmId = (await raw.farm.create({
                data: {
                    ownerId: fx.X.id, entityId: fx.C, organizationId: fx.org, farmName: 'แปลงค้างรอบ', farmType: 'CULTIVATION',
                    address: '99 หมู่ 1', province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540',
                    totalArea: 1600, cultivationArea: 1600, cultivationMethod: 'OUTDOOR',
                },
            })).id;
            // What a pre-fix renewal left: the renewal names a second farm of the site, the open cycle stayed behind.
            await raw.certificate.update({ where: { id: renewal.id }, data: { farmId: secondFarmId } });
        }, 300000);

        test('the plan lists the open cycle, its plot and the second farm, and writes nothing', async () => {
            firstPlan = await heal.planHeal(raw);
            expect({ plan: ours(firstPlan), place: await placeOf() }).toEqual({
                plan: {
                    moves: [{
                        from: { id: old.id, number: old.certificateNumber, farmId: old.farmId },
                        to: { id: renewal.id, number: renewal.certificateNumber, farmId: secondFarmId },
                        cycleIds: [cycle.id],
                        plotIds: [cycle.plotId],
                    }],
                    skipped: [],
                    secondFarms: [{
                        renewedCertificate: old.certificateNumber, renewedFarmId: old.farmId,
                        renewalCertificate: renewal.certificateNumber, renewalFarmId: secondFarmId,
                    }],
                },
                place: { certificateId: old.id, farmId: old.farmId, plotFarmId: old.farmId, batchFarmIds: [old.farmId] },
            });
        });

        test.each([
            ['revoked', { status: 'revoked' }, 'SUCCESSOR_NOT_ACTIVE'],
            ['deleted', { isDeleted: true }, 'SUCCESSOR_NOT_ACTIVE'],
            ['expired', { expiryDate: new Date(Date.now() - DAY_MS) }, 'SUCCESSOR_NOT_ACTIVE'],
        ])('a successor that is %s is skipped with a reason, and nothing moves', async (_case, change, reason) => {
            const before = await raw.certificate.findUnique({ where: { id: renewal.id }, select: { status: true, isDeleted: true, expiryDate: true } });
            await raw.certificate.update({ where: { id: renewal.id }, data: change });
            try {
                const plan = ours(await heal.planHeal(raw));
                await heal.applyHeal(raw, plan);
                expect({ moves: plan.moves, skipped: plan.skipped, place: await placeOf() }).toEqual({
                    moves: [],
                    skipped: [{ renewedCertificate: old.certificateNumber, renewalCertificate: renewal.certificateNumber, reason }],
                    place: { certificateId: old.id, farmId: old.farmId, plotFarmId: old.farmId, batchFarmIds: [old.farmId] },
                });
            } finally {
                await raw.certificate.update({ where: { id: renewal.id }, data: before });
            }
        });

        test('a successor filed for another holder is skipped with a reason, and nothing moves', async () => {
            await raw.application.update({ where: { id: renewal.applicationId }, data: { entityId: fx.D } });
            try {
                const plan = ours(await heal.planHeal(raw));
                expect({ moves: plan.moves, skipped: plan.skipped, place: await placeOf() }).toEqual({
                    moves: [],
                    skipped: [{ renewedCertificate: old.certificateNumber, renewalCertificate: renewal.certificateNumber, reason: 'HOLDER_MISMATCH' }],
                    place: { certificateId: old.id, farmId: old.farmId, plotFarmId: old.farmId, batchFarmIds: [old.farmId] },
                });
            } finally {
                await raw.application.update({ where: { id: renewal.applicationId }, data: { entityId: fx.C } });
            }
        });

        test('a plot another open cycle also uses is never moved: the pair is skipped with a reason', async () => {
            const species = await raw.plantSpecies.findFirst({ where: { code: 'CAN' } });
            const sharing = await raw.plantingCycle.create({
                data: {
                    farmId: old.farmId, plantSpeciesId: species.id, organizationId: fx.org, cycleName: 'รอบที่ใช้แปลงร่วม',
                    startDate: new Date(), status: 'PLANTED', cultivationType: 'OUTDOOR', plotId: cycle.plotId,
                },
            });
            try {
                const plan = ours(await heal.planHeal(raw));
                expect({ moves: plan.moves, skipped: plan.skipped, place: await placeOf() }).toEqual({
                    moves: [],
                    skipped: [{ renewedCertificate: old.certificateNumber, renewalCertificate: renewal.certificateNumber, reason: 'PLOT_SHARED_WITH_OPEN_CYCLE' }],
                    place: { certificateId: old.id, farmId: old.farmId, plotFarmId: old.farmId, batchFarmIds: [old.farmId] },
                });
            } finally {
                await raw.plantingCycle.delete({ where: { id: sharing.id } });
            }
        });

        test('a cycle taken off the renewed certificate between plan and apply is left where it is', async () => {
            const plan = ours(await heal.planHeal(raw));
            await raw.plantingCycle.update({ where: { id: cycle.id }, data: { certificateId: null } });
            try {
                const applied = await heal.applyHeal(raw, plan);
                expect({ applied, place: await placeOf() }).toEqual({
                    applied: [{ from: old.certificateNumber, to: renewal.certificateNumber, cycles: 0, plots: 0, batches: 0 }],
                    place: { certificateId: null, farmId: old.farmId, plotFarmId: old.farmId, batchFarmIds: [old.farmId] },
                });
            } finally {
                await raw.plantingCycle.update({ where: { id: cycle.id }, data: { certificateId: old.id } });
            }
        });

        test('apply moves the open cycle, its plot and its batch to the renewal farm; the closed cycle and the signed farm stay', async () => {
            const applied = await heal.applyHeal(raw, ours(await heal.planHeal(raw)));
            expect({
                applied,
                place: await placeOf(),
                closed: await raw.plantingCycle.findUnique({ where: { id: closedCycle.id }, select: { certificateId: true, farmId: true } }),
                renewalFarm: (await raw.certificate.findUnique({ where: { id: renewal.id }, select: { farmId: true } })).farmId,
            }).toEqual({
                applied: [{ from: old.certificateNumber, to: renewal.certificateNumber, cycles: 1, plots: 1, batches: 1 }],
                place: { certificateId: renewal.id, farmId: secondFarmId, plotFarmId: secondFarmId, batchFarmIds: [secondFarmId] },
                closed: { certificateId: old.id, farmId: old.farmId },
                renewalFarm: secondFarmId,
            });
        });

        test("the healed cycle is in the holder's cycle list, on the renewal's farm", async () => {
            const plantingService = require('../../services/planting-service');
            const listed = await runWithTenantContext({ organizationId: fx.org }, () => plantingService.listByOwner(fx.X.id));
            expect(listed.filter((row) => row.id === cycle.id).map((row) => row.farm.id)).toEqual([secondFarmId]);
        });

        test('the healed cycle harvests under the renewal', async () => {
            const { createHarvestBatches } = require('../../services/planting-cycle-service');
            const harvest = await runWithTenantContext({ organizationId: fx.org }, () => createHarvestBatches(cycle.id, {
                harvestDate: new Date().toISOString(),
                plotHarvests: [{ cyclePlotId: cycle.cyclePlotId, freshWeightKg: 5, packagingRows: [{ packageType: 'BAG', quantity: 2, unitWeight: 1 }] }],
            }, { userId: fx.X.id }));
            expect({ status: harvest.status, success: harvest.body?.success, code: harvest.body?.code ?? null })
                .toEqual({ status: 201, success: true, code: null });
        }, 120000);

        test('a second run plans nothing, and re-applying the first plan moves nothing', async () => {
            const again = ours(await heal.planHeal(raw));
            const reapplied = await heal.applyHeal(raw, ours(firstPlan));
            expect({ again: again.moves, reapplied, place: { ...(await placeOf()), batchFarmIds: undefined } }).toEqual({
                again: [],
                reapplied: [{ from: old.certificateNumber, to: renewal.certificateNumber, cycles: 0, plots: 0, batches: 0 }],
                place: { certificateId: renewal.id, farmId: secondFarmId, plotFarmId: secondFarmId, batchFarmIds: undefined },
            });
        });
    });
});
