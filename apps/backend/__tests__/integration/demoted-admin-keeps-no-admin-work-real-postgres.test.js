'use strict';

/**
 * A DTAM admin demoted to another role keeps no admin work power through the system_admin_dtam
 * group row it still holds (review R2-M1 of fix/admin-role-split). A role change leaves the
 * account's memberships as they are, so the admin group may count only while the account's role
 * is system_admin_dtam: the admin shortcut to every queue comes from the role.
 *
 * Real Postgres and the real doors behind their real gates: every actor signs in through
 * POST /api/auth/provider/login and carries the token it got there, the admin demotes through
 * PATCH /api/admin/users/:id/change-role, and the demoted account signs in again before it
 * works the queue through /api/provider/work.
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const PASSWORD = `Demote#${crypto.randomBytes(4).toString('hex')}Aa1`;
const REASON = 'ลดบทบาทตามคำสั่งหน่วยงาน';

d('a demoted DTAM admin keeps no admin work power (real doors, real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], applicationIds: [] };
    let seq = 0;

    async function account(role, groups = []) {
        seq += 1;
        const id = crypto.randomUUID();
        const canonicalId = `dak-${seq}-${sfx}`;
        const nationalId = String(crypto.randomInt(1e12, 1e13));
        const identity = role === 'health'
            ? { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId }
            : {
                accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId,
                providerIdHash: crypto.createHash('sha256').update(nationalId).digest('hex'),
            };
        await raw.user.create({
            data: {
                id, canonicalId, password: await bcrypt.hash(PASSWORD, 4), role, status: 'ACTIVE',
                email: `${canonicalId}@example.test`, firstName: `ผู้ใช้${seq}`, lastName: 'ทดสอบ',
                organizationId: fx.org, ...identity,
            },
        });
        fx.userIds.push(id);
        for (const code of groups) {
            const group = await raw.roleGroup.findUnique({ where: { code }, select: { id: true } });
            await raw.userGroupMembership.create({ data: { userId: id, groupId: group.id, organizationId: fx.org } });
        }
        return { id, canonicalId, providerId: identity.providerId };
    }

    async function signIn(actor) {
        const res = await request(app).post('/api/auth/provider/login')
            .send({ providerId: actor.providerId, password: PASSWORD });
        expect(res.status).toBe(200);
        return res.body.data.token;
    }

    async function workItem({ candidateGroup, assignedUserId = null }) {
        seq += 1;
        const application = await raw.application.create({
            data: {
                applicationNumber: `APP-DAK-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
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
            select: { id: true },
        });
    }
    const stateOf = (id) => raw.workActivity.findUnique({
        where: { id }, select: { state: true, assignedUserId: true, completedBy: true },
    });
    const groupCodesOf = async (userId) => (await raw.userGroupMembership.findMany({
        where: { userId, isActive: true }, select: { group: { select: { code: true } } },
    })).map((m) => m.group.code).sort();
    const as = (token) => ({ Authorization: `Bearer ${token}` });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.org = (await raw.organization.create({
            data: { name: `dak-${sfx}`, slug: `dak-${sfx}`, code: `DAK_${sfx}`.toUpperCase() },
        })).id;
        fx.applicant = await account('health');
        fx.admin = await account('system_admin_dtam', ['system_admin_dtam']);
        fx.target = await account('system_admin_dtam', ['system_admin_dtam']);
        fx.dispatcher = await account('dispatcher', ['dispatcher']);
        app = express();
        app.use(express.json());
        app.use('/api/auth/provider', require('../../routes/api/auth/auth-provider'));
        app.use('/api/admin', require('../../routes/api/admin'));
        app.use('/api/provider/work', require('../../routes/api/provider/work'));
        fx.adminToken = await signIn(fx.admin);
        fx.targetToken = await signIn(fx.target);
    });

    afterAll(async () => {
        if (!raw) { return; }
        const users = fx.userIds;
        await raw.workActivity.deleteMany({ where: { applicationId: { in: fx.applicationIds } } }).catch(() => {});
        await raw.assignmentLedgerEntry.deleteMany({
            where: { OR: [{ assigneeUserId: { in: users } }, { assignedByUserId: { in: users } }] },
        }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: fx.applicationIds } } }).catch(() => {});
        await raw.userGroupMembership.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { resourceId: { in: users } }] } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: users } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.org } }).catch(() => {});
        await raw.$disconnect();
    });

    test('before the demotion, the admin lists and opens field inspector work', async () => {
        const item = await workItem({ candidateGroup: 'field_inspector' });
        const queue = await request(app).get('/api/provider/work/queue?group=field_inspector').set(as(fx.targetToken));
        expect(queue.status).toBe(200);
        expect(queue.body.data.map((a) => a.id)).toContain(item.id);
    });

    describe('after the demotion to dispatcher and a new sign-in', () => {
        beforeAll(async () => {
            const demote = await request(app).patch(`/api/admin/users/${fx.target.id}/change-role`)
                .set(as(fx.adminToken)).send({ newRole: 'dispatcher', reason: REASON });
            expect(demote.status).toBe(200);
            const { sessionsRevokedAt } = await raw.user.findUnique({ where: { id: fx.target.id }, select: { sessionsRevokedAt: true } });
            const wait = new Date(sessionsRevokedAt).getTime() - Date.now() + 50;
            if (wait > 0) { await new Promise((resolve) => { setTimeout(resolve, wait); }); }
            fx.demotedToken = await signIn(fx.target);
        });

        test('the row says dispatcher, the admin membership is still there, and the old session is over', async () => {
            expect((await raw.user.findUnique({ where: { id: fx.target.id }, select: { role: true } })).role).toBe('dispatcher');
            expect(await groupCodesOf(fx.target.id)).toEqual(['system_admin_dtam']);
            expect((await request(app).get('/api/provider/work/my').set(as(fx.targetToken))).status).toBe(401);
        });

        test('GET /work/queue?group=field_inspector is refused', async () => {
            await workItem({ candidateGroup: 'field_inspector' });
            const res = await request(app).get('/api/provider/work/queue?group=field_inspector').set(as(fx.demotedToken));
            expect(res.status).toBe(403);
            expect(res.body.data).toBeUndefined();
        });

        test('GET /work/:id of field inspector work is refused', async () => {
            const item = await workItem({ candidateGroup: 'field_inspector' });
            const res = await request(app).get(`/api/provider/work/${item.id}`).set(as(fx.demotedToken));
            expect(res.status).toBe(403);
            expect(res.body.data).toBeUndefined();
        });

        test('POST /work/:id/done on work another person claimed is refused and the row stays', async () => {
            const item = await workItem({ candidateGroup: 'dispatcher', assignedUserId: fx.dispatcher.id });
            const res = await request(app).post(`/api/provider/work/${item.id}/done`).set(as(fx.demotedToken)).send({});
            expect([400, 403]).toContain(res.status);
            expect(await stateOf(item.id)).toEqual({ state: 'CLAIMED', assignedUserId: fx.dispatcher.id, completedBy: null });
        });

        test('POST /work/:id/claim on field inspector work is refused and the work stays open', async () => {
            const item = await workItem({ candidateGroup: 'field_inspector' });
            const res = await request(app).post(`/api/provider/work/${item.id}/claim`).set(as(fx.demotedToken)).send({});
            expect(res.status).toBe(400);
            expect(await stateOf(item.id)).toEqual({ state: 'TODO', assignedUserId: null, completedBy: null });
        });

        test('POST /work/:id/unclaim of work another person claimed is refused', async () => {
            const item = await workItem({ candidateGroup: 'dispatcher', assignedUserId: fx.dispatcher.id });
            const res = await request(app).post(`/api/provider/work/${item.id}/unclaim`).set(as(fx.demotedToken)).send({});
            expect(res.status).toBe(400);
            expect(await stateOf(item.id)).toEqual({ state: 'CLAIMED', assignedUserId: fx.dispatcher.id, completedBy: null });
        });

        test('DTAM admin notices of the organization reach the admin and not the demoted account', async () => {
            const userGroups = require('../../shared/user-groups');
            userGroups.clearCache();
            const admins = await userGroups.listGroupMemberUserIds(raw, fx.org, 'system_admin_dtam');
            expect(admins).toContain(fx.admin.id);
            expect(admins).not.toContain(fx.target.id);
        });

        describe('controls', () => {
            test('the admin, with the role and the row, still lists field inspector work', async () => {
                const item = await workItem({ candidateGroup: 'field_inspector' });
                const res = await request(app).get('/api/provider/work/queue?group=field_inspector').set(as(fx.adminToken));
                expect(res.status).toBe(200);
                expect(res.body.data.map((a) => a.id)).toContain(item.id);
            });

            test('the demoted account works the dispatcher queue its new role gives it', async () => {
                const item = await workItem({ candidateGroup: 'dispatcher' });
                const queue = await request(app).get('/api/provider/work/queue?group=dispatcher').set(as(fx.demotedToken));
                expect(queue.status).toBe(200);
                expect(queue.body.data.map((a) => a.id)).toContain(item.id);
                const claim = await request(app).post(`/api/provider/work/${item.id}/claim`).set(as(fx.demotedToken)).send({});
                expect(claim.status).toBe(200);
                expect(await stateOf(item.id)).toEqual({ state: 'CLAIMED', assignedUserId: fx.target.id, completedBy: null });
            });
        });
    });
});
