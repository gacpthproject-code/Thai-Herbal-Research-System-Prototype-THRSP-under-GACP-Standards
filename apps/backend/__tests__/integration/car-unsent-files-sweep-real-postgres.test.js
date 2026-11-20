'use strict';

/**
 * คำสั่ง 129(2)(3): งานกวาดลบเฉพาะไฟล์ที่ระบบบันทึกไว้ว่าอัปโหลดแล้วแต่ยังไม่ได้ส่ง (formData.carStagedFiles)
 * เมื่อพ้นกำหนดส่งของรอบหรือครบ 7 วันนับจากอัปโหลด แล้วแต่ถึงก่อน ไฟล์ใน uploads/car ที่ไม่มีใครอ้างถึงถูกรายงาน ไม่ถูกลบ
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');
const { filedFormData } = require('../../test-support/filed-application');
const { stageCarFile, CAR_DIR } = require('../../test-support/car-staged-file');

const DAY = 86400000;
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

d('งานกวาดไฟล์ CAR ที่ไม่ได้ส่ง (real Postgres)', () => {
    let raw;
    let fx;
    let runCarStagedFilesSweep;

    const flagBefore = process.env.CAR_UNSENT_SWEEP_ENABLED;

    beforeAll(async () => {
        process.env.CAR_UNSENT_SWEEP_ENABLED = 'true';
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'carsw');
        ({ runCarStagedFilesSweep } = require('../../services/car-staged-files-sweep'));
    }, 120000);

    afterAll(async () => {
        if (flagBefore === undefined) { delete process.env.CAR_UNSENT_SWEEP_ENABLED; } else { process.env.CAR_UNSENT_SWEEP_ENABLED = flagBefore; }
        await fx.cleanup();
        await raw.$disconnect();
    });

    const stored = (entry) => fs.existsSync(path.join(CAR_DIR, entry.filename));
    const stagedOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { formData: true } })).formData.carStagedFiles;
    const metadataOf = (row) => (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata);
    const deletionsOf = async (id) => (await raw.auditLog.findMany({ where: { action: 'CAR_UNSENT_FILE_DELETED' }, orderBy: { createdAt: 'asc' } }))
        .filter((row) => metadataOf(row).applicationId === id);

    async function carRound({ status = 'CAR_PENDING', dueInDays = 5, carDocuments = [] } = {}) {
        const requestedAt = new Date(Date.now() - 3600000).toISOString();
        return fx.makeApplication({
            status, auditorId: fx.inspector.id,
            formData: filedFormData({
                workflowState: status,
                carRequestedAt: requestedAt,
                carDueAt: new Date(Date.now() + dueInDays * DAY).toISOString(),
                carRequest: { message: 'แก้ป้ายแปลง', requestedAt, items: [] },
                carDocuments,
            }),
        });
    }

    function orphanOnDisk(ageDays) {
        fs.mkdirSync(CAR_DIR, { recursive: true });
        const file = path.join(CAR_DIR, `CAR-orphan-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
        fs.writeFileSync(file, PDF);
        const at = new Date(Date.now() - ageDays * DAY);
        fs.utimesSync(file, at, at);
        return file;
    }

    test('ไฟล์ที่ไม่มีใครอ้างถึงแต่ไม่ได้อยู่ในสถานะอัปโหลดแล้วไม่ได้ส่ง ไม่ถูกลบ และถูกรายงานพร้อมที่อยู่ไฟล์', async () => {
        const orphan = orphanOnDisk(30);
        try {
            const summary = await runCarStagedFilesSweep({ prisma: raw });
            expect(fs.existsSync(orphan)).toBe(true);
            expect(summary.unreferenced).toBeGreaterThanOrEqual(1);
            expect(summary.unreferencedPaths).toContain(`/uploads/car/${path.basename(orphan)}`);
        } finally {
            fs.rmSync(orphan, { force: true });
        }
    });

    test('ไฟล์หลักฐานที่ส่งแล้วไม่ถูกแตะ แม้เก่ากว่า 7 วันและพ้นกำหนดรอบแล้ว', async () => {
        fs.mkdirSync(CAR_DIR, { recursive: true });
        const filename = `CAR-sent-${Date.now()}.pdf`;
        fs.writeFileSync(path.join(CAR_DIR, filename), PDF);
        const sent = { id: filename, filename, path: `/uploads/car/${filename}`, findingNo: 1, uploadedAt: new Date().toISOString() };
        await carRound({ status: 'CAR_REVIEWING', carDocuments: [sent] });
        await runCarStagedFilesSweep({ prisma: raw, now: new Date(Date.now() + 40 * DAY) });
        expect(stored(sent)).toBe(true);
        fs.rmSync(path.join(CAR_DIR, filename), { force: true });
    });

    test('ไฟล์ค้างที่ยังไม่ถึงกำหนดและยังไม่ครบ 7 วันอยู่ต่อ', async () => {
        const app = await carRound({ dueInDays: 5 });
        const entry = await stageCarFile(raw, app.id);
        await runCarStagedFilesSweep({ prisma: raw, now: new Date(Date.now() + 4 * DAY) });
        expect(stored(entry)).toBe(true);
        expect((await stagedOf(app.id)).map((e) => e.id)).toEqual([entry.id]);
        expect(await deletionsOf(app.id)).toEqual([]);
    });

    test('พ้นกำหนดส่งของรอบก่อนครบ 7 วัน: ไฟล์ค้างถูกลบ เหตุผล deadline และบันทึกการลบไม่มีชื่อไฟล์เดิม', async () => {
        const app = await carRound({ dueInDays: 3 });
        const entry = await stageCarFile(raw, app.id);
        const formData = (await raw.application.findUnique({ where: { id: app.id }, select: { formData: true } })).formData;
        const now = new Date(Date.now() + 4 * DAY);
        const summary = await runCarStagedFilesSweep({ prisma: raw, now });
        expect(summary.unsentDeleted).toBeGreaterThanOrEqual(1);
        expect(stored(entry)).toBe(false);
        expect(await stagedOf(app.id)).toEqual([]);
        const rows = await deletionsOf(app.id);
        expect(rows).toHaveLength(1);
        expect([rows[0].actorType, rows[0].resourceType, rows[0].resourceId]).toEqual(['SYSTEM', 'DOCUMENT', entry.id]);
        expect(metadataOf(rows[0])).toEqual({
            applicationId: app.id, roundId: new Date(formData.carDueAt).toISOString(), reason: 'deadline', deletedAt: now.toISOString(),
        });
        expect(JSON.stringify(rows[0])).not.toContain(entry.originalName);
    });

    test('ครบ 7 วันนับจากอัปโหลดก่อนถึงกำหนดส่ง: ไฟล์ค้างถูกลบ เหตุผล 7days ไฟล์อื่นที่ยังไม่ครบอยู่ต่อ', async () => {
        const app = await carRound({ dueInDays: 30 });
        const old = await stageCarFile(raw, app.id);
        await raw.$executeRaw`
            UPDATE applications SET "formData" = jsonb_set("formData", '{carStagedFiles,0,uploadedAt}', to_jsonb(${new Date(Date.now() - 3 * DAY).toISOString()}::text))
            WHERE id = ${app.id}`;
        const fresh = await stageCarFile(raw, app.id, { findingNo: 1 });
        const now = new Date(Date.now() + 5 * DAY);
        await runCarStagedFilesSweep({ prisma: raw, now });
        expect([stored(old), stored(fresh)]).toEqual([false, true]);
        expect((await stagedOf(app.id)).map((e) => e.id)).toEqual([fresh.id]);
        expect((await deletionsOf(app.id)).map((row) => [row.resourceId, metadataOf(row).reason])).toEqual([[old.id, '7days']]);
    });

    test('คำขอที่ออกจาก CAR_PENDING แล้วใช้กฎเดียวกัน: ไฟล์ค้างอยู่จนพ้นกำหนดหรือครบ 7 วัน', async () => {
        const app = await carRound({ status: 'CANCELLED', dueInDays: 30 });
        const entry = await stageCarFile(raw, app.id);
        await runCarStagedFilesSweep({ prisma: raw, now: new Date(Date.now() + DAY) });
        expect(stored(entry)).toBe(true);
        await runCarStagedFilesSweep({ prisma: raw, now: new Date(Date.now() + 7 * DAY + 60000) });
        expect(stored(entry)).toBe(false);
        expect(await stagedOf(app.id)).toEqual([]);
    });

    test('dry-run นับสิ่งที่จะลบ แต่ไม่ลบไฟล์ ไม่แก้ข้อมูล ไม่เขียนบันทึก และรอบจริงซ้ำไม่พบอะไรอีก', async () => {
        const app = await carRound({ dueInDays: 1 });
        const entry = await stageCarFile(raw, app.id);
        const now = new Date(Date.now() + 2 * DAY);
        const preview = await runCarStagedFilesSweep({ prisma: raw, now, dryRun: true });
        expect(preview.unsentDeleted).toBeGreaterThanOrEqual(1);
        expect(stored(entry)).toBe(true);
        expect(await stagedOf(app.id)).toHaveLength(1);
        expect(await deletionsOf(app.id)).toEqual([]);
        await runCarStagedFilesSweep({ prisma: raw, now });
        expect(await runCarStagedFilesSweep({ prisma: raw, now, dryRun: true })).toMatchObject({ unsentDeleted: 0 });
        expect(await deletionsOf(app.id)).toHaveLength(1);
    });

    test('ก่อน operator เปิด CAR_UNSENT_SWEEP_ENABLED รอบจริงไม่ลบอะไร นับสิ่งที่จะลบและบอกว่าปิดอยู่', async () => {
        const app = await carRound({ dueInDays: 1 });
        const entry = await stageCarFile(raw, app.id);
        const now = new Date(Date.now() + 2 * DAY);
        process.env.CAR_UNSENT_SWEEP_ENABLED = '';
        try {
            const summary = await runCarStagedFilesSweep({ prisma: raw, now });
            expect(summary).toMatchObject({ disabled: 1 });
            expect(summary.unsentDeleted).toBeGreaterThanOrEqual(1);
        } finally {
            process.env.CAR_UNSENT_SWEEP_ENABLED = 'true';
        }
        expect(stored(entry)).toBe(true);
        expect(await stagedOf(app.id)).toHaveLength(1);
        expect(await deletionsOf(app.id)).toEqual([]);
        await runCarStagedFilesSweep({ prisma: raw, now });
        expect(stored(entry)).toBe(false);
    });
});
