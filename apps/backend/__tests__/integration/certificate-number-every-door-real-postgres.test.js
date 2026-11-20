/**
 * เลขใบรับรองที่คนหรือระบบคู่ค้าพิมพ์ ต้องหาแถวที่เก็บไว้เจอทุกรูปแบบที่เคยออก ที่ทุกประตู
 *
 * รอบแรก (0364b8acf) แก้เฉพาะเส้นต่ออายุ ประตูอื่นยังถาม certificateNumber ค่าตรงตัว:
 * หน้าตรวจสอบสาธารณะ (findByCertificateNumber) เพิกถอน (revokeCertificate) งานผู้อนุมัติ
 * (suspend/reinstate/revoke by ref) ประตูคู่ค้า (fetchCertificateByLookup) และค้นทะเบียน
 * (/v1/trust/registry?search=) พิมพ์ "TH-GACP 61/2569" จึงไม่เจอแถว "61/2569" และกลับกัน
 *
 * (ลำดับ, ปี) คือตัวตนของใบ คำนำหน้าคือการสะกดของยุคที่ออก สองแถวที่สะกดต่างกันแต่
 * (ลำดับ, ปี) เดียวกันคือทะเบียนผิด ไม่ใช่คำตอบ ทุกประตูต้องปฏิเสธ ไม่ใช่สุ่มเลือกแถวหนึ่ง
 *
 * รันจริง: TEST_DATABASE_URL=<local migrated postgres> npx jest certificate-number-every-door -i
 */
'use strict';

jest.mock('../../services/crypto/signature-service', () => ({
    getSignatureService: jest.fn(() => ({
        sign: jest.fn().mockResolvedValue('sig'), verify: jest.fn().mockResolvedValue(true), getPublicKey: jest.fn().mockResolvedValue('k'),
    })),
}));
process.env.INTEROP_PARTNER_API_KEYS = JSON.stringify({ 'every-door': 'every-door-key' });

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const certificateService = require('../../services/certificate-service');
const approverActions = require('../../services/certificate-approver-actions');
const { fetchCertificateByLookup } = require('../../routes/api/interoperability/interoperability-core');
const { resolveLawDimensions } = require('../../services/application-law-dimensions');
require('../../middleware/partner-api-key').requirePartnerApiKey._reload();

const DAY = 86400000;

