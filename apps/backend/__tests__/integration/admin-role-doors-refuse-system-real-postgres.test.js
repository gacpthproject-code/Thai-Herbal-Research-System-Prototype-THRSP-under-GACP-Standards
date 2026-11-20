'use strict';

/**
 * Order 34(2): `system` is the role of webhooks and cron jobs, never of a person. Neither
 * admin role-change door may give it (or its aliases webhook / cron) to an account.
 * Real Postgres: the refused calls leave the stored role untouched; the negative control
 * proves the same door does change a role to a staff role.
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

d('admin role-change doors refuse the system role (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: [] };

    async function makeUser(label, role) {
        const id = crypto.randomUUID();
        await raw.user.create({
            data: {
                id, canonicalId: `ars-${label}-${sfx}`, password: 'x', role, accountType: 'PROVIDER',
                authType: 'PROVIDER_ID', providerId: `${sfx}${label}`.slice(0, 13),
                email: `ars-${label}-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: label,
                organizationId: fx.orgId,
            },
        });
        fx.users.push(id);
        return id;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({
            data: { name: `ars-${sfx}`, slug: `ars-${sfx}`, code: `ARS_${sfx}`.toUpperCase() },
        });
        fx.orgId = org.id;
        fx.admin = await makeUser('admin', 'system_admin_dtam');
        fx.target = await makeUser('target', 'document_reviewer');
        app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.user = { ...mockActor.current }; next(); });
        app.use('/api/admin/users', require('../../routes/api/admin/users'));
        mockActor.current = {
            id: fx.admin, role: 'system_admin_dtam', canonicalRole: 'system_admin_dtam', organizationId: fx.orgId,
        };
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.auditLog.deleteMany({ where: { resourceId: { in: fx.users } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.users } } }).catch(() => {});
        if (fx.orgId) { await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {}); }
        await raw.$disconnect();
    });

    const storedRole = async () => (await raw.user.findUnique({ where: { id: fx.target }, select: { role: true } })).role;

    test.each(['system', 'webhook', 'cron', 'SYSTEM'])('PATCH /:id/role with %s is refused and the role stays', async (role) => {
        const res = await request(app).patch(`/api/admin/users/${fx.target}/role`).send({ role });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ROLE_NOT_ASSIGNABLE_TO_A_PERSON');
        expect(await storedRole()).toBe('document_reviewer');
    });

    test.each(['system', 'webhook', 'cron'])('PATCH /:id/change-role with %s is refused and the role stays', async (role) => {
        const res = await request(app).patch(`/api/admin/users/${fx.target}/change-role`)
            .send({ newRole: role, reason: 'ทดสอบการเปลี่ยนบทบาทเป็นระบบ' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ROLE_NOT_ASSIGNABLE_TO_A_PERSON');
        expect(await storedRole()).toBe('document_reviewer');
    });

    test('negative control: both doors still change a role to a staff role', async () => {
        const first = await request(app).patch(`/api/admin/users/${fx.target}/role`).send({ role: 'dispatcher' });
        expect(first.status).toBe(200);
        expect(await storedRole()).toBe('dispatcher');
        const second = await request(app).patch(`/api/admin/users/${fx.target}/change-role`)
            .send({ newRole: 'document_reviewer', reason: 'ย้ายกลับไปตรวจเอกสาร' });
        expect(second.status).toBe(200);
        expect(await storedRole()).toBe('document_reviewer');
    });
});
