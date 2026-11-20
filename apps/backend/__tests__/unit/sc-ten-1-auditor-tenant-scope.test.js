/**
 * X3-FIX-D / SC-TEN-1 (2026-05-18) — tenant-scope regression guard for
 * the SCHEDULER auditor-assignment path.
 *
 * Pre-X3 the assignment path in
 *   apps/backend/services/audit-scheduling-service.js:412
 * looked up the chosen auditor with `prisma.user.findFirst({ where: { id,
 * isActive: true, isDeleted: false } })` — NO `organizationId` predicate.
 * A SCHEDULER in tenant T1 could therefore assign tenant T2's auditor to
 * tenant T1's application; the audit-log would record the actor's
 * organizationId correctly but the assignment itself crossed tenants.
 *
 * The sister reassign path (`audits-reassign.js:97-105`) already scoped
 * BOTH lookups via `req.user?.organizationId`; X3-FIX-D copies that
 * pattern. The fix passes `effectiveActor.organizationId` from the
 * service caller down into the auditor `findFirst` predicate. When the
 * actor has no organizationId (legacy/system caller) the lookup falls
 * back to the global filter so historical valid assignments still work.
 *
 * Anchor assertions:
 *   - POSITIVE: SCHEDULER from tenant T1 assigning tenant T1 auditor →
 *     200 success path (proves we didn't break the happy path)
 *   - NEGATIVE: SCHEDULER from tenant T1 attempting to assign tenant T2
 *     auditor → STAFF_NOT_ASSIGNABLE (422). The inspector is looked up in the
 *     application's organization, so the other tenant's row is never found.
 *   - NO ORGANIZATION: an actor with no organizationId is refused
 *     (NO_ORGANIZATION). Order 17 (operator 2026-10-06): unknown organization
 *     = deny; the old global fallback is gone.
 */

'use strict';
const { paidCheckoutOrders } = require('../../test-support/paid-checkout-orders-stub');

const path = require('path');

function makeApplicationStore(seed = []) {
    const map = new Map();
    seed.forEach((row) => map.set(row.id, { ...row }));
    return map;
}

function makeUserStore(seed = []) {
    const map = new Map();
    seed.forEach((row) => map.set(row.id, { ...row }));
    return map;
}

function makeAuditChecklistStore(seed = []) {
    const map = new Map();
    seed.forEach((row) => map.set(row.id, { ...row }));
    return map;
}