d('a typed certificate number finds its row in any issued form, at every door (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    // Sequence numbers no real series reaches, so a shared test database never collides.
    const seq = 800000 + Math.floor(Math.random() * 90000);
    const n = (k) => seq + k;
    const NEW_FORM = `${n(0)}/2569`;
    const OLD_FORM = `TH-GACP ${n(1)}/2569`;
    const NEAR_MISS = `TH-GACP 1${n(0)}/2569`;
    const TWIN_BARE = `${n(2)}/2569`;
    const TWIN_PREFIXED = `TH-GACP ${n(2)}/2569`;
    const REVOKE_NEW = `${n(3)}/2569`;
    const REVOKE_OLD = `TH-GACP ${n(4)}/2569`;
    const SUSPEND_NEW = `${n(5)}/2569`;
    const SUSPEND_OLD = `TH-GACP ${n(6)}/2569`;
    const ALL = [NEW_FORM, OLD_FORM, NEAR_MISS, TWIN_BARE, TWIN_PREFIXED, REVOKE_NEW, REVOKE_OLD, SUSPEND_NEW, SUSPEND_OLD];
    const fx = { certs: [] };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `everydoor-${sfx}`, slug: `everydoor-${sfx}`, code: `EVERYDOOR_${sfx}`.toUpperCase() } });
        fx.orgId = org.id;
        const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ผู้ถือ ${sfx} จำกัด`, organizationId: org.id } });
        fx.entityId = entity.id;
        const key = `everydoor-${sfx}`;
        const user = await raw.user.create({
            data: {
                canonicalId: key, healthId: key, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `${key}@example.test`, firstName: 'คน', lastName: 'ยื่น', organizationId: org.id,
            },
        });
        fx.userId = user.id;
        await raw.entityMembership.create({
            data: { userId: user.id, entityId: entity.id, role: 'OWNER', permissions: [], status: 'ACTIVE', organizationId: org.id },
        });
        const farm = await raw.farm.create({
            data: {
                ownerId: user.id, farmName: 'ฟาร์มทุกประตู', farmType: 'CULTIVATION', address: '1', province: 'เชียงใหม่',
                district: 'x', subDistrict: 'x', postalCode: '50000', totalArea: 1, cultivationArea: 1,
                cultivationMethod: 'OUTDOOR', organizationId: org.id,
            },
        });
        fx.farmId = farm.id;
        const application = await raw.application.create({
            data: {
                applicationNumber: `APP-EVERYDOOR-${sfx}`, healthId: key, areaType: 'OUTDOOR', organizationId: org.id,
                entityId: entity.id, submitterId: user.id, status: 'CERTIFIED', certificationPurposes: ['RESEARCH'],
                formData: { plantId: 'cannabis' },
            },
        });
        fx.appId = application.id;
        for (const certificateNumber of ALL) {
            const cert = await raw.certificate.create({
                data: {
                    certificateNumber, verificationCode: `v-${sfx}-${certificateNumber}`, qrData: 'x', applicationId: application.id,
                    userId: user.id, farmId: farm.id, farmName: 'ฟาร์มทุกประตู', applicantName: 'ผู้ถือทดสอบ', cropType: 'กัญชา',
                    farmSize: 1, province: 'เชียงใหม่', district: 'x', subDistrict: 'x', standardId: 'x', standardName: 'GACP',
                    status: 'active', expiryDate: new Date(Date.now() + 30 * DAY), validityMonths: 12, issuedBy: 'test',
                    organizationId: org.id,
                },
            });
            fx.certs.push({ id: cert.id, certificateNumber });
        }
        app = express();
        app.use(express.json());
        app.use('/api/interoperability', require('../../routes/api/integration/interoperability'));
    });

    afterAll(async () => {
        const certIds = fx.certs.map((c) => c.id);
        await raw.certificateRevision.deleteMany({ where: { certificateId: { in: certIds } } }).catch(() => null);
        await raw.notification.deleteMany({ where: { userId: fx.userId } }).catch(() => null);
        await raw.auditLog.deleteMany({ where: { organizationId: fx.orgId } });
        await raw.certificate.deleteMany({ where: { id: { in: certIds } } });
        await raw.application.deleteMany({ where: { id: fx.appId } });
        await raw.farm.deleteMany({ where: { id: fx.farmId } });
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } });
        await raw.user.deleteMany({ where: { id: fx.userId } });
        await raw.entity.deleteMany({ where: { id: fx.entityId } });
        await raw.organization.deleteMany({ where: { id: fx.orgId } });
        await raw.$disconnect();
    });

    const idOf = (certificateNumber) => fx.certs.find((c) => c.certificateNumber === certificateNumber).id;
    const actor = () => ({ id: fx.userId, organizationId: fx.orgId, role: 'certificate_approver', canonicalRole: 'certificate_approver' });

    describe('public verify: findByCertificateNumber', () => {
        test.each([
            ['the stored new form', () => NEW_FORM, () => NEW_FORM],
            ['the new form typed with the old prefix', () => `TH-GACP ${n(0)}/2569`, () => NEW_FORM],
            ['the new form as the prefixed slug from an old QR', () => `TH-GACP-${n(0)}-2569`, () => NEW_FORM],
            ['the stored old form', () => OLD_FORM, () => OLD_FORM],
            ['the old form typed without its prefix', () => `${n(1)}/2569`, () => OLD_FORM],
            ['the old form as its bare slug', () => `${n(1)}-2569`, () => OLD_FORM],
        ])('%s answers with the stored row', async (_label, typed, stored) => {
            const cert = await certificateService.findByCertificateNumber(typed());
            expect(cert).toEqual(expect.objectContaining({ id: idOf(stored()), certificateNumber: stored() }));
        });

        test(`${NEW_FORM} never resolves to the longer ${NEAR_MISS}`, async () => {
            const cert = await certificateService.findByCertificateNumber(`TH-GACP ${n(0)}/2569`);
            expect(cert.id).toBe(idOf(NEW_FORM));
        });

        test('a number that was never issued is not found', async () => {
            expect(await certificateService.findByCertificateNumber(`${n(7)}/2569`)).toBeNull();
        });

        test.each([TWIN_BARE, TWIN_PREFIXED])('two stored rows with one (number, year) are refused, typed as %s', async (typed) => {
            expect(await certificateService.findByCertificateNumber(typed)).toBeNull();
        });
    });

    describe('partner lookup: fetchCertificateByLookup', () => {
        test.each([
            ['the new form typed with the old prefix', () => `TH-GACP ${n(0)}/2569`, () => NEW_FORM],
            ['the old form typed without its prefix', () => `${n(1)}/2569`, () => OLD_FORM],
            ['the stored old form as its slug', () => `TH-GACP-${n(1)}-2569`, () => OLD_FORM],
        ])('%s answers with the stored row', async (_label, typed, stored) => {
            const cert = await fetchCertificateByLookup(typed());
            expect(cert).toEqual(expect.objectContaining({ id: idOf(stored()), certificateNumber: stored() }));
        });

        test('a row id still answers', async () => {
            const cert = await fetchCertificateByLookup(idOf(OLD_FORM));
            expect(cert.certificateNumber).toBe(OLD_FORM);
        });

        test('two stored rows with one (number, year) are refused', async () => {
            expect(await fetchCertificateByLookup(TWIN_BARE)).toBeNull();
        });
    });

    describe('partner registry search: /v1/trust/registry?search=', () => {
        const search = (term) => request(app)
            .get('/api/interoperability/v1/trust/registry')
            .query({ search: term, limit: 100 })
            .set('x-api-key', 'every-door-key');
        const numbersOf = (res) => res.body.data.map((row) => row.certificateNumber);

        test('the new form typed with the old prefix finds the bare row and not its longer neighbour', async () => {
            const res = await search(`TH-GACP ${n(0)}/2569`);
            expect(res.status).toBe(200);
            expect(numbersOf(res)).toContain(NEW_FORM);
            expect(numbersOf(res)).not.toContain(NEAR_MISS);
        });

        test('the old form typed without its prefix finds the prefixed row', async () => {
            const res = await search(`${n(1)}/2569`);
            expect(res.status).toBe(200);
            expect(numbersOf(res)).toContain(OLD_FORM);
        });
    });

    describe('revoke: revokeCertificate by typed number', () => {
        test('the new form typed with the old prefix revokes the bare row', async () => {
            const updated = await certificateService.revokeCertificate(`TH-GACP ${n(3)}/2569`, {
                reason: 'ทดสอบทุกประตู', actorId: fx.userId, callerOrganizationId: fx.orgId,
            });
            expect(updated).toEqual(expect.objectContaining({ id: idOf(REVOKE_NEW), status: 'revoked' }));
        });

        test('the old form typed without its prefix revokes the prefixed row', async () => {
            const updated = await certificateService.revokeCertificate(`${n(4)}/2569`, {
                reason: 'ทดสอบทุกประตู', actorId: fx.userId, crossTenant: true,
            });
            expect(updated).toEqual(expect.objectContaining({ id: idOf(REVOKE_OLD), status: 'revoked' }));
        });

        test('two stored rows with one (number, year) are refused as not found, and neither is revoked', async () => {
            await expect(certificateService.revokeCertificate(TWIN_BARE, { reason: 'x', actorId: fx.userId, crossTenant: true }))
                .rejects.toMatchObject({ statusCode: 404 });
            const twins = await raw.certificate.findMany({ where: { id: { in: [idOf(TWIN_BARE), idOf(TWIN_PREFIXED)] } }, select: { status: true } });
            expect(twins.map((t) => t.status)).toEqual(['active', 'active']);
        });
    });

    describe('approver: suspend by typed number inside the organisation', () => {
        test('the new form typed with the old prefix suspends the bare row', async () => {
            const updated = await approverActions.suspendCertificate({
                certificateRef: `TH-GACP ${n(5)}/2569`, actor: actor(), reasonCode: 'HOLDER_REQUEST',
            });
            expect(updated).toEqual(expect.objectContaining({ id: idOf(SUSPEND_NEW), status: 'suspended' }));
        });

        test('the old form typed without its prefix suspends the prefixed row', async () => {
            const updated = await approverActions.suspendCertificate({
                certificateRef: `${n(6)}/2569`, actor: actor(), reasonCode: 'HOLDER_REQUEST',
            });
            expect(updated).toEqual(expect.objectContaining({ id: idOf(SUSPEND_OLD), status: 'suspended' }));
        });

        test('two stored rows with one (number, year) are refused as not found', async () => {
            await expect(approverActions.suspendCertificate({ certificateRef: TWIN_PREFIXED, actor: actor(), reasonCode: 'HOLDER_REQUEST' }))
                .rejects.toMatchObject({ code: 'CERTIFICATE_NOT_FOUND' });
        });
    });

    test('renewal: two stored rows with one (number, year) are refused, and the request stays NEW', async () => {
        const { dimensions, notice } = await resolveLawDimensions({
            prisma: raw, actorUserId: fx.userId, filingEntityId: fx.entityId, stored: {},
            claimed: { requestType: 'RENEWAL', previousCertificateNumber: TWIN_BARE },
        });
        expect(notice).toEqual(expect.objectContaining({ code: 'PREVIOUS_CERTIFICATE_NOT_FOUND' }));
        expect(dimensions).toEqual(expect.objectContaining({ requestType: 'NEW', renewalOf: null }));
    });
});
