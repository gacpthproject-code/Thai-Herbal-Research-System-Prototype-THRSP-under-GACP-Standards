'use strict';

/**
 * A group membership grants its group only on the account's own side (review M1 of
 * fix/admin-role-split; orders 13, 34(2)). Memberships replace the role wherever they exist,
 * and a company account can still hold a DTAM group from before the two-sided rule; no admin
 * door can take it off any more. Real Postgres, the real /api/provider/work router: a
 * finance_officer_platform account holding a leftover system_admin_dtam membership must get
 * no DTAM work power and receive no DTAM admin notice. Same-side memberships keep working.
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
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
    return { ...actual, authenticateAny: attach, authenticateProvider: attach, authenticateToken: attach };
});

d('a cross-side group membership grants nothing (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], applicationIds: [] };
    let seq = 0;
    const as = (user) => { mockActor.current = { ...user }; };

    async function account(role, groups = []) {
        seq += 1;
        const id = crypto.randomUUID();
        const canonicalId = `xsm-${seq}-${sfx}`;
        const nationalId = String(crypto.randomInt(1e12, 1e13));
        const identity = role === 'health'
            ? { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId }
            : { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId };
        await raw.user.create({
            data: {
                id, canonicalId, password: 'x', role, status: 'ACTIVE', email: `${canonicalId}@example.test`,
                firstName: `สมาชิก${seq}`, lastName: 'ทดสอบ', organizationId: fx.org, ...identity,
            },
        });
        fx.userIds.push(id);
        for (const code of groups) {
            const group = await raw.roleGroup.findUnique({ where: { code }, select: { id: true } });
            await raw.userGroupMembership.create({ data: { userId: id, groupId: group.id, organizationId: fx.org } });
        }
        return { id, canonicalId, role, canonicalRole: role, organizationId: fx.org };
    }

    async function workItem({ candidateGroup = 'dispatcher', assignedUserId = null } = {}) {
        seq += 1;
        const application = await raw.application.create({
            data: {
                applicationNumber: `APP-XSM-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, status: 'DOC_FEE_PAID',
            },
            select: { id: true },
        });
        fx.applicationIds.push(application.id);
        return raw.workActivity.create({
            data: {
                applicationId: application.id, workType: 'SCHEDULING', candidateGroup, organizationId: fx.org,
                triggeredAtStage: 'DOC_FEE_PAID',
                ...(assignedUserId ? { state: 'CLAIMED', assignedUserId, claimedAt: new Date() } : { state: 'TODO' }),
            },
        });
    }
    const stateOf = (id) => raw.workActivity.findUnique({ where: { id }, select: { state: true, assignedUserId: true } });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.org = (await raw.organization.create({
            data: { name: `xsm-${sfx}`, slug: `xsm-${sfx}`, code: `XSM_${sfx}`.toUpperCase() },
        })).id;
        fx.applicant = await account('health');
        fx.leftover = await account('finance_officer_platform', ['system_admin_dtam']);
        fx.dtamAdmin = await account('system_admin_dtam');
        fx.dispatcher = await account('dispatcher', ['dispatcher', 'document_reviewer']);
        app = express();
        app.use(express.json());
        app.use('/api/provider/work', require('../../routes/api/provider/work'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.workActivity.deleteMany({ where: { applicationId: { in: fx.applicationIds } } }).catch(() => {});
        await raw.assignmentLedgerEntry.deleteMany({ where: { assigneeUserId: { in: fx.userIds } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: fx.applicationIds } } }).catch(() => {});
        await raw.userGroupMembership.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { actorId: { in: fx.userIds } } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.org } }).catch(() => {});
        await raw.$disconnect();
    });

    describe('company finance with a leftover system_admin_dtam membership', () => {
        test('GET /my does not list DTAM work', async () => {
            const item = await workItem();
            as(fx.leftover);
            const res = await request(app).get('/api/provider/work/my');
            expect(res.status).toBe(200);
            expect(res.body.data.map((a) => a.id)).not.toContain(item.id);
        });

        test('GET /queue?group=dispatcher is refused', async () => {
            await workItem();
            as(fx.leftover);
            const res = await request(app).get('/api/provider/work/queue?group=dispatcher');
            expect(res.status).toBe(403);
            expect(res.body.data).toBeUndefined();
        });

        test('GET /:id of DTAM work is refused', async () => {
            const item = await workItem();
            as(fx.leftover);
            const res = await request(app).get(`/api/provider/work/${item.id}`);
            expect(res.status).toBe(403);
            expect(res.body.data).toBeUndefined();
        });

        test('POST /:id/claim is refused and the work stays open', async () => {
            const item = await workItem();
            as(fx.leftover);
            expect((await request(app).post(`/api/provider/work/${item.id}/claim`).send({})).status).toBe(400);
            expect(await stateOf(item.id)).toEqual({ state: 'TODO', assignedUserId: null });
        });

        test('POST /:id/unclaim of a dispatcher\'s work is refused', async () => {
            const item = await workItem({ assignedUserId: fx.dispatcher.id });
            as(fx.leftover);
            expect((await request(app).post(`/api/provider/work/${item.id}/unclaim`).send({})).status).toBe(400);
            expect(await stateOf(item.id)).toEqual({ state: 'CLAIMED', assignedUserId: fx.dispatcher.id });
        });

        test.each([
            ['open', () => workItem()],
            ['claimed by a dispatcher', () => workItem({ assignedUserId: fx.dispatcher.id })],
        ])('POST /:id/done of %s DTAM work is refused', async (_name, make) => {
            const item = await make();
            const before = await stateOf(item.id);
            as(fx.leftover);
            expect((await request(app).post(`/api/provider/work/${item.id}/done`).send({})).status).toBe(400);
            expect(await stateOf(item.id)).toEqual(before);
        });

        test('DTAM admin notices for the organization do not reach it', async () => {
            const userGroups = require('../../shared/user-groups');
            userGroups.clearCache();
            const admins = await userGroups.listGroupMemberUserIds(raw, fx.org, 'system_admin_dtam');
            expect(admins).toContain(fx.dtamAdmin.id);
            expect(admins).not.toContain(fx.leftover.id);
        });
    });

    describe('controls: same-side powers keep working', () => {
        test('the DTAM admin still sees and claims DTAM work', async () => {
            const item = await workItem();
            as(fx.dtamAdmin);
            expect((await request(app).get('/api/provider/work/my')).body.data.map((a) => a.id)).toContain(item.id);
            expect((await request(app).post(`/api/provider/work/${item.id}/claim`).send({})).status).toBe(200);
            expect(await stateOf(item.id)).toEqual({ state: 'CLAIMED', assignedUserId: fx.dtamAdmin.id });
        });

        test('a dispatcher with a same-side document_reviewer group claims document review work', async () => {
            const item = await workItem({ candidateGroup: 'document_reviewer' });
            as(fx.dispatcher);
            expect((await request(app).post(`/api/provider/work/${item.id}/claim`).send({})).status).toBe(200);
            expect(await stateOf(item.id)).toEqual({ state: 'CLAIMED', assignedUserId: fx.dispatcher.id });
        });

        test('a dispatcher marks its own open dispatcher work done in one step', async () => {
            const item = await workItem();
            as(fx.dispatcher);
            expect((await request(app).post(`/api/provider/work/${item.id}/done`).send({})).status).toBe(200);
            expect((await stateOf(item.id)).state).toBe('DONE');
        });
    });
});
