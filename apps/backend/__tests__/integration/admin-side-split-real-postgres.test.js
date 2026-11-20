'use strict';

/**
 * Each side's admin changes only its own side (order 13, operator 2026-10-06; order 34(2),
 * 2026-10-07). Real Postgres, real routers behind their real gates (/api/admin carries the
 * real requireAdmin, the organizations router the real requireRole): every door that writes
 * a role, a status, a profile field, a lock, a permission grant or a new account refuses the
 * other side with 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN, leaves the account row untouched, and
 * adds one audit row that names no person. The controls prove the same doors still work on
 * the admin's own side, and that applicant accounts keep the rules they had.
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

const CODE = 'CROSS_SIDE_USER_CHANGE_FORBIDDEN';
const REFUSED = 'CROSS_SIDE_USER_CHANGE_REFUSED';
const REASON = 'ปรับบทบาทตามคำสั่งหน่วยงาน';
const PASSWORD = 'Gacp#Split2026x';

d('each side’s admin changes only its own side (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], emails: [] };
    let seq = 0;

    const nationalId = () => String(crypto.randomInt(1e12, 1e13));
    const as = (user) => { mockActor.current = { ...user }; };

    async function account(role, { status = 'ACTIVE', locked = false, granted = false, groups = [], org = fx.org } = {}) {
        seq += 1;
        const id = crypto.randomUUID();
        const email = `ass-${seq}-${sfx}@example.test`;
        const identity = role === 'health'
            ? { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId() }
            : { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId() };
        await raw.user.create({
            data: {
                id, canonicalId: `ass-${seq}-${sfx}`, password: 'x', role, status, email,
                firstName: `ชื่อ${seq}${sfx}`, lastName: `สกุล${seq}${sfx}`, organizationId: org, ...identity,
                ...(locked ? { isLocked: true, lockedUntil: new Date(Date.now() + 3600e3) } : {}),
            },
        });
        fx.userIds.push(id);
        if (granted) {
            await raw.userPermissionGrant.create({
                data: { userId: id, permission: 'report.export', effect: 'GRANT', reason: REASON, organizationId: org },
            });
        }
        for (const code of groups) {
            const group = await raw.roleGroup.findUnique({ where: { code }, select: { id: true } });
            await raw.userGroupMembership.create({ data: { userId: id, groupId: group.id, organizationId: org } });
        }
        return { id, role, canonicalRole: role, organizationId: org, email, ...identity };
    }

    function newStaff(role) {
        seq += 1;
        const email = `ass-new-${seq}-${sfx}@example.test`;
        fx.emails.push(email);
        return { email, providerId: nationalId(), password: PASSWORD, firstName: `ใหม่${seq}`, lastName: 'ทดสอบ', role };
    }

    const snapshot = async (id) => ({
        user: await raw.user.findUnique({
            where: { id },
            select: {
                role: true, status: true, firstName: true, lastName: true, email: true, isDeleted: true,
                isLocked: true, sessionsRevokedAt: true, updatedAt: true,
            },
        }),
        grants: await raw.userPermissionGrant.findMany({ where: { userId: id }, select: { permission: true, effect: true } }),
        groups: await raw.userGroupMembership.findMany({ where: { userId: id }, select: { groupId: true, isActive: true } }),
    });
    const groupCodesOf = async (userId) => (await raw.userGroupMembership.findMany({
        where: { userId, isActive: true }, select: { group: { select: { code: true } } },
    })).map((m) => m.group.code).sort();
    const refusalCount = (actorId) => raw.auditLog.count({ where: { action: REFUSED, actorId } });

    async function expectRefused(actor, target, send) {
        as(actor);
        const before = target ? await snapshot(target.id) : null;
        const refusalsBefore = await refusalCount(actor.id);
        const res = await send(target);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: CODE });
        expect(res.body.messageTh).toMatch(/[฀-๿]/);
        if (target) {
            expect(await snapshot(target.id)).toEqual(before);
        }
        expect(await refusalCount(actor.id)).toBe(refusalsBefore + 1);
        const row = await raw.auditLog.findFirst({ where: { action: REFUSED, actorId: actor.id }, orderBy: { createdAt: 'desc' } });
        expect(row).toMatchObject({ result: 'FAILURE', errorCode: CODE, resourceId: target ? target.id : 'NEW_USER', actorEmail: null });
        const stored = JSON.stringify(row);
        const personal = [actor.email, target?.email, target?.providerId, target?.healthId].filter(Boolean);
        for (const value of personal) { expect(stored).not.toContain(value); }
        expect(stored).not.toMatch(/ชื่อ\d|สกุล\d/);
        return res;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.org = (await raw.organization.create({
            data: { name: `ass-${sfx}`, slug: `ass-${sfx}`, code: `ASS_${sfx}`.toUpperCase() },
        })).id;
        fx.otherOrg = (await raw.organization.create({
            data: { name: `ass-o-${sfx}`, slug: `ass-o-${sfx}`, code: `ASSO_${sfx}`.toUpperCase() },
        })).id;
        fx.dtamAdmin = await account('system_admin_dtam');
        fx.secondDtamAdmin = await account('system_admin_dtam');
        fx.platformAdmin = await account('system_admin_platform');
        app = express();
        app.use(express.json());
        app.use('/api/admin', require('../../routes/api/admin'));
        app.use('/api/provider/directory', require('../../routes/api/system/provider'));
        app.use('/api/platform-admin/organizations', require('../../routes/api/platform-admin/organizations'));
        app.use('/api/provider/admin/user-groups', require('../../routes/api/provider/admin-user-groups'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const created = await raw.user.findMany({ where: { email: { in: fx.emails } }, select: { id: true } });
        const ids = [...fx.userIds, ...created.map((u) => u.id)];
        await raw.userPermissionGrant.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { resourceId: { in: ids } }] } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: [fx.org, fx.otherOrg].filter(Boolean) } } }).catch(() => {});
        await raw.$disconnect();
    });

    const patch = (url, body) => request(app).patch(url).send(body);
    const KINDS = {
        dtamStaff: () => account('document_reviewer'),
        dtamStaffLocked: () => account('document_reviewer', { locked: true }),
        dtamAdmin: () => account('system_admin_dtam'),
        companyStaff: () => account('finance_officer_platform'),
        companyStaffInactive: () => account('finance_officer_platform', { status: 'INACTIVE' }),
        companyStaffLocked: () => account('finance_officer_platform', { locked: true }),
        companyStaffGranted: () => account('finance_officer_platform', { granted: true }),
        companyStaffInGroup: () => account('finance_officer_platform', { groups: ['finance_officer_platform'] }),
        platformAdmin: () => account('system_admin_platform'),
    };

    describe('the DTAM admin cannot touch the company side', () => {
        test.each([
            ['PATCH /admin/users/:id/role gives its staff the company finance role', 'dtamStaff',
                (t) => patch(`/api/admin/users/${t.id}/role`, { role: 'finance_officer_platform' })],
            ['PATCH /admin/users/:id/change-role gives its staff the company finance role', 'dtamStaff',
                (t) => patch(`/api/admin/users/${t.id}/change-role`, { newRole: 'finance_officer_platform', reason: REASON })],
            ['PATCH /admin/users/:id/role moves a company account to a DTAM role', 'companyStaff',
                (t) => patch(`/api/admin/users/${t.id}/role`, { role: 'dispatcher' })],
            ['PATCH /admin/users/:id/change-role moves a company account to a DTAM role', 'companyStaff',
                (t) => patch(`/api/admin/users/${t.id}/change-role`, { newRole: 'dispatcher', reason: REASON })],
            ['PATCH /admin/users/:id/role with a status only disables a company account', 'companyStaff',
                (t) => patch(`/api/admin/users/${t.id}/role`, { status: 'INACTIVE' })],
            ['PATCH /admin/users/:id/disable disables a company account', 'companyStaff',
                (t) => patch(`/api/admin/users/${t.id}/disable`, { reason: REASON })],
            ['PATCH /admin/users/:id/enable re-enables a company account', 'companyStaffInactive',
                (t) => patch(`/api/admin/users/${t.id}/enable`, {})],
            ['PATCH /admin/users/:id/role suspends the platform admin', 'platformAdmin',
                (t) => patch(`/api/admin/users/${t.id}/role`, { status: 'SUSPENDED' })],
            ['PATCH /admin/users/:id/change-role demotes the platform admin', 'platformAdmin',
                (t) => patch(`/api/admin/users/${t.id}/change-role`, { newRole: 'document_reviewer', reason: REASON })],
            ['PUT /admin/user-permissions/:id/:permission revokes a company account permission', 'companyStaff',
                (t) => request(app).put(`/api/admin/user-permissions/${t.id}/report.export`).send({ effect: 'REVOKE', reason: REASON })],
            ['DELETE /admin/user-permissions/:id/:permission resets a company account grant', 'companyStaffGranted',
                (t) => request(app).delete(`/api/admin/user-permissions/${t.id}/report.export`)],
            ['PATCH /provider/directory/:id gives its staff the company finance role', 'dtamStaff',
                (t) => patch(`/api/provider/directory/${t.id}`, { role: 'finance_officer_platform' })],
            ['PUT /provider/directory/:id renames a company account', 'companyStaff',
                (t) => request(app).put(`/api/provider/directory/${t.id}`).send({ firstName: 'เปลี่ยนชื่อ' })],
            ['PATCH /provider/directory/:id disables a company account', 'companyStaff',
                (t) => patch(`/api/provider/directory/${t.id}`, { isActive: false })],
            ['DELETE /provider/directory/:id deletes a company account', 'companyStaff',
                (t) => request(app).delete(`/api/provider/directory/${t.id}`)],
            ['POST /provider/directory/:id/unlock unlocks a company account', 'companyStaffLocked',
                (t) => request(app).post(`/api/provider/directory/${t.id}/unlock`).send({})],
            ['POST /provider/admin/user-groups/:userId adds the company finance group to its staff', 'dtamStaff',
                (t) => request(app).post(`/api/provider/admin/user-groups/${t.id}`).send({ groupCode: 'finance_officer_platform' })],
            ['POST /provider/admin/user-groups/:userId adds a DTAM group to a company account', 'companyStaff',
                (t) => request(app).post(`/api/provider/admin/user-groups/${t.id}`).send({ groupCode: 'dispatcher' })],
            ['DELETE /provider/admin/user-groups/:userId/:groupCode removes a company account group', 'companyStaffInGroup',
                (t) => request(app).delete(`/api/provider/admin/user-groups/${t.id}/finance_officer_platform`)],
        ])('%s: 403, nothing written, one audit row', async (_name, kind, send) => {
            const target = await KINDS[kind]();
            await expectRefused(fx.dtamAdmin, target, send);
        });

        test.each([
            ['POST /admin/users/provider', '/api/admin/users/provider'],
            ['POST /provider/directory', '/api/provider/directory'],
        ])('%s refuses to create a company finance account', async (_name, url) => {
            const body = newStaff('finance_officer_platform');
            await expectRefused(fx.dtamAdmin, null, () => request(app).post(url).send(body));
            expect(await raw.user.count({ where: { email: body.email } })).toBe(0);
        });
    });

    describe('the platform admin cannot touch the DTAM side', () => {
        test.each([
            ['PATCH /provider/directory/:id renames DTAM staff', 'dtamStaff',
                (t) => patch(`/api/provider/directory/${t.id}`, { firstName: 'เปลี่ยนชื่อ' })],
            ['PATCH /provider/directory/:id disables DTAM staff', 'dtamStaff',
                (t) => patch(`/api/provider/directory/${t.id}`, { isActive: false })],
            ['PATCH /provider/directory/:id disables the DTAM admin', 'dtamAdmin',
                (t) => patch(`/api/provider/directory/${t.id}`, { isActive: false })],
            ['PUT /provider/directory/:id moves DTAM staff to the company finance role', 'dtamStaff',
                (t) => request(app).put(`/api/provider/directory/${t.id}`).send({ role: 'finance_officer_platform' })],
            ['PATCH /provider/directory/:id moves a company account to a DTAM role', 'companyStaff',
                (t) => patch(`/api/provider/directory/${t.id}`, { role: 'dispatcher' })],
            ['DELETE /provider/directory/:id deletes DTAM staff', 'dtamStaff',
                (t) => request(app).delete(`/api/provider/directory/${t.id}`)],
            ['POST /provider/directory/:id/unlock unlocks DTAM staff', 'dtamStaffLocked',
                (t) => request(app).post(`/api/provider/directory/${t.id}/unlock`).send({})],
        ])('%s: 403, nothing written, one audit row', async (_name, kind, send) => {
            const target = await KINDS[kind]();
            await expectRefused(fx.platformAdmin, target, send);
        });

        test.each([
            ['POST /provider/directory a document reviewer', '/api/provider/directory', 'document_reviewer'],
            ['POST /platform-admin/organizations/:id/users a DTAM admin', 'org', 'system_admin_dtam'],
            ['POST /platform-admin/organizations/:id/users a certificate approver', 'org', 'certificate_approver'],
        ])('%s is refused', async (_name, url, role) => {
            const body = newStaff(role);
            const path = url === 'org' ? `/api/platform-admin/organizations/${fx.org}/users` : url;
            await expectRefused(fx.platformAdmin, null, () => request(app).post(path).send(body));
            expect(await raw.user.count({ where: { email: body.email } })).toBe(0);
        });
    });

    describe('the group doors take staff accounts only, and never the admin itself (review L4)', () => {
        test.each([
            ['GET', (t) => request(app).get(`/api/provider/admin/user-groups/${t.id}`)],
            ['POST', (t) => request(app).post(`/api/provider/admin/user-groups/${t.id}`).send({ groupCode: 'field_inspector' })],
            ['DELETE', (t) => request(app).delete(`/api/provider/admin/user-groups/${t.id}/dispatcher`)],
        ])('%s on an applicant account answers 404 and changes nothing', async (_verb, send) => {
            const applicant = await account('health', { groups: ['dispatcher'] });
            const before = await snapshot(applicant.id);
            as(fx.dtamAdmin);
            const res = await send(applicant);
            expect(res.status).toBe(404);
            expect(res.body.data).toBeUndefined();
            expect(await snapshot(applicant.id)).toEqual(before);
        });

        test('the DTAM admin cannot give itself a group', async () => {
            const admin = await account('system_admin_dtam');
            const before = await snapshot(admin.id);
            as(admin);
            const res = await request(app).post(`/api/provider/admin/user-groups/${admin.id}`).send({ groupCode: 'certificate_approver' });
            expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: 'SELF_ROLE_CHANGE_FORBIDDEN' });
            expect(await snapshot(admin.id)).toEqual(before);
        });
    });

    describe('an admin whose organization is unknown is refused (order 17)', () => {
        // No users row behind this session, so the tenant middleware cannot fill the
        // organization in from the database either: the request reaches the door without one.
        const orgless = () => ({ id: crypto.randomUUID(), role: 'system_admin_dtam', canonicalRole: 'system_admin_dtam' });
        const expectNoOrganization = (res) => {
            expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'NO_ORGANIZATION' });
            expect(res.body.messageTh).toMatch(/[฀-๿]/);
        };

        test.each([
            ['PATCH /admin/users/:id/role', (t) => patch(`/api/admin/users/${t.id}/role`, { role: 'field_inspector' })],
            ['PATCH /admin/users/:id/disable', (t) => patch(`/api/admin/users/${t.id}/disable`, { reason: REASON })],
            ['PATCH /admin/users/:id/change-role', (t) => patch(`/api/admin/users/${t.id}/change-role`, { newRole: 'field_inspector', reason: REASON })],
            ['PUT /admin/user-permissions/:id/:permission', (t) => request(app).put(`/api/admin/user-permissions/${t.id}/report.export`).send({ effect: 'GRANT', reason: REASON })],
            ['GET /provider/admin/user-groups/:userId', (t) => request(app).get(`/api/provider/admin/user-groups/${t.id}`)],
            ['POST /provider/admin/user-groups/:userId', (t) => request(app).post(`/api/provider/admin/user-groups/${t.id}`).send({ groupCode: 'field_inspector' })],
            ['PATCH /provider/directory/:id', (t) => patch(`/api/provider/directory/${t.id}`, { role: 'field_inspector' })],
        ])('%s: 400 NO_ORGANIZATION and the account stays as it was', async (_name, send) => {
            const target = await account('dispatcher', { groups: ['dispatcher'] });
            const before = await snapshot(target.id);
            as(orgless());
            const res = await send(target);
            expectNoOrganization(res);
            expect(res.body.data).toBeUndefined();
            expect(await snapshot(target.id)).toEqual(before);
        });

        test.each([
            ['POST /admin/users/provider', '/api/admin/users/provider'],
            ['POST /provider/directory', '/api/provider/directory'],
        ])('%s: 400 NO_ORGANIZATION and no account', async (_name, url) => {
            const body = newStaff('dispatcher');
            as(orgless());
            expectNoOrganization(await request(app).post(url).send(body));
            expect(await raw.user.count({ where: { email: body.email } })).toBe(0);
        });

        test('GET /admin/users: 400 NO_ORGANIZATION, no list', async () => {
            as(orgless());
            const res = await request(app).get('/api/admin/users');
            expectNoOrganization(res);
            expect(res.body.data).toBeUndefined();
        });
    });

    describe('each admin still manages its own side', () => {
        const roleOf = async (id) => (await raw.user.findUnique({ where: { id }, select: { role: true } })).role;
        const statusOf = async (id) => (await raw.user.findUnique({ where: { id }, select: { status: true } })).status;

        test('the DTAM admin gives dispatcher to its own staff (PATCH /admin/users/:id/role)', async () => {
            const target = await account('document_reviewer');
            as(fx.dtamAdmin);
            const res = await patch(`/api/admin/users/${target.id}/role`, { role: 'dispatcher' });
            expect(res.status).toBe(200);
            expect(await roleOf(target.id)).toBe('dispatcher');
        });

        test('the DTAM admin appoints a certificate approver (PATCH /admin/users/:id/change-role)', async () => {
            const target = await account('field_inspector');
            as(fx.dtamAdmin);
            const res = await patch(`/api/admin/users/${target.id}/change-role`, { newRole: 'certificate_approver', reason: REASON });
            expect(res.status).toBe(200);
            expect(await roleOf(target.id)).toBe('certificate_approver');
        });

        test('the DTAM admin disables and re-enables its own staff', async () => {
            const target = await account('dispatcher');
            as(fx.dtamAdmin);
            expect((await patch(`/api/admin/users/${target.id}/disable`, { reason: REASON })).status).toBe(200);
            expect(await statusOf(target.id)).toBe('INACTIVE');
            expect((await patch(`/api/admin/users/${target.id}/enable`, {})).status).toBe(200);
            expect(await statusOf(target.id)).toBe('ACTIVE');
        });

        test('the DTAM admin grants a permission to its own staff', async () => {
            const target = await account('dispatcher');
            as(fx.dtamAdmin);
            const res = await request(app).put(`/api/admin/user-permissions/${target.id}/report.export`)
                .send({ effect: 'GRANT', reason: REASON });
            expect(res.status).toBe(200);
            expect(await raw.userPermissionGrant.count({ where: { userId: target.id } })).toBe(1);
        });

        test('the DTAM admin edits, unlocks and deletes its own staff in the directory', async () => {
            const edited = await account('document_reviewer');
            const locked = await account('document_reviewer', { locked: true });
            const deleted = await account('document_reviewer');
            as(fx.dtamAdmin);
            expect((await patch(`/api/provider/directory/${edited.id}`, { role: 'field_inspector', firstName: 'แก้ชื่อ' })).status).toBe(200);
            expect(await roleOf(edited.id)).toBe('field_inspector');
            expect((await request(app).post(`/api/provider/directory/${locked.id}/unlock`).send({})).status).toBe(200);
            expect((await request(app).delete(`/api/provider/directory/${deleted.id}`)).status).toBe(200);
        });

        test.each([
            ['POST /admin/users/provider', '/api/admin/users/provider', 'certificate_approver'],
            ['POST /provider/directory', '/api/provider/directory', 'document_reviewer'],
        ])('the DTAM admin creates its own staff through %s', async (_name, url, role) => {
            const body = newStaff(role);
            as(fx.dtamAdmin);
            const res = await request(app).post(url).send(body);
            expect(res.status).toBe(201);
            expect((await raw.user.findFirst({ where: { email: body.email }, select: { role: true } })).role).toBe(role);
        });

        test('the DTAM admin adds and removes a DTAM group on its own staff, and both are on the record', async () => {
            const target = await account('document_reviewer', { groups: ['document_reviewer'] });
            as(fx.dtamAdmin);
            const add = await request(app).post(`/api/provider/admin/user-groups/${target.id}`).send({ groupCode: 'dispatcher' });
            expect(add.status).toBe(200);
            expect(await groupCodesOf(target.id)).toEqual(['dispatcher', 'document_reviewer']);
            const granted = await raw.auditLog.findFirst({
                where: { action: 'USER_GROUP_MEMBERSHIP_GRANTED', resourceId: target.id }, orderBy: { createdAt: 'desc' },
            });
            expect(granted).toMatchObject({ actorId: fx.dtamAdmin.id, actorRole: 'system_admin_dtam', organizationId: fx.org });
            const remove = await request(app).delete(`/api/provider/admin/user-groups/${target.id}/dispatcher`);
            expect(remove.status).toBe(200);
            expect(await groupCodesOf(target.id)).toEqual(['document_reviewer']);
            const revoked = await raw.auditLog.findFirst({
                where: { action: 'USER_GROUP_MEMBERSHIP_REVOKED', resourceId: target.id }, orderBy: { createdAt: 'desc' },
            });
            expect(revoked).toMatchObject({ actorId: fx.dtamAdmin.id, actorRole: 'system_admin_dtam', organizationId: fx.org });
        });

        test('the DTAM admin can clear a company group off its own staff', async () => {
            const target = await account('dispatcher', { groups: ['dispatcher', 'finance_officer_platform'] });
            as(fx.dtamAdmin);
            const res = await request(app).delete(`/api/provider/admin/user-groups/${target.id}/finance_officer_platform`);
            expect(res.status).toBe(200);
            expect(await groupCodesOf(target.id)).toEqual(['dispatcher']);
        });

        test('the group door does not reach staff of another organization (order 17)', async () => {
            const outsider = await account('dispatcher', { org: fx.otherOrg, groups: ['dispatcher'] });
            as(fx.dtamAdmin);
            const read = await request(app).get(`/api/provider/admin/user-groups/${outsider.id}`);
            const add = await request(app).post(`/api/provider/admin/user-groups/${outsider.id}`).send({ groupCode: 'field_inspector' });
            const remove = await request(app).delete(`/api/provider/admin/user-groups/${outsider.id}/dispatcher`);
            expect([read.status, add.status, remove.status]).toEqual([404, 404, 404]);
            expect(read.body.data).toBeUndefined();
            expect(await groupCodesOf(outsider.id)).toEqual(['dispatcher']);
        });

        test('the DTAM admin keeps its applicant rules: status changes through the admin user doors', async () => {
            const applicant = await account('health');
            as(fx.dtamAdmin);
            expect((await patch(`/api/admin/users/${applicant.id}/role`, { status: 'SUSPENDED' })).status).toBe(200);
            expect(await statusOf(applicant.id)).toBe('SUSPENDED');
            expect((await patch(`/api/admin/users/${applicant.id}/enable`, {})).status).toBe(200);
            expect((await patch(`/api/admin/users/${applicant.id}/disable`, { reason: REASON })).status).toBe(200);
            expect(await statusOf(applicant.id)).toBe('INACTIVE');
        });

        test('the platform admin edits, disables, unlocks and deletes a company account', async () => {
            const edited = await account('finance_officer_platform');
            const locked = await account('finance_officer_platform', { locked: true });
            const deleted = await account('finance_officer_platform');
            as(fx.platformAdmin);
            expect((await patch(`/api/provider/directory/${edited.id}`, { firstName: 'แก้ชื่อ', isActive: false })).status).toBe(200);
            expect(await statusOf(edited.id)).toBe('INACTIVE');
            expect((await request(app).post(`/api/provider/directory/${locked.id}/unlock`).send({})).status).toBe(200);
            expect((await request(app).delete(`/api/provider/directory/${deleted.id}`)).status).toBe(200);
        });

        test.each([
            ['POST /provider/directory', '/api/provider/directory'],
            ['POST /platform-admin/organizations/:id/users', 'org'],
        ])('the platform admin creates a company finance account through %s', async (_name, url) => {
            const body = newStaff('finance_officer_platform');
            as(fx.platformAdmin);
            const path = url === 'org' ? `/api/platform-admin/organizations/${fx.org}/users` : url;
            const res = await request(app).post(path).send(body);
            expect(res.status).toBe(201);
            expect((await raw.user.findFirst({ where: { email: body.email }, select: { role: true } })).role)
                .toBe('finance_officer_platform');
        });

        test.each([
            ['the DTAM admin', '/api/admin/users/provider', 'dtamAdmin'],
            ['the DTAM admin', '/api/provider/directory', 'dtamAdmin'],
            ['the platform admin', '/api/provider/directory', 'platformAdmin'],
        ])('%s creating staff without a role through %s gets 400 and no account', async (_name, url, actor) => {
            const body = newStaff(undefined);
            delete body.role;
            as(fx[actor]);
            const res = await request(app).post(url).send(body);
            expect(res.status).toBe(400);
            expect(await raw.user.count({ where: { email: body.email } })).toBe(0);
        });

        test('the platform admin still has no door to applicant accounts', async () => {
            const applicant = await account('health');
            as(fx.platformAdmin);
            const before = await snapshot(applicant.id);
            expect((await patch(`/api/provider/directory/${applicant.id}`, { isActive: false })).status).toBe(404);
            expect(await snapshot(applicant.id)).toEqual(before);
        });
    });
});
