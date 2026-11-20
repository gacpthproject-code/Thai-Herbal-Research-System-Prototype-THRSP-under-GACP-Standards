'use strict';

/**
 * ADR-014 Phase 3b-D1/D2 — work-inbox org-scoping.
 *
 * candidateGroup is a GLOBAL role code, so the work-queue list queries
 * (listMyTodo / listForGroup) must constrain to the caller's organizationId
 * UNCONDITIONALLY. The route builds the scope (organization, plus the caller's own
 * applications for an assigned role) and the service AND-s it into the query.
 *
 * Two invariants:
 *  1. scope supplied → it is AND-ed into the Prisma `where` unchanged.
 *  2. scope absent   → TypeError before any query. There is no unscoped inbox.
 *     listOverdue (the SLA cron) is the one reader that must NEVER be scoped.
 */

jest.mock('../../shared/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../shared/user-groups', () => ({
    getUserGroups: jest.fn(async () => ['document_reviewer']),
}));

const workActivityService = require('../../services/work-activity-service');

function makePrisma() {
    return { workActivity: { findMany: jest.fn(async () => []) } };
}
function lastWhere(prisma) {
    return prisma.workActivity.findMany.mock.calls[0][0].where;
}

describe('[Phase 3b-D1/D2] work-inbox org-scoping', () => {
    const SCOPE = { organizationId: 'org-1', application: { reviewerId: 'u-1' } };

    test('listMyTodo AND-s the caller scope into the query', async () => {
        const prisma = makePrisma();
        await workActivityService.listMyTodo({ prisma, userId: 'u-1', userRole: 'document_reviewer', scope: SCOPE });
        expect(lastWhere(prisma).AND).toEqual([SCOPE]);
    });

    test('listMyTodo without a scope throws TypeError and queries nothing', async () => {
        const prisma = makePrisma();
        await expect(
            workActivityService.listMyTodo({ prisma, userId: 'u-1', userRole: 'document_reviewer' }),
        ).rejects.toThrow(TypeError);
        expect(prisma.workActivity.findMany).not.toHaveBeenCalled();
    });

    test('listForGroup AND-s the caller scope into the query', async () => {
        const prisma = makePrisma();
        await workActivityService.listForGroup({ prisma, role: 'document_reviewer', scope: SCOPE });
        expect(lastWhere(prisma).AND).toEqual([SCOPE]);
        expect(lastWhere(prisma).candidateGroup).toBe('document_reviewer');
    });

    test('listForGroup without a scope throws TypeError and queries nothing', async () => {
        const prisma = makePrisma();
        await expect(
            workActivityService.listForGroup({ prisma, role: 'document_reviewer' }),
        ).rejects.toThrow(TypeError);
        expect(prisma.workActivity.findMany).not.toHaveBeenCalled();
    });

    test('listOverdue (SLA cron) is NEVER org-scoped — must see all tenants', async () => {
        const prisma = makePrisma();
        await workActivityService.listOverdue({ prisma });
        expect(lastWhere(prisma).organizationId).toBeUndefined();
    });
});
