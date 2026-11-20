/**
 * CERTIFIED notification dispatch — end-to-end side-effect contract.
 *
 * Anchors the Tier 14 fix (batches 9-12) that ties the workflow-side-effects
 * helper (`sendTransitionNotifications` for `nextState === 'CERTIFIED'`) to
 * the canonical status writer (`writeApplicationStatus`).
 *
 * The contract asserted here:
 *
 *   `writeApplicationStatus` invokes the caller's `onAudit` callback with
 *      `event: 'APPLICATION_STATUS_TRANSITION'` and `toStatus: 'CERTIFIED'`.
 *      Without this event field, downstream audit routing breaks silently.
 *
 * Who receives the CERTIFIED notice (applicant and holder) is asserted on real
 * Postgres in applicant-notices-reach-the-holder-real-postgres.test.js.
 *
 * Mocks: prisma, tenant-context, logger. No I/O.
 */

'use strict';

jest.mock('../../shared/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    stream: { write: jest.fn() },
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// Prefix mock-vars with `mock` so jest.mock() hoisting accepts the closure.
const mockNotificationCreate = jest.fn().mockResolvedValue({ id: 'notif-1' });
const mockUserFindUnique = jest.fn().mockResolvedValue({ organizationId: 'org-1' });

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        ...require('../../test-support/paid-checkout-orders-stub').paidCheckoutOrders(),
        application: {
            update: jest.fn(),
            findUnique: jest.fn(),
        },
        user: {
            findUnique: mockUserFindUnique,
            findMany: jest.fn(),
        },
        notification: {
            create: mockNotificationCreate,
            createMany: jest.fn(),
        },
    },
}));

jest.mock('../../services/tenant-context', () => ({
    getTenantContext: jest.fn(() => ({ organizationId: 'org-1' })),
    withoutTenantScope: (fn) => fn(),
}));

// admin-application-service is required by workflow-side-effects but no
// branch we hit needs it. Stub all its functions to no-op.
jest.mock('../../services/admin-application-service', () => ({
    findRevisionDeadlineByApplicationId: jest.fn().mockResolvedValue(null),
    upsertRevisionDeadline: jest.fn().mockResolvedValue(null),
    bulkUpdateRevisionDeadlineStatus: jest.fn().mockResolvedValue(null),
}));

// field-encryption is required for the maskThaiId import (top of side-effects).
jest.mock('../../utils/field-encryption', () => ({
    maskThaiId: (v) => v || null,
}));

const { writeApplicationStatus } = require('../../services/application-status-writer');

beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationCreate.mockResolvedValue({ id: 'notif-1' });
    mockUserFindUnique.mockResolvedValue({ organizationId: 'org-1' });
});

describe('writeApplicationStatus — CERTIFIED transition onAudit envelope', () => {
    test('invokes onAudit with APPLICATION_STATUS_TRANSITION event and toStatus=CERTIFIED', async () => {
        const onAudit = jest.fn().mockResolvedValue(null);
        // Mock prisma with only application.update — workActivity is omitted
        // so the writer's best-effort activity emission is skipped (terminal
        // status path requires workActivity.updateMany, which we don't need
        // to assert here).
        const stubPrisma = {
            ...require('../../test-support/paid-checkout-orders-stub').paidCheckoutOrders(),
            application: {
                update: jest.fn().mockResolvedValue({
                    id: 'app-1',
                    status: 'CERTIFIED',
                    organizationId: 'org-1',
                }),
            },
        };

        await writeApplicationStatus({
            prisma: stubPrisma,
            applicationId: 'app-1',
            fromStatus: 'CERTIFICATE_ISSUED',
            toStatus: 'CERTIFIED',
            actorId: 'admin-1',
            actorRole: 'certificate_approver',
            reason: 'CERTIFICATE_ISSUED',
            onAudit,
        });

        expect(onAudit).toHaveBeenCalledTimes(1);
        const auditEntry = onAudit.mock.calls[0][0];
        expect(auditEntry.event).toBe('APPLICATION_STATUS_TRANSITION');
        expect(auditEntry.toStatus).toBe('CERTIFIED');
        expect(auditEntry.fromStatus).toBe('CERTIFICATE_ISSUED');
        expect(auditEntry.applicationId).toBe('app-1');
        expect(auditEntry.actorId).toBe('admin-1');
        expect(auditEntry.actorRole).toBe('certificate_approver');
        expect(auditEntry.reason).toBe('CERTIFICATE_ISSUED');
        // timestamp is set by the writer, not the caller.
        expect(auditEntry.timestamp).toBeInstanceOf(Date);
    });

    test('cancels open work-activities on CERTIFIED (terminal status)', async () => {
        const onAudit = jest.fn();
        const workActivityUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
        const workActivityCreate = jest.fn().mockResolvedValue(null);
        const stubPrisma = {
            ...require('../../test-support/paid-checkout-orders-stub').paidCheckoutOrders(),
            application: {
                update: jest.fn().mockResolvedValue({
                    id: 'app-1',
                    status: 'CERTIFIED',
                    organizationId: 'org-1',
                }),
            },
            workActivity: {
                updateMany: workActivityUpdateMany,
                create: workActivityCreate,
            },
        };

        await writeApplicationStatus({
            prisma: stubPrisma,
            applicationId: 'app-1',
            fromStatus: 'CERTIFICATE_ISSUED',
            toStatus: 'CERTIFIED',
            actorId: 'approver-1',
            actorRole: 'certificate_approver',
            onAudit,
        });

        expect(workActivityUpdateMany).toHaveBeenCalledTimes(1);
        const cancelArgs = workActivityUpdateMany.mock.calls[0][0];
        expect(cancelArgs.where.applicationId).toBe('app-1');
        expect(cancelArgs.where.state.in).toEqual(
            expect.arrayContaining(['TODO', 'CLAIMED', 'IN_PROGRESS']),
        );
        expect(cancelArgs.data.state).toBe('CANCELLED');
        expect(cancelArgs.data.cancelReason).toContain('CERTIFIED');
    });

    test('does not throw when onAudit callback rejects (best-effort emission)', async () => {
        const onAudit = jest.fn().mockRejectedValue(new Error('downstream audit-log unavailable'));
        const stubPrisma = {
            ...require('../../test-support/paid-checkout-orders-stub').paidCheckoutOrders(),
            application: {
                update: jest.fn().mockResolvedValue({
                    id: 'app-1',
                    status: 'CERTIFIED',
                    organizationId: 'org-1',
                }),
            },
        };

        const result = await writeApplicationStatus({
            prisma: stubPrisma,
            applicationId: 'app-1',
            fromStatus: 'CERTIFICATE_ISSUED',
            toStatus: 'CERTIFIED',
            actorId: 'approver-1',
            actorRole: 'certificate_approver',
            onAudit,
        });

        // Status write still succeeds — audit failure must NEVER block the
        // application from reaching CERTIFIED.
        expect(result).toEqual(expect.objectContaining({ id: 'app-1', status: 'CERTIFIED' }));
        expect(onAudit).toHaveBeenCalledTimes(1);
    });
});
