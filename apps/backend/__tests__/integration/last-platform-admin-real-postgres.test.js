'use strict';

/**
 * The last active system_admin_platform cannot be disabled, deleted or demoted (review I3 of
 * fix/admin-role-split), mirroring the DTAM admin's last-admin guard: 409
 * ROLE_ADMIN_CANNOT_BE_LAST and nothing written. Real Postgres, the real directory router.
 *
 * Over a live session this cannot happen in sequence: the acting platform admin is itself an
 * active platform admin, so its target is never the last one. The session here is mocked and
 * the acting account is SUSPENDED in the database (a session that outlived its account), the
 * one way the target can be the last. The platform admin crosses organizations, so "last" is
 * counted across the whole database; another suite running at the same time may hold an
 * active platform admin, so each case measures that count first and expects the refusal
 * exactly when it is zero.
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

d('the last active platform admin stays (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [] };
    let seq = 0;

    async function platformAdmin(status) {
        seq += 1;
        const id = crypto.randomUUID();
        await raw.user.create({
            data: {
                id, canonicalId: `lpa-${seq}-${sfx}`, password: 'x', role: 'system_admin_platform', status,
                email: `lpa-${seq}-${sfx}@example.test`, firstName: `แพลตฟอร์ม${seq}`, lastName: 'ทดสอบ',
                organizationId: fx.org, accountType: 'PROVIDER', authType: 'PROVIDER_ID',
                providerId: String(crypto.randomInt(1e12, 1e13)),
            },
        });
        fx.userIds.push(id);
        return { id, role: 'system_admin_platform', canonicalRole: 'system_admin_platform', organizationId: fx.org };
    }
    const rowOf = (id) => raw.user.findUnique({ where: { id }, select: { role: true, status: true, isDeleted: true } });
    const otherActivePlatformAdmins = (targetId) => raw.user.count({
        where: { role: 'system_admin_platform', status: 'ACTIVE', isDeleted: false, id: { not: targetId } },
    });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.org = (await raw.organization.create({
            data: { name: `lpa-${sfx}`, slug: `lpa-${sfx}`, code: `LPA_${sfx}`.toUpperCase() },
        })).id;
        mockActor.current = await platformAdmin('SUSPENDED');
        app = express();
        app.use(express.json());
        app.use('/api/provider/directory', require('../../routes/api/system/provider'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.auditLog.deleteMany({ where: { OR: [{ actorId: { in: fx.userIds } }, { resourceId: { in: fx.userIds } }] } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.org } }).catch(() => {});
        await raw.$disconnect();
    });

    test.each([
        ['PATCH /provider/directory/:id disables it', (t) => request(app).patch(`/api/provider/directory/${t.id}`).send({ isActive: false })],
        ['PUT /provider/directory/:id demotes it to company finance', (t) => request(app).put(`/api/provider/directory/${t.id}`).send({ role: 'finance_officer_platform' })],
        ['DELETE /provider/directory/:id deletes it', (t) => request(app).delete(`/api/provider/directory/${t.id}`)],
    ])('%s: refused with 409 exactly when no other active platform admin exists', async (_name, send) => {
        const target = await platformAdmin('ACTIVE');
        const before = await rowOf(target.id);
        const others = await otherActivePlatformAdmins(target.id);
        const res = await send(target);
        if (others === 0) {
            expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: 'ROLE_ADMIN_CANNOT_BE_LAST' });
            expect(await rowOf(target.id)).toEqual(before);
        } else {
            expect(res.status).toBe(200);
        }
    });
});
