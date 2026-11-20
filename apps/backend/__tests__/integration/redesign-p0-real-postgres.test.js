'use strict';

/**
 * แบบคำขอใหม่ ระยะ 0 (operator 2026-10-06 "ตามที่แนะนำทั้งหมด", proposal §5) บน Postgres จริง
 *
 * 1. ของปลอมถูกลบ: /validation/land-check ตอบผล "ทับซ้อน" และ "เขตหวงห้าม" ที่คิดจากตัวเลขพิกัด
 *    และ /validation/pre-submission กับ /validation/checklist ยังขอ บท.11 กับประวัติอาชญากรรม
 *    ทุกประตูที่เคย mount (/api/validation และ /api/applications/validate) ต้องตอบ 404
 * 2. อายุใบรับรองมาจากกฎที่มีวันมีผล: ออกใบภายใต้กฎ 12 เดือน แล้วเพิ่มกฎ 36 เดือนที่มีผลทีหลัง
 *    ใบเก่ายังเป็น 12 ใบใหม่ได้ 36 และกฎที่มีผลในอนาคตไม่ถูกใช้ก่อนวันของมัน
 *    ประตูสาธารณะ GET /api/certificate-validity ตอบกฎเดียวกันนี้
 */

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const { completeHolderEntity } = require('../../test-support/complete-holder');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { phaseBApplicationData } = require('../../test-support/phase-b-application-seed');

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

/** Calendar Y-M-D and wall clock in Bangkok, computed here, not by the code under test. */
function bangkokParts(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get('year'), m: get('month'), d: get('day'), clock: `${get('hour')}:${get('minute')}:${get('second')}` };
}

/** Whole calendar months from issue to expiry, or null when the day or the wall clock moved. */
function termMonths(issuedDate, expiryDate) {
    const a = bangkokParts(new Date(issuedDate));
    const b = bangkokParts(new Date(expiryDate));
    if (a.d !== b.d || a.clock !== b.clock) return null;
    return (b.y - a.y) * 12 + (b.m - a.m);
}

/**
 * The register refuses DELETE for every writer, so a test removes its own rows with the trigger
 * switched off inside one transaction (table-owner privilege, which the test database has).
 */
async function deleteTestRules(prisma, ids) {
    if (ids.length === 0) return;
    await prisma.$transaction([
        prisma.$executeRawUnsafe('ALTER TABLE "certificate_validity_rules" DISABLE TRIGGER "certificate_validity_rules_append_only"'),
        prisma.certificateValidityRule.deleteMany({ where: { id: { in: ids } } }),
        prisma.$executeRawUnsafe('ALTER TABLE "certificate_validity_rules" ENABLE TRIGGER "certificate_validity_rules_append_only"'),
    ]);
}

