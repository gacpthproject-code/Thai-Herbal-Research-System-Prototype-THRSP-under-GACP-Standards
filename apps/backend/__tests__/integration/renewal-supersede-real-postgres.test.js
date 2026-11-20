'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const { completeHolderEntity } = require('../../test-support/complete-holder');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { phaseBApplicationData, phaseBWizardAnswers } = require('../../test-support/phase-b-application-seed');
const { runWithTenantContext } = require('../../services/tenant-context');

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

const DAY_MS = 24 * 3600e3;
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);
const { toCertificateSlug: slug } = require('../../services/certificate-number-display');

d('order 107 on real Postgres: a renewal supersedes the certificate it renews', () => {
    let prisma;
    let app;
    let certificateService;
    let renewalService;
    let auditOnsiteService;
    let orgId;
    let auditorId;
    let applicant;
    let companyId;
    let otherCompanyId;
    const applicationIds = [];
    const auditIds = [];

    beforeAll(async () => {
        prisma = new PrismaClient();
        await prisma.$connect();
        certificateService = require('../../services/certificate-service');
        renewalService = require('../../services/renewal-service');
        auditOnsiteService = require('../../services/audit-onsite-service');
        app = require('../../server');
        await require('../../services/prisma-database').connect();
        if (!(await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } }))) {
            await prisma.plantSpecies.create({ data: { code: 'CAN', nameTH: 'กัญชา', nameEN: 'Cannabis' } });
        }
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        orgId = (await prisma.organization.create({
            data: { name: 'Order 107 renewal org', slug: `o107-${suffix}`, code: `O107_${suffix}`.toUpperCase().slice(0, 24) },
        })).id;
        auditorId = (await prisma.user.create({
            data: {
                canonicalId: `o107-auditor-${suffix}`, password: 'x', organizationId: orgId,
                authType: 'EMAIL_LEGACY', role: 'auditor', firstName: 'ผู้ตรวจ', lastName: 'ทดสอบ',
            },
        })).id;
        applicant = await prisma.user.create({
            data: {
                canonicalId: `o107-applicant-${suffix}`, password: 'x', organizationId: orgId,
                authType: 'EMAIL_LEGACY', role: 'health', firstName: 'สมชาย', lastName: 'ต่ออายุ',
            },
        });
        companyId = (await prisma.entity.create({
            data: completeHolderEntity('JURISTIC', { displayName: 'บริษัท ต่ออายุทดสอบ จำกัด', organizationId: orgId, createdBy: applicant.id }),
        })).id;
        await prisma.entityMembership.create({
            data: { userId: applicant.id, entityId: companyId, role: 'OWNER', permissions: [], status: 'ACTIVE', organizationId: orgId },
        });
        otherCompanyId = (await prisma.entity.create({
            data: completeHolderEntity('JURISTIC', { displayName: 'บริษัท ผู้ถือรายอื่น จำกัด', organizationId: orgId, createdBy: applicant.id }),
        })).id;
        await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS test_supersede_poison (certificate_id text PRIMARY KEY)');
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION test_supersede_poison_fn() RETURNS trigger AS $$
            BEGIN
                IF NEW."status" = 'renewed'
                   AND EXISTS (SELECT 1 FROM test_supersede_poison WHERE certificate_id = NEW."id") THEN
                    RAISE EXCEPTION 'test: supersede forced to fail';
                END IF;
                RETURN NEW;
            END $$ LANGUAGE plpgsql`);
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_supersede_poison_trg ON certificates');
        await prisma.$executeRawUnsafe('CREATE TRIGGER test_supersede_poison_trg BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION test_supersede_poison_fn()');
    }, 120000);

    afterAll(async () => {
        if (!prisma) { return; }
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_supersede_poison_trg ON certificates').catch(() => {});
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_supersede_poison_fn()').catch(() => {});
        await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS test_supersede_poison').catch(() => {});
        await prisma.lot.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.harvestBatch.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plantingCycle.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.certificate.deleteMany({ where: { applicationId: { in: applicationIds } } }).catch(() => {});
        await prisma.farmAuditPhoto.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        await prisma.farmAuditChecklistItem.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        await prisma.attachment.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plot.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.farm.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.auditChecklist.deleteMany({ where: { id: { in: auditIds } } }).catch(() => {});
        await prisma.application.deleteMany({ where: { id: { in: applicationIds } } }).catch(() => {});
        await prisma.entityMembership.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.entity.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
        await prisma.$disconnect();
    });

    async function passedApplication({ renewalOf = null, entityId = companyId } = {}) {
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const answers = phaseBWizardAnswers({
            farmData: { ...phaseBWizardAnswers().farmData, areaTypes: ['OUTDOOR'] },
            purposes: ['RESEARCH'],
            applicantType: 'JURISTIC',
            ...(renewalOf ? { requestType: 'RENEWAL', renewalOf } : {}),
        });
        const application = await prisma.application.create({
            data: phaseBApplicationData(
                { applicationNumber: `O107-${suffix}`, healthId: applicant.canonicalId, organizationId: orgId },
                { status: 'AUDIT_PASSED', auditResult: 'PASS', areaType: 'OUTDOOR', formData: answers, entityId },
            ),
        });
        applicationIds.push(application.id);
        const audit = await prisma.auditChecklist.create({
            data: {
                applicationId: application.id, templateName: 'GACP_GENERAL', sections: [],
                auditorId, organizationId: orgId, status: 'IN_PROGRESS',
            },
        });
        auditIds.push(audit.id);
        for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
            await auditOnsiteService.submitChecklistItem({
                onlyDuringVisit: false,
                auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: auditorId, prisma,
            });
        }
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            await auditOnsiteService.uploadPhoto({
                onlyDuringVisit: false,
                auditId: audit.id, fileBuffer: Buffer.from(`o107-photo-${audit.id}-${i}`, 'utf8'),
                fileName: `o107-${i}.jpg`, gpsLat: 13.75 + i * 0.0001, gpsLng: 100.5 + i * 0.0001,
                capturedAt: new Date(), uploadedBy: auditorId, organizationId: orgId, prisma,
            });
        }
        return application.id;
    }

    const issueInCallerTransaction = (applicationId) => prisma.$transaction(
        (tx) => certificateService.generateCertificate(applicationId, auditorId, { prisma: tx }),
        { timeout: 60000, maxWait: 10000 },
    );
    const issueOnBareClient = (applicationId) => certificateService.generateCertificate(applicationId, auditorId, { prisma });

    async function inForce() {
        return certificateService.generateCertificate(await passedApplication(), auditorId, { prisma });
    }

    const chainOf = (id) => prisma.certificate.findUnique({
        where: { id }, select: { status: true, renewedCertificateId: true, previousCertificateId: true },
    });

    async function openCycleOn(certificate, solarSystem, { startDate = daysFromNow(-200) } = {}) {
        const species = await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } });
        const plot = await prisma.plot.create({
            data: { farmId: certificate.farmId, organizationId: orgId, name: `แปลง ${solarSystem}`, area: 100, solarSystem },
        });
        const cycle = await prisma.plantingCycle.create({
            data: {
                farmId: certificate.farmId, plantSpeciesId: species.id, organizationId: orgId, cycleName: 'รอบที่เปิดอยู่',
                startDate, status: 'GROWING', cultivationType: solarSystem,
                certificateId: certificate.id, plotId: plot.id,
            },
        });
        const cyclePlot = await prisma.plantingCyclePlot.create({
            data: { cycleId: cycle.id, plotId: plot.id, allocatedAreaSqm: 100, plannedPlantCount: 0, organizationId: orgId },
        });
        return { ...cycle, cyclePlotId: cyclePlot.id };
    }

    async function lotUnder(certificate, harvestDate = new Date()) {
        const species = await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } });
        const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const cycle = await prisma.plantingCycle.create({
            data: {
                farmId: certificate.farmId, plantSpeciesId: species.id, organizationId: orgId, cycleName: 'รอบก่อนต่ออายุ',
                startDate: daysFromNow(-400), status: 'HARVESTED', cultivationType: 'OUTDOOR', certificateId: certificate.id,
            },
        });
        const batch = await prisma.harvestBatch.create({
            data: {
                farmId: certificate.farmId, cycleId: cycle.id, organizationId: orgId, batchNumber: `HB-O107-${tag}`, qrCode: `qr-b-o107-${tag}`,
                harvestDate, freshWeight: 10, dryWeight: 3, plantCode: 'CAN', status: 'HARVESTED',
            },
        });
        return prisma.lot.create({
            data: {
                batchId: batch.id, organizationId: orgId, lotNumber: `LOT-O107-${tag}`, packageType: 'BAG',
                quantity: 1, unitWeight: 1, totalWeight: 1, qrCode: `qr-o107-${tag}`, status: 'PACKAGED',
            },
        });
    }

    describe.each([
        ['the approver door (caller transaction)', issueInCallerTransaction],
        ['a bare client (status-writer and seed doors)', issueOnBareClient],
    ])('issuing a renewal through %s', (_door, issue) => {
        test('marks the old certificate renewed and links both ways', async () => {
            const old = await inForce();
            const renewal = await issue(await passedApplication({ renewalOf: old.id }));
            expect(await chainOf(old.id)).toEqual({ status: 'renewed', renewedCertificateId: renewal.id, previousCertificateId: null });
            expect(await chainOf(renewal.id)).toEqual({ status: 'active', renewedCertificateId: null, previousCertificateId: old.id });
        }, 120000);

        test('a failure after the new certificate is created leaves no new certificate and the old one unchanged', async () => {
            const old = await inForce();
            const renewalAppId = await passedApplication({ renewalOf: old.id });
            await prisma.$executeRawUnsafe('INSERT INTO test_supersede_poison (certificate_id) VALUES ($1)', old.id);
            await expect(issue(renewalAppId)).rejects.toThrow('test: supersede forced to fail');
            expect(await prisma.certificate.count({ where: { applicationId: renewalAppId } })).toBe(0);
            expect(await chainOf(old.id)).toEqual({ status: 'active', renewedCertificateId: null, previousCertificateId: null });
        }, 120000);
    });

    describe('two writers on one source certificate (reviewer race test, d22304c7b review)', () => {
        test.each([
            ['caller transactions', issueInCallerTransaction],
            ['bare clients', issueOnBareClient],
        ])('two renewals of one certificate: exactly one wins (%s)', async (_door, issue) => {
            for (let round = 0; round < 3; round += 1) {
                const old = await inForce();
                const a1 = await passedApplication({ renewalOf: old.id });
                const a2 = await passedApplication({ renewalOf: old.id });
                const out = await Promise.allSettled([issue(a1), issue(a2)]);
                const lost = out.filter((o) => o.status === 'rejected');
                expect(out.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
                expect(lost).toHaveLength(1);
                expect(lost[0].reason.code).toBe('RENEWAL_SOURCE_ALREADY_RENEWED');
                const certs = await prisma.certificate.findMany({ where: { applicationId: { in: [a1, a2] } } });
                expect(certs).toHaveLength(1);
                expect(await chainOf(old.id)).toEqual({ status: 'renewed', renewedCertificateId: certs[0].id, previousCertificateId: null });
                expect((await chainOf(certs[0].id)).previousCertificateId).toBe(old.id);
            }
        }, 300000);

        test('a revocation racing a renewal never leaves a renewed source without its new certificate', async () => {
            const old = await inForce();
            const a1 = await passedApplication({ renewalOf: old.id });
            await Promise.allSettled([
                issueInCallerTransaction(a1),
                prisma.certificate.updateMany({ where: { id: old.id, status: 'active' }, data: { status: 'revoked', revokedAt: new Date() } }),
            ]);
            const row = await chainOf(old.id);
            const issued = await prisma.certificate.count({ where: { applicationId: a1 } });
            expect(issued).toBe(row.status === 'renewed' ? 1 : 0);
        }, 300000);
    });

    describe('refusals: nothing is issued and the old certificate keeps its state', () => {
        const refusedWith = async (renewalAppId, code) => {
            await expect(issueOnBareClient(renewalAppId)).rejects.toMatchObject({ code });
            expect(await prisma.certificate.count({ where: { applicationId: renewalAppId } })).toBe(0);
        };

        test('the old certificate belongs to another holder', async () => {
            const old = await inForce();
            await refusedWith(await passedApplication({ renewalOf: old.id, entityId: otherCompanyId }), 'RENEWAL_SOURCE_HOLDER_MISMATCH');
            expect((await chainOf(old.id)).status).toBe('active');
        }, 120000);

        test.each([
            ['revoked', { status: 'revoked', revokedAt: new Date(), revokedBy: 'o107', revokedReason: 'test' }],
            ['suspended', { status: 'suspended', suspendedAt: new Date(), suspendedBy: 'o107', suspendedReason: 'test' }],
        ])('the old certificate is %s', async (status, change) => {
            const old = await inForce();
            await prisma.certificate.update({ where: { id: old.id }, data: change });
            await refusedWith(await passedApplication({ renewalOf: old.id }), 'RENEWAL_SOURCE_NOT_IN_FORCE');
            expect((await chainOf(old.id)).status).toBe(status);
        }, 120000);

        test('the old certificate was already renewed to a different certificate', async () => {
            const old = await inForce();
            const first = await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
            await refusedWith(await passedApplication({ renewalOf: old.id }), 'RENEWAL_SOURCE_ALREADY_RENEWED');
            expect(await chainOf(old.id)).toEqual({ status: 'renewed', renewedCertificateId: first.id, previousCertificateId: null });
        }, 120000);
    });

    describe('open planting cycles move to the renewal; closed ones keep their history', () => {
        let old;
        let renewal;
        let openCycle;
        let outOfScopeCycle;
        let closedLot;

        beforeAll(async () => {
            old = await inForce();
            openCycle = await openCycleOn(old, 'OUTDOOR');
            outOfScopeCycle = await openCycleOn(old, 'INDOOR');
            closedLot = await lotUnder(old);
            renewal = await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
        }, 180000);

        const certificateOfCycle = async (id) => (await prisma.plantingCycle.findUnique({ where: { id }, select: { certificateId: true } })).certificateId;

        test('an open cycle in the renewal\'s scope is bound to the renewal and harvests, and its lot traces to the renewal', async () => {
            const { createHarvestBatches } = require('../../services/planting-cycle-service');
            const harvest = await runWithTenantContext({ organizationId: orgId }, () => createHarvestBatches(openCycle.id, {
                harvestDate: new Date().toISOString(),
                plotHarvests: [{
                    cyclePlotId: openCycle.cyclePlotId, freshWeightKg: 5,
                    packagingRows: [{ packageType: 'BAG', quantity: 2, unitWeight: 1 }],
                }],
            }, { userId: applicant.id }));
            expect(harvest).toMatchObject({ status: 201, body: { success: true } });
            expect(await certificateOfCycle(openCycle.id)).toBe(renewal.id);
            const newLot = harvest.body.data.batches[0].lots[0];
            const res = await request(app).get(`/api/trace/lot/${newLot.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate).toMatchObject({ reference: renewal.certificateNumber, isValid: true });
        }, 120000);

        test('a closed cycle keeps the certificate it was harvested under', async () => {
            const batch = await prisma.harvestBatch.findFirst({ where: { lots: { some: { id: closedLot.id } } }, select: { cycleId: true } });
            expect(await certificateOfCycle(batch.cycleId)).toBe(old.id);
        });

        test('an open cycle on a plot outside the renewal\'s scope stays on the old certificate', async () => {
            expect(await certificateOfCycle(outOfScopeCycle.id)).toBe(old.id);
        });

        test('harvesting the cycle left on the old certificate says why and what to do, in Thai (LOW-A)', async () => {
            const { createHarvestBatches } = require('../../services/planting-cycle-service');
            const res = await runWithTenantContext({ organizationId: orgId }, () => createHarvestBatches(outOfScopeCycle.id, {
                harvestDate: new Date().toISOString(),
                plotHarvests: [{
                    cyclePlotId: outOfScopeCycle.cyclePlotId, freshWeightKg: 5,
                    packagingRows: [{ packageType: 'BAG', quantity: 2, unitWeight: 1 }],
                }],
            }, { userId: applicant.id }));
            expect({ status: res.status, body: res.body }).toMatchObject({
                status: 400,
                body: { code: 'HARVEST_CERTIFICATE_RENEWED', message: expect.stringMatching(/ต่ออายุแล้ว.*ขอบเขต.*ยื่นคำขอ/) },
            });
        }, 60000);
    });

    async function lapsedThenRenewed() {
        const old = await inForce();
        await prisma.certificate.update({
            where: { id: old.id },
            data: { issuedDate: daysFromNow(-400), expiryDate: daysFromNow(-20), status: 'expired' },
        });
        const cycle = await openCycleOn(old, 'OUTDOOR');
        const renewal = await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
        return { old: await prisma.certificate.findUnique({ where: { id: old.id } }), renewal, cycle };
    }

    describe('order 126: a harvest binds only to a certificate in force on its harvest date (HIGH-1)', () => {
        const GAP_DAY = daysFromNow(-10).toISOString();
        const harvestBy = (cycle, harvestDate) => runWithTenantContext({ organizationId: orgId }, () => {
            const { createHarvestBatches } = require('../../services/planting-cycle-service');
            return createHarvestBatches(cycle.id, {
                harvestDate,
                plotHarvests: [{
                    cyclePlotId: cycle.cyclePlotId, freshWeightKg: 5,
                    packagingRows: [{ packageType: 'BAG', quantity: 2, unitWeight: 1 }],
                }],
            }, { userId: applicant.id });
        });
        const token = () => require('../../config/jwt-security').generateToken(
            { id: applicant.id, userId: applicant.id, role: 'health', canonicalRole: 'health' }, 'public',
        );
        const batchesOf = (cycleId) => prisma.harvestBatch.count({ where: { cycleId } });
        const outsideTerm = (res) => expect({ status: res.status, body: res.body }).toMatchObject({
            status: 400,
            body: { code: 'HARVEST_DATE_OUTSIDE_CERTIFICATE', message: expect.stringMatching(/วันเก็บเกี่ยว/) },
        });

        test('a harvest dated in the gap after the renewal is refused and nothing is bound to the new certificate', async () => {
            const { renewal, cycle } = await lapsedThenRenewed();
            expect((await prisma.plantingCycle.findUnique({ where: { id: cycle.id } })).certificateId).toBe(renewal.id);
            const res = await harvestBy(cycle, GAP_DAY);
            outsideTerm(res);
            expect(await batchesOf(cycle.id)).toBe(0);
            expect((await prisma.plantingCycle.findUnique({ where: { id: cycle.id } })).status).toBe('GROWING');
        }, 180000);

        test('a harvest dated before the certificate was issued is refused', async () => {
            const current = await inForce();
            const cycle = await openCycleOn(current, 'OUTDOOR');
            const res = await harvestBy(cycle, daysFromNow(-5).toISOString());
            outsideTerm(res);
            expect(await batchesOf(cycle.id)).toBe(0);
        }, 180000);

        test('the legacy harvest door refuses a gap harvest the same way', async () => {
            const { cycle } = await lapsedThenRenewed();
            const res = await request(app).post(`/api/planting-cycles/${cycle.id}/harvest`)
                .set('Authorization', `Bearer ${token()}`)
                .send({ harvestDate: GAP_DAY, actualYield: 5 });
            outsideTerm(res);
            expect(await batchesOf(cycle.id)).toBe(0);
        }, 180000);

        test('the farm harvest-batch door refuses a gap harvest that names the cycle', async () => {
            const { cycle } = await lapsedThenRenewed();
            const res = await request(app).post('/api/harvest-batches')
                .set('Authorization', `Bearer ${token()}`)
                .send({ farmId: cycle.farmId, cycleId: cycle.id, harvestDate: GAP_DAY, freshWeight: 5, plantCode: 'CAN' });
            outsideTerm(res);
            expect(await batchesOf(cycle.id)).toBe(0);
        }, 180000);
    });

    describe('order 126: the lot doors judge a lot by its harvest date, not by the scan date', () => {
        let old;
        let renewal;
        let gapLot;
        let oldLot;

        beforeAll(async () => {
            ({ old, renewal } = await lapsedThenRenewed());
            gapLot = await lotUnder(renewal, daysFromNow(-10));
            oldLot = await lotUnder(old, daysFromNow(-100));
        }, 180000);

        const batchQr = async (lot) => (await prisma.harvestBatch.findUnique({ where: { id: lot.batchId } })).qrCode;
        const notCertified = { isValid: false, producedInForce: false };

        test('the lot door: a lot harvested in the gap is not shown as certified under the renewal', async () => {
            const res = await request(app).get(`/api/trace/lot/${gapLot.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate).toMatchObject({ reference: renewal.certificateNumber, ...notCertified });
        });

        test('the batch door: the same', async () => {
            const res = await request(app).get(`/api/trace/batch/${gapLot.batchId}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate).toMatchObject({ reference: renewal.certificateNumber, ...notCertified });
        });

        test('the generic door, lot QR and batch QR: the same', async () => {
            const byLot = await request(app).get(`/api/trace/${gapLot.qrCode}`);
            expect(byLot.status).toBe(200);
            expect(byLot.body.data.certificate).toMatchObject({ number: renewal.certificateNumber, ...notCertified });
            const byBatch = await request(app).get(`/api/trace/${await batchQr(gapLot)}`);
            expect(byBatch.status).toBe(200);
            expect(byBatch.body.data.certificate).toMatchObject({ number: renewal.certificateNumber, ...notCertified });
        });

        test('the partner door does not call a gap lot\'s certificate active (LOW 3)', async () => {
            const { resolveScannedCode } = require('../../routes/api/interoperability/interoperability-resolve');
            const { result } = await resolveScannedCode(gapLot.lotNumber);
            expect(result.provenance).toMatchObject({
                certificateNumber: renewal.certificateNumber, certificateStatus: 'outside_validity', producedInForce: false,
            });
            const { result: batch } = await resolveScannedCode(gapLot.batchId);
            expect(batch.provenance).toMatchObject({
                certificateNumber: renewal.certificateNumber, certificateStatus: 'outside_validity', producedInForce: false,
            });
        });

        const lapsedPointer = () => ({
            successorCertificateNumber: renewal.certificateNumber,
            verifyUrl: renewal.qrData,
            successorIssuedDate: new Date(renewal.issuedDate).toISOString(),
            lapsedBeforeRenewal: true,
            expiredOn: new Date(old.expiryDate).toISOString(),
        });

        test('order 126(b): the old certificate expired before its renewal, and its verify page says when and from when the new one holds', async () => {
            const res = await request(app).get(`/api/v1/public/verify/${slug(old.certificateNumber)}`);
            expect(res.body.data.reasonCode).toBe('EXPIRED');
            expect(res.body.data.renewal).toEqual(lapsedPointer());
        });

        test('order 126(b): the lot and generic doors carry the same lapse', async () => {
            const lotDoor = await request(app).get(`/api/trace/lot/${oldLot.id}`);
            expect(lotDoor.body.data.certificate.renewal).toEqual(lapsedPointer());
            const generic = await request(app).get(`/api/trace/${oldLot.qrCode}`);
            expect(generic.body.data.certificate.renewal).toEqual(lapsedPointer());
        });

        test('a lot harvested while the old certificate was in force says so on every door', async () => {
            const lotDoor = await request(app).get(`/api/trace/lot/${oldLot.id}`);
            expect(lotDoor.body.data.certificate).toMatchObject({ reference: old.certificateNumber, isValid: false, producedInForce: true });
            const generic = await request(app).get(`/api/trace/${oldLot.qrCode}`);
            expect(generic.body.data.certificate).toMatchObject({ number: old.certificateNumber, isValid: false, producedInForce: true });
        });

        test('a lot harvested under a certificate in force today is certified', async () => {
            const current = await lotUnder(renewal);
            const res = await request(app).get(`/api/trace/lot/${current.id}`);
            expect(res.body.data.certificate).toMatchObject({ isValid: true, producedInForce: true });
        }, 60000);
    });

    describe('after a renewal, the old certificate is never shown as valid, and goods made under it keep their provenance', () => {
        let old;
        let renewal;
        let lot;

        beforeAll(async () => {
            old = await inForce();
            lot = await lotUnder(old);
            renewal = await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
        }, 180000);

        test('GET /api/v1/public/verify: RENEWED, with the new number and its verify link', async () => {
            const res = await request(app).get(`/api/v1/public/verify/${slug(old.certificateNumber)}`);
            expect(res.status).toBe(200);
            expect(res.body.verified).toBe(false);
            expect(res.body.data.status).toBe('renewed');
            expect(res.body.data.reasonCode).toBe('RENEWED');
            expect(res.body.data.certificate).toBeNull();
            expect(res.body.data.renewal).toEqual(renewalBlock());
        });

        const renewalBlock = () => ({
            successorCertificateNumber: renewal.certificateNumber,
            verifyUrl: renewal.qrData,
            successorIssuedDate: new Date(renewal.issuedDate).toISOString(),
            lapsedBeforeRenewal: false,
            expiredOn: null,
        });

        test('the lot door: 200 with the provenance, the old certificate not valid, and the renewal named', async () => {
            const res = await request(app).get(`/api/trace/lot/${lot.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ lotNumber: lot.lotNumber });
            expect(res.body.data.harvestDate).toEqual(expect.any(String));
            expect(res.body.data.farm).not.toBeNull();
            expect(res.body.data.certificate).toMatchObject({
                reference: old.certificateNumber, isValid: false, renewal: renewalBlock(),
            });
        });

        test('the batch door: 200 with the renewal named', async () => {
            const res = await request(app).get(`/api/trace/batch/${lot.batchId}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate).toMatchObject({
                reference: old.certificateNumber, isValid: false, renewal: renewalBlock(),
            });
        });

        test('the generic door, lot QR: 200 with the provenance and the renewal named', async () => {
            const res = await request(app).get(`/api/trace/${lot.qrCode}`);
            expect(res.status).toBe(200);
            expect(res.body.data.lot).toMatchObject({ lotNumber: lot.lotNumber });
            expect(res.body.data.farm).not.toBeNull();
            expect(res.body.data.certificate).toMatchObject({
                number: old.certificateNumber, isValid: false, renewal: renewalBlock(),
            });
        });

        test('a certificate in force carries renewal null on the lot door', async () => {
            const current = await lotUnder(renewal);
            const res = await request(app).get(`/api/trace/lot/${current.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate).toMatchObject({ reference: renewal.certificateNumber, isValid: true, renewal: null });
        }, 60000);

        test('the new certificate verifies as valid', async () => {
            const res = await request(app).get(`/api/v1/public/verify/${slug(renewal.certificateNumber)}`);
            expect(res.body.verified).toBe(true);
            expect(res.body.data.renewal).toBeNull();
        });

        test('the renewal reminder selects the new certificate in its window, never the old one', async () => {
            const oldWindow = new Date(new Date(old.expiryDate).getTime() - 45 * DAY_MS);
            const selected = await renewalService.getApplicationsForRenewalReminder({ daysBeforeExpiry: 60, now: oldWindow, take: 5000, prisma });
            expect(selected.map((row) => row.id)).not.toContain(old.id);
            const newWindow = new Date(new Date(renewal.expiryDate).getTime() - 45 * DAY_MS);
            const later = await renewalService.getApplicationsForRenewalReminder({ daysBeforeExpiry: 60, now: newWindow, take: 5000, prisma });
            expect(later.map((row) => row.id)).toContain(renewal.id);
        });
    });
    describe('MEDIUM-1: a lot harvested under the old certificate keeps it after its open cycle moves to the renewal', () => {
        const token = () => require('../../config/jwt-security').generateToken(
            { id: applicant.id, userId: applicant.id, role: 'health', canonicalRole: 'health' }, 'public',
        );
        const harvestOnCycle = (cycle, harvestDate) => request(app).post('/api/harvest-batches')
            .set('Authorization', `Bearer ${token()}`)
            .send({ farmId: cycle.farmId, cycleId: cycle.id, harvestDate, freshWeight: 5, plantCode: 'CAN' });
        const packLot = async (batchId) => {
            const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            return prisma.lot.create({
                data: {
                    batchId, organizationId: orgId, lotNumber: `LOT-M1-${tag}`, packageType: 'BAG',
                    quantity: 1, unitWeight: 1, totalWeight: 1, qrCode: `qr-m1-${tag}`, status: 'PACKAGED',
                },
            });
        };
        const batchQr = async (lot) => (await prisma.harvestBatch.findUnique({ where: { id: lot.batchId } })).qrCode;
        const resolvePartner = (code) => require('../../routes/api/interoperability/interoperability-resolve').resolveScannedCode(code);

        let old;
        let renewal;
        let cycle;
        let lot;
        let before;

        beforeAll(async () => {
            old = await inForce();
            await prisma.certificate.update({
                where: { id: old.id },
                data: { issuedDate: daysFromNow(-400), expiryDate: daysFromNow(300) },
            });
            cycle = await openCycleOn(old, 'OUTDOOR');
            const harvested = await harvestOnCycle(cycle, daysFromNow(-20).toISOString());
            expect(harvested.status).toBe(201);
            lot = await packLot(harvested.body.data.id);
            before = (await request(app).get(`/api/trace/lot/${lot.id}`)).body.data.certificate;
            renewal = await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
        }, 180000);

        const underOld = () => ({
            isValid: false,
            producedInForce: true,
            renewal: expect.objectContaining({ successorCertificateNumber: renewal.certificateNumber, lapsedBeforeRenewal: false }),
        });

        test('before the renewal the lot is certified under the old certificate, and the open cycle then moves', async () => {
            expect(before).toMatchObject({ reference: old.certificateNumber, isValid: true, producedInForce: true });
            expect((await prisma.plantingCycle.findUnique({ where: { id: cycle.id } })).certificateId).toBe(renewal.id);
        });

        test('the lot door: produced in force under the old certificate, the renewal linked', async () => {
            const res = await request(app).get(`/api/trace/lot/${lot.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate).toMatchObject({ reference: old.certificateNumber, ...underOld() });
        });

        test('the batch door: the same', async () => {
            const res = await request(app).get(`/api/trace/batch/${lot.batchId}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate).toMatchObject({ reference: old.certificateNumber, ...underOld() });
        });

        test('the generic door, lot QR and batch QR: the same', async () => {
            const byLot = await request(app).get(`/api/trace/${lot.qrCode}`);
            expect(byLot.status).toBe(200);
            expect(byLot.body.data.certificate).toMatchObject({ number: old.certificateNumber, ...underOld() });
            const byBatch = await request(app).get(`/api/trace/${await batchQr(lot)}`);
            expect(byBatch.status).toBe(200);
            expect(byBatch.body.data.certificate).toMatchObject({ number: old.certificateNumber, ...underOld() });
        });

        test('a later harvest on the moved cycle, dated while the old certificate was in force, is produced under the old certificate', async () => {
            const res = await harvestOnCycle(cycle, daysFromNow(-19).toISOString());
            expect(res.status).toBe(201);
            const later = await packLot(res.body.data.id);
            const lotDoor = await request(app).get(`/api/trace/lot/${later.id}`);
            expect(lotDoor.body.data.certificate).toMatchObject({ reference: old.certificateNumber, ...underOld() });
        }, 60000);

        test('a harvest on the moved cycle dated today is certified under the renewal', async () => {
            const res = await harvestOnCycle(cycle, new Date().toISOString());
            expect(res.status).toBe(201);
            const today = await packLot(res.body.data.id);
            const lotDoor = await request(app).get(`/api/trace/lot/${today.id}`);
            expect(lotDoor.body.data.certificate).toMatchObject({ reference: renewal.certificateNumber, isValid: true, producedInForce: true, renewal: null });
        }, 60000);

        test('the partner door names the certificate the lot was produced under, with the same in-force answer (LOW 3)', async () => {
            const { result } = await resolvePartner(lot.lotNumber);
            expect(result.provenance).toMatchObject({
                certificateNumber: old.certificateNumber, certificateStatus: 'renewed', producedInForce: true,
            });
            const { result: batch } = await resolvePartner(lot.batchId);
            expect(batch.provenance).toMatchObject({
                certificateNumber: old.certificateNumber, certificateStatus: 'renewed', producedInForce: true,
            });
        });
    });

    describe('LOW 2: editing a batch or recording its harvest checks the harvest date like the create doors', () => {
        const GAP_DAY = daysFromNow(-10).toISOString();
        const token = () => require('../../config/jwt-security').generateToken(
            { id: applicant.id, userId: applicant.id, role: 'health', canonicalRole: 'health' }, 'public',
        );
        const outsideTerm = (res) => expect({ status: res.status, body: res.body }).toMatchObject({
            status: 400,
            body: { code: 'HARVEST_DATE_OUTSIDE_CERTIFICATE', message: expect.stringMatching(/วันเก็บเกี่ยว/) },
        });
        const growingBatchOn = async (cycle) => {
            const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            return prisma.harvestBatch.create({
                data: {
                    farmId: cycle.farmId, cycleId: cycle.id, organizationId: orgId, batchNumber: `HB-L2-${tag}`, qrCode: `qr-b-l2-${tag}`,
                    harvestDate: new Date(), freshWeight: 5, plantCode: 'CAN', status: 'GROWING',
                },
            });
        };

        test('PUT /harvest-batches/:id refuses a gap harvest date and keeps the stored one', async () => {
            const { cycle } = await lapsedThenRenewed();
            const batch = await growingBatchOn(cycle);
            const res = await request(app).put(`/api/harvest-batches/${batch.id}`)
                .set('Authorization', `Bearer ${token()}`)
                .send({ harvestDate: GAP_DAY });
            outsideTerm(res);
            expect((await prisma.harvestBatch.findUnique({ where: { id: batch.id } })).harvestDate).toEqual(batch.harvestDate);
        }, 180000);

        test('POST /harvest-batches/:id/harvest refuses a gap harvest date and the batch stays growing', async () => {
            const { cycle } = await lapsedThenRenewed();
            const batch = await growingBatchOn(cycle);
            const res = await request(app).post(`/api/harvest-batches/${batch.id}/harvest`)
                .set('Authorization', `Bearer ${token()}`)
                .send({ harvestDate: GAP_DAY, actualYield: 5 });
            outsideTerm(res);
            expect((await prisma.harvestBatch.findUnique({ where: { id: batch.id } })).status).toBe('GROWING');
        }, 180000);

        test('both doors still accept a harvest date the certificate covers', async () => {
            const { cycle } = await lapsedThenRenewed();
            const batch = await growingBatchOn(cycle);
            const today = new Date().toISOString();
            const put = await request(app).put(`/api/harvest-batches/${batch.id}`)
                .set('Authorization', `Bearer ${token()}`)
                .send({ harvestDate: today });
            expect(put.status).toBe(200);
            const harvested = await request(app).post(`/api/harvest-batches/${batch.id}/harvest`)
                .set('Authorization', `Bearer ${token()}`)
                .send({ harvestDate: today, actualYield: 5 });
            expect(harvested.status).toBe(200);
        }, 180000);
    });

    const farmerToken = () => require('../../config/jwt-security').generateToken(
        { id: applicant.id, userId: applicant.id, role: 'health', canonicalRole: 'health' }, 'public',
    );
    const asFarmer = (req) => req.set('Authorization', `Bearer ${farmerToken()}`);
    const tagged = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const growingBatchOn = (cycle) => {
        const tag = tagged();
        return prisma.harvestBatch.create({
            data: {
                farmId: cycle.farmId, cycleId: cycle.id, organizationId: orgId, batchNumber: `HB-F5-${tag}`, qrCode: `qr-b-f5-${tag}`,
                harvestDate: new Date(), freshWeight: 5, plantCode: 'CAN', status: 'GROWING',
            },
        });
    };
    const packLotOn = (batchId) => {
        const tag = tagged();
        return prisma.lot.create({
            data: {
                batchId, organizationId: orgId, lotNumber: `LOT-F5-${tag}`, packageType: 'BAG',
                quantity: 1, unitWeight: 1, totalWeight: 1, qrCode: `qr-f5-${tag}`, status: 'PACKAGED',
            },
        });
    };
    const harvestOnCycleDoor = (cycle, harvestDate) => asFarmer(request(app).post('/api/harvest-batches'))
        .send({ farmId: cycle.farmId, cycleId: cycle.id, harvestDate, freshWeight: 5, plantCode: 'CAN' });
    async function longInForce() {
        const certificate = await inForce();
        return prisma.certificate.update({
            where: { id: certificate.id },
            data: { issuedDate: daysFromNow(-400), expiryDate: daysFromNow(300) },
        });
    }
    const batchQrOf = async (lot) => (await prisma.harvestBatch.findUnique({ where: { id: lot.batchId } })).qrCode;
    const partnerResolve = (code) => require('../../routes/api/interoperability/interoperability-resolve').resolveScannedCode(code);

    describe('MEDIUM-2: a lot produced under a predecessor that was later revoked or suspended answers 410 on every door', () => {
        async function lotUnderPredecessorThen(change) {
            const old = await longInForce();
            const cycle = await openCycleOn(old, 'OUTDOOR');
            const harvested = await harvestOnCycleDoor(cycle, daysFromNow(-20).toISOString());
            expect(harvested.status).toBe(201);
            const lot = await packLotOn(harvested.body.data.id);
            await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
            await prisma.certificate.update({ where: { id: old.id }, data: change });
            return { old, lot };
        }

        describe.each([
            ['revoked', () => ({ status: 'revoked', revokedAt: new Date() })],
            ['suspended', () => ({ status: 'suspended', suspendedAt: new Date() })],
        ])('the predecessor is %s after the renewal', (status, change) => {
            let old;
            let lot;

            beforeAll(async () => {
                ({ old, lot } = await lotUnderPredecessorThen(change()));
            }, 240000);

            const gone = (res, type) => {
                expect(res.status).toBe(410);
                expect(res.body).toMatchObject({
                    success: false, type,
                    verification: { valid: false, reason: `certificate_${status}` },
                    certificate: { reference: old.certificateNumber, status },
                });
                expect(res.body.data).toBeUndefined();
            };

            test('the lot door', async () => gone(await request(app).get(`/api/trace/lot/${lot.id}`), 'LOT'));
            test('the batch door', async () => gone(await request(app).get(`/api/trace/batch/${lot.batchId}`), 'HARVEST_BATCH'));
            test('the generic door, lot QR', async () => gone(await request(app).get(`/api/trace/${lot.qrCode}`), 'LOT'));
            test('the generic door, batch QR', async () => gone(await request(app).get(`/api/trace/${await batchQrOf(lot)}`), 'HARVEST_BATCH'));

            test('the partner door names the certificate, says its status, and does not call the lot in force', async () => {
                const plain = { certificateNumber: old.certificateNumber, certificateStatus: status, producedInForce: false };
                expect((await partnerResolve(lot.lotNumber)).result.provenance).toMatchObject(plain);
                expect((await partnerResolve(lot.batchId)).result.provenance).toMatchObject(plain);
            });
        });
    });

    describe('LOW (L1) + MEDIUM-A: the batch QR reads lab_analysis from the certificate it shows; the lot QR reads only its batch COA', () => {
        let lot;
        let old;

        beforeAll(async () => {
            old = await longInForce();
            const cycle = await openCycleOn(old, 'OUTDOOR');
            const harvested = await harvestOnCycleDoor(cycle, daysFromNow(-20).toISOString());
            expect(harvested.status).toBe(201);
            lot = await packLotOn(harvested.body.data.id);
            const renewal = await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
            await prisma.application.update({
                where: { id: old.applicationId }, data: { labResults: { thc: 'reported' }, labName: 'ห้องแล็บของใบเดิม' },
            });
            await prisma.application.update({
                where: { id: renewal.applicationId }, data: { labResults: { thc: 'reported' }, labName: 'ห้องแล็บของใบใหม่' },
            });
        }, 240000);

        test('batch QR: the old certificate and its lab', async () => {
            const res = await request(app).get(`/api/trace/${await batchQrOf(lot)}`);
            expect(res.status).toBe(200);
            expect(res.body.data.lab_analysis).toEqual({ tested: true, labName: 'ห้องแล็บของใบเดิม' });
        });

        test('lot QR: a bag without its batch COA never reads as tested from the certificate application', async () => {
            const res = await request(app).get(`/api/trace/${lot.qrCode}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate.number).toBe(old.certificateNumber);
            expect(res.body.data).not.toHaveProperty('lab_analysis');
            expect(res.body.data.lot.labTest.lot.tested).toBe(false);
        });

        test('lot QR on a certificate that was never renewed: the same', async () => {
            const plain = await longInForce();
            const harvested = await harvestOnCycleDoor(await openCycleOn(plain, 'OUTDOOR'), daysFromNow(-20).toISOString());
            expect(harvested.status).toBe(201);
            const plainLot = await packLotOn(harvested.body.data.id);
            await prisma.application.update({
                where: { id: plain.applicationId }, data: { labResults: { thc: 'reported' }, labName: 'ห้องแล็บของคำขอ' },
            });
            const res = await request(app).get(`/api/trace/${plainLot.qrCode}`);
            expect(res.status).toBe(200);
            expect(res.body.data.certificate.number).toBe(plain.certificateNumber);
            expect(res.body.data).not.toHaveProperty('lab_analysis');
            expect(res.body.data.lot.labTest.lot.tested).toBe(false);
        }, 240000);
    });

    describe('order 129(5): the harvest date every write door accepts', () => {
        const outcome = (res) => ({ status: res.status, code: res.body?.code });
        const writeDoors = {
            'POST /harvest-batches': (cycle, harvestDate) => harvestOnCycleDoor(cycle, harvestDate),
            'POST /planting-cycles/:id/harvest-batches': (cycle, harvestDate) => runWithTenantContext({ organizationId: orgId }, () => {
                const { createHarvestBatches } = require('../../services/planting-cycle-service');
                return createHarvestBatches(cycle.id, {
                    harvestDate,
                    plotHarvests: [{ cyclePlotId: cycle.cyclePlotId, freshWeightKg: 5, packagingRows: [{ packageType: 'BAG', quantity: 1, unitWeight: 1 }] }],
                }, { userId: applicant.id });
            }),
            'POST /planting-cycles/:id/harvest': (cycle, harvestDate) => asFarmer(request(app).post(`/api/planting-cycles/${cycle.id}/harvest`))
                .send({ harvestDate, actualYield: 5 }),
            'PUT /harvest-batches/:id': async (cycle, harvestDate) => asFarmer(request(app).put(`/api/harvest-batches/${(await growingBatchOn(cycle)).id}`))
                .send({ harvestDate }),
            'POST /harvest-batches/:id/harvest': async (cycle, harvestDate) => asFarmer(request(app).post(`/api/harvest-batches/${(await growingBatchOn(cycle)).id}/harvest`))
                .send({ harvestDate, actualYield: 5 }),
        };

        let certificate;
        const moved = {};

        beforeAll(async () => {
            certificate = await longInForce();
            const old = await longInForce();
            for (const door of Object.keys(writeDoors)) {
                moved[door] = { late: await openCycleOn(old, 'OUTDOOR'), onTime: await openCycleOn(old, 'OUTDOOR') };
            }
            await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
        }, 240000);

        describe.each(Object.keys(writeDoors))('%s', (door) => {
            const write = (cycle, harvestDate) => writeDoors[door](cycle, harvestDate);

            test('(b) a harvest date after today (Bangkok) is refused', async () => {
                const cycle = await openCycleOn(certificate, 'OUTDOOR');
                expect(outcome(await write(cycle, daysFromNow(1).toISOString()))).toEqual({ status: 400, code: 'HARVEST_DATE_IN_FUTURE' });
            }, 60000);

            test('order 130: a harvest recorded 45 days after its date, on a cycle still on its own certificate, is accepted', async () => {
                const cycle = await openCycleOn(certificate, 'OUTDOOR');
                const res = await write(cycle, daysFromNow(-45).toISOString());
                expect(res.status).toBeGreaterThanOrEqual(200);
                expect(res.status).toBeLessThan(300);
            }, 60000);

            test('order 130: a backdated harvest attached to the previous certificate 31 days after its date is refused', async () => {
                const res = await write(moved[door].late, daysFromNow(-31).toISOString());
                expect({ status: res.status, body: res.body }).toMatchObject({
                    status: 400,
                    body: { code: 'HARVEST_BACKDATED_TOO_LATE', message: expect.stringMatching(/ใบรับรองฉบับก่อน/) },
                });
            }, 60000);

            test('order 130: a backdated harvest attached to the previous certificate 30 days after its date is accepted and marked', async () => {
                const res = await write(moved[door].onTime, daysFromNow(-30).toISOString());
                expect(res.status).toBeGreaterThanOrEqual(200);
                expect(res.status).toBeLessThan(300);
                const batches = await prisma.harvestBatch.findMany({ where: { cycleId: moved[door].onTime.id, backdatedCertificateId: { not: null } } });
                expect(batches).toHaveLength(1);
            }, 60000);

            test('(5a) a harvest dated before the cycle was planted is refused', async () => {
                const cycle = await openCycleOn(certificate, 'OUTDOOR', { startDate: daysFromNow(-5) });
                expect(outcome(await write(cycle, daysFromNow(-10).toISOString()))).toEqual({ status: 400, code: 'HARVEST_DATE_BEFORE_PLANTING' });
            }, 60000);
        });

        test('a batch without a cycle refuses a future date and has no 30-day limit', async () => {
            const send = (harvestDate) => asFarmer(request(app).post('/api/harvest-batches'))
                .send({ farmId: certificate.farmId, harvestDate, freshWeight: 5, plantCode: 'CAN' });
            expect(outcome(await send(daysFromNow(1).toISOString()))).toEqual({ status: 400, code: 'HARVEST_DATE_IN_FUTURE' });
            expect((await send(daysFromNow(-45).toISOString())).status).toBe(201);
        }, 60000);
    });

    describe('order 129(5)(b): a harvest recorded on a moved cycle but attached to the old certificate is marked บันทึกย้อนหลัง', () => {
        let old;
        let cycle;
        let backdated;
        let current;

        const staffCycleDetail = async (cycleId) => {
            const handler = require('../../routes/api/provider/handlers/planting').providerPlantingCycleDetail.at(-1);
            const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
            await runWithTenantContext({ organizationId: orgId }, () => handler({ params: { id: cycleId } }, res));
            return res.body.data;
        };
        const adminCycleDetail = async (cycleId) => {
            const layer = require('../../routes/api/admin/planting').stack.find((l) => l.route?.path === '/:id' && l.route.methods.get);
            const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
            await runWithTenantContext({ organizationId: orgId }, () => layer.route.stack.at(-1).handle({ params: { id: cycleId } }, res));
            return res.body.data;
        };

        beforeAll(async () => {
            old = await longInForce();
            cycle = await openCycleOn(old, 'OUTDOOR');
            const before = await harvestOnCycleDoor(cycle, daysFromNow(-25).toISOString());
            expect(before.status).toBe(201);
            await issueOnBareClient(await passedApplication({ renewalOf: old.id }));
            backdated = await harvestOnCycleDoor(cycle, daysFromNow(-10).toISOString());
            current = await harvestOnCycleDoor(cycle, new Date().toISOString());
            expect([backdated.status, current.status]).toEqual([201, 201]);
        }, 240000);

        test('staff see the backdated batch, its harvest date and the old certificate it attached to', async () => {
            for (const detail of [await staffCycleDetail(cycle.id), await adminCycleDetail(cycle.id)]) {
                expect(detail.backdatedBatches).toEqual([{
                    batchNumber: backdated.body.data.batchNumber,
                    harvestDate: expect.any(Date),
                    certificateNumber: old.certificateNumber,
                }]);
            }
        });

        test('a harvest recorded before the move and one under the renewal carry no mark', async () => {
            const detail = await staffCycleDetail(cycle.id);
            expect(detail.backdatedBatches.map((b) => b.batchNumber)).not.toContain(current.body.data.batchNumber);
            expect(detail.backdatedBatches).toHaveLength(1);
        });

        test('the other create doors and the two edit doors mark it too', async () => {
            const marked = async (cycleId) => (await staffCycleDetail(cycleId)).backdatedBatches.length;
            const fresh = async () => {
                const c = await longInForce();
                const moved = await openCycleOn(c, 'OUTDOOR');
                await issueOnBareClient(await passedApplication({ renewalOf: c.id }));
                return moved;
            };
            const perPlot = await fresh();
            await runWithTenantContext({ organizationId: orgId }, () => require('../../services/planting-cycle-service').createHarvestBatches(perPlot.id, {
                harvestDate: daysFromNow(-10).toISOString(),
                plotHarvests: [{ cyclePlotId: perPlot.cyclePlotId, freshWeightKg: 5, packagingRows: [{ packageType: 'BAG', quantity: 1, unitWeight: 1 }] }],
            }, { userId: applicant.id }));
            const legacy = await fresh();
            await asFarmer(request(app).post(`/api/planting-cycles/${legacy.id}/harvest`)).send({ harvestDate: daysFromNow(-10).toISOString(), actualYield: 5 });
            const edited = await fresh();
            await asFarmer(request(app).put(`/api/harvest-batches/${(await growingBatchOn(edited)).id}`)).send({ harvestDate: daysFromNow(-10).toISOString() });
            const recorded = await fresh();
            await asFarmer(request(app).post(`/api/harvest-batches/${(await growingBatchOn(recorded)).id}/harvest`))
                .send({ harvestDate: daysFromNow(-10).toISOString(), actualYield: 5 });
            expect([await marked(perPlot.id), await marked(legacy.id), await marked(edited.id), await marked(recorded.id)]).toEqual([1, 1, 1, 1]);
        }, 600000);

        test('the public doors never carry the mark', async () => {
            const lot = await packLotOn(backdated.body.data.id);
            for (const path of [`/api/trace/lot/${lot.id}`, `/api/trace/batch/${lot.batchId}`, `/api/trace/${lot.qrCode}`, `/api/trace/${await batchQrOf(lot)}`]) {
                const res = await request(app).get(path);
                expect(res.status).toBe(200);
                expect(JSON.stringify(res.body)).not.toMatch(/backdated|ย้อนหลัง/i);
            }
        });
    });
});
