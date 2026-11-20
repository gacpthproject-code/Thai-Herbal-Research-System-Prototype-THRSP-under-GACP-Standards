'use strict';

/**
 * F-A8b-13 (staging walk 2026-10-27): the DTAM admin's user list labelled every
 * applicant "ถูกระงับ", including ones who had just logged in. The list judged a row
 * by `status === 'ACTIVE'` while the door (shared/account-status.js,
 * canAccountHoldSession) lets an applicant in at the registration default
 * PENDING_VERIFICATION. One rule for the door and the list: a row is active when
 * the account can hold a session, and the ACTIVE / DISABLED filters are built from
 * the same statuses.
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

d('GET /api/admin/users judges "active" by the login rule (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const token = `ulr-${sfx}`;
    const fx = { userIds: [] };
    let seq = 0;

    const nationalId = () => String(crypto.randomInt(1e12, 1e13));

    async function account(role, status, emailPrefix = token) {
        seq += 1;
        const id = crypto.randomUUID();
        const identity = role === 'health'
            ? { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId() }
            : { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId() };
        await raw.user.create({
            data: {
                id, canonicalId: `${emailPrefix}-${seq}`, password: 'x', role, status,
                email: `${emailPrefix}-${seq}@example.test`,
                firstName: `ชื่อ${seq}`, lastName: `สกุล${seq}`, organizationId: fx.org, ...identity,
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.org, email: `${emailPrefix}-${seq}@example.test`, ...identity };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.org = (await raw.organization.create({
            data: { name: `ulr-${sfx}`, slug: `ulr-${sfx}`, code: `ULR_${sfx}`.toUpperCase() },
        })).id;
        fx.admin = await account('system_admin_dtam', 'ACTIVE', `adm-${sfx}`);
        fx.newApplicant = await account('health', 'PENDING_VERIFICATION');
        fx.newStaff = await account('document_reviewer', 'PENDING_VERIFICATION');
        fx.disabledApplicant = await account('health', 'INACTIVE');
        mockActor.current = { ...fx.admin };
        app = express();
        app.use(express.json());
        app.use('/api/admin', require('../../routes/api/admin'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.auditLog.deleteMany({ where: { actorId: { in: fx.userIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.org } }).catch(() => {});
        await raw.$disconnect();
    });

    const list = (extra = '') => request(app).get(`/api/admin/users?q=${token}${extra}`);
    const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

    test('an applicant at PENDING_VERIFICATION is active; staff at PENDING_VERIFICATION and an INACTIVE applicant are not', async () => {
        const res = await list();
        expect(res.status).toBe(200);
        const rows = byId(res.body.data.users);
        expect({
            newApplicant: rows[fx.newApplicant.id]?.isActive,
            newStaff: rows[fx.newStaff.id]?.isActive,
            disabledApplicant: rows[fx.disabledApplicant.id]?.isActive,
        }).toEqual({ newApplicant: true, newStaff: false, disabledApplicant: false });
    });

    test('?status=ACTIVE lists the accounts that can log in, so the new applicant and nobody else', async () => {
        const res = await list('&status=ACTIVE');
        expect(res.status).toBe(200);
        expect(res.body.data.users.map((r) => r.id)).toEqual([fx.newApplicant.id]);
    });

    test('?status=DISABLED lists the accounts that cannot log in, so the staff row and the INACTIVE applicant', async () => {
        const res = await list('&status=DISABLED');
        expect(res.status).toBe(200);
        expect(res.body.data.users.map((r) => r.id).sort()).toEqual([fx.newStaff.id, fx.disabledApplicant.id].sort());
    });
});
