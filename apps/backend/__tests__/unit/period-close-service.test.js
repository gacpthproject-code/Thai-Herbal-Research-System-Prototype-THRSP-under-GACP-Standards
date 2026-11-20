/**
 * Tests for period-close-service (Iter 24, 2026-05-16).
 *
 * Anchors:
 *   - closePeriod: validates future month rejected
 *   - closePeriod: validates pending-invoice present → error
 *   - closePeriod: creates PeriodClose row + audit log
 *   - reopenPeriod: ADMIN-only + reason required
 *   - reopenPeriod: closer cannot reopen (separation of duties)
 *   - isPeriodClosed: returns true for CLOSED + false for REOPENED/OPEN
 *   - getPeriodCloseStatus: returns array
 */

'use strict';

const createPrismaMock = () => {
    const store = new Map();
    let counter = 0;

    const periodCloseModel = {
        create: jest.fn(async ({ data }) => {
            counter += 1;
            const row = {
                id: `pc-${counter}`,
                ...data,
                closedAt: data.closedAt || new Date(),
                reopenedAt: null,
                reopenedBy: null,
                reopenReason: null,
            };
            store.set(row.id, row);
            return row;
        }),
        findFirst: jest.fn(async ({ where }) => {
            const rows = Array.from(store.values()).filter((row) => {
                if (where.organizationId && row.organizationId !== where.organizationId) {return false;}
                if (where.year !== undefined && row.year !== where.year) {return false;}
                if (where.month !== undefined && row.month !== where.month) {return false;}
                if (where.status && row.status !== where.status) {return false;}
                return true;
            });
            return rows[0] || null;
        }),
        findUnique: jest.fn(async ({ where: { id } }) => store.get(id) || null),
        findMany: jest.fn(async ({ where = {} } = {}) => {
            return Array.from(store.values()).filter((row) => {
                if (where.organizationId && row.organizationId !== where.organizationId) {return false;}
                if (where.year && typeof where.year === 'object') {
                    if (where.year.gte && row.year < where.year.gte) {return false;}
                    if (where.year.lte && row.year > where.year.lte) {return false;}
                }
                return true;
            });
        }),
        update: jest.fn(async ({ where: { id }, data }) => {
            const existing = store.get(id);
            if (!existing) {throw new Error('not found');}
            const updated = { ...existing, ...data };
            store.set(id, updated);
            return updated;
        }),
        // Conditional write: applies only while the row is still in `where.status`.
        updateMany: jest.fn(async ({ where: { id, status }, data }) => {
            const existing = store.get(id);
            if (!existing || existing.status !== status) {return { count: 0 };}
            store.set(id, { ...existing, ...data });
            return { count: 1 };
        }),
    };

    const prisma = {
        periodClose: periodCloseModel,
        $transaction: jest.fn(async (cb) => cb({ periodClose: periodCloseModel, $executeRaw: jest.fn() })),
    };
    return { prisma, store };
};

/** A company finance officer of org-1: the only role that closes and reopens a month. */
const officer = (id) => ({ id, role: 'finance_officer_platform', canonicalRole: 'finance_officer_platform', organizationId: 'org-1' });

function loadServiceWithMocks({ prismaObj, vatStub, auditStub }) {
    jest.doMock('../../services/prisma-database', () => ({ prisma: prismaObj.prisma }));
    jest.doMock('../../services/vat-report-service', () => vatStub);
    jest.doMock('../../middleware/audit-logger', () => auditStub);
    return require('../../services/period-close-service');
}

const makeVatStub = (closable = true, openInvoices = 0) => ({
    checkPeriodClosable: jest.fn(async () => ({
        closable,
        openInvoices,
        lastPaidInvoiceDate: null,
        warnings: closable ? [] : [`${openInvoices} pending invoices`],
    })),
});

const makeAuditStub = () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(null) },
    AuditCategory: { PAYMENT: 'PAYMENT', SYSTEM: 'SYSTEM' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { SYSTEM: 'SYSTEM' },
});