d('redesign phase 0 (real Postgres)', () => {
    describe('the fake validation doors are gone', () => {
        let app;
        beforeAll(async () => {
            app = require('../../server');
            await require('../../services/prisma-database').connect();
        }, 120000);

        test.each([
            ['POST', '/api/validation/land-check', { lat: 18.05, lng: 99.0 }],
            ['POST', '/api/validation/pre-submission', { plantType: 'cannabis', applicantType: 'INDIVIDUAL' }],
            ['GET', '/api/validation/checklist?plantType=cannabis', null],
            ['POST', '/api/applications/validate/land-check', { lat: 18.05, lng: 99.0 }],
            ['POST', '/api/applications/validate/pre-submission', { plantType: 'cannabis', applicantType: 'INDIVIDUAL' }],
            ['GET', '/api/applications/validate/checklist?plantType=cannabis', null],
        ])('%s %s answers 404', async (method, url, body) => {
            const call = method === 'GET' ? request(app).get(url) : request(app).post(url).send(body);
            const res = await call;
            expect(`${res.status} ${JSON.stringify(res.body).slice(0, 120)}`).toMatch(/^404 /);
            expect(JSON.stringify(res.body)).not.toMatch(/OVERLAP|RESTRICTED_ZONE|criminal_bg|license_bt11/);
        });
    });

    describe('the public validity door before any test rule', () => {
        test('GET /api/certificate-validity answers the seeded 12-month rule', async () => {
            const res = await request(require('../../server')).get('/api/certificate-validity');
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual({ months: 12, effectiveFrom: '2026-09-10T17:00:00.000Z' });
        });
    });

    describe('certificate validity is the dated rule in force on the issue date', () => {
        /** @type {import('@prisma/client').PrismaClient} */
        let prisma;
        let certificateService;
        let auditOnsiteService;
        let orgId;
        let holderId;
        let auditorId;
        let applicantCanonicalId;
        const applicationIds = [];
        const auditIds = [];
        const ruleIds = [];

        beforeAll(async () => {
            prisma = new PrismaClient();
            await prisma.$connect();
            certificateService = require('../../services/certificate-service');
            auditOnsiteService = require('../../services/audit-onsite-service');
            if (!(await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } }))) {
                await prisma.plantSpecies.create({ data: { code: 'CAN', nameTH: 'กัญชา', nameEN: 'Cannabis' } });
            }
            const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const org = await prisma.organization.create({
                data: { name: 'P0 validity org', slug: `p0-validity-${suffix}`, code: `P0V_${suffix}`.toUpperCase().slice(0, 24) },
            });
            orgId = org.id;
            holderId = (await prisma.entity.create({ data: completeHolderEntity('INDIVIDUAL', { organizationId: orgId }) })).id;
            const auditor = await prisma.user.create({
                data: {
                    canonicalId: `p0-auditor-${suffix}`, password: 'x', organizationId: orgId,
                    authType: 'EMAIL_LEGACY', role: 'auditor', firstName: 'P0', lastName: 'Auditor',
                },
            });
            auditorId = auditor.id;
            applicantCanonicalId = `p0-applicant-${suffix}`;
            await prisma.user.create({
                data: {
                    canonicalId: applicantCanonicalId, password: 'x', organizationId: orgId,
                    authType: 'EMAIL_LEGACY', role: 'health', firstName: 'P0', lastName: 'Applicant',
                },
            });
        }, 120000);

        afterAll(async () => {
            await prisma.certificateRevision.deleteMany({ where: { certificate: { applicationId: { in: applicationIds } } } }).catch(() => {});
            await prisma.certificate.deleteMany({ where: { applicationId: { in: applicationIds } } }).catch(() => {});
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
            await deleteTestRules(prisma, ruleIds);
            await prisma.$disconnect();
        });

        async function issue() {
            const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const app = await prisma.application.create({
                data: phaseBApplicationData(
                    { applicationNumber: `P0-${suffix}`, healthId: applicantCanonicalId, organizationId: orgId },
                    { status: 'AUDIT_PASSED', auditResult: 'PASS', entityId: holderId },
                ),
            });
            applicationIds.push(app.id);
            const audit = await prisma.auditChecklist.create({
                data: {
                    applicationId: app.id, templateName: 'GACP_GENERAL', sections: [],
                    auditorId, organizationId: orgId, status: 'IN_PROGRESS',
                },
            });
            auditIds.push(audit.id);
            for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
                // eslint-disable-next-line no-await-in-loop
                await auditOnsiteService.submitChecklistItem({
                    onlyDuringVisit: false,
                    auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: auditorId, prisma,
                });
            }
            for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await auditOnsiteService.uploadPhoto({
                    onlyDuringVisit: false,
                    auditId: audit.id, fileBuffer: Buffer.from(`p0-photo-${audit.id}-${i}`, 'utf8'),
                    fileName: `p0-${i}.jpg`, gpsLat: 13.75 + i * 0.0001, gpsLng: 100.5 + i * 0.0001,
                    capturedAt: new Date(), uploadedBy: auditorId, organizationId: orgId, prisma,
                });
            }
            return certificateService.generateCertificate(app.id, auditorId, { prisma, skipInitialAssets: true });
        }

        async function addRule(effectiveFrom, months) {
            const rule = await prisma.certificateValidityRule.create({
                data: { effectiveFrom, months, createdBy: 'p0-test', reason: `p0 test: ${months} months` },
            });
            ruleIds.push(rule.id);
            return rule;
        }

        test('12-month rule, then a 36-month rule effective later: the first certificate keeps 12, the next gets 36', async () => {
            // A rule dated tomorrow exists the whole time and must not be read before its day.
            await addRule(new Date(Date.now() + 24 * 3600e3), 60);

            const first = await issue();
            expect(first.validityMonths).toBe(12);
            expect(termMonths(first.issuedDate, first.expiryDate)).toBe(12);

            await addRule(new Date(), 36);

            const second = await issue();
            expect(second.validityMonths).toBe(36);
            expect(termMonths(second.issuedDate, second.expiryDate)).toBe(36);

            const firstNow = await prisma.certificate.findUnique({ where: { id: first.id } });
            expect(firstNow.validityMonths).toBe(12);
            expect(firstNow.expiryDate.toISOString()).toBe(new Date(first.expiryDate).toISOString());
            expect(firstNow.documentHash).toBe(first.documentHash);
            expect(certificateService.verifyDocumentIntegrity(firstNow).status).toBe('VALID');
            const secondNow = await prisma.certificate.findUnique({ where: { id: second.id } });
            expect(certificateService.verifyDocumentIntegrity(secondNow).status).toBe('VALID');

            // The public door answers the same register: the rule in force now, not tomorrow's.
            const door = await request(require('../../server')).get('/api/certificate-validity');
            expect(door.status).toBe(200);
            expect(door.body.data.months).toBe(36);
        }, 120000);
        test('an archived revision of an untouched certificate verifies VALID on the public door; an edited snapshot reads TAMPERED', async () => {
            const cert = await issue();
            await prisma.farm.update({ where: { id: cert.farmId }, data: { province: 'เชียงราย' } });
            await certificateService.reviseCertificateFromFarm(cert.id, {
                actorId: auditorId, reason: 'p0 test', crossTenant: true, prisma,
            });
            const archived = await prisma.certificateRevision.findUnique({
                where: { certificateId_revisionNo: { certificateId: cert.id, revisionNo: 1 } },
            });
            expect(archived.snapshot.validityYears).toBe(cert.validityMonths / 12);
            expect(archived.snapshot).not.toHaveProperty('validityMonths');

            const door = (n) => request(require('../../server'))
                .get(`/api/public/verify/${encodeURIComponent(cert.certificateNumber)}/revisions/${n}`);
            const intact = await door(1);
            expect(intact.status).toBe(200);
            expect(intact.body.data.integrity).toBe('VALID');
            expect(intact.body.data.signatureValid).toBe(true);

            await prisma.certificateRevision.update({
                where: { id: archived.id },
                data: { snapshot: { ...archived.snapshot, province: 'กรุงเทพมหานคร' } },
            });
            const edited = await door(1);
            expect(edited.status).toBe(200);
            expect(edited.body.data.integrity).toBe('TAMPERED');
        }, 120000);

        test('a certificate term that is not whole years is refused by the database', async () => {
            const cert = await issue();
            await expect(prisma.$executeRawUnsafe('UPDATE "certificates" SET "validityMonths" = 18 WHERE "id" = $1', cert.id))
                .rejects.toThrow(/certificates_validity_months_whole_years/);
        }, 120000);
    });

    describe('the validity register guards itself', () => {
        /** @type {import('@prisma/client').PrismaClient} */
        let prisma;
        const SEEDED = 'b3f0c1de-2026-4911-8a12-000000000012';
        beforeAll(async () => {
            prisma = new PrismaClient();
            await prisma.$connect();
        });
        afterAll(async () => { await prisma.$disconnect(); });

        test.each([[18], [6], [132], [0]])('a rule of %i months is refused', async (months) => {
            await expect(prisma.$executeRawUnsafe(
                `INSERT INTO "certificate_validity_rules" ("id","effectiveFrom","months","createdBy","reason")
                 VALUES (gen_random_uuid()::text, now() + interval '3650 days', $1, 'p0-test', 'p0 bound test')`,
                months,
            )).rejects.toThrow(/certificate_validity_rules_months_/);
        });

        test('UPDATE of a rule in the register is refused', async () => {
            await expect(prisma.certificateValidityRule.update({ where: { id: SEEDED }, data: { months: 24 } }))
                .rejects.toThrow(/append-only/);
            const seeded = await prisma.certificateValidityRule.findUnique({ where: { id: SEEDED } });
            expect(seeded.months).toBe(12);
        });

        test('DELETE of a rule in the register is refused', async () => {
            await expect(prisma.certificateValidityRule.delete({ where: { id: SEEDED } })).rejects.toThrow(/append-only/);
            expect(await prisma.certificateValidityRule.findUnique({ where: { id: SEEDED } })).not.toBeNull();
        });
    });
});
