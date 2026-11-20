'use strict';

/**
 * The two ops scripts that give a side its admin outside the API (review I1 of
 * fix/admin-role-split; order 13 keeps the API from doing it). Run as the operator runs them,
 * a child `node` process against the test database.
 *
 *   scripts/grant-platform-admin.js      a company-side account becomes system_admin_platform
 *   scripts/ops/bootstrap-dtam-admin.js  an organization with no active DTAM admin gets one,
 *                                        by promoting or re-enabling one of its DTAM-side staff
 *
 * Both write the canonical role word, refuse to move an account across sides, write the
 * change and its audit row together, and print no email or national ID.
 */

const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const BACKEND = path.resolve(__dirname, '../..');
const REASON = 'หนังสือกรมขอตั้งผู้ดูแลระบบขององค์กร';

d('ops scripts that give a side its admin (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], orgIds: [] };
    let seq = 0;

    function run(script, args) {
        const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL };
        const res = spawnSync(process.execPath, [path.join(BACKEND, script), ...args], {
            cwd: BACKEND, env, encoding: 'utf8', timeout: 60000,
        });
        return { status: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
    }

    async function organization() {
        seq += 1;
        const org = await raw.organization.create({
            data: { name: `ops ${seq} ${sfx}`, slug: `ops-${seq}-${sfx}`, code: `OPS${seq}_${sfx}`.toUpperCase() },
        });
        fx.orgIds.push(org.id);
        return org;
    }

    async function account(org, role, { status = 'ACTIVE', groups = [] } = {}) {
        seq += 1;
        const id = crypto.randomUUID();
        const email = `ops-${seq}-${sfx}@example.test`;
        const nationalId = String(crypto.randomInt(1e12, 1e13));
        const identity = role === 'health'
            ? { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId }
            : { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId };
        await raw.user.create({
            data: {
                id, canonicalId: `ops-${seq}-${sfx}`, password: 'x', role, status, email,
                firstName: `ทดสอบ${seq}`, lastName: 'ปฏิบัติการ', organizationId: org.id, ...identity,
            },
        });
        fx.userIds.push(id);
        for (const code of groups) {
            const group = await raw.roleGroup.findUnique({ where: { code }, select: { id: true } });
            await raw.userGroupMembership.create({ data: { userId: id, groupId: group.id, organizationId: org.id } });
        }
        return { id, email, nationalId, firstName: `ทดสอบ${seq}` };
    }

    const rowOf = (id) => raw.user.findUnique({ where: { id }, select: { role: true, status: true, sessionsRevokedAt: true } });
    const groupsOf = async (id) => (await raw.userGroupMembership.findMany({
        where: { userId: id, isActive: true }, select: { group: { select: { code: true } } },
    })).map((m) => m.group.code).sort();
    const auditRows = (id, action) => raw.auditLog.findMany({ where: { resourceId: id, action } });
    const expectNoPersonalData = (output, who) => {
        expect(output).not.toContain(who.email);
        expect(output).not.toContain(who.nationalId);
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.userGroupMembership.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { resourceId: { in: fx.userIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    });

    describe('scripts/grant-platform-admin.js', () => {
        test('a company finance account becomes system_admin_platform, with its audit row and no email printed', async () => {
            const org = await organization();
            const target = await account(org, 'finance_officer_platform');
            const res = run('scripts/grant-platform-admin.js', ['--id', target.id, '--apply']);
            expect(res.status).toBe(0);
            const row = await rowOf(target.id);
            expect(row.role).toBe('system_admin_platform');
            expect(row.sessionsRevokedAt).not.toBeNull();
            expect(await auditRows(target.id, 'USER_ROLE_GRANTED')).toHaveLength(1);
            expectNoPersonalData(res.output, target);
        });

        test.each([
            ['a DTAM-side account (no account crosses sides)', 'dispatcher'],
            ['an account whose role is a retired word', 'PLATFORM_ADMIN'],
        ])('refuses %s and changes nothing', async (_name, role) => {
            const org = await organization();
            const target = await account(org, role);
            const before = await rowOf(target.id);
            const res = run('scripts/grant-platform-admin.js', ['--id', target.id, '--apply']);
            expect(res.status).toBe(1);
            expect(res.output).toContain('REFUSED');
            expect(await rowOf(target.id)).toEqual(before);
            expect(await auditRows(target.id, 'USER_ROLE_GRANTED')).toHaveLength(0);
        });
    });

    describe('scripts/ops/bootstrap-dtam-admin.js', () => {
        const SCRIPT = 'scripts/ops/bootstrap-dtam-admin.js';

        test('with no --user it lists the organization\'s DTAM-side staff by name and user id, and writes nothing', async () => {
            const org = await organization();
            const staff = await account(org, 'document_reviewer');
            const company = await account(org, 'finance_officer_platform');
            const before = await rowOf(staff.id);
            const res = run(SCRIPT, ['--organization', org.id]);
            expect(res.status).toBe(0);
            expect(res.output).toContain(`${staff.firstName} ปฏิบัติการ`);
            expect(res.output).toContain(staff.id);
            expect(res.output).not.toContain(company.id);
            expect(await rowOf(staff.id)).toEqual(before);
            expectNoPersonalData(res.output, staff);
        });

        test('a dry run (the default) says what it would do and writes nothing', async () => {
            const org = await organization();
            const target = await account(org, 'dispatcher', { groups: ['dispatcher'] });
            const before = await rowOf(target.id);
            const res = run(SCRIPT, ['--organization', org.id, '--user', target.id, '--reason', REASON]);
            expect(res.status).toBe(0);
            expect(res.output).toContain(target.firstName);
            expect(await rowOf(target.id)).toEqual(before);
            expect(await groupsOf(target.id)).toEqual(['dispatcher']);
            expect(await auditRows(target.id, 'DTAM_ADMIN_BOOTSTRAPPED')).toHaveLength(0);
            expectNoPersonalData(res.output, target);
        });

        test('--apply promotes DTAM-side staff to the organization\'s DTAM admin, with its admin group and one audit row', async () => {
            const org = await organization();
            const target = await account(org, 'dispatcher', { status: 'INACTIVE', groups: ['dispatcher'] });
            const res = run(SCRIPT, ['--organization', org.slug, '--user', target.id, '--reason', REASON, '--apply']);
            expect(res.status).toBe(0);
            const row = await rowOf(target.id);
            expect(row).toMatchObject({ role: 'system_admin_dtam', status: 'ACTIVE' });
            expect(row.sessionsRevokedAt).not.toBeNull();
            expect(await groupsOf(target.id)).toEqual(['dispatcher', 'system_admin_dtam']);
            const [audit, ...more] = await auditRows(target.id, 'DTAM_ADMIN_BOOTSTRAPPED');
            expect(more).toHaveLength(0);
            expect(audit).toMatchObject({ organizationId: org.id, actorId: 'SYSTEM', result: 'SUCCESS' });
            expect(JSON.parse(audit.metadata)).toMatchObject({
                reason: REASON, before: { role: 'dispatcher', status: 'INACTIVE' }, after: { role: 'system_admin_dtam', status: 'ACTIVE' },
            });
            expectNoPersonalData(res.output, target);
            expectNoPersonalData(JSON.stringify(audit), target);
        });

        test('--apply re-enables a disabled DTAM admin', async () => {
            const org = await organization();
            const target = await account(org, 'system_admin_dtam', { status: 'INACTIVE', groups: ['system_admin_dtam'] });
            const res = run(SCRIPT, ['--organization', org.id, '--user', target.id, '--reason', REASON, '--apply']);
            expect(res.status).toBe(0);
            expect(await rowOf(target.id)).toMatchObject({ role: 'system_admin_dtam', status: 'ACTIVE' });
            expect(await auditRows(target.id, 'DTAM_ADMIN_BOOTSTRAPPED')).toHaveLength(1);
        });

        test('refuses an organization that already has an active DTAM admin, so a second run changes nothing', async () => {
            const org = await organization();
            await account(org, 'system_admin_dtam');
            const target = await account(org, 'dispatcher');
            const before = await rowOf(target.id);
            const res = run(SCRIPT, ['--organization', org.id, '--user', target.id, '--reason', REASON, '--apply']);
            expect(res.status).toBe(1);
            expect(res.output).toContain('ปฏิเสธ');
            expect(await rowOf(target.id)).toEqual(before);
        });

        test.each([
            ['a company-side account', 'finance_officer_platform', false],
            ['an applicant account', 'health', false],
            ['staff of another organization', 'dispatcher', true],
        ])('refuses %s and changes nothing', async (_name, role, elsewhere) => {
            const org = await organization();
            const home = elsewhere ? await organization() : org;
            const target = await account(home, role);
            const before = await rowOf(target.id);
            const res = run(SCRIPT, ['--organization', org.id, '--user', target.id, '--reason', REASON, '--apply']);
            expect(res.status).toBe(1);
            expect(res.output).toContain('ปฏิเสธ');
            expect(await rowOf(target.id)).toEqual(before);
            expect(await auditRows(target.id, 'DTAM_ADMIN_BOOTSTRAPPED')).toHaveLength(0);
        });

        test('--apply without a reason is refused', async () => {
            const org = await organization();
            const target = await account(org, 'dispatcher');
            const before = await rowOf(target.id);
            const res = run(SCRIPT, ['--organization', org.id, '--user', target.id, '--apply']);
            expect(res.status).toBe(1);
            expect(res.output).toContain('ปฏิเสธ');
            expect(await rowOf(target.id)).toEqual(before);
        });
    });
});