// We use 2026-05-16 as "today" (per the iteration brief). Picking a
// last-elapsed month: April 2026 (m=4) → fully past. Picking the current
// month: May 2026 (m=5) → not yet elapsed (rejected by FUTURE_PERIOD).
const TODAY = new Date('2026-05-16T00:00:00Z');

describe('[Iter 24] period-close-service', () => {
    beforeAll(() => {
        // Freeze "now" so isMonthFullyElapsed is deterministic. Modern
        // fake timers replace `new Date()` with the simulated time;
        // `Date.UTC(...)` and `new Date(arg)` still work normally.
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(TODAY);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        // Re-pin the simulated clock every test. `resetModules()` +
        // `clearAllMocks()` can drop the @sinonjs fake-timer system time set in
        // beforeAll, so a later test's default `new Date()` silently falls back
        // to the real wall-clock. That made `closePeriod({ month: 5 })` flip
        // from FUTURE_PERIOD (correct under frozen May 16 2026) to a successful
        // close once the real date crossed June 1 — a date-dependent flake, not
        // a product bug. Re-freezing here keeps every test deterministic.
        jest.setSystemTime(TODAY);
    });

    describe('_internals.isMonthFullyElapsed', () => {
        test('returns true for April 2026 when now is May 16 2026', () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            expect(service._internals.isMonthFullyElapsed(2026, 4, TODAY)).toBe(true);
        });

        test('returns false for May 2026 (current month)', () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            expect(service._internals.isMonthFullyElapsed(2026, 5, TODAY)).toBe(false);
        });

        test('returns false for June 2026 (future month)', () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            expect(service._internals.isMonthFullyElapsed(2026, 6, TODAY)).toBe(false);
        });
    });

    describe('closePeriod', () => {
        test('rejects future month with FUTURE_PERIOD', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            try {
                await service.closePeriod({
                    year: 2026, month: 6,
                    actor: officer('user-closer'),
                });
                throw new Error('expected throw');
            } catch (err) {
                expect(err.code).toBe('FUTURE_PERIOD');
            }
        });

        test('rejects current (not-yet-elapsed) month', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            try {
                await service.closePeriod({
                    year: 2026, month: 5,
                    actor: officer('user-closer'),
                });
                throw new Error('expected throw');
            } catch (err) {
                expect(err.code).toBe('FUTURE_PERIOD');
            }
        });

        test('rejects when pending invoices exist in period', async () => {
            const prismaObj = createPrismaMock();
            const vatStub = makeVatStub(false, 3);
            const service = loadServiceWithMocks({
                prismaObj, vatStub, auditStub: makeAuditStub(),
            });
            try {
                await service.closePeriod({
                    year: 2026, month: 4,
                    actor: officer('user-closer'),
                });
                throw new Error('expected throw');
            } catch (err) {
                expect(err.code).toBe('PENDING_INVOICES_IN_PERIOD');
                expect(err.openInvoices).toBe(3);
            }
            expect(vatStub.checkPeriodClosable).toHaveBeenCalledWith({
                year: 2026, month: 4, organizationId: 'org-1',
            });
        });

        test('creates a PeriodClose row with status=CLOSED and audit log', async () => {
            const prismaObj = createPrismaMock();
            const auditStub = makeAuditStub();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub,
            });

            const result = await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
                notes: 'May 1 close',
            });

            expect(result.id).toBeTruthy();
            expect(result.year).toBe(2026);
            expect(result.month).toBe(4);
            expect(result.status).toBe('CLOSED');

            // Persistence
            expect(prismaObj.prisma.periodClose.create).toHaveBeenCalledTimes(1);
            const createCall = prismaObj.prisma.periodClose.create.mock.calls[0][0];
            expect(createCall.data.status).toBe('CLOSED');
            expect(createCall.data.closedBy).toBe('user-closer');
            expect(createCall.data.organizationId).toBe('org-1');

            // Audit log fired
            expect(auditStub.auditLogger.log).toHaveBeenCalledTimes(1);
            const auditCall = auditStub.auditLogger.log.mock.calls[0][0];
            expect(auditCall.action).toBe('PERIOD_CLOSED');
            expect(auditCall.actorId).toBe('user-closer');
        });

        // A journal writer holds this lock shared while it checks the month and writes; the close
        // takes it exclusive, so it waits for every writer that found the month open.
        test('takes the month\'s lock exclusive, in its transaction, before it reads or writes the close row', async () => {
            const { NAMESPACES } = jest.requireActual('../../services/finance/books-locks');
            const prismaObj = createPrismaMock();
            const steps = [];
            const { periodClose } = prismaObj.prisma;
            const tx = {
                periodClose: {
                    ...periodClose,
                    findFirst: jest.fn(async (args) => { steps.push('read close row'); return periodClose.findFirst(args); }),
                    create: jest.fn(async (args) => { steps.push('write close row'); return periodClose.create(args); }),
                },
                $executeRaw: jest.fn(async (sql, namespace, key) => {
                    steps.push({ lock: /_shared\(/.test(sql.join('')) ? 'shared' : 'exclusive', namespace, key });
                    return 0;
                }),
            };
            prismaObj.prisma.$transaction = jest.fn(async (cb) => cb(tx));
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });

            await service.closePeriod({ year: 2026, month: 4, actor: officer('user-closer') });

            expect(steps).toEqual([
                { lock: 'exclusive', namespace: NAMESPACES.ACCOUNTING_PERIOD, key: 'org-1:2026-4' },
                'read close row',
                'write close row',
            ]);
        });

        test('rejects ALREADY_CLOSED when a CLOSED row exists', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            // First close
            await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });
            // Second close on the same period — must fail
            try {
                await service.closePeriod({
                    year: 2026, month: 4,
                    actor: officer('user-closer'),
                });
                throw new Error('expected throw');
            } catch (err) {
                expect(err.code).toBe('ALREADY_CLOSED');
            }
        });

        // Fail closed (security review 2026-10-09): a month is closed only when the pending-
        // invoice check answered. The closer passes both argument forms so the refusal is the
        // only difference measured.
        const CLOSER_ARGS = {
            year: 2026, month: 4, organizationId: 'org-1', actorId: 'user-closer',
            actor: { id: 'user-closer', role: 'finance_officer_platform', organizationId: 'org-1' },
        };

        test('refuses, and closes nothing, when the pending-invoice check fails', async () => {
            const prismaObj = createPrismaMock();
            const vatStub = { checkPeriodClosable: jest.fn(async () => { throw new Error('connection reset'); }) };
            const service = loadServiceWithMocks({ prismaObj, vatStub, auditStub: makeAuditStub() });

            await expect(service.closePeriod(CLOSER_ARGS))
                .rejects.toMatchObject({ code: 'PERIOD_CHECK_UNAVAILABLE', statusCode: 503 });
            expect(prismaObj.prisma.periodClose.create).not.toHaveBeenCalled();
        });

        test('refuses, and closes nothing, when the pending-invoice check cannot load', async () => {
            const prismaObj = createPrismaMock();
            jest.doMock('../../services/prisma-database', () => ({ prisma: prismaObj.prisma }));
            jest.doMock('../../services/vat-report-service', () => { throw new Error('vat-report-service failed to load'); });
            jest.doMock('../../middleware/audit-logger', () => makeAuditStub());
            const service = require('../../services/period-close-service');

            await expect(service.closePeriod(CLOSER_ARGS))
                .rejects.toMatchObject({ code: 'PERIOD_CHECK_UNAVAILABLE', statusCode: 503 });
            expect(prismaObj.prisma.periodClose.create).not.toHaveBeenCalled();
        });

        // The real checker, not a stub of it: only the database under it fails.
        test('refuses, and closes nothing, when the pending-invoice count itself fails', async () => {
            const prismaObj = createPrismaMock();
            prismaObj.prisma.invoice = {
                count: jest.fn().mockRejectedValue(new Error('connection reset during count')),
                findFirst: jest.fn().mockResolvedValue(null),
            };
            prismaObj.prisma.journalLine = { findMany: jest.fn().mockResolvedValue([]) };
            jest.doMock('../../services/prisma-database', () => ({ prisma: prismaObj.prisma }));
            jest.dontMock('../../services/vat-report-service');
            jest.doMock('../../middleware/audit-logger', () => makeAuditStub());
            const service = require('../../services/period-close-service');

            await expect(service.closePeriod(CLOSER_ARGS))
                .rejects.toMatchObject({ code: 'PERIOD_CHECK_UNAVAILABLE', statusCode: 503 });
            expect(prismaObj.prisma.invoice.count).toHaveBeenCalled();
            expect(prismaObj.prisma.$transaction).not.toHaveBeenCalled();
            expect(prismaObj.store.size).toBe(0);
        });

        test('refuses a caller who may not write the books, has no organization or no id', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            await expect(service.closePeriod({
                year: 2026, month: 4, actor: { id: 'u1', role: 'finance_officer_dtam', organizationId: 'org-1' },
            })).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE', statusCode: 403 });
            await expect(service.closePeriod({
                year: 2026, month: 4, actor: { id: 'u1', role: 'finance_officer_platform', organizationId: null },
            })).rejects.toMatchObject({ code: 'FORBIDDEN_TENANT', statusCode: 403 });
            await expect(service.closePeriod({
                year: 2026, month: 4, actor: { role: 'finance_officer_platform', organizationId: 'org-1' },
            })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
            expect(prismaObj.prisma.periodClose.create).not.toHaveBeenCalled();
        });
    });

    describe('reopenPeriod — separation of duties', () => {
        test('flips CLOSED → REOPENED when reopener != closer + records reason', async () => {
            const prismaObj = createPrismaMock();
            const auditStub = makeAuditStub();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub,
            });

            const closed = await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });

            const reopened = await service.reopenPeriod(closed.id, {
                reason: 'Audit finding requires reopen',
                actor: officer('user-admin-different'),
            });
            expect(reopened.status).toBe('REOPENED');
            expect(reopened.reopenedBy).toBe('user-admin-different');
            expect(reopened.reopenReason).toBe('Audit finding requires reopen');
            expect(reopened.reopenedAt).toBeInstanceOf(Date);

            // Audit log fired with WARNING severity
            const auditCalls = auditStub.auditLogger.log.mock.calls;
            const reopenedAudit = auditCalls.find((c) => c[0].action === 'PERIOD_REOPENED');
            expect(reopenedAudit).toBeTruthy();
            expect(reopenedAudit[0].severity).toBe('WARNING');
        });

        test('REJECTS SELF_REOPEN_FORBIDDEN when reopener === closer', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });

            const closed = await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });
            try {
                await service.reopenPeriod(closed.id, {
                    reason: 'Self-reopen attempt',
                    actor: officer('user-closer'),
                });
                throw new Error('expected throw');
            } catch (err) {
                expect(err.code).toBe('SELF_REOPEN_FORBIDDEN');
            }
        });

        test('rejects when reason is missing or < 10 chars', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            const closed = await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });
            await expect(service.reopenPeriod(closed.id, {
                reason: 'short',
                actor: officer('user-admin'),
            })).rejects.toThrow(/at least 10 characters/);
            await expect(service.reopenPeriod(closed.id, {
                actor: officer('user-admin'),
            })).rejects.toThrow(/reason is required/);
        });

        test('rejects reopen from REOPENED status (INVALID_STATE)', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            const closed = await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });
            await service.reopenPeriod(closed.id, {
                reason: 'first reopen reason',
                actor: officer('user-admin'),
            });
            try {
                await service.reopenPeriod(closed.id, {
                    reason: 'second reopen attempt',
                    actor: officer('user-admin-2'),
                });
                throw new Error('expected throw');
            } catch (err) {
                expect(err.code).toBe('INVALID_STATE');
            }
        });

        test('rejects when PeriodClose not found', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            try {
                await service.reopenPeriod('does-not-exist', {
                    reason: 'reopen not found row',
                    actor: officer('u-admin'),
                });
                throw new Error('expected throw');
            } catch (err) {
                expect(err.code).toBe('NOT_FOUND');
            }
        });
    });

    describe('isPeriodClosed', () => {
        test('returns true when a CLOSED row exists', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });
            const closed = await service.isPeriodClosed({
                year: 2026, month: 4, organizationId: 'org-1',
            });
            expect(closed).toBe(true);
        });

        test('returns false when row is REOPENED', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            const closed = await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });
            await service.reopenPeriod(closed.id, {
                reason: 'reopen for late posting',
                actor: officer('user-admin'),
            });
            const isClosed = await service.isPeriodClosed({
                year: 2026, month: 4, organizationId: 'org-1',
            });
            expect(isClosed).toBe(false);
        });

        test('returns false when no row exists (OPEN by default)', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            const isClosed = await service.isPeriodClosed({
                year: 2026, month: 3, organizationId: 'org-1',
            });
            expect(isClosed).toBe(false);
        });

        test('returns false for invalid inputs (defensive)', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            expect(await service.isPeriodClosed({ year: 'bogus', month: 4 })).toBe(false);
            expect(await service.isPeriodClosed({})).toBe(false);
        });

        // A writer's transaction, or the server's client, that cannot read close rows cannot say
        // the month is open: refused like a failed read (security review of a46baa286, L2).
        test('refuses PERIOD_CHECK_UNAVAILABLE, never "not closed", when the client has no period-close model', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            await expect(service.isPeriodClosed({
                year: 2026, month: 4, organizationId: 'org-1', client: { $executeRaw: jest.fn() },
            })).rejects.toMatchObject({ code: 'PERIOD_CHECK_UNAVAILABLE', statusCode: 503 });
        });

        test('refuses PERIOD_CHECK_UNAVAILABLE when there is no database client at all', async () => {
            const service = loadServiceWithMocks({
                prismaObj: { prisma: null }, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            await expect(service.isPeriodClosed({ year: 2026, month: 4, organizationId: 'org-1' }))
                .rejects.toMatchObject({ code: 'PERIOD_CHECK_UNAVAILABLE', statusCode: 503 });
        });
    });

    describe('getPeriodCloseStatus', () => {
        test('returns array of records for the org', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            await service.closePeriod({
                year: 2026, month: 3,
                actor: officer('user-closer'),
            });
            await service.closePeriod({
                year: 2026, month: 4,
                actor: officer('user-closer'),
            });

            const records = await service.getPeriodCloseStatus({
                organizationId: 'org-1',
                fromYear: 2026,
                toYear: 2026,
            });
            expect(Array.isArray(records)).toBe(true);
            expect(records.length).toBe(2);
        });

        test('returns empty array when no records exist', async () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            const records = await service.getPeriodCloseStatus({ organizationId: 'org-empty' });
            expect(records).toEqual([]);
        });
    });

    describe('STATUS + ACTIONS exports', () => {
        test('exposes STATUS state-machine', () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            expect(service.STATUS).toEqual({
                OPEN: 'OPEN',
                CLOSED: 'CLOSED',
                REOPENED: 'REOPENED',
            });
        });

        test('exposes ACTIONS for audit-logger', () => {
            const prismaObj = createPrismaMock();
            const service = loadServiceWithMocks({
                prismaObj, vatStub: makeVatStub(), auditStub: makeAuditStub(),
            });
            expect(service.ACTIONS.CLOSED).toBe('PERIOD_CLOSED');
            expect(service.ACTIONS.REOPENED).toBe('PERIOD_REOPENED');
        });
    });
});
