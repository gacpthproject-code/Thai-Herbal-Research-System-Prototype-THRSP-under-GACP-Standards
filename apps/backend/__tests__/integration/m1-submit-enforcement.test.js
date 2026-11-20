'use strict';

const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { seedHolderScopeFixture, cleanupHolderScopeFixture } = require('./fixtures/holder-scope-fixture');

d('M1 submit enforcement (real Postgres)', () => {
    let raw;
    let fx;
    let assertSubmitAllowed;
    let draft;
    const grantMemberships = [];

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await seedHolderScopeFixture(raw);
        ({ assertSubmitAllowed } = require('../../services/application-submit-guard'));
        draft = await raw.application.findUnique({ where: { id: fx.apps.D } });
    }, 120000);

    afterAll(async () => {
        if (raw) {
            await raw.entityMemberPermissionGrant.deleteMany({ where: { membershipId: { in: grantMemberships } } });
            await cleanupHolderScopeFixture(raw, fx);
            await raw.$disconnect();
        }
    });

    const membershipOf = (userKey) => raw.entityMembership.findFirst({
        where: { userId: fx.users[userKey].id, entityId: fx.entities.C },
        select: { id: true },
    });

    async function fileGrant(userKey, effect) {
        const membership = await membershipOf(userKey);
        await raw.entityMemberPermissionGrant.create({
            data: { membershipId: membership.id, permission: 'SUBMIT_APPLICATION', effect, organizationId: fx.orgId },
        });
        grantMemberships.push(membership.id);
    }

    const failureRows = () => raw.auditLog.count({ where: { resourceId: draft.id, result: 'FAILURE' } });
    const latestFailure = () => raw.auditLog.findFirst({
        where: { resourceId: draft.id, result: 'FAILURE' },
        orderBy: { createdAt: 'desc' },
    });
    const metadataOf = (row) => (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata);

    it('AC2: a non-member is refused 403 ENTITY_PERMISSION_DENIED and the refusal is on the record', async () => {
        const before = await failureRows();

        await expect(assertSubmitAllowed({
            userId: fx.users.S.id, application: draft, auditContext: { actorRole: 'health', route: 'TEST' },
        })).rejects.toMatchObject({ status: 403, code: 'ENTITY_PERMISSION_DENIED' });

        expect(await failureRows()).toBe(before + 1);
        const row = await latestFailure();
        expect(row.actorId).toBe(fx.users.S.id);
        expect(metadataOf(row).onBehalfOfEntityId).toBe(fx.entities.C);
    });

    it('AC3: a MANAGER is refused by role default, and a SUBMIT_APPLICATION GRANT row allows it, naming the entity', async () => {
        await expect(assertSubmitAllowed({
            userId: fx.users.B.id, application: draft, auditContext: { actorRole: 'health' },
        })).rejects.toMatchObject({ status: 403, code: 'ENTITY_PERMISSION_DENIED' });

        await fileGrant('B', 'GRANT');

        await expect(assertSubmitAllowed({
            userId: fx.users.B.id, application: draft, auditContext: { actorRole: 'health' },
        })).resolves.toEqual({ entityId: fx.entities.C });
    });

    it('AC2: a REVOKE row wins over the OWNER role default (fail closed), still audited', async () => {
        await expect(assertSubmitAllowed({
            userId: fx.users.O2.id, application: draft, auditContext: {},
        })).resolves.toEqual({ entityId: fx.entities.C });

        await fileGrant('O2', 'REVOKE');

        const before = await failureRows();
        await expect(assertSubmitAllowed({
            userId: fx.users.O2.id, application: draft, auditContext: {},
        })).rejects.toMatchObject({ status: 403, code: 'ENTITY_PERMISSION_DENIED' });
        expect(await failureRows()).toBe(before + 1);
    });

    it('AC2: an application naming no entity is 400 VALIDATION_ERROR, audited with a null holder', async () => {
        const before = await failureRows();

        await expect(assertSubmitAllowed({
            userId: fx.users.A.id, application: { ...draft, entityId: null }, auditContext: {},
        })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });

        expect(await failureRows()).toBe(before + 1);
        expect(metadataOf(await latestFailure()).onBehalfOfEntityId).toBeNull();
    });
});
