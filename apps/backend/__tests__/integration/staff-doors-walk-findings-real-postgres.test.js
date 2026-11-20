'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { addWorkingDays, startOfLocalDay } = require('../../utils/working-days');

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
const HAS_THAI = /[฀-๿]/;

d('staging walk findings on the real doors (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], plantIds: [] };
    let seq = 0;
    let slotDay = 3;

    const as = (user) => { mockActor.current = { ...user }; };
    const tasks = (applicationId, workType) => raw.workActivity.findMany({ where: { applicationId, workType }, orderBy: { createdAt: 'asc' } });

    function nextSlot() {
        slotDay += 1;
        const day = startOfLocalDay(addWorkingDays(new Date(), slotDay));
        return new Date(day.getTime() + 9 * 60 * 60 * 1000);
    }

    async function staff(role) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `wf3-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `wf3-${seq}-${sfx}`, email: `wf3-${seq}-${sfx}@example.test`,
                firstName: `เจ้าหน้าที่${seq}`, lastName: role, organizationId: fx.org, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.org };
    }

    async function application(status, { milestones = [], formData = {}, ...extra } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-WF3-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status,
                formData: {
                    workflowState: status,
                    farmData: {
                        siteName: 'แปลงทดสอบ', siteAddress: '99 หมู่ 1', subDistrict: 'บางกระสอ', district: 'เมืองนนทบุรี',
                        province: 'นนทบุรี', postalCode: '11000', latitude: 13.86, longitude: 100.51,
                    },
                    ...formData,
                },
                ...extra,
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId: fx.org }, milestones);
        for (const invoice of await raw.invoice.findMany({ where: { applicationId: row.id }, select: { id: true } })) {
            await raw.invoice.update({ where: { id: invoice.id }, data: { receiptNumber: `RC-${invoice.id}`, receiptIssuedAt: new Date() } });
        }
        return row;
    }

    async function write(applicationId, fromStatus, toStatus, actor) {
        const { writeApplicationStatus } = require('../../services/application-status-writer');
        return writeApplicationStatus({
            prisma: raw, applicationId, fromStatus, toStatus,
            actorId: actor ? actor.id : null, actorRole: actor ? actor.role : 'system', reason: 'TEST',
        });
    }

    const book = (applicationId, auditorId, when) => request(app).post('/api/provider/scheduler/audits/schedules').send({
        applicationId, auditorId, scheduledDate: when.toISOString(), location: 'แปลงทดสอบ',
    });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `wf3-${sfx}`, slug: `wf3-${sfx}`, code: `WF3_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.orgIds.push(org.id);
        fx.dispatcher = await staff('dispatcher');
        fx.reviewer = await staff('document_reviewer');
        fx.inspector = await staff('field_inspector');

        const applicantId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: `wf3-applicant-${sfx}`, healthId: `wf3-applicant-${sfx}`, password: 'x', role: 'health',
                authType: 'EMAIL_LEGACY', email: `wf3-applicant-${sfx}@example.test`, firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.org,
            },
        });
        fx.userIds.push(applicantId);
        fx.applicant = { id: applicantId, canonicalId: `wf3-applicant-${sfx}`, role: 'health', canonicalRole: 'health', organizationId: fx.org };
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท wf3 ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.entity);
        await raw.entityMembership.create({ data: { userId: applicantId, entityId: fx.entity, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });

        const kratom = await raw.plantSpecies.findUnique({ where: { code: 'KRA' } });
        if (!kratom) {
            const created = await raw.plantSpecies.create({ data: { code: 'KRA', nameTH: 'กระท่อม', nameEN: 'Kratom' } });
            fx.plantIds.push(created.id);
        }

        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
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
        await wipe('plantSpecies', { id: { in: fx.plantIds } });
        await raw.$disconnect();
    });

    describe('F-A8-14 a visit with a recorded result does not hold the inspector\'s slot', () => {
        test.each(['AUDIT_NOT_PASSED', 'CAR_PENDING', 'CAR_REVIEWING', 'AUDIT_PASSED', 'APPROVED', 'CERTIFIED'])(
            'a booking that overlaps a %s visit of the same inspector goes ahead',
            async (decidedStatus) => {
                const when = nextSlot();
                await application(decidedStatus, { milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: when });
                const row = await application('AUDIT_FEE_PAID', { milestones: ['M1', 'M2'] });
                as(fx.dispatcher);
                const res = await book(row.id, fx.inspector.id, when);
                expect(res.body).toMatchObject({ success: true });
                expect(res.status).toBe(201);
            },
        );

        test('a visit still booked holds the slot: 409 AUDITOR_BUSY in Thai naming the cause and the next step', async () => {
            const when = nextSlot();
            const held = await application('AUDIT_CONFIRMED', { milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: when });
            const row = await application('AUDIT_FEE_PAID', { milestones: ['M1', 'M2'] });
            as(fx.dispatcher);
            const res = await book(row.id, fx.inspector.id, new Date(when.getTime() + 30 * 60 * 1000));
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('AUDITOR_BUSY');
            expect(res.body.error).toMatch(HAS_THAI);
            expect(res.body.error).not.toMatch(/[A-Za-z]{4,}/);
            expect(res.body.data.conflictingApplicationNumber).toBe(held.applicationNumber);
            expect((await raw.application.findUnique({ where: { id: row.id } })).status).toBe('AUDIT_FEE_PAID');
        });

        const HOUR = 60 * 60 * 1000;
        const longVisit = (when) => application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: when, formData: { auditSchedule: { estimatedDuration: 240 } },
        });

        test('a booked 4-hour visit from 09:00 holds the inspector until 13:00: a 2-hour booking at 12:00 is refused in Thai', async () => {
            const nine = nextSlot();
            const held = await longVisit(nine);
            const row = await application('AUDIT_FEE_PAID', { milestones: ['M1', 'M2'] });
            as(fx.dispatcher);
            const res = await book(row.id, fx.inspector.id, new Date(nine.getTime() + 3 * HOUR));
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('AUDITOR_BUSY');
            expect(res.body.error).toMatch(HAS_THAI);
            expect(res.body.data.conflictingApplicationNumber).toBe(held.applicationNumber);
        });

        test('the same 4-hour visit leaves 13:00 free', async () => {
            const nine = nextSlot();
            await longVisit(nine);
            const row = await application('AUDIT_FEE_PAID', { milestones: ['M1', 'M2'] });
            as(fx.dispatcher);
            const res = await book(row.id, fx.inspector.id, new Date(nine.getTime() + 4 * HOUR));
            expect(res.body).toMatchObject({ success: true });
            expect(res.status).toBe(201);
        });

        test('the daily cap counts every visit of the day, decided ones too: two decided visits fill a cap of 2', async () => {
            const nine = nextSlot();
            await application('AUDIT_PASSED', { milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: nine });
            await application('CAR_PENDING', { milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: new Date(nine.getTime() + 2 * HOUR) });
            const row = await application('AUDIT_FEE_PAID', { milestones: ['M1', 'M2'] });
            as(fx.dispatcher);
            const res = await book(row.id, fx.inspector.id, new Date(nine.getTime() + 6 * HOUR));
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('AUDITOR_OVER_CAP');
            expect(res.body.error).toMatch(HAS_THAI);

            const day = await request(app).get(`/api/audit/scheduling/auditor-availability/${fx.inspector.id}`)
                .query({ from: new Date(nine.getTime() - 9 * HOUR).toISOString(), to: new Date(nine.getTime() + 14 * HOUR).toISOString() });
            expect(day.status).toBe(200);
            expect(day.body.data.overCapDays).toEqual([expect.objectContaining({ count: 2, cap: 2 })]);
            expect(day.body.data.busySlots).toEqual([]);
        });
    });

    describe('F-A8c-13 staff work closes when the application leaves its stage', () => {
        test('document review approved: the applicant sees the document review done, not in progress', async () => {
            const row = await application('DOC_FEE_PAID', { milestones: ['M1'] });
            as(fx.dispatcher);
            expect((await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: row.id, reviewerId: fx.reviewer.id })).status).toBe(200);
            expect((await tasks(row.id, 'DOC_REVIEW')).map((t) => t.state)).toEqual(['CLAIMED']);

            await write(row.id, 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED', fx.reviewer);

            const [review] = await tasks(row.id, 'DOC_REVIEW');
            expect(review.state).toBe('DONE');
            expect(review.completedBy).toBe(fx.reviewer.id);

            as(fx.applicant);
            const res = await request(app).get(`/api/applications/${row.id}/activities`);
            expect(res.status).toBe(200);
            const shown = res.body.data.find((a) => a.workType === 'DOC_REVIEW');
            expect(shown).toMatchObject({ status: 'done', isOverdue: false });
        });

        test('the inspector records a major finding: the field-audit task closes, the corrective-action loop opens nothing for staff yet', async () => {
            const row = await application('AUDIT_FEE_PAID', { milestones: ['M1', 'M2'] });
            as(fx.dispatcher);
            expect((await book(row.id, fx.inspector.id, nextSlot())).status).toBe(201);
            expect((await tasks(row.id, 'FIELD_AUDIT')).filter((t) => OPEN.includes(t.state))).toHaveLength(1);

            await write(row.id, 'AUDIT_CONFIRMED', 'CAR_PENDING', fx.inspector);

            const open = (await raw.workActivity.findMany({ where: { applicationId: row.id } })).filter((t) => OPEN.includes(t.state));
            expect(open).toEqual([]);
        });

        test('a revision round reopens document review as new work, the earlier round stays done', async () => {
            const row = await application('DOC_FEE_PAID', { milestones: ['M1'] });
            as(fx.dispatcher);
            expect((await request(app).post('/api/provider/scheduler/reviewer-assignments')
                .send({ applicationId: row.id, reviewerId: fx.reviewer.id })).status).toBe(200);
            await write(row.id, 'ASSIGNED_FOR_REVIEW', 'REVISION_REQUESTED', fx.reviewer);
            await write(row.id, 'REVISION_REQUESTED', 'ASSIGNED_FOR_REVIEW', fx.applicant);
            expect((await tasks(row.id, 'DOC_REVIEW')).map((t) => t.state)).toEqual(['DONE', 'CLAIMED']);
        });

        test('work closed by someone outside its group is not credited to them', async () => {
            const row = await application('AUDIT_CONFIRMED', { milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: nextSlot() });
            await write(row.id, 'AUDIT_CONFIRMED', 'AUDIT_PASSED', fx.inspector);
            expect((await tasks(row.id, 'FINAL_APPROVAL')).map((t) => t.state)).toEqual(['TODO']);

            await write(row.id, 'AUDIT_PASSED', 'CAR_REVIEWING', fx.inspector);

            const [approval] = await tasks(row.id, 'FINAL_APPROVAL');
            expect(approval.state).toBe('DONE');
            expect(approval.completedBy).toBeNull();
        });
    });

    describe('F-A8b-06 staff read the plant by the herb register name', () => {
        test('the field inspector\'s application detail carries the register name and the filed site', async () => {
            const row = await application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: nextSlot(), formData: { plantId: 'kratom' },
            });
            as(fx.inspector);
            const res = await request(app).get(`/api/provider/applications/${row.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.scope).toEqual({ plantName: 'กระท่อม', cultivationTypes: ['กลางแจ้ง'], province: 'นนทบุรี' });
        });

        test('a plant the register does not know reads as not recorded, never as its code', async () => {
            const row = await application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], auditorId: fx.inspector.id, scheduledDate: nextSlot(), formData: { plantId: 'no-such-herb' },
            });
            as(fx.inspector);
            const res = await request(app).get(`/api/provider/applications/${row.id}`);
            expect(res.body.data.scope.plantName).toBeNull();
        });

        test.each(['finance_officer_platform', 'finance_officer_dtam'])('%s reads the billing shape only, with no scope', async (role) => {
            const row = await application('AUDIT_FEE_PAID', { milestones: ['M1', 'M2'], formData: { plantId: 'kratom' } });
            as(await staff(role));
            const res = await request(app).get(`/api/provider/applications/${row.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.applicationNumber).toBe(row.applicationNumber);
            expect(res.body.data).not.toHaveProperty('scope');
            expect(res.body.data).not.toHaveProperty('formData');
        });
    });
});
