'use strict';

/**
 * scripts/backfill-certificate-scopes.js on real Postgres: certificates issued before issuance
 * wrote scope rows get them from their application's declaration, once, and only on --apply.
 * A type that would come only from the applications.areaType column is nobody's declaration:
 * it is counted and skipped, never written (review F3). Standard output carries counts only;
 * certificate numbers go to a 0600 file (review F2).
 */

process.env.RATE_LIMIT_MAX = '1000000';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d, getTestDatabase } = require('../../test-support/test-database');
const { backfillCertificateScopes } = require('../../scripts/backfill-certificate-scopes');

const SCRIPT = path.join(__dirname, '../../scripts/backfill-certificate-scopes.js');

d('backfill-certificate-scopes (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let prisma;
    let app;
    let orgId;
    let declared;
    let columnOnly;
    let undeclared;
    const issuedDate = new Date('2026-09-20T03:00:00Z');

    beforeAll(async () => {
        prisma = new PrismaClient();
        await prisma.$connect();
        app = require('../../server');
        await require('../../services/prisma-database').connect();
        const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        orgId = (await prisma.organization.create({
            data: { name: 'Scope backfill org', slug: `scope-backfill-${s}`, code: `SBF_${s}`.toUpperCase().slice(0, 24) },
        })).id;
        const user = await prisma.user.create({
            data: { canonicalId: `sbf-${s}`, password: 'x', organizationId: orgId, authType: 'EMAIL_LEGACY', role: 'health' },
        });
        const farm = await prisma.farm.create({
            data: {
                ownerId: user.id, organizationId: orgId, farmName: 'ไร่เติมขอบเขต', farmType: 'CULTIVATION',
                address: '1', province: 'เชียงใหม่', district: 'แม่ริม', subDistrict: 'ริมใต้', postalCode: '50180',
                totalArea: 1, cultivationArea: 1, cultivationMethod: 'GREENHOUSE',
            },
        });
        const certificateFor = async (label, prefix, applicationData) => {
            const application = await prisma.application.create({
                data: { applicationNumber: `SBF-${label}-${s}`, healthId: user.canonicalId, organizationId: orgId, ...applicationData },
            });
            return prisma.certificate.create({
                data: {
                    certificateNumber: `TH-GACP ${prefix}${Math.floor(Math.random() * 1000)}/2569`,
                    verificationCode: 'SBF', qrData: 'qr', applicationId: application.id, userId: user.id, farmId: farm.id,
                    farmName: farm.farmName, applicantName: 'ทดสอบ', holderType: 'JURISTIC', holderDisplayName: 'บริษัท เติม จำกัด',
                    cropType: 'กัญชา', farmSize: 1, province: farm.province, district: farm.district, subDistrict: farm.subDistrict,
                    standardId: 'GACP-TH', standardName: 'GACP Thailand', status: 'active', issuedDate,
                    expiryDate: new Date(Date.now() + 300 * 24 * 3600e3), validityMonths: 12, issuedBy: 'SYSTEM', organizationId: orgId,
                },
            });
        };
        declared = await certificateFor('declared', 880001, {
            areaType: 'GREENHOUSE', formData: { farmData: { areaTypes: ['GREENHOUSE'] }, onsiteAuditId: 'audit-sbf-1' },
        });
        columnOnly = await certificateFor('column-only', 880003, { areaType: 'OUTDOOR', formData: { plantId: 'cannabis' } });
        undeclared = await certificateFor('undeclared', 880002, { areaType: 'UNDECLARED', formData: {} });
    }, 120000);

    afterAll(async () => {
        if (!prisma) { return; }
        await prisma.certificate.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.application.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.farm.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
        await prisma.$disconnect();
    });

    const scopeRows = (certificate) => prisma.certificateScope.findMany({
        where: { certificateId: certificate.id }, select: { areaType: true, status: true, grantedDate: true, auditId: true },
    });
    const { toCertificateSlug: slug } = require('../../services/certificate-number-display');
    const publicTypes = async (certificate) => (await request(app).get(`/api/v1/public/verify/${slug(certificate.certificateNumber)}`))
        .body.data.certificate.scope.cultivationTypes;
    const skippedColumnOnly = () => [{ certificateNumber: columnOnly.certificateNumber, areaTypeColumn: 'OUTDOOR' }];
    const skippedUndeclared = () => [{ certificateNumber: undeclared.certificateNumber, areaTypeColumn: 'UNDECLARED' }];

    test('a dry run reports what it would write, counts the column-only type apart, and writes nothing', async () => {
        const result = await backfillCertificateScopes(prisma, { where: { organizationId: orgId } });
        expect(result).toEqual({
            certificatesWithoutScope: 3,
            rowsToWrite: 1,
            byType: { GREENHOUSE: 1 },
            written: 0,
            columnOnly: skippedColumnOnly(),
            undeclared: skippedUndeclared(),
        });
        expect(await scopeRows(declared)).toEqual([]);
        expect(await publicTypes(declared)).toEqual([]);
    });

    test('--apply writes the declared type as the certificate\'s own scope and never freezes the column\'s word', async () => {
        const result = await backfillCertificateScopes(prisma, { apply: true, where: { organizationId: orgId } });
        expect(result).toMatchObject({ written: 1, columnOnly: skippedColumnOnly(), undeclared: skippedUndeclared() });
        expect(await scopeRows(declared)).toEqual([{ areaType: 'GREENHOUSE', status: 'active', grantedDate: issuedDate, auditId: 'audit-sbf-1' }]);
        expect(await scopeRows(columnOnly)).toEqual([]);
        expect(await scopeRows(undeclared)).toEqual([]);
        expect(await publicTypes(declared)).toEqual([{ code: 'GREENHOUSE', labelTh: 'ปลูกในโรงเรือน' }]);
        expect(await publicTypes(columnOnly)).toEqual([]);
    });

    test('a second --apply writes nothing and still counts the two skipped certificates', async () => {
        const result = await backfillCertificateScopes(prisma, { apply: true, where: { organizationId: orgId } });
        expect(result).toEqual({
            certificatesWithoutScope: 2,
            rowsToWrite: 0,
            byType: {},
            written: 0,
            columnOnly: skippedColumnOnly(),
            undeclared: skippedUndeclared(),
        });
        expect(await scopeRows(declared)).toHaveLength(1);
    });

    test('the command line prints counts only at the default log level and lists the skipped certificates in a 0600 file', () => {
        const env = { ...process.env, DATABASE_URL: getTestDatabase().url };
        delete env.LOG_LEVEL;
        const run = spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
        expect(run.status).toBe(0);
        const lines = run.stdout.trim().split('\n');
        const countLines = [
            /^mode: dry run \(nothing written; pass --apply to write\)$/,
            /^certificates without a scope row: \d+$/,
            /^scope rows to write: \d+ \{("[A-Z]+":\d+,?)*\}$/,
            /^scope rows written: 0$/,
            /^type from the column only, skipped: \d+$/,
            /^no cultivation type at all, skipped: \d+$/,
            /^skipped certificates listed in \(0600\): \S+$/,
        ];
        expect(lines.filter((line) => !countLines.some((shape) => shape.test(line)))).toEqual([]);
        for (const certificate of [declared, columnOnly, undeclared]) {
            expect(run.stdout).not.toContain(certificate.certificateNumber);
        }

        const listFile = lines.find((line) => line.startsWith('skipped certificates listed in')).split(': ')[1];
        expect(fs.statSync(listFile).mode & 0o777).toBe(0o600);
        const listed = fs.readFileSync(listFile, 'utf8');
        expect(listed).toContain(`type from the column only\t${columnOnly.certificateNumber}\tOUTDOOR`);
        expect(listed).toContain(`no cultivation type at all\t${undeclared.certificateNumber}\tUNDECLARED`);
        expect(listed).not.toContain(declared.certificateNumber);
        fs.rmSync(path.dirname(listFile), { recursive: true });
    });
});
