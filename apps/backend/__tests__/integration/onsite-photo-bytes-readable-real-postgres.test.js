/**
 * ภาพถ่ายหลักฐานจากการตรวจแปลงอ่านกลับได้ (real Postgres, ประตูจริง) ขั้นตอน 08 และ 10:
 * อัปโหลด → ขอลิงก์ชั่วคราว → เปิดลิงก์โดยไม่มีเซสชันได้ไบต์เดิม · บันทึกแถวไม่สำเร็จไม่เหลือไฟล์ ·
 * เขียนไฟล์ไม่ได้ตอบ STORAGE_UPLOAD_FAILED เป็นภาษาไทย
 */

'use strict';


const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

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

const { BASE_UPLOAD_DIR } = require('../../services/storage-service');
const { MIN_ONSITE_PHOTO_EDGE_PX } = require('../../services/upload-content-guard');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function fieldPhoto() {
    const height = MIN_ONSITE_PHOTO_EDGE_PX + 120;
    const width = Math.round(height * 4 / 3);
    return sharp(crypto.randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
        .jpeg({ quality: 90 })
        .toBuffer();
}

function bytes(req) {
    return req.buffer(true).parse((res, done) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => done(null, Buffer.concat(chunks)));
    });
}

d('ภาพถ่ายหลักฐานจากการตรวจแปลงอ่านกลับได้ (real Postgres, ประตูจริง)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { orgIds: [], userIds: [], entityIds: [], appIds: [], auditIds: [] };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({
            data: { name: `photos-${sfx}`, slug: `photos-${sfx}`, code: `PHOTOS_${sfx}`.toUpperCase() },
        });
        fx.orgIds.push(org.id);

        const inspectorKey = `photos-insp-${sfx}`;
        const inspector = await raw.user.create({
            data: {
                id: crypto.randomUUID(), canonicalId: inspectorKey, password: 'x', role: 'field_inspector',
                authType: 'PROVIDER_ID', providerId: inspectorKey, email: `${inspectorKey}@example.test`,
                firstName: 'ผู้ตรวจ', lastName: 'พื้นที่', organizationId: org.id, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(inspector.id);
        fx.inspector = { id: inspector.id, role: 'field_inspector', canonicalRole: 'field_inspector', organizationId: org.id, canonicalId: inspectorKey };

        const applicantKey = `photos-app-${sfx}`;
        const applicant = await raw.user.create({
            data: {
                id: crypto.randomUUID(), canonicalId: applicantKey, healthId: applicantKey, password: 'x', role: 'health',
                authType: 'EMAIL_LEGACY', email: `${applicantKey}@example.test`, firstName: 'ผู้ยื่น', lastName: 'ทดสอบ',
                organizationId: org.id, status: 'ACTIVE',
            },
        });
        fx.userIds.push(applicant.id);
        const entity = await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท ผู้ถือ ${sfx} จำกัด`, organizationId: org.id },
        });
        fx.entityIds.push(entity.id);

        const application = await raw.application.create({
            data: {
                applicationNumber: `APP-PHOTOS-${sfx}`, healthId: applicantKey, areaType: 'OUTDOOR',
                organizationId: org.id, entityId: entity.id, submitterId: applicant.id, status: 'AUDIT_CONFIRMED',
                auditorId: inspector.id, certificationPurposes: ['RESEARCH'],
                formData: {
                    workflowState: 'AUDIT_CONFIRMED', plantId: 'cannabis', locationType: 'OUTDOOR',
                    farmData: { farmName: 'ฟาร์มทดสอบ', gpsLat: '13.12', gpsLng: '100.65' },
                },
            },
        });
        fx.appIds.push(application.id);
        const audit = await raw.auditChecklist.create({
            data: {
                applicationId: application.id, templateName: 'GACP_GENERAL', sections: [],
                auditorId: inspector.id, organizationId: org.id, status: 'IN_PROGRESS',
            },
        });
        fx.auditIds.push(audit.id);
        fx.auditId = audit.id;

        app = express();
        app.use(express.json());
        app.use('/api/audit/onsite', require('../../routes/api/audit/onsite'));
        app.use('/api/files', require('../../routes/api/files/files'));
        const { gateSensitiveUploads, gateUploadsObjectAccess } = require('../../middleware/uploads-access');
        const uploadsSecurityHeaders = require('../../middleware/uploads-security-headers');
        app.use('/uploads', gateSensitiveUploads, gateUploadsObjectAccess, uploadsSecurityHeaders, express.static(BASE_UPLOAD_DIR));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        await wipe('farmAuditPhoto', { auditId: { in: fx.auditIds } });
        await wipe('farmAuditChecklistItem', { auditId: { in: fx.auditIds } });
        await wipe('attachment', { organizationId: { in: fx.orgIds } });
        await wipe('auditChecklist', { id: { in: fx.auditIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        for (const id of fx.auditIds) {
            fs.rmSync(path.join(BASE_UPLOAD_DIR, 'audits', id), { recursive: true, force: true });
        }
        await raw.$disconnect();
    });

    test('อัปโหลดผ่านประตูจริง ขอลิงก์ชั่วคราว แล้วเปิดลิงก์ได้ไบต์เดิม ไฟล์อยู่ใต้โฟลเดอร์ที่ /uploads เสิร์ฟ ชื่อเป็นของเซิร์ฟเวอร์', async () => {
        const photo = await fieldPhoto();
        mockActor.current = fx.inspector;

        const uploaded = await request(app)
            .post(`/api/audit/onsite/${fx.auditId}/photo`)
            .attach('photo', photo, { filename: 'ทางเข้า แปลง 1.jpg', contentType: 'image/jpeg' })
            .field('gps', JSON.stringify({ latitude: 13.12, longitude: 100.65 }))
            .field('itemId', '1.1');
        expect(uploaded.status).toBe(200);
        expect(uploaded.body.data.fileHash).toBe(sha256(photo));
        const url = uploaded.body.data.url;
        expect(url).toMatch(new RegExp(`^/uploads/audits/${fx.auditId}/`));

        const minted = await request(app).post('/api/files/signed-url').send({ fileUrl: url });
        expect(minted.status).toBe(200);

        mockActor.current = null;
        const served = await bytes(request(app).get(minted.body.data.url));
        expect(served.status).toBe(200);
        expect(sha256(served.body)).toBe(sha256(photo));

        const rel = url.replace(/^\/uploads\//, '');
        expect(path.basename(rel)).toMatch(/^\d+-[0-9a-f-]{36}\.jpg$/);
        expect(sha256(fs.readFileSync(path.join(BASE_UPLOAD_DIR, rel)))).toBe(sha256(photo));

        const attachment = await raw.attachment.findFirst({
            where: { fileUrl: url },
            select: { resModel: true, resId: true, fileHash: true, fileSize: true, fileName: true },
        });
        expect(attachment).toEqual({
            resModel: 'FarmAuditPhoto', resId: fx.auditId, fileHash: sha256(photo), fileSize: photo.length, fileName: 'ทางเข้า แปลง 1.jpg',
        });
    });

    test('ถ้าบันทึกแถวไม่สำเร็จ ไบต์ที่เขียนไปแล้วถูกลบ และไม่เหลือแถว Attachment ที่ชี้ไฟล์นั้น', async () => {
        const photo = await fieldPhoto();
        mockActor.current = fx.inspector;
        const dir = path.join(BASE_UPLOAD_DIR, 'audits', fx.auditId);
        const filesBefore = fs.readdirSync(dir).length;
        const live = () => raw.attachment.count({ where: { resModel: 'FarmAuditPhoto', resId: fx.auditId, isDeleted: false } });
        const liveBefore = await live();

        const res = await request(app)
            .post(`/api/audit/onsite/${fx.auditId}/photo`)
            .attach('photo', photo, { filename: 'broken-time.jpg', contentType: 'image/jpeg' })
            .field('gps', JSON.stringify({ latitude: 13.12, longitude: 100.65, capturedAt: 'not-a-date' }));
        expect(res.status).toBeGreaterThanOrEqual(400);

        expect(fs.readdirSync(dir).length).toBe(filesBefore);
        expect(await live()).toBe(liveBefore);
    });

    test('ถ้าเขียนไฟล์ไม่ได้ (โฟลเดอร์อ่านอย่างเดียว) ประตูตอบ 500 STORAGE_UPLOAD_FAILED พร้อมข้อความไทยบอกขั้นต่อไป ไม่ใช่รหัสของระบบไฟล์ และไม่เพิ่มแถว', async () => {
        const photo = await fieldPhoto();
        mockActor.current = fx.inspector;
        const dir = path.join(BASE_UPLOAD_DIR, 'audits', fx.auditId);
        const filesBefore = fs.readdirSync(dir).length;
        const rows = async () => ({
            attachments: await raw.attachment.count({ where: { resModel: 'FarmAuditPhoto', resId: fx.auditId } }),
            photos: await raw.farmAuditPhoto.count({ where: { auditId: fx.auditId } }),
        });
        const rowsBefore = await rows();

        fs.chmodSync(dir, 0o555);
        let res;
        try {
            res = await request(app)
                .post(`/api/audit/onsite/${fx.auditId}/photo`)
                .attach('photo', photo, { filename: 'no-disk.jpg', contentType: 'image/jpeg' })
                .field('gps', JSON.stringify({ latitude: 13.12, longitude: 100.65 }));
        } finally {
            fs.chmodSync(dir, 0o755);
        }
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('STORAGE_UPLOAD_FAILED');
        expect(res.body.error).toMatch(/ลองอัปโหลดอีกครั้ง/);
        expect(JSON.stringify(res.body)).not.toMatch(/EACCES|\/uploads\//);

        expect(fs.readdirSync(dir).length).toBe(filesBefore);
        expect(await rows()).toEqual(rowsBefore);
    });
});
