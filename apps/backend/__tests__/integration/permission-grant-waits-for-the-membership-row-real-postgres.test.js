'use strict';

/**
 * A per-member grant must not land on a membership that a concurrent revocation is closing (N6).
 * revokeMember marks the membership REVOKED and clears its grants in one transaction; a grant
 * written by setMemberPermissionGrant / resetMemberPermissionGrant in between would survive on the
 * revoked row and come back with a later re-invite (the upsert reuses the same membership row).
 *
 * Real Postgres, deterministic order: a second connection holds the membership row the way the
 * revocation does, the grant write starts and is seen waiting on a lock, then the revocation
 * commits. The grant write must see REVOKED and write nothing.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const entityService = require('../../services/entity-service');

d('a permission grant waits for the membership row (real Postgres)', () => {
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [] };

    async function user(label) {
        const id = crypto.randomUUID();
        const canonicalId = `pgw-${label}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: label, organizationId: fx.orgId,
            },
        });
        fx.userIds.push(id);
        return id;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgId = (await raw.organization.create({ data: { name: `pgw-${sfx}`, slug: `pgw-${sfx}`, code: `PGW_${sfx}`.toUpperCase() } })).id;
        fx.entityId = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: 'บริษัท รอแถวสมาชิก จำกัด', juristicId: '0105561234616', organizationId: fx.orgId },
        })).id;
        fx.owner = await user('owner');
        await raw.entityMembership.create({ data: { userId: fx.owner, entityId: fx.entityId, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId } });
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.entityMembershipEvent.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: fx.entityId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    /** Wait until some session of this database waits on a lock behind the given transaction's pid. */
    async function waitUntilBlockedBehind(holderPid) {
        for (let i = 0; i < 100; i += 1) {
            const rows = await raw.$queryRaw`
                SELECT pid FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock' AND ${holderPid}::int = ANY (pg_blocking_pids(pid))`;
            if (rows.length > 0) { return true; }
            await new Promise((resolve) => { setTimeout(resolve, 20); });
        }
        return false;
    }

    test.each([
        ['setMemberPermissionGrant', (member) => entityService.setMemberPermissionGrant({
            entityId: fx.entityId, targetUserId: member, permission: 'VIEW_FINANCIAL', effect: 'GRANT', actorUserId: fx.owner,
        })],
        ['resetMemberPermissionGrant', (member) => entityService.resetMemberPermissionGrant({
            entityId: fx.entityId, targetUserId: member, permission: 'VIEW_FINANCIAL', actorUserId: fx.owner,
        })],
    ])('%s behind a revocation sees REVOKED and writes nothing', async (_name, write) => {
        const member = await user(`m-${_name}`);
        const membership = await raw.entityMembership.create({
            data: { userId: member, entityId: fx.entityId, role: 'MANAGER', status: 'ACTIVE', organizationId: fx.orgId },
        });
        const eventsBefore = await raw.entityMembershipEvent.count({ where: { entityId: fx.entityId, targetUserId: member } });

        const { pending, sawWait } = await raw.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "entity_memberships" WHERE "id" = ${membership.id} FOR UPDATE`;
            const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
            const started = write(member);
            started.catch(() => {});
            const waited = await waitUntilBlockedBehind(pid);
            await tx.entityMembership.update({ where: { id: membership.id }, data: { status: 'REVOKED' } });
            return { pending: started, sawWait: waited };
        }, { timeout: 10000 });

        expect(sawWait).toBe(true);
        await expect(pending).rejects.toMatchObject({ code: 'TARGET_NOT_MEMBER' });
        expect(await raw.entityMemberPermissionGrant.count({ where: { membershipId: membership.id } })).toBe(0);
        expect(await raw.entityMembershipEvent.count({ where: { entityId: fx.entityId, targetUserId: member } })).toBe(eventsBefore);
    });
});
