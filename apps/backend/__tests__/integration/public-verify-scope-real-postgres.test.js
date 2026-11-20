'use strict';

/**
 * Operator order 68(1) on real Postgres through the real server: issuance records each
 * certificate's own scope, and the public doors read it from there, never from the application.
 * Certificates are minted by certificate-service.generateCertificate with full onsite evidence,
 * the way redesign-p0-real-postgres.test.js mints them.
 */

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const { completeHolderEntity } = require('../../test-support/complete-holder');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { phaseBApplicationData, phaseBWizardAnswers } = require('../../test-support/phase-b-application-seed');
const { generatePlotCode } = require('../../shared/plot-code');

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

const ISSUER_SENTENCE =
    'ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ';
const COMPANY = 'บริษัท ขอบเขตทดสอบ จำกัด';
const TYPES = [['OUTDOOR', 'ปลูกกลางแจ้ง'], ['GREENHOUSE', 'ปลูกในโรงเรือน'], ['INDOOR', 'ปลูกในอาคาร']];
/** A certificate no longer in force: the row change that makes it so, and the public reason code. */
const LAPSED = [
    ['suspended', () => ({ status: 'suspended', suspendedAt: new Date(), suspendedBy: 'o68-test', suspendedReason: 'test' }), 'SUSPENDED'],
    ['revoked', () => ({ status: 'revoked', revokedAt: new Date(), revokedBy: 'o68-test', revokedReason: 'test' }), 'REVOKED'],
    ['expired', () => ({ expiryDate: new Date(Date.now() - 24 * 3600e3) }), 'EXPIRED'],
];

const { toCertificateSlug: slug } = require('../../services/certificate-number-display');

