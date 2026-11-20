'use strict';

/**
 * Certificate.suspendedReason is free text since the "อื่น ๆ (โปรดระบุ)" reason (up to 500
 * characters the approver types), so it is encrypted at rest like revokedReason. Real
 * Postgres through the application's own prisma client with field encryption on:
 *   - a suspension stores ciphertext, and the application reads the typed text back;
 *   - a row suspended before this change (plaintext) still reads as written;
 *   - control: a column outside the encrypt set stays plaintext.
 */

// Before services/prisma-database is first required: the PDPA extension is wired at require time.
process.env.ENABLE_PDPA_FIELD_ENCRYPTION = 'true';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

d('Certificate.suspendedReason is encrypted at rest (real Postgres)', () => {
    let raw;
    let prisma;
    let withoutTenantScope;
    let certificateService;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { certIds: [] };
    const typed = 'พบเอกสารสิทธิ์ที่ดินของผู้อื่น เลขบัตร 1100000000008 แนบมาแทน';

    async function certificate(label, extra = {}) {
        const row = await raw.certificate.create({
            data: {
                certificateNumber: `TH-GACP SRE-${label}-${sfx}`, verificationCode: `SRE-${label}-${sfx}`, qrData: 'qr',
                applicationId: fx.appId, userId: fx.userId, farmId: fx.farmId, issuedBy: 'approver-x',
                farmName: `ฟาร์ม ${label}`, applicantName: 'ทดสอบ', cropType: 'cannabis', farmSize: 1,
                province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่', standardId: 'std',
                standardName: 'GACP', validityMonths: 12, expiryDate: new Date(Date.now() + 365 * 86400e3),
                status: 'active', organizationId: fx.orgId, ...extra,
            },
        });
        fx.certIds.push(row.id);
        return row.id;
    }

    const stored = async (id) => raw.certificate.findUnique({ where: { id }, select: { suspendedReason: true, farmName: true } });
    const readByApp = async (id) => withoutTenantScope(() => prisma.certificate.findUnique({ where: { id }, select: { suspendedReason: true } }));

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        ({ prisma } = require('../../services/prisma-database'));
        ({ withoutTenantScope } = require('../../services/tenant-context'));
        certificateService = require('../../services/certificate-service');
        const org = await raw.organization.create({
            data: { name: `sre-${sfx}`, slug: `sre-${sfx}`, code: `SRE_${sfx}`.toUpperCase() },
        });
        fx.orgId = org.id;
        fx.userId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.userId, canonicalId: `sre-${sfx}`, healthId: `sre-${sfx}`, password: 'x', role: 'health',
                authType: 'EMAIL_LEGACY', email: `sre-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: 'sre',
                organizationId: fx.orgId,
            },
        });
        fx.appId = (await raw.application.create({
            data: {
                applicationNumber: `APP-SRE-${sfx}`, healthId: `sre-${sfx}`, areaType: 'OUTDOOR',
                organizationId: fx.orgId, status: 'CERTIFIED',
            },
        })).id;
        fx.farmId = (await raw.farm.create({
            data: {
                ownerId: fx.userId, farmName: `ฟาร์ม sre ${sfx}`, farmType: 'CULTIVATION', address: '1',
                province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540',
                totalArea: 1, cultivationArea: 1, cultivationMethod: 'OUTDOOR', organizationId: fx.orgId,
            },
        })).id;
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.auditLog.deleteMany({ where: { resourceId: { in: fx.certIds } } }).catch(() => {});
        await raw.certificate.deleteMany({ where: { id: { in: fx.certIds } } }).catch(() => {});
        await raw.farm.deleteMany({ where: { id: fx.farmId } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: fx.appId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: fx.userId } }).catch(() => {});
        if (fx.orgId) { await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {}); }
        await raw.$disconnect();
    });

    test('a suspension stores ciphertext and the application reads the typed reason back', async () => {
        const id = await certificate('new');
        const suspended = await withoutTenantScope(() => certificateService.suspendCertificate(id, { reason: typed, suspendedBy: 'approver-x' }));
        expect(suspended.suspendedReason).toBe(typed);
        const row = await stored(id);
        expect(row.suspendedReason.startsWith('enc:v1:')).toBe(true);
        expect(row.suspendedReason).not.toContain('1100000000008');
        expect((await readByApp(id)).suspendedReason).toBe(typed);
    });

    test('a 500-character reason round-trips', async () => {
        const id = await certificate('long');
        const long = 'ก'.repeat(500);
        await withoutTenantScope(() => certificateService.suspendCertificate(id, { reason: long }));
        expect((await stored(id)).suspendedReason.startsWith('enc:v1:')).toBe(true);
        expect((await readByApp(id)).suspendedReason).toBe(long);
    });

    test('a row suspended before encryption (plaintext) still reads as written', async () => {
        const legacy = 'เหตุเดิมที่บันทึกเป็นข้อความธรรมดา';
        const id = await certificate('legacy', { status: 'suspended', suspendedAt: new Date(), suspendedReason: legacy });
        expect((await stored(id)).suspendedReason).toBe(legacy);
        expect((await readByApp(id)).suspendedReason).toBe(legacy);
    });

    test('control: a column outside the encrypt set stays plaintext', async () => {
        const id = await certificate('control');
        await withoutTenantScope(() => certificateService.suspendCertificate(id, { reason: typed }));
        expect((await stored(id)).farmName).toBe('ฟาร์ม control');
    });
});
