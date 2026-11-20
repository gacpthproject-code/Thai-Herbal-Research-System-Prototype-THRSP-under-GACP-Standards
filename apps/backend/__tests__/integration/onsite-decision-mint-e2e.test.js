/**
 * onsite-decision-mint-e2e.test.js — Task 12 (final closure proof, fixes B10).
 *
 * The end-to-end proof that the certificate path closes: a field inspector signs in, records a
 * fully evidenced PASS through POST /api/audit/onsite/:auditId/decision, a certificate approver
 * signs in, opens the file and approves through POST
 * /api/provider/auditor/applications/:id/final-approvals, and that approval mints a REAL
 * Certificate on a REAL Postgres. An under-evidenced PASS still refuses. NOTHING in this file is
 * mocked, authentication included: every actor carries the token POST /api/auth/provider/login
 * gave it, so the role that reaches the status writer is the role a real session carries. This
 * is deliberately the opposite of the B10 pattern (wholesale service mocks that let every one of
 * B1-B9 ship invisibly).
 *
 * The inspector's PASS mints nothing. The certificate is born at the approver's decision
 * (F-CERT-SOD, operator 2026-09-10, ISO/IEC 17065 7.6), and a decision state is written only by
 * the roles that own it (order 31, shared/decision-states.js). A role word that retired with the
 * 2026-09 vocabulary normalises to nothing, so it owns no decision state.
 *
 * Unlike __tests__/integration/onsite-evidence-unfreeze.test.js (which passes
 * `skipInitialAssets: true` to isolate the evidence-gate proof from
 * PlantingCycle/HarvestBatch/QR bootstrap), this suite runs the FULL cert machinery:
 * generateCertificate ignores that option (F-G4-22), so this also proves the mint survives
 * createInitialAssets.
 *
 * Third test (PIN-PROPAGATION) is a carried requirement from earlier task reviews, not from the
 * original task-12 brief: it proves the Task-3 decided-auditId pin (submitDecision stamping
 * formData.onsiteAuditId, forwarded by certificate-service.js as the `auditId` arg to
 * assertOnsiteEvidenceSufficient) is actually load-bearing end-to-end, not just unit-tested in
 * isolation. See that test's own comment for the exact failure mode it catches.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { completeHolderEntity } = require('../../test-support/complete-holder');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { PrismaClient } = require('@prisma/client');
const auditOnsiteService = require('../../services/audit-onsite-service');
const { PLANT_SLUG_TO_CODE } = require('../../config/plant-species-slugs');

// Not `Boolean(process.env.DATABASE_URL)`: jest.setup.js:104 pins that variable on every
// run, so the old HAS_DB was always true — this suite never skipped and died on connection
// refused. Ask the run-level guard what it actually probed; it names the reason in the title.
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const PASSWORD = `Mint#${crypto.randomBytes(4).toString('hex')}Aa1`;

d('onsite PASS through /decision, then the approver\'s decision mints a Certificate (e2e closure)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let prisma;
    let app;
    let orgId;
    let holderId;
    let inspector;
    let approver;
    let plantId;
    let applicantCanonicalId;
    const staffIds = [];
    const applicationIds = [];
    const auditIds = [];

    async function staff(role) {
        const id = crypto.randomUUID();
        const providerId = String(crypto.randomInt(1e12, 1e13));
        await prisma.user.create({
            data: {
                id, canonicalId: `e2e-${role}-${providerId}`, password: await bcrypt.hash(PASSWORD, 4), role,
                status: 'ACTIVE', organizationId: orgId, accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId,
                providerIdHash: crypto.createHash('sha256').update(providerId).digest('hex'),
                email: `e2e-${providerId}@example.test`, firstName: 'E2E', lastName: role,
            },
        });
        staffIds.push(id);
        const signedIn = await request(app).post('/api/auth/provider/login').send({ providerId, password: PASSWORD });
        expect(signedIn.status).toBe(200);
        return { id, headers: { Authorization: `Bearer ${signedIn.body.data.token}` } };
    }

    const recordPass = (auditId, summary) => request(app)
        .post(`/api/audit/onsite/${auditId}/decision`).set(inspector.headers)
        .send({ decision: 'PASS', summary });

    async function approve(applicationId) {
        const opened = await request(app)
            .post(`/api/provider/auditor/applications/${applicationId}/decision-file/opened`).set(approver.headers);
        expect(opened.status).toBe(200);
        const approved = await request(app)
            .post(`/api/provider/auditor/applications/${applicationId}/final-approvals`).set(approver.headers)
            .send({ reason: 'หลักฐานครบ' });
        expect(approved.body).toMatchObject({ success: true });
        expect(approved.status).toBe(200);
    }

    beforeAll(async () => {
        prisma = new PrismaClient();
        await prisma.$connect();
        const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const org = await prisma.organization.create({
            data: { name: 'E2E Mint Org', slug: `e2e-mint-${s}`, code: `E2EMINT_${s}`.toUpperCase().slice(0, 24) },
        });
        orgId = org.id;
        holderId = (await prisma.entity.create({ data: completeHolderEntity('INDIVIDUAL', { organizationId: orgId }) })).id;

        app = express();
        app.use(express.json());
        app.use('/api/auth/provider', require('../../routes/api/auth/auth-provider'));
        app.use('/api/audit/onsite', require('../../routes/api/audit/onsite'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        inspector = await staff('field_inspector');
        approver = await staff('certificate_approver');

        // Application.healthId FKs to User.canonicalId (NOT User.id) — see
        // prisma/schema/application.prisma `applicant User @relation(fields:
        // [healthId], references: [canonicalId])` (same shape onsite-evidence-
        // unfreeze.test.js relies on).
        applicantCanonicalId = `e2e-applicant-${s}`;
        await prisma.user.create({
            data: {
                canonicalId: applicantCanonicalId,
                password: 'x',
                organizationId: orgId,
                authType: 'EMAIL_LEGACY',
                role: 'health',
                firstName: 'E2E',
                lastName: 'Applicant',
            },
        });

        const plantCode = PLANT_SLUG_TO_CODE.cannabis;
        if (!(await prisma.plantSpecies.findUnique({ where: { code: plantCode } }))) {
            plantId = (await prisma.plantSpecies.create({ data: { code: plantCode, nameTH: 'กัญชา', nameEN: 'Cannabis' } })).id;
        }
    });

    afterAll(async () => {
        // Children before parents (no onDelete cascade on any of these FKs).
        const byApplication = { applicationId: { in: applicationIds } };
        await prisma.certificateScope.deleteMany({ where: { certificate: byApplication } }).catch(() => {});
        await prisma.certificate.deleteMany({ where: byApplication }).catch(() => {});
        await prisma.checkoutOrder.deleteMany({ where: byApplication }).catch(() => {});
        await prisma.invoice.deleteMany({ where: byApplication }).catch(() => {});
        await prisma.workActivity.deleteMany({ where: byApplication }).catch(() => {});
        if (prisma.farmAuditPhoto) {
            await prisma.farmAuditPhoto.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        }
        if (prisma.farmAuditChecklistItem) {
            await prisma.farmAuditChecklistItem.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        }
        // Full cert machinery (no skipInitialAssets) may create these —
        // onsite-evidence-unfreeze.test.js does not need to clean them up
        // because it always skips initial-asset creation; this suite does not.
        await prisma.harvestBatch.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plantingCycle.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.attachment.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plot.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.farm.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.auditChecklist.deleteMany({ where: { id: { in: auditIds } } }).catch(() => {});
        await prisma.auditLog.deleteMany({ where: { resourceId: { in: applicationIds } } }).catch(() => {});
        await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.notification.deleteMany({ where: { userId: { in: staffIds } } }).catch(() => {});
        await prisma.assignmentLedgerEntry.deleteMany({ where: { assigneeUserId: { in: staffIds } } }).catch(() => {});
        await prisma.application.deleteMany({ where: { id: { in: applicationIds } } }).catch(() => {});
        await prisma.entity.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
        if (plantId) { await prisma.plantSpecies.deleteMany({ where: { id: plantId } }).catch(() => {}); }
        await prisma.$disconnect();
    });

    async function seed() {
        const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const filed = await prisma.application.create({
            data: {
                applicationNumber: `E2E-${s}`,
                healthId: applicantCanonicalId,
                areaType: 'OUTDOOR',
                organizationId: orgId,
                entityId: holderId,
                status: 'AUDIT_CONFIRMED',
                auditorId: inspector.id,
                formData: {
                    workflowState: 'AUDIT_CONFIRMED', plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
                    farmData: {
                        farmName: `ฟาร์ม ${s}`, address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
                        subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai',
                        gpsLat: '13.12', gpsLng: '100.65',
                    },
                    plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
                },
            },
        });
        applicationIds.push(filed.id);
        await settleMilestones(prisma, filed);
        const audit = await prisma.auditChecklist.create({
            data: {
                applicationId: filed.id,
                templateName: 'GACP_GENERAL',
                sections: [],
                auditorId: inspector.id,
                organizationId: orgId,
                status: 'IN_PROGRESS',
            },
        });
        auditIds.push(audit.id);
        return { app: filed, audit };
    }

    async function recordFullEvidence(auditId) {
        for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
            // eslint-disable-next-line no-await-in-loop
            await auditOnsiteService.submitChecklistItem({
                auditId, itemCode: item.itemCode, response: 'PASS', actorId: inspector.id, prisma,
            });
        }
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await auditOnsiteService.uploadPhoto({
                auditId,
                fileBuffer: Buffer.from(`e2e-${auditId}-${i}`),
                fileName: `e-${i}.jpg`,
                gpsLat: 13.75 + i * 1e-4,
                gpsLng: 100.5 + i * 1e-4,
                capturedAt: new Date(),
                uploadedBy: inspector.id,
                organizationId: orgId,
                prisma,
            });
        }
    }

    test('HEADLINE: a fully-evidenced PASS waits for the approver, and the approver\'s decision mints the Certificate', async () => {
        const { app: filed, audit } = await seed();
        await recordFullEvidence(audit.id);

        const passed = await recordPass(audit.id, 'ผ่านการตรวจ');
        expect(passed.body).toMatchObject({ success: true });
        expect(passed.status).toBe(200);

        const decided = await prisma.application.findUnique({ where: { id: filed.id }, select: { status: true, formData: true } });
        expect(decided.status).toBe('AUDIT_PASSED');
        expect(decided.formData.onsiteAuditId).toBe(audit.id);
        expect(await prisma.certificate.findFirst({ where: { applicationId: filed.id } })).toBeNull();

        await approve(filed.id);

        const cert = await prisma.certificate.findFirst({ where: { applicationId: filed.id } });
        expect(cert).not.toBeNull();
        expect(cert.certificateNumber).toMatch(/^\d+\/\d{4}$/);
        const reread = await prisma.application.findUnique({ where: { id: filed.id }, select: { status: true, formData: true } });
        expect(reread.status).toBe('CERTIFIED');
        expect(reread.formData.onsiteAuditId).toBe(audit.id);
    });

    test('gate holds: an under-evidenced PASS refuses and mints nothing', async () => {
        const { app: filed, audit } = await seed();
        // no evidence recorded
        const refused = await recordPass(audit.id, 'x');
        expect(refused.status).toBe(422);
        expect(refused.body).toMatchObject({ code: 'INSUFFICIENT_PHOTOS' });
        const cert = await prisma.certificate.findFirst({ where: { applicationId: filed.id } });
        expect(cert).toBeNull();
    });

    // ── Carried requirement (Task-3 linchpin, currently untested before this
    // file): prove the decided-auditId PIN actually reaches generateCertificate
    // in-tx, by making the WITHOUT-the-pin failure mode concrete and seeded. ──
    test('PIN-PROPAGATION: audit-A fully evidenced + audit-B a newer EMPTY IN_PROGRESS orphan on the SAME application — PASS on audit-A then approval still mints, proving the pin froze the decided row', async () => {
        const { app: filed, audit: auditA } = await seed();
        await recordFullEvidence(auditA.id);

        // audit-B: created AFTER audit-A, IN_PROGRESS, deliberately given ZERO
        // evidence. onsite-audit-resolver.js's resolveCurrentOnsiteAuditId
        // prefers (1) the IN_PROGRESS row, (2) then most-recently-created —
        // audit-B satisfies BOTH tie-breakers over audit-A (which submitDecision
        // is about to flip to COMPLETED). Without Task 3's pin (formData.
        // onsiteAuditId, stamped by submitDecision and forwarded by
        // certificate-service.js to assertOnsiteEvidenceSufficient as the
        // `auditId` arg), generateCertificate would re-resolve to audit-B — 0
        // photos, 0 checklist items — and throw INSUFFICIENT_PHOTOS, minting
        // NOTHING. A minted cert below is only reachable if the pin held.
        const auditB = await prisma.auditChecklist.create({
            data: {
                applicationId: filed.id,
                templateName: 'GACP_GENERAL',
                sections: [],
                auditorId: inspector.id,
                organizationId: orgId,
                status: 'IN_PROGRESS',
                // Force an unambiguous ordering gap so the resolver's
                // `orderBy: { createdAt: 'desc' }` deterministically prefers
                // audit-B over audit-A if the pin were ever dropped — the
                // exact failure mode this test exists to catch.
                createdAt: new Date(auditA.createdAt.getTime() + 60_000),
            },
        });
        auditIds.push(auditB.id);
        expect(auditB.createdAt.getTime()).toBeGreaterThan(auditA.createdAt.getTime());

        const passed = await recordPass(auditA.id, 'ผ่านการตรวจ (pin-propagation proof)');
        expect(passed.status).toBe(200);
        await approve(filed.id);

        const cert = await prisma.certificate.findFirst({ where: { applicationId: filed.id } });
        // If this is null, the pin never reached generateCertificate — the gate
        // silently fell back to resolveCurrentOnsiteAuditId and hit the empty
        // audit-B orphan instead of the decided audit-A. Report that loudly;
        // it means the Task-3 pin is inert end-to-end, not just unit-covered.
        expect(cert).not.toBeNull();
        expect(cert.certificateNumber).toMatch(/^\d+\/\d{4}$/);

        const reread = await prisma.application.findUnique({ where: { id: filed.id }, select: { status: true, formData: true } });
        expect(reread.status).toBe('CERTIFIED');
        // The load-bearing assertion: generateCertificate verified audit-A
        // specifically (the row actually decided on), never audit-B (the
        // empty orphan resolveCurrentOnsiteAuditId would otherwise prefer).
        expect(reread.formData.onsiteAuditId).toBe(auditA.id);
        expect(reread.formData.onsiteAuditId).not.toBe(auditB.id);
    });
});