d('order 68(1) on real Postgres: issuance records the scope, the public doors read it', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let prisma;
    let app;
    let certificateService;
    let auditOnsiteService;
    let orgId;
    let auditorId;
    let applicant;
    let companyId;
    let personId;
    const applicationIds = [];
    const auditIds = [];
    /** areaType → { certificate, auditId } for the company-held certificates in force */
    const inForce = {};

    beforeAll(async () => {
        prisma = new PrismaClient();
        await prisma.$connect();
        certificateService = require('../../services/certificate-service');
        auditOnsiteService = require('../../services/audit-onsite-service');
        app = require('../../server');
        await require('../../services/prisma-database').connect();
        if (!(await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } }))) {
            await prisma.plantSpecies.create({ data: { code: 'CAN', nameTH: 'กัญชา', nameEN: 'Cannabis' } });
        }
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        orgId = (await prisma.organization.create({
            data: { name: 'Order 68 scope org', slug: `o68-scope-${suffix}`, code: `O68_${suffix}`.toUpperCase().slice(0, 24) },
        })).id;
        auditorId = (await prisma.user.create({
            data: {
                canonicalId: `o68-auditor-${suffix}`, password: 'x', organizationId: orgId,
                authType: 'EMAIL_LEGACY', role: 'auditor', firstName: 'ผู้ตรวจ', lastName: 'ทดสอบ',
            },
        })).id;
        applicant = await prisma.user.create({
            data: {
                canonicalId: `o68-applicant-${suffix}`, password: 'x', organizationId: orgId,
                authType: 'EMAIL_LEGACY', role: 'health', firstName: 'สมชาย', lastName: 'ขอบเขต',
            },
        });
        companyId = (await prisma.entity.create({
            data: completeHolderEntity('JURISTIC', { displayName: COMPANY, organizationId: orgId, createdBy: applicant.id }),
        })).id;
        personId = (await prisma.entity.create({
            data: completeHolderEntity('INDIVIDUAL', { organizationId: orgId, createdBy: applicant.id }),
        })).id;
        for (const [areaType] of TYPES) {
            inForce[areaType] = await issue(areaType, { company: true });
        }
    }, 240000);

    afterAll(async () => {
        if (!prisma) { return; }
        const certificateIds = (await prisma.certificate.findMany({
            where: { applicationId: { in: applicationIds } }, select: { id: true },
        })).map((c) => c.id);
        await prisma.lot.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.harvestBatch.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plantingCycle.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.certificate.deleteMany({ where: { id: { in: certificateIds } } }).catch(() => {});
        await prisma.farmAuditPhoto.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        await prisma.farmAuditChecklistItem.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        await prisma.attachment.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plot.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.farm.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.auditChecklist.deleteMany({ where: { id: { in: auditIds } } }).catch(() => {});
        await prisma.application.deleteMany({ where: { id: { in: applicationIds } } }).catch(() => {});
        await prisma.entity.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
        await prisma.$disconnect();
    });

    /** One application of one cultivation type, as fan-out leaves it, passed with full onsite evidence. */
    async function issue(areaType, { company, farm = {} }) {
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const answers = phaseBWizardAnswers({
            farmData: { ...phaseBWizardAnswers().farmData, ...farm, areaTypes: [areaType] },
            purposes: ['RESEARCH', 'EXPORT', 'PROCESSING'],
            ...(company ? { applicantType: 'JURISTIC' } : {}),
        });
        const application = await prisma.application.create({
            data: phaseBApplicationData(
                { applicationNumber: `O68-${suffix}`, healthId: applicant.canonicalId, organizationId: orgId },
                {
                    status: 'AUDIT_PASSED', auditResult: 'PASS', areaType, formData: answers,
                    entityId: company ? companyId : personId,
                },
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
                auditId: audit.id, fileBuffer: Buffer.from(`o68-photo-${audit.id}-${i}`, 'utf8'),
                fileName: `o68-${i}.jpg`, gpsLat: 13.75 + i * 0.0001, gpsLng: 100.5 + i * 0.0001,
                capturedAt: new Date(), uploadedBy: auditorId, organizationId: orgId, prisma,
            });
        }
        const certificate = await certificateService.generateCertificate(application.id, auditorId, { prisma });
        return { certificate, auditId: audit.id };
    }

    /** A packaged lot from a harvest of a cycle that runs under this certificate, on its own farm. */
    async function lotUnder(certificate, areaType) {
        const species = await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } });
        const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const cycle = await prisma.plantingCycle.create({
            data: {
                farmId: certificate.farmId, plantSpeciesId: species.id, organizationId: orgId, cycleName: 'รอบทดสอบ',
                startDate: new Date('2026-01-01'), status: 'HARVESTED', cultivationType: areaType, certificateId: certificate.id,
            },
        });
        const batch = await prisma.harvestBatch.create({
            data: {
                farmId: certificate.farmId, cycleId: cycle.id, organizationId: orgId, batchNumber: `HB-O68-${tag}`,
                harvestDate: new Date(), freshWeight: 10, dryWeight: 3, plantCode: 'CAN', status: 'HARVESTED',
            },
        });
        return prisma.lot.create({
            data: {
                batchId: batch.id, organizationId: orgId, lotNumber: `LOT-O68-${tag}`, packageType: 'BAG',
                quantity: 1, unitWeight: 1, totalWeight: 1, qrCode: `qr-o68-${tag}`, status: 'PACKAGED',
            },
        });
    }

    const verify = (number) => request(app).get(`/api/v1/public/verify/${slug(number)}`);
    const scanLot = (lot) => request(app).get(`/api/trace/lot/${lot.id}`);

    describe('issuance', () => {
        test.each(TYPES)('%s: the certificate holds one active scope row of its type, proved by the decided audit', async (areaType) => {
            const { certificate, auditId } = inForce[areaType];
            const rows = await prisma.certificateScope.findMany({
                where: { certificateId: certificate.id },
                select: { areaType: true, status: true, auditId: true },
            });
            expect(rows).toEqual([{ areaType, status: 'active', auditId }]);
        });
    });

    describe('GET /api/v1/public/verify/:number', () => {
        test.each(TYPES)('%s in force: the scope line, the issuer sentence, the company, no person', async (areaType, labelTh) => {
            const { certificate } = inForce[areaType];
            const res = await verify(certificate.certificateNumber);
            expect(res.status).toBe(200);
            expect(res.body.verified).toBe(true);
            expect(res.body.data.certificate.scope).toEqual({
                crop: certificate.cropType,
                cultivationTypes: [{ code: areaType, labelTh }],
                standard: 'GACP Thailand',
            });
            expect(res.body.data.certificate.issuingAuthority).toBe(ISSUER_SENTENCE);
            expect(res.body.data.certificate.holderDisplayName).toBe(COMPANY);
            expect(res.body.data.certificate).not.toHaveProperty('applicantName');
            expect(res.text).not.toMatch(/สมชาย|RESEARCH|EXPORT|PROCESSING/);
        });

        test('a person-held certificate in force publishes no holder name at all', async () => {
            const { certificate } = await issue('OUTDOOR', { company: false });
            expect(certificate.holderType).toBe('INDIVIDUAL');
            const res = await verify(certificate.certificateNumber);
            expect(res.body.verified).toBe(true);
            expect(res.body.data.certificate.holderDisplayName).toBeNull();
            expect(res.text).not.toContain('สมชาย');
        }, 120000);

        test.each(LAPSED)('%s: no certificate block, so no scope, holder or issuer', async (_label, change, reasonCode) => {
            const { certificate } = await issue('INDOOR', { company: true });
            await prisma.certificate.update({ where: { id: certificate.id }, data: change() });
            const res = await verify(certificate.certificateNumber);
            expect(res.status).toBe(200);
            expect(res.body.verified).toBe(false);
            expect(res.body.data.reasonCode).toBe(reasonCode);
            expect(res.body.data.certificate).toBeNull();
            expect(res.text).not.toMatch(/ปลูก|บริษัท|สมชาย/);
        }, 120000);

        test('an unknown number: not found, nothing else', async () => {
            const res = await request(app).get('/api/v1/public/verify/TH-GACP-999999-2569');
            expect(res.status).toBe(200);
            expect(res.body.verified).toBe(false);
            expect(res.body.data.reasonCode).toBe('NOT_FOUND');
            expect(res.body.data).not.toHaveProperty('certificate');
        });
    });

    describe('GET /api/trace/lot/:id, the page a printed lot QR opens', () => {
        test.each(TYPES)('%s certificate in force: the same scope and issuer as the certificate-number door', async (areaType, labelTh) => {
            const { certificate } = inForce[areaType];
            const lot = await lotUnder(certificate, areaType);
            const [lotRes, certRes] = await Promise.all([scanLot(lot), verify(certificate.certificateNumber)]);
            expect(lotRes.status).toBe(200);
            expect(lotRes.body.data.certificate.isValid).toBe(true);
            expect(lotRes.body.data.certificate.scope.cultivationTypes).toEqual([{ code: areaType, labelTh }]);
            expect(lotRes.body.data.certificate.scope).toEqual(certRes.body.data.certificate.scope);
            expect(lotRes.body.data.certificate.issuingAuthority).toBe(ISSUER_SENTENCE);
            expect(lotRes.text).not.toMatch(/สมชาย|RESEARCH|EXPORT|PROCESSING/);
        });

        test.each(LAPSED)('%s certificate: today\'s 410 minimal body, which carries no scope', async (label, change) => {
            const { certificate } = await issue('OUTDOOR', { company: true });
            const lot = await lotUnder(certificate, 'OUTDOOR');
            await prisma.certificate.update({ where: { id: certificate.id }, data: change() });
            const res = await scanLot(lot);
            expect(res.status).toBe(410);
            expect(res.body).toEqual({
                success: false,
                type: 'LOT',
                verification: { valid: false, scannedAt: expect.any(String), reason: `certificate_${label}` },
                certificate: {
                    reference: certificate.certificateNumber,
                    status: label === 'expired' ? 'active' : label,
                    issuedDate: expect.any(String),
                    expiryDate: expect.any(String),
                },
                message: expect.any(String),
            });
            expect(res.text).not.toMatch(/ปลูก|บริษัท|สมชาย/);
        }, 120000);
    });

    // Review F4: the public doors dropped this legacy spelling while the planting gate read it as INDOOR.
    test('a scope row spelled INDOOR_CONTROLLED means INDOOR on the certificate door, the lot door and the planting gate', async () => {
        const { certificate } = await issue('INDOOR', { company: true, farm: { farmName: 'ไร่ขอบเขตคำสะกดเดิม', address: '7 หมู่ 2' } });
        await prisma.certificateScope.updateMany({ where: { certificateId: certificate.id }, data: { areaType: 'INDOOR_CONTROLLED' } });
        const lot = await lotUnder(certificate, 'INDOOR');
        const [certRes, lotRes] = await Promise.all([verify(certificate.certificateNumber), scanLot(lot)]);
        const indoor = [{ code: 'INDOOR', labelTh: 'ปลูกในอาคาร' }];
        expect(certRes.body.data.certificate.scope.cultivationTypes).toEqual(indoor);
        expect(lotRes.body.data.certificate.scope.cultivationTypes).toEqual(indoor);
        const { certifiedAreaTypes } = require('../../services/certified-scope');
        expect((await certifiedAreaTypes({ farmId: certificate.farmId, client: prisma })).areaTypes).toEqual(['INDOOR']);
    }, 120000);

    // Operator order 56(0): until the official arrangement is complete, a public answer names
    // the department only in the future-tense issuer sentence.
    test('the lot door, the batch door and every branch of the generic door name the department only in the future-tense issuer sentence', async () => {
        const { certificate } = inForce.OUTDOOR;
        const lot = await lotUnder(certificate, 'OUTDOOR');
        const species = await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } });
        const growing = await prisma.plantingCycle.create({
            data: {
                farmId: certificate.farmId, plantSpeciesId: species.id, organizationId: orgId, cycleName: 'รอบที่กำลังปลูก',
                startDate: new Date('2026-07-01'), status: 'GROWING', cultivationType: 'OUTDOOR', certificateId: certificate.id,
            },
        });
        const plot = () => prisma.plot.create({
            data: { farmId: certificate.farmId, organizationId: orgId, name: 'แปลงติดป้าย', area: 100, areaSqm: 100, plotCode: generatePlotCode() },
        });
        const [planted, dormant] = [await plot(), await plot()];
        await prisma.plantingCyclePlot.create({
            data: { cycleId: growing.id, plotId: planted.id, allocatedAreaSqm: 100, plannedPlantCount: 10, organizationId: orgId },
        });
        const doors = {
            'lot door': `/api/trace/lot/${lot.id}`,
            'batch door': `/api/trace/batch/${lot.batchId}`,
            'generic door, lot QR': `/api/trace/${lot.qrCode}`,
            'generic door, batch id': `/api/trace/${lot.batchId}`,
            'generic door, planting-cycle id': `/api/trace/${growing.id}`,
            'generic door, plot code': `/api/trace/${planted.plotCode}`,
            'generic door, plot code with no open cycle': `/api/trace/${dormant.plotCode}`,
        };
        const responses = Object.fromEntries(await Promise.all(
            Object.entries(doors).map(async ([door, url]) => [door, await request(app).get(url)]),
        ));
        expect(Object.fromEntries(Object.entries(responses).map(([door, res]) => [door, `${res.status} ${res.body.type}`]))).toEqual({
            'lot door': '200 PACKAGING_LOT',
            'batch door': '200 HARVEST_BATCH',
            'generic door, lot QR': '200 LOT',
            'generic door, batch id': '200 HARVEST_BATCH',
            'generic door, planting-cycle id': '200 PLANTING_CYCLE',
            'generic door, plot code': '200 PLOT_CYCLE',
            'generic door, plot code with no open cycle': '200 PLOT',
        });
        const department = /.{0,30}(?:\bDTAM\b|กรมการแพทย์แผนไทย|Department of Thai Traditional).{0,30}/;
        const naming = Object.entries(responses).flatMap(([door, res]) => {
            const match = res.text.replaceAll(ISSUER_SENTENCE, '').match(department);
            return match ? [`${door}: ${match[0]}`] : [];
        });
        expect(naming).toEqual([]);
    });
});
