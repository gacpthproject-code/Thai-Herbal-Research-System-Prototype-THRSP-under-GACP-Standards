'use strict';

/**
 * Two admins removing each other at the same moment must not leave their side without an
 * active admin (review R2-M2 of fix/admin-role-split). The last-admin guard counted the other
 * active admins in one statement and wrote in another, so two requests in flight both counted
 * the other admin and both wrote: over real HTTP, 29 of 30 trials per side ended with zero.
 *
 * Real Postgres, the real routers behind their real gates, a real provider token for each
 * admin. Each trial sends the two removals at once, through every door that disables, deletes
 * or demotes an admin, and expects exactly one to pass. The other is refused, with 409
 * ROLE_ADMIN_CANNOT_BE_LAST, or with 401 when the first one ended its session before it was
 * read. One admin of the pair stays active.
 *
 * The DTAM admin is counted in its organization, so every DTAM trial has an organization of
 * its own. The platform admin is counted across the whole database, and another suite running
 * at the same time may hold an active platform admin, so a platform trial is held to the rule
 * only when no other active platform admin exists before and after it.
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const TRIALS = 10;
const REASON = 'ปิดบัญชีตามคำสั่งหน่วยงาน';
const LAST = 'ROLE_ADMIN_CANNOT_BE_LAST';

const DOOR = {
    adminDisable: (id) => ['patch', `/api/admin/users/${id}/disable`, { reason: REASON }],
    adminChangeRole: (id) => ['patch', `/api/admin/users/${id}/change-role`, { newRole: 'dispatcher', reason: REASON }],
    adminRoleStatus: (id) => ['patch', `/api/admin/users/${id}/role`, { status: 'INACTIVE' }],
    adminRoleRole: (id) => ['patch', `/api/admin/users/${id}/role`, { role: 'dispatcher' }],
    directoryDisable: (id) => ['patch', `/api/provider/directory/${id}`, { isActive: false }],
    directoryDemoteDtam: (id) => ['put', `/api/provider/directory/${id}`, { role: 'dispatcher' }],
    directoryDemotePlatform: (id) => ['put', `/api/provider/directory/${id}`, { role: 'finance_officer_platform' }],
    directoryDelete: (id) => ['delete', `/api/provider/directory/${id}`],
};

const DTAM_RACES = [
    ['PATCH /api/admin/users/:id/disable', DOOR.adminDisable, DOOR.adminDisable],
    ['PATCH /api/admin/users/:id/change-role', DOOR.adminChangeRole, DOOR.adminChangeRole],
    ['PATCH /api/admin/users/:id/role with a status', DOOR.adminRoleStatus, DOOR.adminRoleStatus],
    ['PATCH /api/admin/users/:id/role with a role', DOOR.adminRoleRole, DOOR.adminRoleRole],
    ['PATCH /api/provider/directory/:id', DOOR.directoryDisable, DOOR.directoryDisable],
    ['PUT /api/provider/directory/:id', DOOR.directoryDemoteDtam, DOOR.directoryDemoteDtam],
    ['DELETE /api/provider/directory/:id', DOOR.directoryDelete, DOOR.directoryDelete],
    ['/api/admin/users disable against a directory delete', DOOR.adminDisable, DOOR.directoryDelete],
];

const PLATFORM_RACES = [
    ['DELETE /api/provider/directory/:id', DOOR.directoryDelete, DOOR.directoryDelete],
    ['PATCH /api/provider/directory/:id', DOOR.directoryDisable, DOOR.directoryDisable],
    ['PUT /api/provider/directory/:id', DOOR.directoryDemotePlatform, DOOR.directoryDemotePlatform],
    ['a directory disable against a directory delete', DOOR.directoryDisable, DOOR.directoryDelete],
];

d('two admins removing each other at once leave one admin (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], orgIds: [] };
    let seq = 0;

    async function organization() {
        seq += 1;
        const org = await raw.organization.create({
            data: { name: `lar-${seq}-${sfx}`, slug: `lar-${seq}-${sfx}`, code: `LAR${seq}_${sfx}`.toUpperCase() },
            select: { id: true },
        });
        fx.orgIds.push(org.id);
        return org.id;
    }

    async function admin(role, organizationId) {
        seq += 1;
        const id = crypto.randomUUID();
        await raw.user.create({
            data: {
                id, canonicalId: `lar-${seq}-${sfx}`, password: 'x', role, status: 'ACTIVE',
                email: `lar-${seq}-${sfx}@example.test`, firstName: `ผู้ดูแล${seq}`, lastName: 'ทดสอบ',
                organizationId, accountType: 'PROVIDER', authType: 'PROVIDER_ID',
                providerId: String(crypto.randomInt(1e12, 1e13)),
            },
        });
        fx.userIds.push(id);
        const jwtConfig = require('../../config/jwt-security');
        const token = jwtConfig.generateToken(
            { id, userId: id, role, canonicalRole: role, authType: 'PROVIDER_ID', organizationId },
            'provider',
        );
        return { id, token };
    }

    function send(actor, [method, url, body]) {
        const req = request(app)[method](url).set('Authorization', `Bearer ${actor.token}`);
        return body === undefined ? req : req.send(body);
    }

    const isActiveAdmin = (row, role) => row.role === role && row.status === 'ACTIVE' && !row.isDeleted;

    /** Both removals at once; the outcome as one line, and whether it breaks the rule. */
    async function race(role, a, b, doorA, doorB) {
        const [ra, rb] = await Promise.all([send(a, doorA(b.id)), send(b, doorB(a.id))]);
        const rows = await raw.user.findMany({ where: { id: { in: [a.id, b.id] } }, select: { role: true, status: true, isDeleted: true } });
        const active = rows.filter((row) => isActiveAdmin(row, role)).length;
        const statuses = [ra, rb].map((r) => r.status);
        const refusal = [ra, rb].find((r) => r.status !== 200);
        const refusedAsTheRuleSays = refusal
            && (refusal.status === 401 || (refusal.status === 409 && refusal.body.code === LAST));
        const passed = statuses.filter((s) => s === 200).length;
        return {
            line: `${statuses.join('/')} · ${active} of the pair still active`,
            broken: !(passed === 1 && refusedAsTheRuleSays && active === 1),
            guarded: Boolean(refusal && refusal.status === 409),
        };
    }

    const otherActivePlatformAdmins = (pair) => raw.user.count({
        where: { role: 'system_admin_platform', status: 'ACTIVE', isDeleted: false, id: { notIn: pair } },
    });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        app = express();
        app.use(express.json());
        app.use('/api/admin', require('../../routes/api/admin'));
        app.use('/api/provider/directory', require('../../routes/api/system/provider'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const users = fx.userIds;
        await raw.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { resourceId: { in: users } }] } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: users } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    });

    test.each(DTAM_RACES)('DTAM admins, %s: one passes, one is refused, one admin stays', async (_name, doorA, doorB) => {
        const broken = [];
        let guarded = 0;
        for (let trial = 1; trial <= TRIALS; trial += 1) {
            const org = await organization();
            const a = await admin('system_admin_dtam', org);
            const b = await admin('system_admin_dtam', org);
            const outcome = await race('system_admin_dtam', a, b, doorA, doorB);
            if (outcome.broken) { broken.push(`trial ${trial}: ${outcome.line}`); }
            if (outcome.guarded) { guarded += 1; }
        }
        expect(broken).toEqual([]);
        expect(guarded).toBeGreaterThan(0);
    }, 60000);

    test.each(PLATFORM_RACES)('platform admins, %s: one passes, one is refused, one admin stays', async (_name, doorA, doorB) => {
        const org = await organization();
        const broken = [];
        let held = 0;
        let guarded = 0;
        for (let trial = 1; trial <= TRIALS; trial += 1) {
            const a = await admin('system_admin_platform', org);
            const b = await admin('system_admin_platform', org);
            const othersBefore = await otherActivePlatformAdmins([a.id, b.id]);
            const outcome = await race('system_admin_platform', a, b, doorA, doorB);
            const othersAfter = await otherActivePlatformAdmins([a.id, b.id]);
            if (othersBefore === 0 && othersAfter === 0) {
                held += 1;
                if (outcome.broken) { broken.push(`trial ${trial}: ${outcome.line}`); }
                if (outcome.guarded) { guarded += 1; }
            }
            await raw.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { isDeleted: true, status: 'INACTIVE' } });
        }
        expect(broken).toEqual([]);
        expect(guarded > 0).toBe(held > 0);
    }, 60000);
});
