/**
 * เลขใบรับรองเดิมที่ผู้ยื่นพิมพ์ ต้องหาแถวที่เก็บไว้เจอทุกรูปแบบที่เคยออก
 *
 * ตั้งแต่ a1fddd03b (คำสั่ง 134-136) ใบรับรองใหม่เก็บเป็น `{ลำดับ}/{ปี พ.ศ.}` ไม่มีคำนำหน้า
 * ส่วนใบที่ออกก่อนหน้านั้นเก็บเป็น `TH-GACP {ลำดับ}/{ปี}` ทั้งสองชุดใช้ตัวนับเดียวกัน
 * (receipt_sequences บัคเก็ต TH-GACP คำสั่ง 135) จึงเป็นเลขชุดเดียวกัน ต่างกันแค่การสะกด
 *
 * toCanonicalCertificateNumber เก็บคำนำหน้าที่พิมพ์มาไว้ แล้วตัวแก้ขอบเขตกฎหมายถามฐานข้อมูล
 * ด้วยค่าตรงตัว: พิมพ์ "TH-GACP 61/2569" (ตามตัวอย่างบนหน้าจอ) จึงไม่เจอแถว "61/2569"
 * และคำขอต่ออายุกลายเป็นคำขอใหม่ชุดเอกสารเต็ม (PREVIOUS_CERTIFICATE_NOT_FOUND)
 * ขากลับก็พัง: พิมพ์ "3/2569" ไม่เจอแถว "TH-GACP 3/2569"
 *
 * ชุด unit ของตัวแก้ mock prisma ให้ตอบแถวเสมอ จึงมองไม่เห็น ไฟล์นี้ถามฐานข้อมูลจริง
 *
 * รันจริง: TEST_DATABASE_URL=<local migrated postgres> npx jest renewal-previous-certificate-every-form -i
 */
'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { resolveLawDimensions } = require('../../services/application-law-dimensions');

const DAY = 86400000;

d('a renewal names its previous certificate in any issued form (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    // Sequence numbers no real series reaches, so a shared test database never collides.
    const seq = 900000 + Math.floor(Math.random() * 90000);
    const NEW_FORM = `${seq}/2569`;
    const OLD_FORM = `TH-GACP ${seq + 1}/2569`;
    const NEAR_MISS = `TH-GACP 1${seq}/2569`;
    const fx = { certIds: [] };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `prevcert-${sfx}`, slug: `prevcert-${sfx}`, code: `PREVCERT_${sfx}`.toUpperCase() } });
        fx.orgId = org.id;
        const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ผู้ถือ ${sfx} จำกัด`, organizationId: org.id } });
        fx.entityId = entity.id;
        const key = `prevcert-${sfx}`;
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
                ownerId: user.id, farmName: 'ฟาร์มต่ออายุ', farmType: 'CULTIVATION', address: '1', province: 'เชียงใหม่',
                district: 'x', subDistrict: 'x', postalCode: '50000', totalArea: 1, cultivationArea: 1,
                cultivationMethod: 'OUTDOOR', organizationId: org.id,
            },
        });
        fx.farmId = farm.id;
        const application = await raw.application.create({
            data: {
                applicationNumber: `APP-PREVCERT-${sfx}`, healthId: key, areaType: 'OUTDOOR', organizationId: org.id,
                entityId: entity.id, submitterId: user.id, status: 'CERTIFIED', certificationPurposes: ['RESEARCH'],
                formData: { plantId: 'cannabis' },
            },
        });
        fx.appId = application.id;
        for (const certificateNumber of [NEW_FORM, OLD_FORM, NEAR_MISS]) {
            const cert = await raw.certificate.create({
                data: {
                    certificateNumber, verificationCode: 'x', qrData: 'x', applicationId: application.id, userId: user.id,
                    farmId: farm.id, farmName: 'ฟาร์มต่ออายุ', applicantName: 'ผู้ถือทดสอบ', cropType: 'กัญชา', farmSize: 1,
                    province: 'เชียงใหม่', district: 'x', subDistrict: 'x', standardId: 'x', standardName: 'GACP',
                    status: 'active', expiryDate: new Date(Date.now() + 30 * DAY), validityMonths: 12, issuedBy: 'test',
                    organizationId: org.id,
                },
            });
            fx.certIds.push({ id: cert.id, certificateNumber });
        }
    });

    afterAll(async () => {
        await raw.certificate.deleteMany({ where: { id: { in: fx.certIds.map((c) => c.id) } } });
        await raw.application.deleteMany({ where: { id: fx.appId } });
        await raw.farm.deleteMany({ where: { id: fx.farmId } });
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } });
        await raw.user.deleteMany({ where: { id: fx.userId } });
        await raw.entity.deleteMany({ where: { id: fx.entityId } });
        await raw.organization.deleteMany({ where: { id: fx.orgId } });
        await raw.$disconnect();
    });

    const idOf = (certificateNumber) => fx.certIds.find((c) => c.certificateNumber === certificateNumber).id;
    const renew = (previousCertificateNumber) => resolveLawDimensions({
        prisma: raw, actorUserId: fx.userId, filingEntityId: fx.entityId, stored: {},
        claimed: { requestType: 'RENEWAL', previousCertificateNumber },
    });

    test.each([
        ['the stored new form', () => NEW_FORM, () => NEW_FORM],
        ['the new form typed with the old prefix', () => `TH-GACP ${seq}/2569`, () => NEW_FORM],
        ['the new form as its slug', () => `${seq}-2569`, () => NEW_FORM],
        ['the new form as the prefixed slug', () => `TH-GACP-${seq}-2569`, () => NEW_FORM],
        ['the stored old form', () => OLD_FORM, () => OLD_FORM],
        ['the old form typed without its prefix', () => `${seq + 1}/2569`, () => OLD_FORM],
        ['the old form as its bare slug', () => `${seq + 1}-2569`, () => OLD_FORM],
        ['the old form in lower case with extra spaces', () => ` th-gacp ${seq + 1} / 2569 `, () => OLD_FORM],
    ])('%s is granted as a renewal of the stored row', async (_label, typed, stored) => {
        const { dimensions, notice } = await renew(typed());
        expect(notice).toBeNull();
        expect(dimensions).toEqual(expect.objectContaining({
            requestType: 'RENEWAL',
            renewalOf: idOf(stored()),
            renewalOfCertificateNumber: stored(),
        }));
    });

    test('a number that was never issued is refused, not matched to a neighbour', async () => {
        const { dimensions, notice } = await renew(`${seq + 2}/2569`);
        expect(notice).toEqual(expect.objectContaining({ code: 'PREVIOUS_CERTIFICATE_NOT_FOUND' }));
        expect(dimensions).toEqual(expect.objectContaining({ requestType: 'NEW', renewalOf: null }));
    });

    test(`${NEW_FORM} never resolves to the longer number ${NEAR_MISS}`, async () => {
        const { dimensions } = await renew(`TH-GACP ${seq}/2569`);
        expect(dimensions.renewalOf).toBe(idOf(NEW_FORM));
        expect(dimensions.renewalOf).not.toBe(idOf(NEAR_MISS));
    });
});
