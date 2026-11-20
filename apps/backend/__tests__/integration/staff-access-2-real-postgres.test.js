/**
 * Staff access, round 2 (real Postgres).
 *
 * - Order 31 (operator 2026-10-07 "ไม่ให้ทำ"): no admin door sets a status that is another
 *   role's decision (DOC_APPROVED, REVISION_REQUESTED, AUDIT_PASSED, CAR_PENDING, APPROVED),
 *   from any source state, force and break-glass included.
 * - The admin recovery doors act only inside the admin's organization (order 17).
 * - The document check opens only for the assigned reviewer; an unassigned filing has no one.
 * - The work inbox: own organization only, unknown organization denied, the inspector and the
 *   reviewer see only their assigned applications, and no applicant email.
 * - Work KPIs: unknown organization denied, figures of the own organization only.
 * - Post-audit tasks: the field inspector's door is auditorId, not headAuditorId.
 * - The status writer takes the refunded-cancelled row lock on a bare client too.
 * - A correction letter never carries a deadline already past.
 * - Creating a staff user answers with the providerId masked (order 10).
 * - The formData scrub replaces legacy staff national ids with user ids, idempotently.
 * - No person closes past the audit pass or leaves an issued certificate off their own edge,
 *   and CANCELLED is final for people (orders 30, 34(4)); the applicant's withdrawal keeps
 *   its own closedReason.
 * - A closure notice reaches only people who still belong to a live holder and may sign in.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');

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

const DECISIONS = ['DOC_APPROVED', 'REVISION_REQUESTED', 'AUDIT_PASSED', 'CAR_PENDING', 'REJECTED', 'APPROVED', 'CERTIFIED'];
const STAFF_NATIONAL_ID = '3100000000221';

d('staff access round 2 (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;

    async function organization() {
        seq += 1;
        const id = (await raw.organization.create({ data: { name: `sa2-${seq}-${sfx}`, slug: `sa2-${seq}-${sfx}`, code: `SA2_${seq}_${sfx}`.toUpperCase() } })).id;
        fx.orgIds.push(id);
        return id;
    }

    async function staff(role, organizationId, providerId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `sa2-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: providerId || `sa2-${seq}-${sfx}`, email: `sa2-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId, firstName: 'เจ้าหน้าที่', lastName: role };
    }

    async function application(status, extra = {}, { organizationId = fx.orgA, milestones = ['M1', 'M2'] } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-SA2-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId, entityId: fx.entity, submitterId: fx.applicant.id, status,
                formData: { workflowState: status, plantId: 'cannabis', certificationPurposes: ['RESEARCH'] }, ...extra,
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId }, milestones);
        return row.id;
    }

    async function activity(applicationId, candidateGroup, organizationId = fx.orgA) {
        return raw.workActivity.create({
            data: {
                applicationId, workType: 'FIELD_AUDIT', candidateGroup, state: 'TODO',
                triggeredAtStage: 'AUDIT_CONFIRMED', organizationId,
            },
        });
    }

    const MEDICAL_GINGER_UNDER_REVIEW = { workflowState: 'ASSIGNED_FOR_REVIEW', plantId: 'ginger', certificationPurposes: ['MEDICAL'] };

    const refusedAsDecision = (res) => {
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DECISION_STATE_NOT_FORCEABLE');
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgA = await organization();
        fx.orgB = await organization();
        fx.adminA = await staff('system_admin_dtam', fx.orgA);
        fx.adminB = await staff('system_admin_dtam', fx.orgB);
        fx.platformAdmin = await staff('system_admin_platform', fx.orgA);
        fx.dispatcher = await staff('dispatcher', fx.orgA);
        fx.reviewer = await staff('document_reviewer', fx.orgA);
        fx.inspectorA = await staff('field_inspector', fx.orgA);
        fx.inspectorB = await staff('field_inspector', fx.orgA);
        fx.legacyReviewer = await staff('document_reviewer', fx.orgA, STAFF_NATIONAL_ID);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `sa2-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `sa2-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท sa2 ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
        fx.entityIds.push(fx.entity);

        app = express();
        app.use(express.json());
        // The admin router authenticates at its mount (routes/api/admin), not inside.
        app.use('/api/admin/applications', require('../../middleware/auth-middleware').authenticateProvider,
            require('../../routes/api/admin/applications'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/applications', require('../../routes/api/provider/document-reviews'));
        app.use('/api/provider/work', require('../../routes/api/provider/work'));
        app.use('/api/provider/analytics/work-kpis', require('../../routes/api/provider/analytics-work-kpis'));
        app.use('/api/post-audit', require('../../routes/api/audit/post-audit'));
        app.use('/api/platform-admin/organizations', require('../../routes/api/platform-admin/organizations'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['postAuditTask', 'applicationDocumentReview', 'revisionDeadline', 'correctionRound', 'applicationDocument',
            'workActivity', 'checkoutOrder', 'invoice']) {
            await wipe(model, byApp);
        }
        await wipe('workActivity', { organizationId: { in: fx.orgIds } });
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { organizationId: { in: fx.orgIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { organizationId: { in: fx.orgIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    describe('order 31: no admin door writes another role\'s decision', () => {
        test.each(DECISIONS)('POST force-status to %s is refused and the status stays', async (target) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: target, reasonCode: 'SYSTEM_RECOVERY', reason: 'stuck by a system fault, recovering' });
            refusedAsDecision(res);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test.each(DECISIONS)('PATCH status to %s is refused', async (target) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await request(app).patch(`/api/admin/applications/${id}/status`)
                .send({ status: target, reasonCode: 'SYSTEM_RECOVERY', comment: 'stuck by a system fault' });
            refusedAsDecision(res);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test.each(DECISIONS)('provider status-override to %s is refused', async (target) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: target, reason: 'stuck by a system fault' });
            refusedAsDecision(res);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test.each(DECISIONS)('workflow-transitions force to %s is refused from a state other than review', async (target) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await request(app).post(`/api/provider/applications/${id}/workflow-transitions`)
                .send({ toState: target, force: true, reasonCode: 'SYSTEM_RECOVERY', comment: 'stuck by a system fault' });
            refusedAsDecision(res);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test('batch has no "request documents": the revision request stays the reviewer\'s', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW', { reviewerId: fx.reviewer.id });
            as(fx.adminA);
            const res = await request(app).post('/api/provider/admin/batch-actions')
                .send({ applicationIds: [id], action: 'REQUEST_DOCUMENTS', reason: 'missing papers' });
            expect(res.status).toBe(400);
            expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
        });

        test('revert onto a decision state is refused', async () => {
            const id = await application('PENDING_AUDIT_FEE', {
                workflowHistory: [{ timestamp: new Date().toISOString(), action: 'WORKFLOW_TRANSITION', fromStatus: 'DOC_APPROVED', toStatus: 'PENDING_AUDIT_FEE' }],
            });
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/revert-last-transition`)
                .send({ reason: 'undo the last hop, recovering' });
            refusedAsDecision(res);
            expect(await statusOf(id)).toBe('PENDING_AUDIT_FEE');
        });

        test('control: the recovery door still sends a file waiting for the approver back to the visit', async () => {
            const id = await application('AUDIT_PASSED');
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'AUDIT_CONFIRMED', reasonCode: 'SYSTEM_RECOVERY', reason: 'stuck by a system fault, recovering' });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test('a file waiting for the approver is not walked past the decision by the recovery door (order 31)', async () => {
            const id = await application('AUDIT_PASSED');
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'CAR_REVIEWING', reasonCode: 'SYSTEM_RECOVERY', reason: 'stuck by a system fault, recovering' });
            expect([res.status, res.body.code]).toEqual([409, 'CERTIFICATION_TRACK_LOCKED']);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('the writer refuses an admin decision whatever door calls it', async () => {
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            const id = await application('AUDIT_CONFIRMED');
            await expect(writeApplicationStatus({
                prisma: raw, applicationId: id, fromStatus: 'AUDIT_CONFIRMED', toStatus: 'AUDIT_PASSED',
                actorId: fx.adminA.id, actorRole: 'system_admin_dtam', autoIssueCertificate: false,
            })).rejects.toMatchObject({ code: 'DECISION_STATE_NOT_FORCEABLE' });
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test('SYSTEM writes a decision only along its own edges: the e2e shortcut to APPROVED is refused', async () => {
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            const id = await application('AUDIT_PASSED');
            await expect(writeApplicationStatus({
                prisma: raw, applicationId: id, fromStatus: 'AUDIT_PASSED', toStatus: 'APPROVED',
                actorId: 'E2E_BOT', actorRole: 'SYSTEM', autoIssueCertificate: false,
            })).rejects.toMatchObject({ code: 'DECISION_STATE_NOT_FORCEABLE' });
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('control: SYSTEM still walks its waiver-reopen edge EXPIRED -> REVISION_REQUESTED', async () => {
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            const id = await application('EXPIRED', {}, { milestones: ['M1'] });
            await writeApplicationStatus({
                prisma: raw, applicationId: id, fromStatus: 'EXPIRED', toStatus: 'REVISION_REQUESTED',
                actorId: 'SYSTEM', actorRole: 'system', autoIssueCertificate: false,
            });
            expect(await statusOf(id)).toBe('REVISION_REQUESTED');
        });
    });

    describe('order 35: an admin closes as CANCELLED with a reason from the fixed list, never REJECTED', () => {
        const closureOf = async (id) => {
            const row = await raw.application.findUnique({ where: { id }, select: { closedReason: true, formData: true } });
            return { closedReason: row.closedReason, reasonCode: row.formData?.adminClosure?.reasonCode };
        };
        const refusedForReason = (res) => {
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('APPLICATION_CLOSURE_REASON_REQUIRED');
        };
        const DOORS = {
            'force-status': (id, extra) => request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'CANCELLED', reasonCode: 'LEGAL_ORDER', reason: 'the holder was dissolved last month', ...extra }),
            'PATCH status': (id, extra) => request(app).patch(`/api/admin/applications/${id}/status`)
                .send({ status: 'CANCELLED', reasonCode: 'LEGAL_ORDER', comment: 'the holder was dissolved', ...extra }),
            'status-override': (id, extra) => request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: 'CANCELLED', reason: 'the holder was dissolved', ...extra }),
            'workflow-transitions force': (id, extra) => request(app).post(`/api/provider/applications/${id}/workflow-transitions`)
                .send({ toState: 'CANCELLED', force: true, reasonCode: 'LEGAL_ORDER', comment: 'the holder was dissolved', ...extra }),
        };

        test.each(Object.keys(DOORS))('%s: CANCELLED with no closure reason is refused', async (door) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            refusedForReason(await DOORS[door](id, {}));
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test.each(Object.keys(DOORS))('%s: free text is not a closure reason', async (door) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            refusedForReason(await DOORS[door](id, { closureReasonCode: 'ผู้ยื่นแจ้งว่าไม่ทำต่อแล้ว' }));
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test.each(Object.keys(DOORS))('%s: a listed reason closes the application and records the code', async (door) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await DOORS[door](id, { closureReasonCode: 'HOLDER_DISSOLVED' });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('CANCELLED');
            expect(await closureOf(id)).toEqual({ closedReason: 'CANCELLED_BY_ADMIN', reasonCode: 'HOLDER_DISSOLVED' });
        });

        test('force-status: a code-shaped key that is not on the list is refused', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW');
            as(fx.adminA);
            refusedForReason(await DOORS['force-status'](id, { closureReasonCode: 'MEDICAL_PURPOSE_REMOVED' }));
            expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
        });

        test('force-status: PURPOSE_NOT_IN_SCOPE closes a filing under review and records the code', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW', { formData: MEDICAL_GINGER_UNDER_REVIEW });
            as(fx.adminA);
            const res = await DOORS['force-status'](id, { closureReasonCode: 'PURPOSE_NOT_IN_SCOPE' });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('CANCELLED');
            expect(await closureOf(id)).toEqual({ closedReason: 'CANCELLED_BY_ADMIN', reasonCode: 'PURPOSE_NOT_IN_SCOPE' });
        });

        test('break-glass is gone: BREAK_GLASS_REOPEN is not a reason code and EXPIRED stays shut', async () => {
            const id = await application('EXPIRED', {}, { milestones: ['M1'] });
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'ASSIGNED_FOR_REVIEW', reasonCode: 'BREAK_GLASS_REOPEN', reason: 'stuck by a system fault, recovering' });
            expect(res.status).toBe(400);
            expect(await statusOf(id)).toBe('EXPIRED');
        });

        test('the writer has no break-glass flag: an admin cannot leave EXPIRED through it', async () => {
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            const id = await application('EXPIRED', {}, { milestones: ['M1'] });
            await expect(writeApplicationStatus({
                prisma: raw, applicationId: id, fromStatus: 'EXPIRED', toStatus: 'ASSIGNED_FOR_REVIEW',
                actorId: fx.adminA.id, actorRole: 'system_admin_dtam', breakGlassReopen: true, autoIssueCertificate: false,
            })).rejects.toMatchObject({ code: 'WAIVER_REOPEN_REQUIRED' });
            expect(await statusOf(id)).toBe('EXPIRED');
        });
    });

    describe('order 36: an admin closure tells the applicant and the holder\'s submitters why', () => {
        const INTERNAL_NOTE = 'บันทึกภายในห้ามถึงผู้ยื่น';
        const LABEL = require('../../shared/application-closure-reasons').APPLICATION_CLOSURE_REASONS.LICENCE_REVOKED;
        const DOORS = {
            'force-status': (id) => request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'CANCELLED', reasonCode: 'LEGAL_ORDER', reason: INTERNAL_NOTE, closureReasonCode: 'LICENCE_REVOKED' }),
            'PATCH status': (id) => request(app).patch(`/api/admin/applications/${id}/status`)
                .send({ status: 'CANCELLED', reasonCode: 'LEGAL_ORDER', comment: INTERNAL_NOTE, closureReasonCode: 'LICENCE_REVOKED' }),
            'status-override': (id) => request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: 'CANCELLED', reason: INTERNAL_NOTE, closureReasonCode: 'LICENCE_REVOKED' }),
            'workflow-transitions force': (id) => request(app).post(`/api/provider/applications/${id}/workflow-transitions`)
                .send({ toState: 'CANCELLED', force: true, reasonCode: 'LEGAL_ORDER', comment: INTERNAL_NOTE, closureReasonCode: 'LICENCE_REVOKED' }),
        };
        const members = {};

        async function member(label, role, { organizationId = fx.orgA } = {}) {
            const id = crypto.randomUUID();
            seq += 1;
            await raw.user.create({
                data: {
                    id, canonicalId: `sa2-m-${seq}-${sfx}`, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                    email: `sa2-m-${seq}-${sfx}@example.test`, firstName: label, lastName: 'สมาชิก', organizationId,
                },
            });
            fx.userIds.push(id);
            await raw.entityMembership.create({ data: { userId: id, entityId: fx.entity, role, organizationId: fx.orgA } });
            return id;
        }

        const closureNotices = (userId, applicationId) => raw.notification.findMany({
            where: { userId, metadata: { path: ['applicationId'], equals: applicationId } },
        });

        beforeAll(async () => {
            // The applicant is also the holder's OWNER: one person, one notice.
            await raw.entityMembership.create({ data: { userId: fx.applicant.id, entityId: fx.entity, role: 'OWNER', organizationId: fx.orgA } });
            // A submitter whose mailbox lives in another organization than the closing admin.
            members.submitter = await member('ผู้ยื่นแทน', 'ADMIN', { organizationId: fx.orgB });
            members.viewer = await member('ผู้ดู', 'VIEWER');
            members.manager = await member('ผู้จัดการ', 'MANAGER');
        });

        test.each(Object.keys(DOORS))('%s: the applicant and the submitter each get one notice with the reason label and no note', async (door) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            expect((await DOORS[door](id)).status).toBe(200);

            for (const userId of [fx.applicant.id, members.submitter]) {
                const notices = await closureNotices(userId, id);
                expect(notices).toHaveLength(1);
                expect(notices[0].message).toContain(LABEL);
                expect(notices[0].message).toContain('คุณ');
                expect(`${notices[0].title} ${notices[0].message} ${JSON.stringify(notices[0].metadata)}`).not.toContain(INTERNAL_NOTE);
            }
            const submitterOrg = (await closureNotices(members.submitter, id))[0].organizationId;
            expect(submitterOrg).toBe(fx.orgB);
            expect(await closureNotices(members.viewer, id)).toHaveLength(0);
            expect(await closureNotices(members.manager, id)).toHaveLength(0);
        });

        test('PURPOSE_NOT_IN_SCOPE: the notice names the reason and says a new filing with a purpose still in scope is open', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW', { formData: MEDICAL_GINGER_UNDER_REVIEW });
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'CANCELLED', reasonCode: 'LEGAL_ORDER', reason: INTERNAL_NOTE, closureReasonCode: 'PURPOSE_NOT_IN_SCOPE' });
            expect(res.status).toBe(200);
            for (const userId of [fx.applicant.id, members.submitter]) {
                const notices = await closureNotices(userId, id);
                expect(notices).toHaveLength(1);
                expect(notices[0].message).toContain('เนื่องจากวัตถุประสงค์ที่ระบุในคำขอไม่อยู่ในขอบข่ายการรับรองแล้ว');
                expect(notices[0].message).toContain('ผู้ที่มีสิทธิ์ยื่นคำขอในนามผู้ขอรับรองยื่นคำขอใหม่ได้');
                expect(notices[0].metadata.closureReasonCode).toBe('PURPOSE_NOT_IN_SCOPE');
                expect(notices[0].message).not.toContain(INTERNAL_NOTE);
            }
        });

        test('a reason with no way forward on record promises no new filing', async () => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            expect((await DOORS['force-status'](id)).status).toBe(200);
            const [notice] = await closureNotices(fx.applicant.id, id);
            expect(notice.message.endsWith(`เนื่องจาก${LABEL}`)).toBe(true);
        });

        test('telling twice writes nothing new', async () => {
            const { notifyApplicationClosedByAdmin } = require('../../services/application-closure-notify');
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            expect((await DOORS['force-status'](id)).status).toBe(200);
            await notifyApplicationClosedByAdmin({ applicationId: id });
            expect(await closureNotices(fx.applicant.id, id)).toHaveLength(1);
            expect(await closureNotices(members.submitter, id)).toHaveLength(1);
        });

        test('control: a refused closure tells nobody', async () => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'CANCELLED', reasonCode: 'LEGAL_ORDER', reason: INTERNAL_NOTE });
            expect(res.status).toBe(400);
            expect(await closureNotices(fx.applicant.id, id)).toHaveLength(0);
        });
    });

    describe('a person never closes or reopens past the certificate (orders 30, 34(4))', () => {
        const DOORS = {
            'force-status': (id, toStatus, reasonCode = 'SYSTEM_RECOVERY') => request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus, reasonCode, reason: 'the holder was dissolved last month', closureReasonCode: 'HOLDER_DISSOLVED' }),
            'PATCH status': (id, toStatus, reasonCode = 'SYSTEM_RECOVERY') => request(app).patch(`/api/admin/applications/${id}/status`)
                .send({ status: toStatus, reasonCode, comment: 'the holder was dissolved', closureReasonCode: 'HOLDER_DISSOLVED' }),
            'status-override': (id, toStatus) => request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: toStatus, reason: 'the holder was dissolved', closureReasonCode: 'HOLDER_DISSOLVED' }),
            'workflow-transitions force': (id, toStatus, reasonCode = 'SYSTEM_RECOVERY') => request(app).post(`/api/provider/applications/${id}/workflow-transitions`)
                .send({ toState: toStatus, force: true, reasonCode, comment: 'the holder was dissolved', closureReasonCode: 'HOLDER_DISSOLVED' }),
        };
        const refusedAs = (res, code) => {
            expect(res.status).toBe(409);
            expect(res.body.code).toBe(code);
        };

        test.each(Object.keys(DOORS))('%s: closing a CERTIFIED application is refused and points to the approver', async (door) => {
            const id = await application('CERTIFIED');
            as(fx.adminA);
            const res = await DOORS[door](id, 'CANCELLED', 'LEGAL_ORDER');
            refusedAs(res, 'CERTIFICATION_TRACK_LOCKED');
            expect(res.body.message || res.body.error?.message || JSON.stringify(res.body)).toContain('ผู้อนุมัติ');
            expect(await statusOf(id)).toBe('CERTIFIED');
        });

        test.each(['AUDIT_PASSED', 'APPROVED'])('force-status: closing from %s is refused', async (from) => {
            const id = await application(from);
            as(fx.adminA);
            refusedAs(await DOORS['force-status'](id, 'CANCELLED', 'LEGAL_ORDER'), 'CERTIFICATION_TRACK_LOCKED');
            expect(await statusOf(id)).toBe(from);
        });

        test.each(Object.keys(DOORS))('%s: moving a CERTIFIED application back is refused too', async (door) => {
            const id = await application('CERTIFIED');
            as(fx.adminA);
            refusedAs(await DOORS[door](id, 'CAR_REVIEWING'), 'CERTIFICATION_TRACK_LOCKED');
            expect(await statusOf(id)).toBe('CERTIFIED');
        });

        test.each(Object.keys(DOORS))('control, %s: an unpaid filing still closes with a listed reason', async (door) => {
            const id = await application('PENDING_DOC_FEE', {}, { milestones: [] });
            as(fx.adminA);
            const res = await DOORS[door](id, 'CANCELLED', 'LEGAL_ORDER');
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test.each(Object.keys(DOORS))('%s: a CANCELLED application stays cancelled, no refund needed', async (door) => {
            const id = await application('CANCELLED', {}, { milestones: [] });
            as(fx.adminA);
            refusedAs(await DOORS[door](id, 'PENDING_DOC_FEE'), 'APPLICATION_CANCELLED_FINAL');
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test('revert out of CANCELLED is refused', async () => {
            const id = await application('CANCELLED', {
                workflowHistory: [{ timestamp: new Date().toISOString(), action: 'WORKFLOW_TRANSITION', fromStatus: 'PENDING_DOC_FEE', toStatus: 'CANCELLED' }],
            }, { milestones: [] });
            as(fx.adminA);
            const res = await request(app).post(`/api/admin/applications/${id}/revert-last-transition`)
                .send({ reason: 'closed by mistake, recovering' });
            refusedAs(res, 'APPLICATION_CANCELLED_FINAL');
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test('the applicant withdrawing keeps its own closedReason and needs no admin reason', async () => {
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            const id = await application('PENDING_DOC_FEE', {}, { milestones: [] });
            await writeApplicationStatus({
                prisma: raw, applicationId: id, fromStatus: 'PENDING_DOC_FEE', toStatus: 'CANCELLED',
                actorId: fx.applicant.id, actorRole: 'health', autoIssueCertificate: false,
                additionalData: { closedReason: 'CANCELLED_BY_APPLICANT' },
            });
            const row = await raw.application.findUnique({ where: { id }, select: { status: true, closedReason: true, formData: true } });
            expect(row).toMatchObject({ status: 'CANCELLED', closedReason: 'CANCELLED_BY_APPLICANT' });
            expect(row.formData.adminClosure).toBeUndefined();
        });

        test('control: SYSTEM still writes out of CANCELLED (a repair, order 22)', async () => {
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            const id = await application('CANCELLED', {}, { milestones: [] });
            await writeApplicationStatus({
                prisma: raw, applicationId: id, fromStatus: 'CANCELLED', toStatus: 'PENDING_DOC_FEE',
                actorId: 'SYSTEM', actorRole: 'SYSTEM', autoIssueCertificate: false,
            });
            expect(await statusOf(id)).toBe('PENDING_DOC_FEE');
        });
    });

    describe('status-override takes only the targets force-status and PATCH take (appeal review 2026-10-14, Q3 a)', () => {
        const { FORCE_STATUS_EXCLUSIONS } = require('../../services/admin-application-service');
        const DOORS = {
            'force-status': (id, toStatus) => request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus, reasonCode: 'SYSTEM_RECOVERY', reason: 'stuck by a system fault, recovering' }),
            'PATCH status': (id, toStatus) => request(app).patch(`/api/admin/applications/${id}/status`)
                .send({ status: toStatus, reasonCode: 'SYSTEM_RECOVERY', comment: 'stuck by a system fault' }),
            'status-override': (id, toStatus) => request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: toStatus, reason: 'stuck by a system fault' }),
        };

        test('status-override cannot close a passed file as EXPIRED, which would end it with no order and no letter', async () => {
            const id = await application('AUDIT_PASSED');
            as(fx.adminA);
            const res = await DOORS['status-override'](id, 'EXPIRED');
            expect(res.status).toBe(400);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test.each(Object.keys(FORCE_STATUS_EXCLUSIONS).flatMap((target) => Object.keys(DOORS).map((door) => [door, target])))(
            '%s refuses %s as a target',
            async (door, target) => {
                const id = await application('AUDIT_CONFIRMED');
                as(fx.adminA);
                const res = await DOORS[door](id, target);
                expect(res.status).toBe(400);
                expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
            },
        );
    });

    describe('the writer decides on the status it holds the row lock on (security re-review H1)', () => {
        const DOORS = {
            'force-status': (id, toStatus, extra) => request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus, reasonCode: 'LEGAL_ORDER', reason: 'the holder was dissolved last month', ...extra }),
            'PATCH status': (id, toStatus, extra) => request(app).patch(`/api/admin/applications/${id}/status`)
                .send({ status: toStatus, reasonCode: 'LEGAL_ORDER', comment: 'the holder was dissolved', ...extra }),
            'status-override': (id, toStatus, extra) => request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: toStatus, reason: 'the holder was dissolved', ...extra }),
            'workflow-transitions force': (id, toStatus, extra) => request(app).post(`/api/provider/applications/${id}/workflow-transitions`)
                .send({ toState: toStatus, force: true, reasonCode: 'LEGAL_ORDER', comment: 'the holder was dissolved', ...extra }),
        };
        const CLOSE = { closureReasonCode: 'HOLDER_DISSOLVED' };
        /** PATCH runs Serializable: Postgres refuses the stale transaction before the writer can name why. */
        const refusal = (door, code) => ({ status: 409, code: door === 'PATCH status' ? 'APPLICATION_STATE_CHANGED' : code });

        async function lockWaiters() {
            const [{ n }] = await raw.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock'`;
            return n;
        }
        async function untilAWaiter(alsoDone) {
            let done = false;
            alsoDone.then(() => { done = true; }, () => { done = true; });
            for (let i = 0; i < 200; i += 1) {
                if (done || (await lockWaiters()) >= 1) { return; }
                await new Promise((r) => setTimeout(r, 25));
            }
            throw new Error('the door never waited on the row lock');
        }

        /** Another session moves the row and holds its lock until release(), then commits. */
        function holdAMove(id, status) {
            let release;
            const released = new Promise((r) => { release = r; });
            let ready;
            const holding = new Promise((r) => { ready = r; });
            const tx = raw.$transaction(async (t) => {
                await t.$executeRaw`UPDATE applications SET status = ${status}, version = version + 1 WHERE id = ${id}`;
                ready();
                await released;
            }, { timeout: 30000 });
            return holding.then(() => ({ release: async () => { release(); await tx; } }));
        }

        async function race(id, committed, door) {
            const blocker = await holdAMove(id, committed);
            const outcome = door();
            await untilAWaiter(outcome);
            await blocker.release();
            return outcome;
        }

        test.each(Object.keys(DOORS))('%s: closing while an inspector commits AUDIT_PASSED is refused', async (door) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await race(id, 'AUDIT_PASSED', () => DOORS[door](id, 'CANCELLED', CLOSE));
            expect({ status: res.status, code: res.body.code }).toEqual(refusal(door, 'CERTIFICATION_TRACK_LOCKED'));
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test.each(Object.keys(DOORS))('%s: a stale move over a just-committed CANCELLED is refused', async (door) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            const res = await race(id, 'CANCELLED', () => DOORS[door](id, 'CAR_REVIEWING'));
            expect({ status: res.status, code: res.body.code }).toEqual(refusal(door, 'APPLICATION_CANCELLED_FINAL'));
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test.each(Object.keys(DOORS))('control, %s: with nothing racing the admin closes AUDIT_CONFIRMED', async (door) => {
            const id = await application('AUDIT_CONFIRMED');
            as(fx.adminA);
            expect((await DOORS[door](id, 'CANCELLED', CLOSE)).status).toBe(200);
            expect(await statusOf(id)).toBe('CANCELLED');
        });
    });

    describe('order 36: a closure notice reaches only people who still belong to the holder', () => {
        const { notifyApplicationClosedByAdmin } = require('../../services/application-closure-notify');

        async function person(label, extra = {}) {
            const id = crypto.randomUUID();
            seq += 1;
            await raw.user.create({
                data: {
                    id, canonicalId: `sa2-p-${seq}-${sfx}`, healthId: `sa2-p-${seq}-${sfx}`, password: 'x', role: 'health',
                    authType: 'EMAIL_LEGACY', email: `sa2-p-${seq}-${sfx}@example.test`, firstName: label, lastName: 'ทดสอบ',
                    organizationId: fx.orgA, status: 'ACTIVE', ...extra,
                },
            });
            fx.userIds.push(id);
            return (await raw.user.findUnique({ where: { id }, select: { id: true, canonicalId: true } }));
        }

        async function holder(extra = {}) {
            const id = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท sa2 ${++seq} ${sfx} จำกัด`, organizationId: fx.orgA, ...extra } })).id;
            fx.entityIds.push(id);
            return id;
        }

        const join = (userId, entityId, role, status = 'ACTIVE') => raw.entityMembership.create({ data: { userId, entityId, role, status, organizationId: fx.orgA } });

        async function closedApplication(applicant, entityId) {
            seq += 1;
            const row = await raw.application.create({
                data: {
                    applicationNumber: `APP-SA2-${seq}-${sfx}`, healthId: applicant.canonicalId, areaType: 'OUTDOOR',
                    organizationId: fx.orgA, entityId, submitterId: applicant.id, status: 'CANCELLED', closedReason: 'CANCELLED_BY_ADMIN',
                    formData: { workflowState: 'CANCELLED', adminClosure: { reasonCode: 'HOLDER_DISSOLVED' } },
                },
            });
            fx.appIds.push(row.id);
            return row.id;
        }

        const noticesFor = (userId, applicationId) => raw.notification.count({
            where: { userId, metadata: { path: ['applicationId'], equals: applicationId } },
        });

        test('an applicant removed from the holder is not told; a current submitter is', async () => {
            const entityId = await holder();
            const applicant = await person('ออกไปแล้ว');
            const submitter = await person('ยังอยู่');
            await join(applicant.id, entityId, 'OWNER', 'REVOKED');
            await join(submitter.id, entityId, 'ADMIN');
            const id = await closedApplication(applicant, entityId);
            await notifyApplicationClosedByAdmin({ applicationId: id });
            expect(await noticesFor(applicant.id, id)).toBe(0);
            expect(await noticesFor(submitter.id, id)).toBe(1);
        });

        test('a suspended or deleted account is not told', async () => {
            const entityId = await holder();
            const applicant = await person('ผู้ยื่น');
            const suspended = await person('ถูกระงับ', { status: 'SUSPENDED' });
            const deleted = await person('ถูกลบ', { isDeleted: true });
            await join(applicant.id, entityId, 'OWNER');
            await join(suspended.id, entityId, 'ADMIN');
            await join(deleted.id, entityId, 'ADMIN');
            const id = await closedApplication(applicant, entityId);
            await notifyApplicationClosedByAdmin({ applicationId: id });
            expect(await noticesFor(applicant.id, id)).toBe(1);
            expect(await noticesFor(suspended.id, id)).toBe(0);
            expect(await noticesFor(deleted.id, id)).toBe(0);
        });

        test('a suspended applicant is not told', async () => {
            const entityId = await holder();
            const applicant = await person('ผู้ยื่นถูกระงับ', { status: 'SUSPENDED' });
            await join(applicant.id, entityId, 'OWNER');
            const id = await closedApplication(applicant, entityId);
            await notifyApplicationClosedByAdmin({ applicationId: id });
            expect(await noticesFor(applicant.id, id)).toBe(0);
        });

        test('a deleted holder tells nobody', async () => {
            const entityId = await holder({ isDeleted: true, status: 'DELETED', deletedAt: new Date() });
            const applicant = await person('ผู้ยื่น');
            const submitter = await person('ผู้ยื่นแทน');
            await join(applicant.id, entityId, 'OWNER');
            await join(submitter.id, entityId, 'ADMIN');
            const id = await closedApplication(applicant, entityId);
            await notifyApplicationClosedByAdmin({ applicationId: id });
            expect(await noticesFor(applicant.id, id)).toBe(0);
            expect(await noticesFor(submitter.id, id)).toBe(0);
        });

        test('control: with no holder the applicant is told', async () => {
            const applicant = await person('ไม่มีบริษัท');
            const id = await closedApplication(applicant, null);
            await notifyApplicationClosedByAdmin({ applicationId: id });
            expect(await noticesFor(applicant.id, id)).toBe(1);
        });
    });

    test('the admin door that extended a correction deadline is gone (orders 28, 32)', async () => {
        const id = await application('REVISION_REQUESTED');
        as(fx.adminA);
        const res = await request(app).post('/api/provider/admin/deadline-extension')
            .send({ applicationId: id, extensionDays: 5, reason: 'applicant asked for more time' });
        expect(res.status).toBe(404);
    });

    describe('order 17: the recovery doors stay in the admin\'s organization', () => {
        test('force-status on another organization\'s application answers not found', async () => {
            const id = await application('AUDIT_PASSED');
            as(fx.adminB);
            const res = await request(app).post(`/api/admin/applications/${id}/force-status`)
                .send({ toStatus: 'CAR_REVIEWING', reasonCode: 'SYSTEM_RECOVERY', reason: 'stuck by a system fault, recovering' });
            expect(res.status).toBe(404);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('status-override on another organization\'s application answers not found', async () => {
            const id = await application('AUDIT_PASSED');
            as(fx.adminB);
            const res = await request(app).post('/api/provider/admin/status-override')
                .send({ applicationId: id, newStatus: 'CAR_REVIEWING', reason: 'stuck by a system fault' });
            expect(res.status).toBe(404);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });

        test('PATCH status on another organization\'s application answers not found', async () => {
            const id = await application('AUDIT_PASSED');
            as(fx.adminB);
            const res = await request(app).patch(`/api/admin/applications/${id}/status`)
                .send({ status: 'CAR_REVIEWING', reasonCode: 'SYSTEM_RECOVERY', comment: 'stuck by a system fault' });
            expect(res.status).toBe(404);
            expect(await statusOf(id)).toBe('AUDIT_PASSED');
        });
    });

    describe('document check: only the assigned reviewer', () => {
        test('an unassigned filing opens for no reviewer, read or write', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW', {}, { milestones: ['M1'] });
            as(fx.reviewer);
            const read = await request(app).get(`/api/provider/applications/${id}/document-check`);
            expect(read.status).toBe(403);
            expect(read.body.code).toBe('NOT_THE_ASSIGNED_REVIEWER');
            const write = await request(app).post(`/api/provider/applications/${id}/document-reviews`)
                .send({ slotId: 'sop_manual', verdict: 'ACCEPTED' });
            expect(write.status).toBe(403);
        });

        test('control: the assigned reviewer opens it; an admin reads it but records nothing', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW', { reviewerId: fx.reviewer.id }, { milestones: ['M1'] });
            as(fx.reviewer);
            expect((await request(app).get(`/api/provider/applications/${id}/document-check`)).status).toBe(200);
            as(fx.adminA);
            expect((await request(app).get(`/api/provider/applications/${id}/document-check`)).status).toBe(200);
            const decide = await request(app).post(`/api/provider/applications/${id}/document-decision`).send({ action: 'APPROVE' });
            expect(decide.status).toBe(403);
            expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
        });
    });

    describe('work inbox', () => {
        let mine;
        let theirs;
        beforeAll(async () => {
            const appMine = await application('AUDIT_CONFIRMED', { auditorId: fx.inspectorA.id });
            const appTheirs = await application('AUDIT_CONFIRMED', { auditorId: fx.inspectorB.id });
            mine = await activity(appMine, 'field_inspector');
            theirs = await activity(appTheirs, 'field_inspector');
        });

        test('an inspector\'s queue holds only its assigned applications', async () => {
            as(fx.inspectorA);
            const res = await request(app).get('/api/provider/work/queue');
            expect(res.status).toBe(200);
            const ids = res.body.data.map((row) => row.id);
            expect(ids).toContain(mine.id);
            expect(ids).not.toContain(theirs.id);
            const my = await request(app).get('/api/provider/work/my');
            expect(my.body.data.map((row) => row.id)).not.toContain(theirs.id);
        });

        test('another inspector\'s item cannot be opened or claimed', async () => {
            as(fx.inspectorA);
            expect((await request(app).get(`/api/provider/work/${theirs.id}`)).status).toBe(404);
            const claim = await request(app).post(`/api/provider/work/${theirs.id}/claim`);
            expect(claim.status).toBe(400);
            expect((await raw.workActivity.findUnique({ where: { id: theirs.id } })).state).toBe('TODO');
        });

        test('the detail carries no applicant email', async () => {
            as(fx.inspectorA);
            const res = await request(app).get(`/api/provider/work/${mine.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data).not.toHaveProperty('applicantEmail');
            expect(JSON.stringify(res.body)).not.toContain('@example.test');
        });

        test('a caller with no organization is denied on every door', async () => {
            as({ id: crypto.randomUUID(), role: 'field_inspector', canonicalRole: 'field_inspector', organizationId: null });
            for (const res of [
                await request(app).get('/api/provider/work/queue'),
                await request(app).get('/api/provider/work/my'),
                await request(app).get(`/api/provider/work/${mine.id}`),
                await request(app).post(`/api/provider/work/${mine.id}/claim`),
            ]) {
                expect({ path: res.req.path, code: res.body.code }).toEqual({ path: res.req.path, code: 'NO_ORGANIZATION' });
            }
            expect((await raw.workActivity.findUnique({ where: { id: mine.id } })).state).toBe('TODO');
        });

        test('control: the assigned inspector claims its own item', async () => {
            as(fx.inspectorA);
            const res = await request(app).post(`/api/provider/work/${mine.id}/claim`);
            expect(res.status).toBe(200);
            expect((await raw.workActivity.findUnique({ where: { id: mine.id } })).assignedUserId).toBe(fx.inspectorA.id);
        });
    });

    describe('work KPIs', () => {
        test('no organization: denied', async () => {
            as({ id: crypto.randomUUID(), role: 'dispatcher', canonicalRole: 'dispatcher', organizationId: null });
            const res = await request(app).get('/api/provider/analytics/work-kpis');
            expect(res.body.code).toBe('NO_ORGANIZATION');
        });

        test('the open count is the organization\'s own', async () => {
            const otherApp = await application('AUDIT_CONFIRMED', {}, { organizationId: fx.orgB });
            await activity(otherApp, 'field_inspector', fx.orgB);
            const own = await raw.workActivity.count({ where: { organizationId: fx.orgA, state: { in: ['TODO', 'CLAIMED', 'IN_PROGRESS'] } } });
            as(fx.dispatcher);
            const res = await request(app).get('/api/provider/analytics/work-kpis');
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).toContain(`"openCount":${own}`);
        });
    });

    describe('post-audit tasks', () => {
        test('headAuditorId is not an inspector\'s door in', async () => {
            const id = await application('AUDIT_PASSED', { auditorId: fx.inspectorB.id, headAuditorId: fx.inspectorA.id });
            as(fx.inspectorA);
            const res = await request(app).post('/api/post-audit/tasks')
                .send({ applicationId: id, description: 'follow-up', dueDate: new Date(Date.now() + 864e5).toISOString() });
            expect(res.status).toBe(404);
            expect(await raw.postAuditTask.count({ where: { applicationId: id } })).toBe(0);
        });

        test('control: the assigned inspector creates one', async () => {
            const id = await application('AUDIT_PASSED', { auditorId: fx.inspectorA.id });
            as(fx.inspectorA);
            const res = await request(app).post('/api/post-audit/tasks')
                .send({ applicationId: id, description: 'follow-up', dueDate: new Date(Date.now() + 864e5).toISOString() });
            expect(res.status).toBe(201);
        });
    });

    test('the writer takes the row lock on a bare client with its own audit off', async () => {
        const { writeApplicationStatus } = require('../../services/application-status-writer');
        const logged = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
        const queries = [];
        logged.$on('query', (event) => queries.push(event.query));
        try {
            const id = await application('AUDIT_PASSED');
            await writeApplicationStatus({
                prisma: logged, applicationId: id, fromStatus: 'AUDIT_PASSED', toStatus: 'CAR_REVIEWING',
                actorId: fx.inspectorA.id, actorRole: 'field_inspector', onAudit: false,
            });
            expect(queries.some((q) => /FOR UPDATE/i.test(q) && /applications/i.test(q))).toBe(true);
            expect(await statusOf(id)).toBe('CAR_REVIEWING');
        } finally {
            await logged.$disconnect();
        }
    });

    test('a correction letter with a deadline already past is refused and nothing is written', async () => {
        const { mintCorrectionLetter, CORRECTION_LETTER_STAGE } = require('../../services/decision-letter-service');
        const id = await application('ASSIGNED_FOR_REVIEW', {}, { milestones: ['M1'] });
        const before = await raw.notification.count({ where: { userId: fx.applicant.id } });
        await expect(raw.$transaction((tx) => mintCorrectionLetter({
            tx, healthId: fx.applicant.canonicalId, applicationId: id, applicationNumber: 'APP-SA2',
            stage: CORRECTION_LETTER_STAGE.DOC_REVIEW, items: ['แผนที่แปลง'], dueAt: new Date(Date.now() - 864e5),
        }))).rejects.toMatchObject({ code: 'CORRECTION_DUE_DATE_PASSED' });
        expect(await raw.notification.count({ where: { userId: fx.applicant.id } })).toBe(before);
        expect(await raw.correctionRound.count({ where: { applicationId: id } })).toBe(0);
    });

    test('creating a staff user answers with the providerId masked', async () => {
        as(fx.platformAdmin);
        const nationalId = `31000${String(Date.now()).slice(-8)}`;
        const res = await request(app).post(`/api/platform-admin/organizations/${fx.orgA}/users`)
            .send({ email: `sa2-new-${sfx}@example.test`, firstName: 'ใหม่', lastName: 'ทดสอบ', role: 'finance_officer_platform', providerId: nationalId });
        expect(res.status).toBe(201);
        expect(JSON.stringify(res.body)).not.toContain(nationalId);
        expect(res.body.data.user.providerId).toBe(`${nationalId[0]}-XXXX-XXXX-X-${nationalId.slice(9)}`);
        expect(res.body.data.loginHint.providerId).toBe(res.body.data.user.providerId);
    });

    describe('scrub-staff-ids-from-formdata', () => {
        const findUserByProviderId = (providerId) => raw.user.findFirst({ where: { providerId }, select: { id: true } });
        const UNKNOWN = '3999999999990';

        test('dry run counts, apply rewrites, a second run changes nothing', async () => {
            const { run } = require('../../scripts/scrub-staff-ids-from-formdata');
            const id = await application('CAR_PENDING', {
                formData: {
                    workflowState: 'CAR_PENDING', plantId: 'cannabis',
                    PROVIDERAssignment: { reviewerId: fx.legacyReviewer.id, reviewerProviderId: STAFF_NATIONAL_ID },
                    reviewHistory: [{ action: 'approve', by: STAFF_NATIONAL_ID }, { action: 'revision', by: fx.reviewer.id }],
                    auditDecision: { decidedBy: UNKNOWN },
                    auditExecution: { startedBy: STAFF_NATIONAL_ID },
                    carRequest: { requestedBy: STAFF_NATIONAL_ID, message: 'แก้ไข' },
                },
            });
            const scope = { prisma: { application: {
                findMany: (args) => raw.application.findMany({ ...args, where: { id } }),
                updateMany: (args) => raw.application.updateMany(args),
            } }, findUserByProviderId };

            const dry = await run({ ...scope, apply: false });
            expect(dry).toMatchObject({ scanned: 1, rowsToChange: 1, rowsChanged: 0, replaced: 3, dropped: 2 });
            expect(JSON.stringify((await raw.application.findUnique({ where: { id } })).formData)).toContain(STAFF_NATIONAL_ID);

            const applied = await run({ ...scope, apply: true });
            expect(applied).toMatchObject({ rowsChanged: 1, replaced: 3, dropped: 2 });
            const formData = (await raw.application.findUnique({ where: { id } })).formData;
            expect(JSON.stringify(formData)).not.toMatch(/\d{13}/);
            expect(formData.PROVIDERAssignment).toEqual({ reviewerId: fx.legacyReviewer.id });
            expect(formData.reviewHistory.map((entry) => entry.by)).toEqual([fx.legacyReviewer.id, fx.reviewer.id]);
            expect(formData.auditDecision).toEqual({});
            expect(formData.auditExecution.startedBy).toBe(fx.legacyReviewer.id);
            expect(formData.carRequest).toEqual({ requestedBy: fx.legacyReviewer.id, message: 'แก้ไข' });

            const again = await run({ ...scope, apply: true });
            expect(again).toMatchObject({ rowsToChange: 0, rowsChanged: 0, replaced: 0, dropped: 0 });
        });
    });
});