function createPrismaMock({ applications = [], users = [] } = {}) {
    const appStore = makeApplicationStore(applications);
    const userStore = makeUserStore(users);
    // cert-integrity follow-up (onsite evidence, 2026-08-17,
    // audit-scheduling-service.js:576-593): an ONSITE assignment now creates
    // an AuditChecklist row inside the same transaction so the onsite
    // evidence gate has something to count photos/checklist items against.
    // Every test here goes down the default ONSITE path, so the mock needs
    // this delegate or the transaction throws before it ever reaches the
    // tenant-scope assertions this file exists to pin.
    const auditChecklistStore = makeAuditChecklistStore();

    const prisma = {
        ...paidCheckoutOrders(),
        application: {
            findFirst: jest.fn(async ({ where }) => {
                const ids = where.OR ? where.OR.map((c) => c.id || c.applicationNumber) : [where.id];
                for (const row of appStore.values()) {
                    if (where.isDeleted === false && row.isDeleted) {continue;}
                    if (ids.includes(row.id) || ids.includes(row.applicationNumber)) {return { ...row };}
                }
                return null;
            }),
            // armOnsiteEvidence reads the application's formData through this to
            // re-point the evidence pin (formData.onsiteAuditId) at the audit it
            // just armed — see services/audit/arm-onsite-evidence.js.
            findUnique: jest.fn(async ({ where: { id } }) => {
                const row = appStore.get(id);
                return row ? { ...row } : null;
            }),
            findMany: jest.fn(async ({ where }) => {
                return Array.from(appStore.values()).filter((row) => {
                    if (where.isDeleted === false && row.isDeleted) {return false;}
                    if (where.auditorId && row.auditorId !== where.auditorId) {return false;}
                    if (where.scheduledDate?.gte && row.scheduledDate < where.scheduledDate.gte) {return false;}
                    if (where.scheduledDate?.lte && row.scheduledDate > where.scheduledDate.lte) {return false;}
                    if (where.status?.notIn && where.status.notIn.includes(row.status)) {return false;}
                    if (where.status && typeof where.status === 'string' && row.status !== where.status) {return false;}
                    if (where.id?.not && row.id === where.id.not) {return false;}
                    if (where.organizationId && row.organizationId !== where.organizationId) {return false;}
                    return true;
                }).map((row) => ({ ...row }));
            }),
            update: jest.fn(async ({ where: { id }, data }) => {
                const existing = appStore.get(id);
                if (!existing) {throw new Error(`application ${id} not found`);}
                const updated = { ...existing, ...data, updatedAt: new Date() };
                if (data.formData) {updated.formData = data.formData;}
                appStore.set(id, updated);
                return { ...updated };
            }),
            // The inspector's workload (services/assignment-policy.js): none booked in the window.
            count: jest.fn(async () => 0),
        },
        user: {
            findFirst: jest.fn(async ({ where }) => {
                for (const row of userStore.values()) {
                    if (where.id && row.id !== where.id) {continue;}
                    if (where.healthId && row.healthId !== where.healthId) {continue;}
                    if (where.isActive === true && row.isActive === false) {continue;}
                    if (where.isDeleted === false && row.isDeleted) {continue;}
                    // X3-FIX-D / SC-TEN-1 — the new tenant-scope filter.
                    if (where.organizationId && row.organizationId !== where.organizationId) {continue;}
                    return { ...row };
                }
                return null;
            }),
        },
        auditChecklist: {
            findFirst: jest.fn(async ({ where }) => {
                for (const row of auditChecklistStore.values()) {
                    if (where.applicationId && row.applicationId !== where.applicationId) {continue;}
                    if (where.isDeleted === false && row.isDeleted) {continue;}
                    if (where.status && row.status !== where.status) {continue;}
                    return { ...row };
                }
                return null;
            }),
            create: jest.fn(async ({ data }) => {
                const id = `audit-checklist-${auditChecklistStore.size + 1}`;
                const row = { id, isDeleted: false, ...data };
                auditChecklistStore.set(id, row);
                return { ...row };
            }),
        },
        // the booking's transaction-local lock timeout
        $queryRaw: jest.fn(async () => []),
        // the officer's workload lock
        $executeRaw: jest.fn(async () => 0),
        $transaction: jest.fn(async (cbOrArr) => {
            if (typeof cbOrArr === 'function') {return cbOrArr(prisma);}
            return Promise.all(cbOrArr);
        }),
    };
    return { prisma, appStore, userStore, auditChecklistStore };
}

function makeFanoutMock() {
    return {
        send: jest.fn(async ({ userId, type, payload }) => ({
            dedupeKey: 'fake', deduped: false,
            inApp: { ok: true }, email: { ok: true }, sms: { ok: true },
            _called: { userId, type, payload },
        })),
    };
}

const SERVICE_PATH = path.resolve(__dirname, '../../services/audit-scheduling-service.js');

function loadService({ prisma, fanoutMock }) {
    jest.resetModules();
    jest.doMock('../../services/prisma-database', () => ({ prisma }));
    jest.doMock('../../services/notification-fanout-service', () => fanoutMock);
    jest.doMock('../../middleware/audit-logger', () => ({
        auditLogger: { log: jest.fn().mockResolvedValue(null) },
        AuditCategory: { APPLICATION: 'APPLICATION' },
        AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
        ResourceType: { APPLICATION: 'APPLICATION' },
    }));
    // The zone helpers stay real: the service reads the Bangkok day through them.
    jest.doMock('../../utils/working-days', () => ({
        ...jest.requireActual('../../utils/working-days'),
        isWorkingDay: (date) => {
            const day = (date instanceof Date ? date : new Date(date)).getDay();
            return day !== 0 && day !== 6;
        },
        countWorkingDaysBetween: () => 1,
    }));
    return require(SERVICE_PATH);
}

const ACTOR_SCHED_T1 = {
    id: 'sched-T1',
    canonicalRole: 'dispatcher',
    role: 'dispatcher',
    organizationId: 'tenant-T1',
};

const ACTOR_SCHED_NO_ORG = {
    id: 'sched-legacy',
    canonicalRole: 'dispatcher',
    role: 'dispatcher',
    // No organizationId — legacy / system actor path
};

const AUDITOR_T1 = {
    id: 'auditor-T1',
    role: 'field_inspector',
    canonicalRole: 'field_inspector',
    firstName: 'หนึ่ง',
    lastName: 'T1',
    email: 'a1@t1.example',
    isActive: true,
    isDeleted: false,
    organizationId: 'tenant-T1',
};

