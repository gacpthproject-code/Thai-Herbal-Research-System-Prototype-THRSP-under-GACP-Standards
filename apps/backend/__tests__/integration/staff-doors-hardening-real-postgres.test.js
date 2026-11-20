/**
 * Staff doors of the dispatcher and the field inspector hold under a stale read, a race and an
 * odd stored value (security re-review 2026-10-09 of fix/dispatcher-tools, findings L1-L7 and
 * I2-I5), on real Postgres.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');
const { waitUntilQueued } = require('./fixtures/row-lock-race');

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

/** A 13-digit number whose last digit is the Mod-11 check digit. */
const thaiId = (first12) => {
    const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (13 - i), 0);
    return `${first12}${(11 - (sum % 11)) % 10}`;
};

d('staff doors hold (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'sdh' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/audit/onsite', require('../../routes/api/audit/onsite'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
    });

    afterAll(async () => { await world.cleanup(); });

    describe('a value typed over what the screen showed masked (L1)', () => {
        const formFields = (id, changes) => request(app).patch(`/api/provider/applications/${id}/form-fields`).send({ changes });

        test('a partial edit of a juristic registration number the screen showed masked is refused, and nothing changes', async () => {
            const registrationNumber = thaiId('010555600001');
            const row = await world.application('ASSIGNED_FOR_REVIEW', {
                milestones: ['M1'], reviewerId: fx.reviewerA.id,
                formData: { applicantData: { companyName: 'บริษัท ทดสอบ จำกัด', registrationNumber, phone: '0812345678' } },
            });
            as(fx.reviewerA);
            const shown = (await request(app).get(`/api/provider/applications/${row.id}`)).body.data.formData.applicantData.registrationNumber;
            expect(shown).toBe(`0-XXXX-XXXX-X-${registrationNumber.slice(9)}`);
            const editedInPlace = `${shown.slice(0, -1)}${(Number(shown.slice(-1)) + 1) % 10}`;
            const saved = await formFields(row.id, { applicantData: { phone: '0899999999', registrationNumber: editedInPlace } });
            expect([saved.status, saved.body.code]).toEqual([400, 'NATIONAL_ID_MASKED_VALUE']);
            const stored = (await world.rowOf(row.id)).formData.applicantData;
            expect([stored.registrationNumber, stored.phone]).toEqual([registrationNumber, '0812345678']);
        });

        test('a stored ID that itself carries an X (a passport number) is sent back unchanged and does not block the save', async () => {
            const row = await world.application('ASSIGNED_FOR_REVIEW', {
                milestones: ['M1'], reviewerId: fx.reviewerA.id,
                formData: { applicantData: { fullName: 'John Doe', idCard: 'AX1234567', phone: '0812345678' } },
            });
            as(fx.reviewerA);
            const shown = (await request(app).get(`/api/provider/applications/${row.id}`)).body.data.formData.applicantData;
            const saved = await formFields(row.id, { applicantData: { ...shown, phone: '0899999999' } });
            expect(saved.status).toBe(200);
            const stored = (await world.rowOf(row.id)).formData.applicantData;
            expect([stored.idCard, stored.phone]).toEqual(['AX1234567', '0899999999']);
        });
    });

    describe('the field app writes only while the visit stands and is still the inspector\'s (L3 L4 L5)', () => {
        const onsiteService = require('../../services/audit-onsite-service');
        const ITEM = onsiteService.CHECKLIST_TEMPLATE_2026[0].itemCode;

        async function bookedVisit() {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot().toISOString(), location: 'แปลงทดสอบ',
            });
            expect(booked.status).toBe(201);
            const audit = await world.raw.auditChecklist.findFirst({ where: { applicationId: row.id, status: 'IN_PROGRESS' }, select: { id: true } });
            return { row, auditId: audit.id };
        }
        const itemsOf = (auditId) => world.raw.farmAuditChecklistItem.count({ where: { auditId } });

        /**
         * The dispatcher's reassignment, committed while `fire`'s request waits on the application row:
         * the test holds the row as the reassignment does, lets the request queue behind it, then moves
         * the inspector on the application and on its evidence row.
         */
        async function whileReassigned({ applicationId, auditId }, fire) {
            let pending;
            await world.raw.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM applications WHERE id = ${applicationId} FOR UPDATE`;
                const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
                pending = fire().then((res) => res);
                await waitUntilQueued(world.raw, pid, 1, 15000);
                await tx.$executeRaw`UPDATE audit_checklists SET "auditorId" = ${fx.inspectorA2.id} WHERE id = ${auditId}`;
                await tx.$executeRaw`UPDATE applications SET "auditorId" = ${fx.inspectorA2.id}, version = version + 1 WHERE id = ${applicationId}`;
            }, { timeout: 30000, maxWait: 10000 });
            return pending;
        }

        test('a writer that leaves the visit flag out is still held to the visit: nothing is written once the application left it (L3)', async () => {
            const { row, auditId } = await bookedVisit();
            await world.raw.application.update({ where: { id: row.id }, data: { status: 'CAR_PENDING', version: { increment: 1 } } });
            await expect(onsiteService.submitChecklistItem({ auditId, itemCode: ITEM, response: 'PASS', actorId: fx.inspectorA.id }))
                .rejects.toMatchObject({ code: 'APPLICATION_STATE_CHANGED' });
            expect(await itemsOf(auditId)).toBe(0);
        });

        test('a checklist answer racing a reassignment that commits first is refused, and nothing is written (L4)', async () => {
            const { row, auditId } = await bookedVisit();
            as(fx.inspectorA);
            const res = await whileReassigned({ applicationId: row.id, auditId }, () => request(app)
                .post(`/api/audit/onsite/${auditId}/checklist`).send({ items: [{ itemCode: ITEM, response: 'PASS' }] }));
            expect([res.status, res.body.code]).toEqual([403, 'AUDIT_AUDITOR_MISMATCH']);
            expect(await itemsOf(auditId)).toBe(0);
        });

        test('a decision racing a reassignment waits for the application row first: no deadlock, a clean refusal, nothing decided (L5)', async () => {
            const { row, auditId } = await bookedVisit();
            as(fx.inspectorA);
            const res = await whileReassigned({ applicationId: row.id, auditId }, () => request(app)
                .post(`/api/audit/onsite/${auditId}/decision`).send({ decision: 'FAIL', summary: 'ไม่มีบันทึกการใช้ปุ๋ย' }));
            expect([res.status, res.body.code]).toEqual([403, 'AUDIT_AUDITOR_MISMATCH']);
            const audit = await world.raw.auditChecklist.findUnique({ where: { id: auditId }, select: { status: true, auditorId: true } });
            expect(audit).toEqual({ status: 'IN_PROGRESS', auditorId: fx.inspectorA2.id });
            expect((await world.rowOf(row.id)).status).toBe('AUDIT_CONFIRMED');
        });
    });

    describe('a reschedule and a reassignment never write over each other (L6 I4 I5)', () => {
        const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });
        const asApplicant = () => as({
            id: fx.applicant.id, role: 'health', canonicalRole: 'health', canonicalId: fx.applicant.canonicalId, organizationId: fx.orgA,
        });

        async function bookedVisit({ at = world.nextSlot(), inspector = fx.inspectorA } = {}) {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: inspector.id, scheduledDate: at.toISOString(), location: 'แปลงทดสอบ',
            });
            expect(booked.status).toBe(201);
            return row;
        }

        /** The other party's write, committed by the test while `fire`'s request waits on the application row. */
        async function whileCommitted(applicationId, write, fire, { holdMs = 0 } = {}) {
            let pending;
            await world.raw.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM applications WHERE id = ${applicationId} FOR UPDATE`;
                await write(tx);
                const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
                pending = fire().then((res) => res);
                await waitUntilQueued(world.raw, pid, 1, 15000);
                if (holdMs) { await pause(holdMs); }
            }, { timeout: 30000, maxWait: 10000 });
            return pending;
        }
        async function reassignedFormData(tx, applicationId, inspector) {
            const [stored] = await tx.$queryRaw`SELECT "formData" FROM applications WHERE id = ${applicationId}`;
            const formData = { ...stored.formData, auditorName: `${inspector.id} ชื่อใหม่`, _reassignmentHistory: [{ from: fx.inspectorA.id, to: inspector.id, reason: 'ลาป่วย' }] };
            await tx.$executeRaw`UPDATE applications SET "auditorId" = ${inspector.id}, "formData" = ${JSON.stringify(formData)}::jsonb, version = version + 1 WHERE id = ${applicationId}`;
            await tx.$executeRaw`UPDATE audit_checklists SET "auditorId" = ${inspector.id} WHERE "applicationId" = ${applicationId} AND status = 'IN_PROGRESS'`;
        }

        test('the applicant\'s reschedule request read before a reassignment keeps the reassignment it did not see (L6)', async () => {
            const row = await bookedVisit();
            asApplicant();
            const res = await whileCommitted(row.id, (tx) => reassignedFormData(tx, row.id, fx.inspectorA2), () => request(app)
                .post(`/api/audit/scheduling/${row.id}/reschedule`).send({ requestedDate: world.nextSlot().toISOString(), reason: 'ติดธุระวันนั้น' }));
            expect(res.status).toBe(201);
            const stored = await world.rowOf(row.id);
            expect(stored.auditorId).toBe(fx.inspectorA2.id);
            expect(stored.formData._reassignmentHistory).toHaveLength(1);
            expect(stored.formData.auditorName).toBe(`${fx.inspectorA2.id} ชื่อใหม่`);
            expect(stored.formData.rescheduleRequests).toHaveLength(1);
        });

        test('who may ask to move a visit: a member of the holder who may act on it; nobody outside it, and not a viewer', async () => {
            const row = await bookedVisit();
            const outsider = await world.healthUser('outsider', fx.orgA);
            const viewer = await world.healthUser('viewer', fx.orgA);
            await world.raw.entityMembership.create({ data: { userId: viewer.id, entityId: fx.entityA, role: 'VIEWER', status: 'ACTIVE', organizationId: fx.orgA } });
            const ask = (user) => {
                as({ id: user.id, role: 'health', canonicalRole: 'health', canonicalId: user.canonicalId, organizationId: fx.orgA });
                return request(app).post(`/api/audit/scheduling/${row.id}/reschedule`).send({ requestedDate: world.nextSlot().toISOString(), reason: 'ติดธุระวันนั้น' });
            };
            const answers = {
                outsider: await ask(outsider),
                viewer: await ask(viewer),
                noIdentity: await ask({ id: null, canonicalId: null }),
            };
            expect(Object.fromEntries(Object.entries(answers).map(([who, res]) => [who, [res.status, res.body.code]]))).toEqual({
                outsider: [404, 'APPLICATION_NOT_FOUND'], viewer: [403, 'ENTITY_PERMISSION_DENIED'], noIdentity: [404, 'APPLICATION_NOT_FOUND'],
            });
            expect((await world.rowOf(row.id)).formData.rescheduleRequests).toBeUndefined();
            const member = await ask(fx.applicant);
            expect(member.status).toBe(201);
            expect((await world.rowOf(row.id)).formData.rescheduleRequests).toHaveLength(1);
        });

        test('approving a reschedule read before a reassignment is refused and the reassignment stays (L6)', async () => {
            const row = await bookedVisit();
            asApplicant();
            const asked = await request(app).post(`/api/audit/scheduling/${row.id}/reschedule`).send({ requestedDate: world.nextSlot().toISOString(), reason: 'ติดธุระวันนั้น' });
            expect(asked.status).toBe(201);
            as(fx.dispatcherA);
            const res = await whileCommitted(row.id, (tx) => reassignedFormData(tx, row.id, fx.inspectorA2), () => request(app)
                .post(`/api/audit/scheduling/${asked.body.data.rescheduleId}/approve`).send({ newDate: world.nextSlot().toISOString() }));
            expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
            const stored = await world.rowOf(row.id);
            expect(stored.auditorId).toBe(fx.inspectorA2.id);
            expect(stored.formData._reassignmentHistory).toHaveLength(1);
            const evidence = await world.raw.auditChecklist.findFirst({ where: { applicationId: row.id, status: 'IN_PROGRESS' }, select: { auditorId: true } });
            expect(evidence.auditorId).toBe(fx.inspectorA2.id);
        });

        test('the reassignment checks the new inspector\'s day on the visit date read under the lock (L6)', async () => {
            const busyDay = world.nextSlot();
            await bookedVisit({ at: busyDay, inspector: fx.inspectorA2 });
            await bookedVisit({ at: new Date(busyDay.getTime() + 3 * 60 * 60 * 1000), inspector: fx.inspectorA2 });
            const row = await bookedVisit();
            as(fx.dispatcherA);
            const movedTo = new Date(busyDay.getTime() + 6 * 60 * 60 * 1000);
            const res = await whileCommitted(row.id, (tx) => tx.$executeRaw`UPDATE applications SET "scheduledDate" = ${movedTo} WHERE id = ${row.id}`,
                () => request(app).post(`/api/audits/reassign/${row.id}/reassign`).send({ newAuditorId: fx.inspectorA2.id, reason: 'ลาป่วย' }));
            expect([res.status, res.body.code]).toEqual([409, 'AUDITOR_OVER_CAP']);
            expect((await world.rowOf(row.id)).auditorId).toBe(fx.inspectorA.id);
        });

        test('a booking that waits on a long write answers a retriable 409, not a 500 (I5)', async () => {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const res = await whileCommitted(row.id, async () => {}, () => request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot().toISOString(), location: 'แปลงทดสอบ',
            }), { holdMs: 7000 });
            expect([res.status, res.body.code]).toEqual([409, 'AUDITOR_SLOT_CONFLICT']);
            expect((await world.rowOf(row.id)).status).toBe('AUDIT_FEE_PAID');
        }, 30000);

        test('a reassignment that rolls back leaves no audit row behind (I4)', async () => {
            const row = await bookedVisit();
            await world.raw.$executeRawUnsafe(`
                CREATE OR REPLACE FUNCTION sdh_refuse_rebind() RETURNS trigger AS $$
                BEGIN IF NEW."applicationId" = '${row.id}' THEN RAISE EXCEPTION 'sdh: the evidence row refuses the move'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
            await world.raw.$executeRawUnsafe('CREATE TRIGGER sdh_refuse_rebind BEFORE UPDATE ON audit_checklists FOR EACH ROW EXECUTE FUNCTION sdh_refuse_rebind()');
            try {
                as(fx.dispatcherA);
                const res = await request(app).post(`/api/audits/reassign/${row.id}/reassign`).send({ newAuditorId: fx.inspectorA2.id, reason: 'ลาป่วย' });
                expect(res.status).toBe(500);
            } finally {
                await world.raw.$executeRawUnsafe('DROP TRIGGER IF EXISTS sdh_refuse_rebind ON audit_checklists');
                await world.raw.$executeRawUnsafe('DROP FUNCTION IF EXISTS sdh_refuse_rebind()');
            }
            expect((await world.rowOf(row.id)).auditorId).toBe(fx.inspectorA.id);
            const phantom = await world.raw.auditLog.findMany({ where: { resourceId: row.id, action: 'application.auditorId.changed' } });
            expect(phantom).toEqual([]);
        });
    });

    describe('expiring an overdue revision by hand stays inside the caller\'s organization and read scope, on the real clock (L7)', () => {
        const expire = (id, body = {}) => request(app).post(`/api/provider/applications/${id}/revision-expirations`).send(body);
        const waiting = (dueAt) => world.application('REVISION_REQUESTED', {
            milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: { revisionDueAt: dueAt.toISOString() },
        });
        const DAY = 24 * 60 * 60 * 1000;

        test('another organization\'s DTAM admin, or any other role: nothing expires', async () => {
            const row = await waiting(new Date(Date.now() - DAY));
            const answers = {};
            as(await world.staff('system_admin_dtam', fx.orgB));
            answers.otherOrganization = await expire(row.id);
            as(fx.reviewerA);
            answers.reviewer = await expire(row.id);
            as(fx.dispatcherA);
            answers.dispatcher = await expire(row.id);
            expect(Object.fromEntries(Object.entries(answers).map(([who, res]) => [who, res.status]))).toEqual({
                otherOrganization: 404, reviewer: 403, dispatcher: 403,
            });
            expect((await world.rowOf(row.id)).status).toBe('REVISION_REQUESTED');
            as(fx.adminA);
            expect((await expire(row.id)).status).toBe(200);
            expect((await world.rowOf(row.id)).status).toBe('EXPIRED');
        });

        test('only the DTAM admin expires by hand: the dispatcher and the platform admin are refused, and the answer carries no filing (I-A)', async () => {
            const row = await world.application('REVISION_REQUESTED', {
                milestones: ['M1'], reviewerId: fx.reviewerA.id,
                formData: { revisionDueAt: new Date(Date.now() - DAY).toISOString(), applicantData: { fullName: 'ผู้ยื่น ทดสอบ', phone: '0813334444' } },
            });
            as(fx.dispatcherA);
            const dispatcher = await expire(row.id);
            as(await world.staff('system_admin_platform', fx.orgA));
            const platformAdmin = await expire(row.id);
            expect([dispatcher.status, platformAdmin.status]).toEqual([403, 403]);
            expect((await world.rowOf(row.id)).status).toBe('REVISION_REQUESTED');
            as(fx.adminA);
            const res = await expire(row.id);
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual({ id: row.id, applicationNumber: row.applicationNumber, status: 'EXPIRED' });
        });

        test('a caller-supplied clock is not honoured: a deadline still ahead does not expire', async () => {
            const row = await waiting(new Date(Date.now() + 3 * DAY));
            as(fx.adminA);
            const res = await expire(row.id, { forceNow: new Date(Date.now() + 30 * DAY).toISOString() });
            expect(res.status).toBe(400);
            expect((await world.rowOf(row.id)).status).toBe('REVISION_REQUESTED');
        });
    });

    describe('the dispatcher\'s edges carry their record at the status writer, whatever the door (I2)', () => {
        const { writeApplicationStatus } = require('../../services/application-status-writer');

        test('a forced status change on a row whose filing says another state still cannot book a visit with no inspector or date', async () => {
            const row = await world.application('AUDIT_FEE_PAID', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, formData: { workflowState: 'PENDING_AUDIT_FEE' },
            });
            as(fx.adminA);
            const res = await request(app).post(`/api/provider/applications/${row.id}/workflow-transitions`)
                .send({ toState: 'AUDIT_CONFIRMED', force: true, reasonCode: 'SYSTEM_RECOVERY', comment: 'กู้สถานะที่ค้าง' });
            expect([res.status, res.body.code]).toEqual([409, 'AUDIT_BOOKING_USE_CALENDAR']);
            expect((await world.rowOf(row.id)).status).toBe('AUDIT_FEE_PAID');
        });

        test.each([
            ['DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW', ['M1'], 'REVIEWER_ASSIGNMENT_USE_ASSIGN'],
            ['AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', ['M1', 'M2'], 'AUDIT_BOOKING_USE_CALENDAR'],
        ])('the writer refuses %s -> %s without its record, for any caller', async (from, to, milestones, code) => {
            const row = await world.application(from, { milestones, reviewerId: from === 'AUDIT_FEE_PAID' ? fx.reviewerA.id : null });
            await expect(writeApplicationStatus({
                prisma: world.raw, applicationId: row.id, fromStatus: from, toStatus: to,
                actorId: fx.adminA.id, actorRole: 'system_admin_dtam', reason: 'TEST_NO_RECORD',
            })).rejects.toMatchObject({ code });
            expect((await world.rowOf(row.id)).status).toBe(from);
        });
    });
});
