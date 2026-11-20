/**
 * เครื่องมือผู้จัดคิวครบตามเส้นที่อนุมัติ (real Postgres)
 *
 * คำสั่ง 27 (operator 2026-10-06) และเส้น 12 ขั้น (application-flow-confirmed-2026-10-06):
 * ชำระงวด 1 → คิวผู้จัดคิว → มอบผู้ตรวจเอกสาร · ชำระงวด 2 → ผู้จัดคิวเลือกผู้ตรวจพื้นที่ + วัน → AUDIT_CONFIRMED ·
 * ข้อบกพร่องร้ายแรง = หลักฐานแก้ไขก่อน ลงพื้นที่ซ้ำเฉพาะเมื่อผู้ตรวจระบุ แล้วผู้จัดคิวนัดจากสถานะนั้น ·
 * ไม่มีการตรวจแบบออนไลน์ · กำหนดเวลาของคิวนับวันทำการเป็นค่ามีวันที่กำกับ · แจ้งเตือนที่ผู้จัดคิวส่งถึงผู้ยื่นและผู้ถือ ·
 * จำนวนงานสูงสุดต่อผู้ตรวจเป็นค่ามีวันที่กำกับ · รายงาน role-workflow-auditor 2026-10-06 dispatcher D4-D11
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { addWorkingDays, startOfLocalDay, countWorkingDaysBetween } = require('../../utils/working-days');

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

const OPEN = ['TODO', 'CLAIMED', 'IN_PROGRESS'];

d('เครื่องมือผู้จัดคิว (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [] };
    let seq = 0;
    let slotDay = 3;

    const as = (user) => { mockActor.current = { ...user }; };
    const rowOf = (id) => raw.application.findUnique({
        where: { id }, select: { status: true, reviewerId: true, auditorId: true, formData: true },
    });
    const tasks = (applicationId, workType) => raw.workActivity.findMany({ where: { applicationId, workType }, orderBy: { createdAt: 'asc' } });
    const noticesOf = (userId, applicationNumber) => raw.notification.findMany({
        where: { userId, message: { contains: applicationNumber } },
    });

    /** a working day ahead, 09:00 Bangkok, each call a different day so the per-day cap never interferes */
    function nextSlot() {
        slotDay += 1;
        const day = startOfLocalDay(addWorkingDays(new Date(), slotDay));
        return new Date(day.getTime() + 9 * 60 * 60 * 1000);
    }

    async function staff(role, organizationId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `dt-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `dt-${seq}-${sfx}`, email: `dt-${seq}-${sfx}@example.test`,
                firstName: `เจ้าหน้าที่${seq}`, lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function healthUser(tag, organizationId) {
        const id = crypto.randomUUID();
        await raw.user.create({
            data: {
                id, canonicalId: `dt-${tag}-${sfx}`, healthId: `dt-${tag}-${sfx}`, password: 'x', role: 'health',
                authType: 'EMAIL_LEGACY', email: `dt-${tag}-${sfx}@example.test`, firstName: tag, lastName: 'ทดสอบ', organizationId,
            },
        });
        fx.userIds.push(id);
        return { id, canonicalId: `dt-${tag}-${sfx}` };
    }

    async function application(status, { milestones = [], org = fx.orgA, formData = {}, ...extra } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-DT-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: org, entityId: org === fx.orgA ? fx.entityA : fx.entityB, submitterId: fx.applicant.id, status,
                formData: {
                    workflowState: status,
                    farmData: {
                        siteName: 'แปลงทดสอบผู้จัดคิว', siteAddress: '99 หมู่ 1', subDistrict: 'ทดสอบ', district: 'เมือง',
                        province: 'เชียงใหม่', postalCode: '50000', latitude: 18.7883, longitude: 98.9853,
                    },
                    ...formData,
                },
                ...extra,
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId: org }, milestones);
        for (const invoice of await raw.invoice.findMany({ where: { applicationId: row.id }, select: { id: true } })) {
            await raw.invoice.update({ where: { id: invoice.id }, data: { receiptNumber: `RC-${invoice.id}`, receiptIssuedAt: new Date() } });
        }
        return row;
    }

    /** the settlement's own write: SYSTEM moves a paid application into the dispatcher's queue */
    async function settledInto(toStatus, extra = {}) {
        const { writeApplicationStatus } = require('../../services/application-status-writer');
        const fromStatus = toStatus === 'DOC_FEE_PAID' ? 'PENDING_DOC_FEE' : 'PENDING_AUDIT_FEE';
        const row = await application(fromStatus, { milestones: toStatus === 'DOC_FEE_PAID' ? ['M1'] : ['M1', 'M2'], ...extra });
        await writeApplicationStatus({
            prisma: raw, applicationId: row.id, fromStatus, toStatus, actorId: null, actorRole: 'system', reason: 'TEST_SETTLED',
        });
        return row;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `dt-${tag}-${sfx}`, slug: `dt-${tag}-${sfx}`, code: `DT${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;

        fx.dispatcherA = await staff('dispatcher', fx.orgA);
        fx.dispatcherB = await staff('dispatcher', fx.orgB);
        fx.reviewerA = await staff('document_reviewer', fx.orgA);
        fx.reviewerA2 = await staff('document_reviewer', fx.orgA);
        fx.inspectorA = await staff('field_inspector', fx.orgA);
        fx.inspectorA2 = await staff('field_inspector', fx.orgA);
        fx.financeA = await staff('finance_officer_platform', fx.orgA);
        fx.adminA = await staff('system_admin_dtam', fx.orgA);

        fx.applicant = await healthUser('applicant', fx.orgA);
        fx.holderMember = await healthUser('holder', fx.orgA);
        fx.entityA = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท dt-a ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
        fx.entityB = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท dt-b ${sfx} จำกัด`, organizationId: fx.orgB } })).id;
        fx.entityIds.push(fx.entityA, fx.entityB);
        for (const userId of [fx.applicant.id, fx.holderMember.id]) {
            await raw.entityMembership.create({ data: { userId, entityId: fx.entityA, role: 'ADMIN', status: 'ACTIVE', organizationId: fx.orgA } });
        }

        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
        app.use('/api/audits', require('../../routes/api/audit/audits'));
        app.use('/api/provider/work', require('../../routes/api/provider/work'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/admin/work-config', require('../../routes/api/provider/admin-work-config'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['checkoutOrder', 'workActivity', 'revisionDeadline', 'correctionRound', 'invoice', 'auditChecklist']) {
            await wipe(model, byApp);
        }
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    describe('งานจัดคิวปิดเมื่อคำขอพ้นขั้นตอน และกำหนดเวลานับวันทำการ', () => {
        test('ชำระงวด 1 แล้วเกิดงานจัดคิว กำหนดเวลา = วันทำการตามค่าที่มีผล (สิ้นวันทำการกรุงเทพฯ ไม่ใช่ +24 ชั่วโมง)', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            const [task] = await tasks(row.id, 'SCHEDULING');
            expect(task).toBeTruthy();
            const { queueTimeLimitsAt } = require('../../services/dispatcher-rules');
            const rule = queueTimeLimitsAt(task.createdAt);
            expect(task.dueAt.toISOString()).toBe(addWorkingDays(task.createdAt, rule.dueWorkingDays).toISOString());
            expect(task.dueAt.getTime()).not.toBe(task.createdAt.getTime() + 24 * 60 * 60 * 1000);
        });

        test('มอบหมายผู้ตรวจเอกสาร → งานจัดคิวของขั้นที่รอมอบหมายปิด โดยผู้จัดคิวคนนั้น', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: row.id, reviewerId: fx.reviewerA.id });
            expect(res.status).toBe(200);
            const [task] = await tasks(row.id, 'SCHEDULING');
            expect(task.state).toBe('DONE');
            expect(task.completedBy).toBe(fx.dispatcherA.id);
        });

        test('นัดตรวจจากหน้าปฏิทิน → งานจัดคิวของขั้นที่รอนัดปิด', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            expect((await tasks(row.id, 'SCHEDULING'))[0].state).toBe('TODO');
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ', inspectionMode: 'ONSITE',
            });
            expect(res.status).toBe(201);
            const open = (await tasks(row.id, 'SCHEDULING')).filter((t) => OPEN.includes(t.state));
            expect(open).toHaveLength(0);
        });

        test('นัดตรวจจากคิวจัดตาราง → งานจัดคิวปิดเหมือนกัน', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            as(fx.dispatcherA);
            const when = nextSlot();
            const { isoDate } = require('../../utils/working-days').getZonedParts(when);
            const res = await request(app).post('/api/audit/scheduling/assign').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: isoDate, scheduledTime: '09:00', location: 'แปลงทดสอบ',
            });
            expect(res.status).toBe(201);
            const open = (await tasks(row.id, 'SCHEDULING')).filter((t) => OPEN.includes(t.state));
            expect(open).toHaveLength(0);
        });

        test('เฝ้าระวังงานค้าง: นับวันทำการที่รอ ไม่ใช่ชั่วโมง และระดับมาจากเกณฑ์ที่มีวันที่กำกับ', async () => {
            const row = await application('DOC_FEE_PAID', { milestones: ['M1'] });
            await raw.$executeRaw`UPDATE applications SET "updatedAt" = now() - interval '9 days' WHERE id = ${row.id}`;
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/urgent-monitor');
            expect(res.status).toBe(200);
            const item = res.body.data.stuckItems.find((it) => it.applicationNumber === row.applicationNumber);
            expect(item).toBeTruthy();
            expect(item).not.toHaveProperty('hoursStuck');
            const updatedAt = (await raw.application.findUnique({ where: { id: row.id }, select: { updatedAt: true } })).updatedAt;
            expect(item.workingDaysWaiting).toBe(countWorkingDaysBetween(updatedAt, new Date()));
            const { queueTimeLimitsAt } = require('../../services/dispatcher-rules');
            const rule = queueTimeLimitsAt(new Date());
            const expected = item.workingDaysWaiting >= rule.criticalAfterWorkingDays ? 'CRITICAL'
                : item.workingDaysWaiting >= rule.urgentAfterWorkingDays ? 'WARNING' : 'INFO';
            expect(item.severity).toBe(expected);
        });
    });

    describe('คิวงานแสดงวันทำการ ไม่ใช่ชั่วโมง', () => {
        test('งานจัดคิวในกล่องงานบอกจำนวนวันทำการที่เหลือจากกำหนดเวลา', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/work/queue?group=dispatcher');
            expect(res.status).toBe(200);
            const item = res.body.data.find((it) => it.applicationId === row.id);
            expect(item).toBeTruthy();
            expect(item.workingDaysLeft).toBe(countWorkingDaysBetween(new Date(), new Date(item.dueAt)));
        });
    });

    describe('ข้อมูลรูปแบบ seed เก่าไม่ทำให้หน้าผู้จัดคิวพัง', () => {
        test('คำขอที่ไม่มีผู้ถือ ไม่มีแปลง ไม่มีใบแจ้งหนี้ และมีรูปแบบนัดออนไลน์ค้าง: ทุกประตูตอบ 200', async () => {
            seq += 1;
            const legacy = await raw.application.create({
                data: {
                    applicationNumber: `APP-68-DT${seq}-${sfx}`, healthId: fx.applicant.canonicalId, organizationId: fx.orgA,
                    submitterId: fx.applicant.id, status: 'AUDIT_FEE_PAID', areaType: 'OUTDOOR',
                    formData: { firstName: 'สมหญิง', lastName: 'ปลูกดี', auditSchedule: { inspectionMode: 'ONLINE_MEET', meetingLink: 'https://meet.example.test/old' } },
                },
            });
            fx.appIds.push(legacy.id);
            as(fx.dispatcherA);
            for (const path of [
                '/api/provider/scheduler/dashboard?limit=200',
                '/api/provider/scheduler/urgent-monitor',
                '/api/provider/scheduler/auditor-workload',
                '/api/provider/scheduler/audits/schedules?limit=200',
                '/api/audit/scheduling/queue',
                `/api/provider/scheduler/applications/${legacy.id}`,
            ]) {
                const res = await request(app).get(path);
                expect([path, res.status]).toEqual([path, 200]);
                expect(JSON.stringify(res.body)).not.toContain('meet.example.test');
            }
        });
    });

    describe('ภาระงานและเพดานงานต่อผู้ตรวจ', () => {
        test('ผู้ตรวจเอกสารที่ถืองานอยู่ นับเป็นภาระงาน · เพดานมาจากค่ามีวันที่กำกับ ไม่ใช่ตัวแปรสภาพแวดล้อม', async () => {
            const reviewer = await staff('document_reviewer', fx.orgA);
            await application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: reviewer.id });
            const before = process.env.AUDITOR_MAX_CONCURRENT_AUDITS;
            process.env.AUDITOR_MAX_CONCURRENT_AUDITS = '9';
            try {
                as(fx.dispatcherA);
                const res = await request(app).get('/api/provider/scheduler/auditor-workload');
                expect(res.status).toBe(200);
                const mine = res.body.data.auditors.find((row) => row.id === reviewer.id);
                expect(mine.activeAssignments).toBe(1);
                const { officerWorkloadCapsAt } = require('../../services/dispatcher-rules');
                expect(mine.capacity).toBe(officerWorkloadCapsAt(new Date()).documentReviewer.openApplications);
                expect(mine.capacity).not.toBe(9);
            } finally {
                if (before === undefined) { delete process.env.AUDITOR_MAX_CONCURRENT_AUDITS; } else { process.env.AUDITOR_MAX_CONCURRENT_AUDITS = before; }
            }
        });
    });

    describe('แจ้งเตือน', () => {
        test('ชำระแล้ว ผู้จัดคิวขององค์กรได้รับแจ้งว่ามีงานเข้าคิว · ผู้จัดคิวองค์กรอื่นไม่ได้', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            const { notifyPaymentSuccess } = require('../../services/notification/domain-helpers');
            await notifyPaymentSuccess(row.id, 'M1', { checkoutOrderId: null });
            expect(await noticesOf(fx.dispatcherA.id, row.applicationNumber)).toHaveLength(1);
            expect(await noticesOf(fx.dispatcherB.id, row.applicationNumber)).toHaveLength(0);
        });

        test('แจ้งผู้จัดคิวไม่ใช้เลขคำสั่งชำระ ซึ่งเป็นเครื่องหมายว่าแจ้งผู้ยื่นแล้ว (L1)', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            const checkoutOrderId = crypto.randomUUID();
            const { notifyPaymentSuccess } = require('../../services/notification/domain-helpers');
            await notifyPaymentSuccess(row.id, 'M1', { checkoutOrderId });
            const marked = await raw.notification.findMany({ where: { metadata: { path: ['checkoutOrderId'], equals: checkoutOrderId } } });
            expect(new Set(marked.map((n) => n.userId))).toEqual(new Set([fx.applicant.id, fx.holderMember.id]));
            expect(await noticesOf(fx.dispatcherA.id, row.applicationNumber)).toHaveLength(1);
        });

        test('มอบหมายผู้ตรวจเอกสาร: แจ้งทั้งผู้ยื่นและผู้ถือ', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: row.id, reviewerId: fx.reviewerA.id });
            expect(res.status).toBe(200);
            expect((await noticesOf(fx.applicant.id, row.applicationNumber)).length).toBeGreaterThan(0);
            expect((await noticesOf(fx.holderMember.id, row.applicationNumber)).length).toBeGreaterThan(0);
        });

        test('แจ้งเตือนด้วยมือจากผู้จัดคิว: ถึงทั้งผู้ยื่นและผู้ถือ', async () => {
            const row = await application('REVISION_REQUESTED', { milestones: ['M1'], reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const res = await request(app).post(`/api/provider/scheduler/applications/${row.id}/send-reminder`).send({});
            expect(res.status).toBe(200);
            expect((await noticesOf(fx.applicant.id, row.applicationNumber)).length).toBeGreaterThan(0);
            expect((await noticesOf(fx.holderMember.id, row.applicationNumber)).length).toBeGreaterThan(0);
        });
    });

    describe('สลับผู้ตรวจเอกสาร', () => {
        test('งานตรวจเอกสารและข้อมูลมอบหมายย้ายไปผู้ตรวจคนใหม่ และแจ้งผู้ยื่นกับผู้ถือ', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            as(fx.dispatcherA);
            expect((await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: row.id, reviewerId: fx.reviewerA.id })).status).toBe(200);
            const [before] = await tasks(row.id, 'DOC_REVIEW');
            expect(before.assignedUserId).toBe(fx.reviewerA.id);

            const res = await request(app).post(`/api/provider/scheduler/reviewer-assignments/${row.id}/reassign`)
                .send({ newReviewerId: fx.reviewerA2.id, reason: 'ผู้ตรวจเดิมลา' });
            expect(res.status).toBe(200);
            const reviewTasks = (await tasks(row.id, 'DOC_REVIEW')).filter((t) => OPEN.includes(t.state));
            expect(reviewTasks).toHaveLength(1);
            expect(reviewTasks[0].assignedUserId).toBe(fx.reviewerA2.id);
            const stored = await rowOf(row.id);
            expect(stored.reviewerId).toBe(fx.reviewerA2.id);
            expect(stored.formData.PROVIDERAssignment.reviewerId).toBe(fx.reviewerA2.id);
            const holderNotices = await noticesOf(fx.holderMember.id, row.applicationNumber);
            expect(holderNotices.some((n) => n.title.includes('เปลี่ยนผู้ตรวจเอกสาร'))).toBe(true);
        });
    });

    describe('สลับผู้ตรวจเอกสารแข่งกับคนอื่น (F6)', () => {
        const pause = (ms) => new Promise((r) => setTimeout(r, ms));
        /** The other party's write, committed while the reassignment waits on the row. */
        async function whileHeld(id, data, send) {
            let release;
            let locked;
            const gate = new Promise((r) => { release = r; });
            const isLocked = new Promise((r) => { locked = r; });
            const done = raw.$transaction(async (tx) => {
                // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the other party's committed write
                await tx.application.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
                locked();
                await gate;
            }, { timeout: 30000 });
            await isLocked;
            const pending = send().then((r) => r);
            await pause(1500);
            release();
            await done;
            return pending;
        }
        async function underReview() {
            const row = await settledInto('DOC_FEE_PAID');
            as(fx.dispatcherA);
            expect((await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: row.id, reviewerId: fx.reviewerA.id })).status).toBe(200);
            return row;
        }
        const reassign = (id, newReviewerId) => request(app).post(`/api/provider/scheduler/reviewer-assignments/${id}/reassign`)
            .send({ newReviewerId, reason: 'ผู้ตรวจเดิมลา' });
        const openReviewTask = async (id) => (await tasks(id, 'DOC_REVIEW')).filter((t) => OPEN.includes(t.state));

        test('สลับผู้ตรวจที่อ่านคำขอก่อนผู้ตรวจเดิมตัดสินเอกสาร ไม่เปลี่ยนผู้ตรวจของแฟ้มที่ตัดสินแล้ว', async () => {
            const row = await underReview();
            const decided = { ...(await rowOf(row.id)).formData, workflowState: 'DOC_APPROVED' };
            as(fx.dispatcherA);
            const res = await whileHeld(row.id, { status: 'DOC_APPROVED', formData: decided }, () => reassign(row.id, fx.reviewerA2.id));
            expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
            const stored = await rowOf(row.id);
            expect([stored.status, stored.reviewerId, stored.formData.workflowState]).toEqual(['DOC_APPROVED', fx.reviewerA.id, 'DOC_APPROVED']);
            expect((await openReviewTask(row.id)).map((t) => t.assignedUserId)).toEqual([fx.reviewerA.id]);
        });

        test('ผู้จัดคิวสองคนสลับพร้อมกัน: คนหลังถูกปฏิเสธ การสลับของคนแรกคงอยู่', async () => {
            const row = await underReview();
            const third = await staff('document_reviewer', fx.orgA);
            const firstSwap = { ...(await rowOf(row.id)).formData, reviewerName: 'ผู้ตรวจที่คนแรกเลือก' };
            as(fx.dispatcherA);
            const res = await whileHeld(row.id, { reviewerId: fx.reviewerA2.id, formData: firstSwap }, () => reassign(row.id, third.id));
            expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
            const stored = await rowOf(row.id);
            expect([stored.reviewerId, stored.formData.reviewerName]).toEqual([fx.reviewerA2.id, 'ผู้ตรวจที่คนแรกเลือก']);
            expect((await openReviewTask(row.id)).map((t) => t.assignedUserId)).not.toContain(third.id);
        });
    });

    describe('สลับผู้ตรวจพื้นที่แข่งกับคนอื่น (N3)', () => {
        const pause = (ms) => new Promise((r) => setTimeout(r, ms));
        /** The other party's write, committed while the reassignment waits on the row. */
        async function whileHeld(id, data, send) {
            let release;
            let locked;
            const gate = new Promise((r) => { release = r; });
            const isLocked = new Promise((r) => { locked = r; });
            const done = raw.$transaction(async (tx) => {
                await tx.application.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
                locked();
                await gate;
            }, { timeout: 30000 });
            await isLocked;
            const pending = send().then((r) => r);
            await pause(1500);
            release();
            await done;
            return pending;
        }
        // During a correction the reason comes from the list (order 60(a)); before the visit it is the dispatcher's words.
        const reassign = (id, newAuditorId) => request(app).post(`/api/audits/reassign/${id}/reassign`)
            .send({ newAuditorId, reason: 'ผู้ตรวจเดิมลาป่วย', reasonCode: 'INSPECTOR_UNAVAILABLE' });

        test('ตัวควบคุม: สลับผู้ตรวจพื้นที่ได้ ผู้ตรวจคนใหม่อยู่ทั้งบนคำขอและแบบบันทึกการตรวจ', async () => {
            const row = await application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot(),
            });
            await raw.auditChecklist.create({
                data: { applicationId: row.id, templateName: 'GACP_GENERAL', sections: [], auditorId: fx.inspectorA.id, organizationId: fx.orgA },
            });
            as(fx.dispatcherA);
            const res = await reassign(row.id, fx.inspectorA2.id);
            expect(res.status).toBe(200);
            const stored = await rowOf(row.id);
            expect([stored.auditorId, stored.formData._reassignmentHistory.length]).toEqual([fx.inspectorA2.id, 1]);
            expect((await raw.auditChecklist.findFirst({ where: { applicationId: row.id } })).auditorId).toBe(fx.inspectorA2.id);
        });

        test('สลับที่อ่านคำขอก่อนผู้ตรวจขอลงพื้นที่ซ้ำ ไม่ลบคำขอลงพื้นที่ซ้ำและไม่เปลี่ยนผู้ตรวจ', async () => {
            const row = await application('CAR_REVIEWING', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id,
                scheduledDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                formData: { auditDecisions: [{ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' }] },
            });
            const asked = {
                ...(await rowOf(row.id)).formData,
                reinspection: { status: 'REQUESTED', reason: 'ต้องดูของจริง', requestedBy: fx.inspectorA.id },
            };
            as(fx.dispatcherA);
            const res = await whileHeld(row.id, { formData: asked }, () => reassign(row.id, fx.inspectorA2.id));
            expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
            const stored = await rowOf(row.id);
            expect([stored.auditorId, stored.formData.reinspection?.status]).toEqual([fx.inspectorA.id, 'REQUESTED']);
        });

        test('สลับที่อ่านคำขอก่อนผู้จัดคิวอีกคนเลื่อนนัด ไม่ทับวันนัดใหม่และไม่เปลี่ยนผู้ตรวจ', async () => {
            const row = await application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot(),
            });
            const movedTo = nextSlot();
            const rebooked = {
                ...(await rowOf(row.id)).formData,
                auditSchedule: { scheduledDate: movedTo.toISOString(), auditorId: fx.inspectorA.id, rescheduledBy: fx.dispatcherA.id },
            };
            as(fx.dispatcherA);
            const res = await whileHeld(row.id, { scheduledDate: movedTo, formData: rebooked }, () => reassign(row.id, fx.inspectorA2.id));
            expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
            const stored = await rowOf(row.id);
            expect([stored.auditorId, stored.formData.auditSchedule?.scheduledDate]).toEqual([fx.inspectorA.id, movedTo.toISOString()]);
        });
    });

    describe('คิวเดียว', () => {
        test('คำขอที่ยังไม่ชำระงวด 2 ไม่อยู่ในคิวไหนเลย · คำขอที่ชำระแล้วอยู่ทุกคิวเท่ากัน', async () => {
            const paid = await settledInto('AUDIT_FEE_PAID');
            const unpaid = await application('AUDIT_FEE_PAID', { milestones: ['M1'] });
            as(fx.dispatcherA);
            const dashboard = await request(app).get('/api/provider/scheduler/dashboard?limit=200');
            const queue = await request(app).get('/api/audit/scheduling/queue');
            const schedules = await request(app).get('/api/provider/scheduler/audits/schedules?queue=ready_to_schedule&limit=200');
            const numbersIn = {
                dashboard: dashboard.body.data.queues.readyToSchedule.items.map((it) => it.applicationNumber),
                queue: queue.body.data.items.map((it) => it.applicationNumber),
                schedules: schedules.body.data.map((it) => it.applicationNumber),
            };
            for (const numbers of Object.values(numbersIn)) {
                expect(numbers).toContain(paid.applicationNumber);
                expect(numbers).not.toContain(unpaid.applicationNumber);
            }
        });
    });

    describe('รายละเอียดคำขอแบบอ่านอย่างเดียวของผู้จัดคิว', () => {
        test('ผู้จัดคิวเห็นผู้ถือ ที่อยู่แปลง พิกัด สถานะชำระ โดยไม่มีข้อมูลฟอร์มทั้งก้อน', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            as(fx.dispatcherA);
            const res = await request(app).get(`/api/provider/scheduler/applications/${row.id}`);
            expect(res.status).toBe(200);
            const data = res.body.data;
            expect(data.summary.applicationNumber).toBe(row.applicationNumber);
            expect(data.summary.holder.name).toContain('dt-a');
            expect(data.summary.farmAddress).toContain('99 หมู่ 1');
            expect(data.summary.farmLatitude).toBeCloseTo(18.7883);
            expect(data.summary.farmLongitude).toBeCloseTo(98.9853);
            expect(data.payment).toEqual({ m1Paid: true, m2Paid: true });
            expect(JSON.stringify(res.body)).not.toContain('formData');
        });

        test('องค์กรอื่นได้ 404 · บทบาทการเงินได้ 403', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            as(fx.dispatcherB);
            expect((await request(app).get(`/api/provider/scheduler/applications/${row.id}`)).status).toBe(404);
            as(fx.financeA);
            expect((await request(app).get(`/api/provider/scheduler/applications/${row.id}`)).status).toBe(403);
        });
    });

    describe('ผู้จัดคิวอ่านเฉพาะงานของตัวเอง (F8)', () => {
        const detail = (id) => request(app).get(`/api/provider/applications/${id}`);

        test('คำขอที่กำลังพิจารณาหลักฐานแก้ไข ผู้จัดคิวเปิดได้เฉพาะเมื่อผู้ตรวจขอลงพื้นที่ซ้ำ', async () => {
            const reviewing = await application('CAR_REVIEWING', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id,
                formData: { auditDecisions: [{ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' }] },
            });
            const asked = await application('CAR_REVIEWING', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id,
                formData: { reinspection: { status: 'REQUESTED', reason: 'ต้องดูของจริง', requestedBy: fx.inspectorA.id } },
            });
            as(fx.dispatcherA);
            expect((await detail(reviewing.id)).status).toBe(404);
            expect((await detail(asked.id)).status).toBe(200);
            as(fx.inspectorA);
            expect((await detail(reviewing.id)).status).toBe(200);
        });

        test('รายละเอียดคำขอส่งเลขบัตรประชาชนของผู้ยื่นแบบปิดบางส่วนเท่านั้น (คำสั่ง 10)', async () => {
            const row = await application('AUDIT_FEE_PAID', {
                milestones: ['M1', 'M2'],
                formData: { applicantData: { fullName: 'สมชาย ใจดี', idCard: '1100000000008', phone: '0812345678' } },
            });
            as(fx.dispatcherA);
            const res = await detail(row.id);
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).not.toContain('1100000000008');
            expect(res.body.data.formData.applicantData).toMatchObject({ fullName: 'สมชาย ใจดี', idCard: '1-XXXX-XXXX-X-0008' });
            expect(res.body.data.formData.farmData.siteAddress).toBe('99 หมู่ 1');
            expect((await rowOf(row.id)).formData.applicantData.idCard).toBe('1100000000008');
        });
    });

    describe('เลขบัตรประชาชนออกจากประตูของเจ้าหน้าที่แบบปิดบางส่วนเท่านั้น (คำสั่ง 10 · N2 R4)', () => {
        /** A Thai national-ID-shaped number whose 13th digit is the Mod-11 check digit. */
        const thaiId = (first12) => {
            const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (13 - i), 0);
            return `${first12}${(11 - (sum % 11)) % 10}`;
        };
        const ids = {
            idCard: thaiId('110370012345'),
            presidentIdCard: thaiId('310060054321'),
            directorIdCard: thaiId('510040011223'),
            taxId: thaiId('010555612345'),
            nationalId: thaiId('170990033445'),
            authorisedIdCard: thaiId('360110022334'),
            stepIdCard: thaiId('140990011556'),
            staffProviderId: thaiId('380010077889'),
            witness: thaiId('290050066778'),
            historyActor: thaiId('190010044556'),
        };
        const filing = () => ({
            applicantData: {
                fullName: 'สมชาย ใจดี', phone: '0812345678', idCard: ids.idCard, presidentIdCard: ids.presidentIdCard,
                directorIdCard: ids.directorIdCard, taxId: ids.taxId, nationalId: ids.nationalId, authorisedIdCard: ids.authorisedIdCard,
            },
            steps: { 4: { id_card: ids.stepIdCard } },
            reviewedBy: ids.staffProviderId,
            consentLetter: { witnesses: [{ name: 'พยาน หนึ่ง', witnessId: ids.witness }] },
            revisionDueAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        });
        const leaked = (res) => Object.entries(ids).filter(([, id]) => JSON.stringify(res.body).includes(id)).map(([key]) => key);
        const inspected = (status, extra = {}) => application(status, {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot(), formData: filing(), ...extra,
        });

        test('ทุกประตูอ่านและเขียนของเจ้าหน้าที่ไม่ส่งเลขบัตรเต็มออกไป · ตัวคำขอที่เก็บไว้ยังเป็นเลขเต็ม', async () => {
            const answers = {};
            const toBook = await settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: filing() });
            as(fx.dispatcherA);
            answers.detail = await request(app).get(`/api/provider/applications/${toBook.id}`);
            answers.booking = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: toBook.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ',
            });
            as(fx.inspectorA);
            answers.inspectionStart = await request(app).post(`/api/provider/auditor/applications/${toBook.id}/inspection-starts`).send({});
            answers.auditDecision = await request(app).post(`/api/provider/auditor/applications/${toBook.id}/audit-decisions`)
                .send({ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' });
            const transitioned = await inspected('AUDIT_CONFIRMED');
            answers.transition = await request(app).post(`/api/provider/applications/${transitioned.id}/workflow-transitions`)
                .send({ toState: 'CAR_PENDING', comment: 'ไม่มีบันทึกการใช้ปุ๋ย' });
            // The applicant's resubmission stamps its national ID as the actor (security re-review M1).
            const resubmitted = await inspected('AUDIT_CONFIRMED', {
                workflowHistory: [{ action: 'RESUBMITTED', actorId: ids.historyActor, reviewedBy: ids.staffProviderId }],
            });
            answers.auditTimelines = await request(app).get(`/api/provider/applications/${resubmitted.id}/audit-timelines`);

            const toAssign = await settledInto('DOC_FEE_PAID', { formData: filing() });
            as(fx.dispatcherA);
            answers.assign = await request(app).post(`/api/provider/applications/${toAssign.id}/assign`).send({ reviewerId: fx.reviewerA.id });
            as(fx.reviewerA);
            answers.formFields = await request(app).patch(`/api/provider/applications/${toAssign.id}/form-fields`)
                .send({ changes: { applicantData: { phone: '0899999999' } } });
            const overdue = await application('REVISION_REQUESTED', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: filing() });
            // A file in revision is outside the dispatcher's read scope; the DTAM admin expires it by hand (L7).
            as(fx.adminA);
            answers.revisionExpiry = await request(app).post(`/api/provider/applications/${overdue.id}/revision-expirations`).send({});

            for (const [door, res] of Object.entries(answers)) {
                expect([door, res.status >= 200 && res.status < 300, leaked(res)]).toEqual([door, true, []]);
            }
            expect(answers.booking.body.data).not.toHaveProperty('formData');
            expect(answers.booking.body.data).toHaveProperty('canLeadToCertificate');
            expect(answers.assign.body.data).not.toHaveProperty('formData');
            expect(answers.assign.body.data).not.toHaveProperty('healthId');
            expect(answers.assign.body.data).toMatchObject({ id: toAssign.id, status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.reviewerA.id });
            expect(answers.transition.body.data.application).not.toHaveProperty('formData');
            expect(answers.detail.body.data.formData.applicantData).toMatchObject({
                fullName: 'สมชาย ใจดี', idCard: `1-XXXX-XXXX-X-${ids.idCard.slice(9)}`,
            });
            // The dispatcher reads no contact of the applicant (order 56(3)).
            expect(answers.detail.body.data.formData.applicantData).not.toHaveProperty('phone');
            expect(answers.detail.body.data.formData.consentLetter.witnesses[0].name).toBe('พยาน หนึ่ง');
            const stored = (await rowOf(toBook.id)).formData;
            expect([stored.applicantData.idCard, stored.applicantData.taxId, stored.reviewedBy]).toEqual([ids.idCard, ids.taxId, ids.staffProviderId]);
        });

        test('แบบแก้ไขข้อมูลที่สร้างจากรายละเอียดแบบปิดเลข ส่งเลขที่ปิดไว้กลับมา ไม่ทับเลขจริง · เลขใหม่ที่พิมพ์เต็มยังบันทึกได้', async () => {
            const row = await application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: filing() });
            as(fx.reviewerA);
            const shown = (await request(app).get(`/api/provider/applications/${row.id}`)).body.data.formData;
            const correctedTaxId = thaiId('010555699887');
            const saved = await request(app).patch(`/api/provider/applications/${row.id}/form-fields`).send({
                changes: { applicantData: { ...shown.applicantData, phone: '0899999999', taxId: correctedTaxId } },
            });
            expect([saved.status, leaked(saved)]).toEqual([200, []]);
            const stored = (await rowOf(row.id)).formData.applicantData;
            expect(stored).toMatchObject({
                phone: '0899999999', taxId: correctedTaxId, idCard: ids.idCard, presidentIdCard: ids.presidentIdCard,
                directorIdCard: ids.directorIdCard, nationalId: ids.nationalId, authorisedIdCard: ids.authorisedIdCard,
            });
        });

        test('เลขที่ปิดไว้ถูกพิมพ์แก้บางส่วน ไม่ถูกบันทึกแทนเลขจริง: ตอบ 400 ให้พิมพ์เลขเต็ม และไม่มีอะไรเปลี่ยน', async () => {
            const row = await application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: filing() });
            as(fx.reviewerA);
            const saved = await request(app).patch(`/api/provider/applications/${row.id}/form-fields`).send({
                changes: { applicantData: { phone: '0899999999', idCard: `1-XXXX-XXXX-X-${ids.idCard.slice(9, 12)}0` } },
            });
            expect([saved.status, saved.body.code]).toEqual([400, 'NATIONAL_ID_MASKED_VALUE']);
            expect(saved.body.messageTh).toMatch(/13 หลัก/);
            const stored = (await rowOf(row.id)).formData.applicantData;
            expect([stored.idCard, stored.phone]).toEqual([ids.idCard, '0812345678']);
        });
    });

    describe('ลงพื้นที่ซ้ำหลังข้อบกพร่องร้ายแรง', () => {
        async function carUnderReview(auditorId = fx.inspectorA.id) {
            return application('CAR_REVIEWING', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId,
                scheduledDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                formData: { auditDecisions: [{ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' }] },
            });
        }

        test('ผู้ตรวจพื้นที่ระบุว่าต้องลงพื้นที่ซ้ำ → คำขอรอนัดที่ผู้จัดคิว ผู้จัดคิวได้แจ้ง และมีงานจัดคิว', async () => {
            const row = await carUnderReview();
            as(fx.inspectorA);
            const res = await request(app).post(`/api/provider/auditor/applications/${row.id}/audit-decisions`)
                .send({ decision: 'REINSPECT', notes: 'ต้องดูประตูโรงเก็บของจริง' });
            expect(res.status).toBe(200);
            const stored = await rowOf(row.id);
            expect(stored.status).toBe('CAR_REVIEWING');
            expect(stored.formData.reinspection).toMatchObject({ status: 'REQUESTED', requestedBy: fx.inspectorA.id });
            expect((await noticesOf(fx.dispatcherA.id, row.applicationNumber)).length).toBeGreaterThan(0);
            const open = (await tasks(row.id, 'SCHEDULING')).filter((t) => OPEN.includes(t.state));
            expect(open).toHaveLength(1);
            expect(open[0].candidateGroup).toBe('dispatcher');

            as(fx.dispatcherA);
            const dashboard = await request(app).get('/api/provider/scheduler/dashboard?limit=200');
            expect(dashboard.body.data.queues.reinspectionRequired.items.map((it) => it.applicationNumber)).toContain(row.applicationNumber);
        });

        test('ผู้จัดคิวนัดลงพื้นที่ซ้ำจากสถานะนั้น ด้วยผู้ตรวจพื้นที่คนเดิม → AUDIT_CONFIRMED งานจัดคิวปิด', async () => {
            const row = await carUnderReview();
            as(fx.inspectorA);
            expect((await request(app).post(`/api/provider/auditor/applications/${row.id}/audit-decisions`)
                .send({ decision: 'REINSPECT', notes: 'ต้องดูของจริง' })).status).toBe(200);

            as(fx.dispatcherA);
            const other = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA2.id, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ',
            });
            expect(other.status).toBe(409);
            expect(other.body.code).toBe('REINSPECTION_SAME_INSPECTOR');

            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ',
            });
            expect(res.status).toBe(201);
            const stored = await rowOf(row.id);
            expect(stored.status).toBe('AUDIT_CONFIRMED');
            expect(stored.formData.reinspection.status).toBe('BOOKED');
            expect((await tasks(row.id, 'SCHEDULING')).filter((t) => OPEN.includes(t.state))).toHaveLength(0);
        });

        test('ผู้ตรวจไม่ได้ระบุให้ลงพื้นที่ซ้ำ ผู้จัดคิวนัดจาก CAR_REVIEWING ไม่ได้', async () => {
            const row = await carUnderReview();
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ',
            });
            expect(res.status).toBeGreaterThanOrEqual(400);
            expect((await rowOf(row.id)).status).toBe('CAR_REVIEWING');
        });

        /** CAR_REVIEWING with the second visit asked for by `requestedBy` (the inspector on the file by default) */
        async function secondVisitAskedFor(requestedBy = fx.inspectorA.id) {
            return application('CAR_REVIEWING', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id,
                scheduledDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                formData: {
                    auditDecisions: [{ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' }, { decision: 'REINSPECT', notes: 'ต้องดูของจริง' }],
                    reinspection: { status: 'REQUESTED', reason: 'ต้องดูของจริง', requestedAt: new Date().toISOString(), requestedBy },
                },
            });
        }

        test('ประตูเปลี่ยนสถานะทั่วไปนัดลงพื้นที่ซ้ำไม่ได้ แม้ผู้ตรวจขอแล้ว: ต้องนัดจากหน้าปฏิทิน (F1)', async () => {
            // Asked for: refused with the reason. Not asked for: the dispatcher does not read the file at all (F8).
            for (const [row, answer] of [[await secondVisitAskedFor(), [409, 'REINSPECTION_USE_CALENDAR']], [await carUnderReview(), [404, undefined]]]) {
                as(fx.dispatcherA);
                const res = await request(app).post(`/api/provider/applications/${row.id}/workflow-transitions`)
                    .send({ toState: 'AUDIT_CONFIRMED', comment: 'นัดตรวจแล้ว' });
                expect([res.status, res.body.code]).toEqual(answer);
                const stored = await rowOf(row.id);
                expect([stored.status, stored.auditorId]).toEqual(['CAR_REVIEWING', fx.inspectorA.id]);
            }
        });

        test('ประตูนัดตรวจเดิมถูกลบทั้งสองประตู: นัดหรือเปลี่ยนผู้ตรวจจาก CAR_REVIEWING ไม่ได้ (F1)', async () => {
            const row = await secondVisitAskedFor();
            as(fx.dispatcherA);
            const { isoDate } = require('../../utils/working-days').getZonedParts(nextSlot());
            const booked = await request(app).post('/api/audits/schedule').send({
                applicationId: row.id, auditorId: fx.inspectorA2.id, scheduledDate: isoDate, scheduledTime: '09:00',
            });
            const moved = await request(app).patch(`/api/audits/${row.id}/schedule`).send({
                scheduledDate: isoDate, scheduledTime: '10:00', auditorId: fx.inspectorA2.id,
            });
            expect([booked.status, moved.status]).toEqual([404, 404]);
            const stored = await rowOf(row.id);
            expect([stored.status, stored.auditorId, stored.formData.reinspection.status]).toEqual(['CAR_REVIEWING', fx.inspectorA.id, 'REQUESTED']);
        });

        test('ตัวเขียนสถานะ: จาก CAR_REVIEWING ไป AUDIT_CONFIRMED ต้องมีคำขอลงพื้นที่ซ้ำของผู้ตรวจคนปัจจุบัน และผู้ตรวจคนเดิม ไม่ว่าเข้ามาทางประตูไหน (F1)', async () => {
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            const book = (row, additionalData = {}) => writeApplicationStatus({
                prisma: raw, applicationId: row.id, fromStatus: 'CAR_REVIEWING', toStatus: 'AUDIT_CONFIRMED',
                actorId: fx.dispatcherA.id, actorRole: 'dispatcher', reason: 'TEST_BOOKING', additionalData,
            }).then(() => 'written', (error) => error.code);

            expect(await book(await carUnderReview())).toBe('REINSPECTION_NOT_REQUESTED');
            expect(await book(await secondVisitAskedFor(fx.inspectorA2.id))).toBe('REINSPECTION_NOT_REQUESTED');
            expect(await book(await secondVisitAskedFor(), { auditorId: fx.inspectorA2.id })).toBe('REINSPECTION_SAME_INSPECTOR');
            for (const id of fx.appIds.slice(-3)) { expect((await rowOf(id)).status).toBe('CAR_REVIEWING'); }

            const control = await secondVisitAskedFor();
            expect(await book(control, { auditorId: fx.inspectorA.id })).toBe('written');
            expect((await rowOf(control.id)).status).toBe('AUDIT_CONFIRMED');
        });

        test('ระบุลงพื้นที่ซ้ำได้เฉพาะตอนพิจารณาหลักฐานแก้ไข และต้องบอกเหตุผล', async () => {
            const confirmed = await application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(),
            });
            as(fx.inspectorA);
            expect((await request(app).post(`/api/provider/auditor/applications/${confirmed.id}/audit-decisions`)
                .send({ decision: 'REINSPECT', notes: 'x' })).status).toBe(400);
            const row = await carUnderReview();
            expect((await request(app).post(`/api/provider/auditor/applications/${row.id}/audit-decisions`)
                .send({ decision: 'REINSPECT' })).status).toBe(400);
            expect((await rowOf(row.id)).formData.reinspection).toBeUndefined();
        });

        test('ผู้ตรวจตัดสินผลอื่นแทนการลงพื้นที่ซ้ำ: คำขอลงพื้นที่ซ้ำปิด ไม่ค้างไปให้นัดในรอบแก้ไขถัดไป (F5)', async () => {
            const row = await secondVisitAskedFor();
            as(fx.inspectorA);
            const decided = await request(app).post(`/api/provider/auditor/applications/${row.id}/audit-decisions`)
                .send({ decision: 'MAJOR', notes: 'หลักฐานยังไม่พอ ประตูโรงเก็บยังไม่มีกุญแจ' });
            expect(decided.status).toBe(200);
            const decidedRow = await rowOf(row.id);
            expect([decidedRow.status, decidedRow.formData.reinspection.status]).toEqual(['CAR_PENDING', 'CLOSED']);

            const { writeApplicationStatus } = require('../../services/application-status-writer');
            await writeApplicationStatus({
                prisma: raw, applicationId: row.id, fromStatus: 'CAR_PENDING', toStatus: 'CAR_REVIEWING',
                actorId: fx.applicant.id, actorRole: 'health', reason: 'TEST_CAR_EVIDENCE_SENT_AGAIN',
            });
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ',
            });
            expect([res.status, res.body.code]).toEqual([400, 'REINSPECTION_NOT_REQUESTED']);
            expect((await rowOf(row.id)).status).toBe('CAR_REVIEWING');
        });

        test('ผู้ดูแลกู้คำขอที่ค้างไป AUDIT_CONFIRMED: คำขอลงพื้นที่ซ้ำที่ยังไม่ได้นัดปิด ไม่ค้างไปให้นัดในรอบแก้ไขถัดไป (R2)', async () => {
            const row = await secondVisitAskedFor();
            const admin = await staff('system_admin_dtam', fx.orgA);
            const adminApplicationService = require('../../services/admin-application-service');
            await adminApplicationService.forceTransitionStatus({
                applicationId: row.id, toStatus: 'AUDIT_CONFIRMED', reasonCode: 'SYSTEM_RECOVERY',
                reason: 'กู้คำขอที่ค้างเพราะระบบขัดข้อง', actorId: admin.id, actorRole: 'system_admin_dtam',
                prisma: raw, organizationWhere: { organizationId: fx.orgA },
            });
            const stored = await rowOf(row.id);
            expect([stored.status, stored.formData.reinspection.status]).toEqual(['AUDIT_CONFIRMED', 'CLOSED']);
        });

        describe('เขียนพร้อมกัน: ผู้ที่อ่านคำขอก่อนอีกฝ่ายบันทึก ไม่เขียนทับสิ่งที่อีกฝ่ายบันทึกแล้ว', () => {
            const pause = (ms) => new Promise((r) => setTimeout(r, ms));
            /** The other party's write, committed while the request under test waits on the row. */
            function holdRow(id, data) {
                let release;
                let locked;
                const gate = new Promise((r) => { release = r; });
                const isLocked = new Promise((r) => { locked = r; });
                const done = raw.$transaction(async (tx) => {
                    // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the other party's committed write
                    await tx.application.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
                    locked();
                    await gate;
                }, { timeout: 30000 });
                return { isLocked, release: async () => { release(); await done; } };
            }
            async function whileHeld(id, data, send) {
                const hold = holdRow(id, data);
                await hold.isLocked;
                const pending = send().then((r) => r);
                await pause(1500);
                await hold.release();
                return pending;
            }
            const bookVisit = (applicationId, auditorId) => request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId, auditorId, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ',
            });

            test('ตัวเขียนสถานะ: การนัดที่เริ่มจากสถานะที่อ่านไว้ก่อน ไม่ทับผลผ่านหรือนัดของผู้จัดคิวอีกคนที่บันทึกไปแล้ว (F4)', async () => {
                const { writeApplicationStatus } = require('../../services/application-status-writer');
                const staleBooking = (id, fromStatus) => writeApplicationStatus({
                    prisma: raw, applicationId: id, fromStatus, toStatus: 'AUDIT_CONFIRMED',
                    actorId: fx.dispatcherA.id, actorRole: 'dispatcher', reason: 'TEST_STALE_BOOKING',
                    additionalData: { auditorId: fx.inspectorA.id },
                }).then(() => 'written', (error) => error.code);
                const passed = await application('AUDIT_PASSED', {
                    milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: { auditResult: 'PASS' },
                });
                const booked = await application('AUDIT_CONFIRMED', {
                    milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA2.id, scheduledDate: nextSlot(),
                });

                expect(await staleBooking(passed.id, 'CAR_REVIEWING')).toBe('APPLICATION_STATE_CHANGED');
                expect(await staleBooking(booked.id, 'AUDIT_FEE_PAID')).toBe('APPLICATION_STATE_CHANGED');
                expect((await rowOf(passed.id)).status).toBe('AUDIT_PASSED');
                expect((await rowOf(booked.id)).auditorId).toBe(fx.inspectorA2.id);
            });

            test('นัดลงพื้นที่ซ้ำที่อ่านคำขอก่อนผู้ตรวจบันทึกผ่าน ไม่เขียนทับผลผ่าน (F4)', async () => {
                const row = await secondVisitAskedFor();
                const passed = { ...(await rowOf(row.id)).formData, workflowState: 'AUDIT_PASSED', auditResult: 'PASS' };
                as(fx.dispatcherA);
                const res = await whileHeld(row.id, { status: 'AUDIT_PASSED', formData: passed }, () => bookVisit(row.id, fx.inspectorA.id));
                expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
                const stored = await rowOf(row.id);
                expect([stored.status, stored.formData.workflowState]).toEqual(['AUDIT_PASSED', 'AUDIT_PASSED']);
            });

            test('ผู้จัดคิวสองคนนัดครั้งแรกพร้อมกัน: คนหลังถูกปฏิเสธ นัดของคนแรกคงอยู่ (F4)', async () => {
                const row = await settledInto('AUDIT_FEE_PAID');
                const firstBooking = { ...(await rowOf(row.id)).formData, workflowState: 'AUDIT_CONFIRMED' };
                as(fx.dispatcherA);
                const res = await whileHeld(
                    row.id, { status: 'AUDIT_CONFIRMED', auditorId: fx.inspectorA2.id, formData: firstBooking },
                    () => bookVisit(row.id, fx.inspectorA.id),
                );
                expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
                expect((await rowOf(row.id)).auditorId).toBe(fx.inspectorA2.id);
            });

            test('เลื่อนนัดที่อ่านคำขอก่อนผู้ตรวจบันทึกผล ไม่เขียนทับผลและสถานะ (F4)', async () => {
                const row = await application('AUDIT_CONFIRMED', {
                    milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot(),
                });
                const decided = {
                    ...(await rowOf(row.id)).formData, workflowState: 'CAR_PENDING',
                    auditDecisions: [{ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' }],
                };
                as(fx.dispatcherA);
                const res = await whileHeld(row.id, { status: 'CAR_PENDING', formData: decided }, () => bookVisit(row.id, fx.inspectorA.id));
                expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
                const stored = await rowOf(row.id);
                expect([stored.status, stored.formData.workflowState, stored.formData.auditDecisions.length]).toEqual(['CAR_PENDING', 'CAR_PENDING', 1]);
            });

            test('ผู้ตรวจกดขอลงพื้นที่ซ้ำซ้อนกัน: ครั้งหลังถูกปฏิเสธ บันทึกของครั้งแรกไม่หาย (J1)', async () => {
                const row = await carUnderReview();
                const before = (await rowOf(row.id)).formData;
                const first = { decision: 'REINSPECT', notes: 'ครั้งแรก', decidedBy: fx.inspectorA.id };
                const recorded = {
                    ...before,
                    reinspection: { status: 'REQUESTED', reason: 'ครั้งแรก', requestedBy: fx.inspectorA.id },
                    auditDecisions: [...before.auditDecisions, first],
                };
                as(fx.inspectorA);
                const res = await whileHeld(row.id, { formData: recorded }, () => request(app)
                    .post(`/api/provider/auditor/applications/${row.id}/audit-decisions`).send({ decision: 'REINSPECT', notes: 'ครั้งหลัง' }));
                expect(res.status).toBe(409);
                const stored = await rowOf(row.id);
                expect(stored.formData.auditDecisions.map((d) => d.notes)).toEqual(['โรงเก็บไม่มีประตู', 'ครั้งแรก']);
                expect(stored.formData.reinspection.reason).toBe('ครั้งแรก');
            });
        });
    });

    describe('ขาของผู้จัดคิวเดินได้จากประตูของมันเท่านั้น (R1)', () => {
        const transition = (id, toState, extra = {}) => request(app)
            .post(`/api/provider/applications/${id}/workflow-transitions`).send({ toState, comment: 'เดินสถานะจากประตูทั่วไป', ...extra });

        test('ประตูเปลี่ยนสถานะทั่วไปมอบผู้ตรวจเอกสารหรือนัดตรวจครั้งแรกไม่ได้ ทั้งผู้จัดคิวและผู้ดูแลที่ใช้ force', async () => {
            const docPaid = await settledInto('DOC_FEE_PAID');
            const auditPaid = await settledInto('AUDIT_FEE_PAID');
            const admin = await staff('system_admin_dtam', fx.orgA);
            for (const [actor, extra] of [[fx.dispatcherA, {}], [admin, { force: true, reasonCode: 'SYSTEM_RECOVERY' }]]) {
                as(actor);
                const assigned = await transition(docPaid.id, 'ASSIGNED_FOR_REVIEW', extra);
                const booked = await transition(auditPaid.id, 'AUDIT_CONFIRMED', extra);
                expect([actor.role, assigned.status, assigned.body.code]).toEqual([actor.role, 409, 'REVIEWER_ASSIGNMENT_USE_ASSIGN']);
                expect([actor.role, booked.status, booked.body.code]).toEqual([actor.role, 409, 'AUDIT_BOOKING_USE_CALENDAR']);
                expect(assigned.body.messageTh).toMatch(/[ก-๙]/);
            }
            const [doc, audit] = [await rowOf(docPaid.id), await rowOf(auditPaid.id)];
            expect([doc.status, doc.reviewerId, audit.status, audit.auditorId]).toEqual(['DOC_FEE_PAID', null, 'AUDIT_FEE_PAID', null]);
        });

        test('ตัวควบคุม: ประตูของผู้จัดคิวยังมอบหมายและนัดได้ และบันทึกผู้ตรวจกับวันนัด', async () => {
            const docPaid = await settledInto('DOC_FEE_PAID');
            const auditPaid = await settledInto('AUDIT_FEE_PAID');
            // A reviewer with no work yet: the workload cap is dispatcher-defaults' own test.
            const reviewer = await staff('document_reviewer', fx.orgA);
            as(fx.dispatcherA);
            const assigned = await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: docPaid.id, reviewerId: reviewer.id });
            const when = nextSlot();
            const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: auditPaid.id, auditorId: fx.inspectorA.id, scheduledDate: when.toISOString(), location: 'แปลงทดสอบ',
            });
            expect([assigned.status, booked.status]).toEqual([200, 201]);
            const doc = await rowOf(docPaid.id);
            const audit = await raw.application.findUnique({ where: { id: auditPaid.id }, select: { status: true, auditorId: true, scheduledDate: true } });
            expect([doc.status, doc.reviewerId]).toEqual(['ASSIGNED_FOR_REVIEW', reviewer.id]);
            expect([audit.status, audit.auditorId, audit.scheduledDate.toISOString()]).toEqual(['AUDIT_CONFIRMED', fx.inspectorA.id, when.toISOString()]);
        });
    });

    describe('ไม่มีการตรวจแบบออนไลน์', () => {
        test('หน้าปฏิทิน: ขอนัดแบบออนไลน์ถูกปฏิเสธ ไม่มีอะไรเปลี่ยน', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: nextSlot().toISOString(),
                inspectionMode: 'ONLINE_MEET', meetingLink: 'https://meet.example.test/x',
            });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('ONLINE_INSPECTION_RETIRED');
            expect((await rowOf(row.id)).status).toBe('AUDIT_FEE_PAID');
        });

        test('คิวจัดตาราง: ขอนัดแบบออนไลน์ถูกปฏิเสธ', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            as(fx.dispatcherA);
            const { isoDate } = require('../../utils/working-days').getZonedParts(nextSlot());
            const res = await request(app).post('/api/audit/scheduling/assign').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: isoDate, scheduledTime: '09:00', inspectionMode: 'ONLINE_MEET',
            });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('ONLINE_INSPECTION_RETIRED');
            expect((await rowOf(row.id)).status).toBe('AUDIT_FEE_PAID');
        });

        test('หน้าศูนย์จัดคิวไม่มีตัวชี้วัดออนไลน์/หน้างาน', async () => {
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/dashboard?limit=5');
            expect(res.status).toBe(200);
            expect(res.body.data.kpi).not.toHaveProperty('onlineVsOnsite');
            expect(JSON.stringify(res.body)).not.toMatch(/ONLINE_MEET|meetingLink/);
        });
    });

    describe('รายชื่อมอบงานตามบทบาท (ตัวควบคุมฝั่งปฏิเสธ)', () => {
        test('ผู้ตรวจพื้นที่รับงานตรวจเอกสารไม่ได้', async () => {
            const row = await settledInto('DOC_FEE_PAID');
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: row.id, reviewerId: fx.inspectorA.id });
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect((await rowOf(row.id)).status).toBe('DOC_FEE_PAID');
        });

        test('ผู้ตรวจเอกสารรับงานตรวจพื้นที่ไม่ได้', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.reviewerA2.id, scheduledDate: nextSlot().toISOString(), location: 'แปลงทดสอบ', inspectionMode: 'ONSITE',
            });
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect((await rowOf(row.id)).status).toBe('AUDIT_FEE_PAID');
        });

        test('ผู้ดูแลฝั่งกรมรับงานตรวจเอกสารไม่ได้ ทั้งมอบหมาย สลับ และมอบหมายเป็นชุด (L5 · คำสั่ง 27)', async () => {
            const admin = await staff('system_admin_dtam', fx.orgA);
            const fresh = await settledInto('DOC_FEE_PAID');
            as(fx.dispatcherA);
            const assigned = await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: fresh.id, reviewerId: admin.id });
            const batch = await settledInto('DOC_FEE_PAID');
            as(admin);
            const batched = await request(app).post('/api/provider/admin/batch-actions')
                .send({ applicationIds: [batch.id], action: 'ASSIGN', assignTo: admin.id });
            const reviewing = await settledInto('DOC_FEE_PAID');
            // A reviewer with no work yet: the workload cap is dispatcher-defaults' own test.
            const reviewer = await staff('document_reviewer', fx.orgA);
            as(fx.dispatcherA);
            expect((await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: reviewing.id, reviewerId: reviewer.id })).status).toBe(200);
            const swapped = await request(app).post(`/api/provider/scheduler/reviewer-assignments/${reviewing.id}/reassign`)
                .send({ newReviewerId: admin.id, reason: 'ผู้ตรวจเดิมลา' });

            expect([assigned.body.code, swapped.body.code]).toEqual(['STAFF_NOT_ASSIGNABLE', 'STAFF_NOT_ASSIGNABLE']);
            expect(batched.status).toBeGreaterThanOrEqual(400);
            expect([(await rowOf(fresh.id)).reviewerId, (await rowOf(batch.id)).reviewerId, (await rowOf(reviewing.id)).reviewerId])
                .toEqual([null, null, reviewer.id]);
        });

        test('นำเข้าค่าตั้งงานสร้างแถวเวลาของงานผู้จัดคิวกลับมาไม่ได้ เพราะเป็นค่ามีวันที่กำกับในระบบ (L3)', async () => {
            const admin = await staff('system_admin_dtam', fx.orgA);
            as(admin);
            const refused = await request(app).post('/api/provider/admin/work-config/import')
                .send({ slaPolicies: [{ workType: 'scheduling', targetHours: 24, warningHours: 16 }] });
            expect([refused.status, refused.body.code]).toEqual([400, 'WORK_CONFIG_SCHEDULING_IS_DATED_RULE']);
            expect(await raw.slaPolicy.count({ where: { workType: 'SCHEDULING' } })).toBe(0);

            const workType = `A4B_${sfx}`.toUpperCase();
            const accepted = await request(app).post('/api/provider/admin/work-config/import')
                .send({ slaPolicies: [{ workType, targetHours: 24, warningHours: 16 }] });
            await raw.slaPolicy.deleteMany({ where: { workType } });
            expect(accepted.status).toBe(200);
        });

        test('รายละเอียดแบบอ่านอย่างเดียว: ผู้ดูแลแพลตฟอร์มไม่เห็นสถานะชำระเงิน (L6 · คำสั่ง 47)', async () => {
            const row = await settledInto('AUDIT_FEE_PAID');
            const platformAdmin = await staff('system_admin_platform', fx.orgB);
            as(platformAdmin);
            const res = await request(app).get(`/api/provider/scheduler/applications/${row.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data).not.toHaveProperty('payment');
            expect(res.body.data.summary.applicationNumber).toBe(row.applicationNumber);
            as(fx.dispatcherA);
            expect((await request(app).get(`/api/provider/scheduler/applications/${row.id}`)).body.data.payment).toEqual({ m1Paid: true, m2Paid: true });
        });

        test('รายชื่อให้เลือก: ตรวจเอกสาร = ผู้ตรวจเอกสารเท่านั้น · ตรวจพื้นที่ = ผู้ตรวจพื้นที่เท่านั้น', async () => {
            as(fx.dispatcherA);
            const reviewers = (await request(app).get('/api/provider/scheduler/reviewers')).body.data;
            const inspectors = (await request(app).get('/api/provider/scheduler/auditors')).body.data;
            expect(new Set(reviewers.map((r) => r.canonicalRole))).toEqual(new Set(['document_reviewer']));
            expect(new Set(inspectors.map((r) => r.canonicalRole))).toEqual(new Set(['field_inspector']));
        });
    });
});