const AUDITOR_T2 = {
    id: 'auditor-T2',
    role: 'field_inspector',
    canonicalRole: 'field_inspector',
    firstName: 'สอง',
    lastName: 'T2',
    email: 'a2@t2.example',
    isActive: true,
    isDeleted: false,
    organizationId: 'tenant-T2',
};

const APPLICANT_T1 = {
    id: 'health-T1',
    healthId: 'health-T1',
    role: 'health',
    canonicalRole: 'health',
    firstName: 'ผู้สมัคร',
    lastName: 'T1',
    isActive: true,
    isDeleted: false,
    organizationId: 'tenant-T1',
};

function makeApplicationT1(overrides = {}) {
    return {
        id: 'app-T1-1',
        applicationNumber: 'APP-T1-00001',
        status: 'AUDIT_FEE_PAID',
        organizationId: 'tenant-T1',
        healthId: 'health-T1',
        auditorId: null,
        scheduledDate: null,
        phase2Status: 'PAID',
        formData: { workflowState: 'AUDIT_FEE_PAID' },
        workflowHistory: [],
        isDeleted: false,
        createdAt: new Date('2026-05-01T00:00:00Z'),
        updatedAt: new Date('2026-05-10T00:00:00Z'),
        ...overrides,
    };
}

function nextWorkingDayAt(hour = 10) {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    while (d.getDay() === 0 || d.getDay() === 6) {d.setDate(d.getDate() + 1);}
    d.setHours(hour, 0, 0, 0);
    return d;
}

describe('[X3-FIX-D / SC-TEN-1] assignAuditor — tenant-scope auditor lookup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('POSITIVE: SCHEDULER from tenant T1 assigning tenant T1 auditor → success (200 path)', async () => {
        const app = makeApplicationT1();
        const { prisma, appStore } = createPrismaMock({
            applications: [app],
            users: [AUDITOR_T1, AUDITOR_T2, APPLICANT_T1],
        });
        const svc = loadService({ prisma, fanoutMock: makeFanoutMock() });

        const result = await svc.assignAuditor({
            applicationId: 'app-T1-1',
            auditorId: 'auditor-T1',
            scheduledDate: nextWorkingDayAt(10).toISOString(),
            location: 'ไร่ตัวอย่าง T1',
            actor: ACTOR_SCHED_T1,
        });

        expect(result.workflowState).toBe('AUDIT_CONFIRMED');
        expect(result.auditor.id).toBe('auditor-T1');
        const stored = appStore.get('app-T1-1');
        expect(stored.auditorId).toBe('auditor-T1');
    });

    test('NEGATIVE: SCHEDULER from tenant T1 attempting to assign tenant T2 auditor → STAFF_NOT_ASSIGNABLE (422)', async () => {
        const app = makeApplicationT1();
        const { prisma } = createPrismaMock({
            applications: [app],
            // Both tenants' auditors exist in the DB — SC-TEN-1 fix must
            // hide the cross-tenant one based on the actor's org filter.
            users: [AUDITOR_T1, AUDITOR_T2, APPLICANT_T1],
        });
        const svc = loadService({ prisma, fanoutMock: makeFanoutMock() });

        await expect(svc.assignAuditor({
            applicationId: 'app-T1-1',
            auditorId: 'auditor-T2', // <-- cross-tenant attempt
            scheduledDate: nextWorkingDayAt(10).toISOString(),
            actor: ACTOR_SCHED_T1,
        })).rejects.toMatchObject({
            code: 'STAFF_NOT_ASSIGNABLE',
            statusCode: 422,
        });

        // Confirm the user.findFirst was called with the tenant filter
        // (proves the SC-TEN-1 narrowing took effect — defensive check).
        const callsWithOrg = prisma.user.findFirst.mock.calls.filter(
            ([{ where }]) => where && where.organizationId === 'tenant-T1',
        );
        expect(callsWithOrg.length).toBeGreaterThan(0);
    });

    test('NO ORGANIZATION: actor without organizationId is refused, nothing is written', async () => {
        const app = makeApplicationT1();
        const { prisma, appStore } = createPrismaMock({
            applications: [app],
            users: [AUDITOR_T1, APPLICANT_T1],
        });
        const svc = loadService({ prisma, fanoutMock: makeFanoutMock() });

        await expect(svc.assignAuditor({
            applicationId: 'app-T1-1',
            auditorId: 'auditor-T1',
            scheduledDate: nextWorkingDayAt(10).toISOString(),
            actor: ACTOR_SCHED_NO_ORG,
        })).rejects.toMatchObject({ code: 'NO_ORGANIZATION', statusCode: 400 });
        expect(appStore.get('app-T1-1').auditorId).toBeFalsy();
    });
});
