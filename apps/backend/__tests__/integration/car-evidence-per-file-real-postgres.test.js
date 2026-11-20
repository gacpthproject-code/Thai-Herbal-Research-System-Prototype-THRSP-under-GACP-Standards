'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');
const { filedFormData, grantFilingConsents, dropFilingConsents } = require('../../test-support/filed-application');

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

const FINDINGS = [
    { nonConformity: 'ป้ายแปลงไม่ระบุชื่อสายพันธุ์', correctiveAction: 'ติดป้ายให้ครบ' },
    { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ย', correctiveAction: 'จัดทำสมุดบันทึก' },
];

d('หลักฐาน CAR ทีละไฟล์ (real Postgres)', () => {
    let raw;
    let fx;
    let app;
    let pdf;
    let carDir;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'carf');
        await grantFilingConsents(raw, { userIds: [fx.applicant.id], organizationId: fx.orgId });
        carDir = path.join(require('../../services/uploads-root').BASE_UPLOAD_DIR, 'car');
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications-car'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        const PDFDocument = require('pdfkit');
        const pdfPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'car-files-')), 'car.pdf');
        await new Promise((resolve, reject) => {
            const doc = new PDFDocument();
            const out = fs.createWriteStream(pdfPath);
            doc.pipe(out);
            doc.fontSize(14).text('Corrective action evidence '.repeat(200));
            doc.end();
            out.on('finish', resolve);
            out.on('error', reject);
        });
        pdf = fs.readFileSync(pdfPath);
    }, 120000);

    afterAll(async () => {
        await raw.correctionSubmissionVersion?.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await dropFilingConsents(raw, [fx.applicant.id]);
        await fx.cleanup();
        await raw.$disconnect();
    });

    const asApplicant = () => { mockActor.current = { id: fx.applicant.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgId }; };
    const asStaff = (who) => { mockActor.current = { ...who }; };
    const formDataOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { formData: true } })).formData;
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;
    const stored = (doc) => fs.existsSync(path.join(carDir, doc.id));

    async function carPending() {
        const requestedAt = new Date(Date.now() - 3600000).toISOString();
        const application = await fx.makeApplication({
            status: 'CAR_PENDING', auditorId: fx.inspector.id, reviewerId: fx.reviewer.id,
            formData: filedFormData({
                workflowState: 'CAR_PENDING',
                carRequestedAt: requestedAt,
                carDueAt: new Date(Date.now() + 5 * 86400000).toISOString(),
                carRequest: { message: null, requestedAt, items: FINDINGS },
            }),
        });
        await fx.settle(application.id, 'M1');
        await fx.settle(application.id, 'M2');
        return application;
    }

    let distinct = 0;
    const anotherPdf = () => { distinct += 1; return Buffer.concat([pdf, Buffer.from(`\n% copy ${distinct}\n`)]); };
    const upload = (application, { findingNo = 1, body = anotherPdf(), filename = 'หลักฐาน.pdf', contentType = 'application/pdf' } = {}) => {
        asApplicant();
        return request(app).post(`/api/applications/${application.id}/car/files`)
            .field('findingNo', String(findingNo))
            .attach('file', body, { filename, contentType });
    };
    const send = (application, files, notes = 'แก้ครบแล้ว') => {
        asApplicant();
        return request(app).post(`/api/applications/${application.id}/car`).send({ files, notes });
    };

    test('อัปโหลดได้ 20 ไฟล์ทีละคำขอ ไฟล์ที่ 21 ถูกปฏิเสธเป็นภาษาไทยและไม่ค้างในที่เก็บ', async () => {
        const application = await carPending();
        for (let i = 0; i < 20; i += 1) {
            const res = await upload(application, { findingNo: (i % 2) + 1 });
            expect(res.status).toBe(200);
            expect(res.body.data.file).toMatchObject({ findingNo: (i % 2) + 1, originalName: 'หลักฐาน.pdf' });
        }
        const before = fs.readdirSync(carDir).length;
        const refused = await upload(application);
        expect(refused.status).toBe(409);
        expect(refused.body).toMatchObject({ code: 'CAR_FILES_LIMIT' });
        expect(refused.body.error).toMatch(/ไม่เกิน 20 ไฟล์/);
        expect(fs.readdirSync(carDir).length).toBe(before);
        expect((await formDataOf(application.id)).carStagedFiles).toHaveLength(20);
    });

    test('ไฟล์ใหญ่เกิน 10 MB ชนิดไม่รับ หรือข้อบกพร่องที่ไม่มีในรอบ ถูกปฏิเสธพร้อมทางแก้ และไม่เก็บไฟล์', async () => {
        const application = await carPending();
        const before = fs.readdirSync(carDir).sort();
        const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024)]);
        const tooBig = await upload(application, { body: big });
        expect(tooBig.status).toBe(413);
        expect(tooBig.body).toMatchObject({ code: 'CAR_FILE_TOO_LARGE' });
        expect(tooBig.body.error).toMatch(/10 MB.*บีบอัด/);
        const gif = await upload(application, { body: Buffer.from('GIF89a........'), filename: 'x.gif', contentType: 'image/gif' });
        expect(gif.status).toBe(400);
        expect(gif.body).toMatchObject({ code: 'CAR_FILE_TYPE' });
        expect(gif.body.error).toMatch(/PDF หรือรูปภาพ JPG และ PNG/);
        const fakePdf = await upload(application, { body: Buffer.from('this is plain text, not a pdf at all '.repeat(100)) });
        expect(fakePdf.status).toBe(400);
        expect(fakePdf.body.error).toMatch(/อ่านชนิด/);
        const noSuchDefect = await upload(application, { findingNo: 3 });
        expect(noSuchDefect.status).toBe(400);
        expect(noSuchDefect.body).toMatchObject({ code: 'CAR_FILE_FINDING_INVALID' });
        expect(fs.readdirSync(carDir).sort()).toEqual(before);
        expect((await formDataOf(application.id)).carStagedFiles ?? []).toEqual([]);
    });

    test('ส่งรอบ: ไฟล์ที่เลือกไปอยู่ในหลักฐานพร้อมข้อบกพร่อง ไฟล์ที่ไม่ได้เลือกถูกลบ ไฟล์ที่ลบออกเองหายจากที่เก็บ', async () => {
        const application = await carPending();
        const a = (await upload(application, { findingNo: 1 })).body.data.file;
        const b = (await upload(application, { findingNo: 2 })).body.data.file;
        const c = (await upload(application, { findingNo: 2 })).body.data.file;
        const d2 = (await upload(application, { findingNo: 1 })).body.data.file;
        asApplicant();
        const removed = await request(app).delete(`/api/applications/${application.id}/car/files/${d2.id}`);
        expect(removed.status).toBe(200);
        expect(stored(d2)).toBe(false);

        const res = await send(application, [{ id: a.id, findingNo: 1 }, { id: b.id, findingNo: 1 }]);
        expect(res.status).toBe(200);
        expect(await statusOf(application.id)).toBe('CAR_REVIEWING');
        const formData = await formDataOf(application.id);
        expect(formData.carStagedFiles).toEqual([]);
        expect(formData.carDocuments.map((doc) => [doc.id, doc.findingNo])).toEqual([[a.id, 1], [b.id, 1]]);
        expect(formData.carNotes).toBe('แก้ครบแล้ว');
        expect([stored(a), stored(b), stored(c)]).toEqual([true, true, false]);
    });

    test('ส่งไฟล์ของคำขออื่น หรือไฟล์ที่หายจากที่เก็บ ถูกปฏิเสธ สถานะไม่เปลี่ยน', async () => {
        const mine = await carPending();
        const other = await carPending();
        const foreign = (await upload(other)).body.data.file;
        const own = (await upload(mine)).body.data.file;

        const foreignRes = await send(mine, [{ id: own.id, findingNo: 1 }, { id: foreign.id, findingNo: 1 }]);
        expect(foreignRes.status).toBe(409);
        expect(foreignRes.body).toMatchObject({ code: 'CAR_FILE_NOT_STAGED' });
        expect(await statusOf(mine.id)).toBe('CAR_PENDING');

        fs.unlinkSync(path.join(carDir, own.id));
        const missing = await send(mine, [{ id: own.id, findingNo: 1 }]);
        expect(missing.status).toBe(409);
        expect(missing.body).toMatchObject({ code: 'CAR_FILE_MISSING' });
        expect(missing.body.error).toMatch(/อัปโหลดใหม่/);
        expect(await statusOf(mine.id)).toBe('CAR_PENDING');

        const none = await send(mine, []);
        expect(none.status).toBe(400);
        expect(none.body).toMatchObject({ code: 'CAR_FILES_REQUIRED' });
    });

    test('อัปโหลดซ้ำด้วยไฟล์เดียวกันใต้ข้อเดียวกันในรอบเดียวกัน ได้ไฟล์เดิมคืน ไม่นับโควตา 20 ไฟล์ซ้ำ และไม่เก็บไฟล์ใหม่', async () => {
        const application = await carPending();
        const same = anotherPdf();
        const first = await upload(application, { findingNo: 1, body: same });
        expect(first.status).toBe(200);
        const before = fs.readdirSync(carDir).length;
        const retried = await upload(application, { findingNo: 1, body: same });
        expect(retried.status).toBe(200);
        expect(retried.body.data.file.id).toBe(first.body.data.file.id);
        expect(fs.readdirSync(carDir).length).toBe(before);
        expect((await formDataOf(application.id)).carStagedFiles.map((doc) => doc.id)).toEqual([first.body.data.file.id]);

        const otherDefect = await upload(application, { findingNo: 2, body: same });
        expect(otherDefect.body.data.file.id).not.toBe(first.body.data.file.id);
        expect((await formDataOf(application.id)).carStagedFiles).toHaveLength(2);
    });

    test('ผู้ตรวจพื้นที่บันทึกผ่านไม่ได้จนกว่าจะเปิดทุกไฟล์ของรอบด้วยตัวเอง ผู้ตรวจคนอื่นเปิดไม่ได้', async () => {
        const application = await carPending();
        const one = (await upload(application, { findingNo: 1 })).body.data.file;
        const two = (await upload(application, { findingNo: 2 })).body.data.file;
        expect((await send(application, [{ id: one.id, findingNo: 1 }, { id: two.id, findingNo: 2 }])).status).toBe(200);

        const { recordInspectionResult } = require('../../services/inspection-result-service');
        const pass = () => raw.$transaction((tx) => recordInspectionResult(tx, {
            applicationId: application.id, expectedStatus: 'CAR_REVIEWING', inspectorId: fx.inspector.id,
            inspectorRole: 'field_inspector', verdict: 'PASS', notes: 'หลักฐานครบ',
        }));
        const open = (who, file) => {
            asStaff(who);
            return request(app).get(`/api/provider/auditor/applications/${application.id}/car-evidence/${file.id}`)
                .buffer(true).parse((res, cb) => { const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => cb(null, Buffer.concat(parts))); });
        };

        await expect(pass()).rejects.toMatchObject({ code: 'CAR_EVIDENCE_NOT_OPENED' });
        expect((await open(fx.inspector2, one)).status).toBe(404);
        expect((await open(fx.foreignInspector, one)).status).toBe(404);

        const first = await open(fx.inspector, one);
        expect(first.status).toBe(200);
        expect(first.body.subarray(0, 5).toString()).toBe('%PDF-');
        await expect(pass()).rejects.toMatchObject({ code: 'CAR_EVIDENCE_NOT_OPENED' });

        expect((await open(fx.inspector, two)).status).toBe(200);
        const views = (await formDataOf(application.id)).carEvidenceViews;
        expect(Object.keys(views).sort()).toEqual([one.id, two.id].sort());
        expect(Object.keys(views[one.id])).toEqual([fx.inspector.id]);
        await expect(pass()).resolves.toMatchObject({ toStatus: 'AUDIT_PASSED' });
    });
});
