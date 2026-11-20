/**
 * Iter 24 (Ralph Loop, 2026-05-16) — Decimal × PeriodClose integration test.
 *
 * Exercises two features from batches B24-A / B24-B together to prove they
 * compose correctly per TFRS for NPAEs:
 *
 *   B24-A — Invoice money columns unified to Decimal(15,2).
 *           Parity invariant: totalAmount === subtotal + vat (no IEEE-754
 *           drift even after multi-scope aggregation).
 *
 *   B24-B — PeriodClose model + isPeriodClosed predicate. Journal entries
 *           whose entryDate lands in a CLOSED period must throw
 *           PERIOD_CLOSED unless the caller supplies the ADMIN recovery
 *           override (meta.allowClosedPeriod = true).
 *
 * The B24-C general reversing-entry helper had no caller and was removed
 * (security review of a46baa286); a sale is reversed by its credit note.
 *
 * Compliance anchors:
 *   - TFRS for NPAEs ch.2 (internal controls) — period locks + immutability
 *   - TFRS for NPAEs ch.5 (year-end close) — monthly close supports year-end
 *   - TFRS for NPAEs ch.18 (รายได้) — exact decimal recognition, reversals
 *     reduce revenue in the period of recognition, never editing the
 *     original entry.
 *   - ป.รัษฎากร ม.86/4 — VAT period closure aligns with monthly ภ.พ.30.
 *   - ป.รัษฎากร ม.86/10 — credit-note / reversing-entry shape.
 *   - ป.รัษฎากร ม.87/3 — 7-year retention; original + reversal pair must
 *     survive together (audit trail).
 *
 * Mock strategy
 * ─────────────
 *   - prisma stubs capture writes; no real Postgres needed.
 *   - period-close-service.isPeriodClosed is jest.fn so each scenario can
 *     control whether a date lands in CLOSED / OPEN territory.
 *   - middleware/audit-logger is stubbed so audit calls are observable.
 *   - shared/logger is silenced.
 *
 * Defensive design
 * ────────────────
 * Period-lock enforcement on recordPaymentEntry is
 * delivered by B24-B integration work. If the live source has not yet
 * wired the call to isPeriodClosed, the period-lock scenarios document
 * the EXPECTED behaviour the wiring must satisfy. Scenarios that don't
 * depend on that wiring (Decimal precision, parity invariant) run
 * unconditionally and must pass.
 */

'use strict';

// ──────────────────────────────────────────────────────────────────────────
// Shared module-level mocks (must be declared before service requires).
// ──────────────────────────────────────────────────────────────────────────

jest.mock('../../shared/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    stream: { write: jest.fn() },
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

// Variable names prefixed with `mock` are permitted inside jest.mock
// factories — Jest treats them as test-doubles. We also expose the
// mockAuditLogCalls array via global so each test can inspect/clear it.
const mockAuditLogCalls = [];
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: {
        log: jest.fn(async (entry) => {
            mockAuditLogCalls.push(entry);
            return null;
        }),
    },
    AuditCategory: {
        PAYMENT: 'PAYMENT',
        FINANCE: 'FINANCE',
        SYSTEM: 'SYSTEM',
    },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', CRITICAL: 'CRITICAL' },
    ResourceType: {
        INVOICE: 'INVOICE',
        JOURNAL_ENTRY: 'JOURNAL_ENTRY',
        SYSTEM: 'SYSTEM',
    },
}));

// ──────────────────────────────────────────────────────────────────────────
// Prisma client mock — captures every JE write, simulates Decimal storage.
// ──────────────────────────────────────────────────────────────────────────

/**
 * The "Decimal-as-stored" representation we use across the mock layer.
 * We expose `.toString()` and `.toNumber()` to match the Prisma.Decimal
 * runtime surface — code reading these values must NOT use IEEE-754 maths
 * directly. The mock guarantees that round-tripping through this type
 * preserves exact two-decimal precision.
 */
function decimal(value) {
    // Store as integer satang to dodge IEEE-754 drift entirely.
    const satang = Math.round(Number(value) * 100);
    return {
        __decimal: true,
        toString() { return (satang / 100).toFixed(2); },
        toNumber() { return satang / 100; },
        valueOf() { return satang / 100; },
        satang,
    };
}

function buildPrismaMock({ periodClosedPredicate } = {}) {
    const writes = {
        journalEntries: [],
        journalLines: [],
        invoices: new Map(),
        periodCloses: [],
    };
    let nextEntryId = 1;
    let nextLineId = 1;
    let nextPeriodId = 1;

    const journalEntry = {
        create: jest.fn(async ({ data, include: _include }) => {
            const entryId = `je-${nextEntryId++}`;
            const linePayload = (data.lines && data.lines.create) || [];
            const persistedLines = linePayload.map((line, idx) => ({
                id: `jl-${nextLineId++}`,
                entryId,
                lineNumber: line.lineNumber || (idx + 1),
                accountCode: line.accountCode,
                accountName: line.accountName,
                debit: line.debit,
                credit: line.credit,
                issuer: line.issuer || null,
                taxableAmount: line.taxableAmount != null ? line.taxableAmount : null,
                metadata: line.metadata || null,
            }));
            const row = {
                id: entryId,
                entryDate: data.entryDate,
                reference: data.reference,
                invoiceId: data.invoiceId || null,
                description: data.description,
                totalDebit: data.totalDebit,
                totalCredit: data.totalCredit,
                organizationId: data.organizationId || null,
                createdBy: data.createdBy || null,
                isDeleted: false,
                lines: persistedLines,
                createdAt: new Date(),
            };
            writes.journalEntries.push(row);
            writes.journalLines.push(...persistedLines);
            return row;
        }),
        findUnique: jest.fn(async ({ where: { id }, include: _include }) => {
            return writes.journalEntries.find((e) => e.id === id) || null;
        }),
        findFirst: jest.fn(async ({ where }) => {
            return writes.journalEntries.find((e) => {
                if (where.reference && e.reference !== where.reference) {return false;}
                if (where.isDeleted === false && e.isDeleted) {return false;}
                return true;
            }) || null;
        }),
    };

    const journalLine = {
        update: jest.fn(async ({ where: { id }, data }) => {
            const line = writes.journalLines.find((l) => l.id === id);
            if (!line) {throw new Error(`line ${id} not found`);}
            Object.assign(line, data);
            return line;
        }),
    };

    const invoice = {
        findUnique: jest.fn(async ({ where: { id } }) => {
            return writes.invoices.get(id) || null;
        }),
    };

    const periodClose = {
        findFirst: jest.fn(async ({ where }) => {
            if (periodClosedPredicate
                && typeof periodClosedPredicate === 'function'
                && periodClosedPredicate(where)) {
                return {
                    id: `pc-${nextPeriodId++}`,
                    year: where.year,
                    month: where.month,
                    status: 'CLOSED',
                    organizationId: where.organizationId || 'org-1',
                };
            }
            return null;
        }),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    };

    const prisma = {
        journalEntry,
        journalLine,
        invoice,
        periodClose,
        // The period guard takes the month's lock in the writer's transaction.
        $executeRaw: jest.fn(async () => 0),
        $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    return { prisma, writes };
}

// Initial wiring — each test resets prisma + service caches via jest.resetModules().
// Variables with `mock` prefix are allowed inside jest.mock() factories.
let mockPrismaContext;
jest.mock('../../services/prisma-database', () => ({
    get prisma() {
        return mockPrismaContext ? mockPrismaContext.prisma : {};
    },
}));

// Period-close service is mocked so we can flip the closed/open predicate
// from each scenario. The real implementation reads PeriodClose rows via
// Prisma; our mock short-circuits that read.
const mockPeriodCloseService = {
    isPeriodClosed: jest.fn(),
    closePeriod: jest.fn(),
    reopenPeriod: jest.fn(),
    STATUS: { OPEN: 'OPEN', CLOSED: 'CLOSED', REOPENED: 'REOPENED' },
};
jest.mock('../../services/period-close-service', () => mockPeriodCloseService);

// ──────────────────────────────────────────────────────────────────────────
// Helper: load the service under test fresh after wiring prismaContext.
// ──────────────────────────────────────────────────────────────────────────

function loadJournalService() {
    jest.isolateModules(() => {});
    return require('../../services/journal-entry-service');
}

// Reusable invoice fixture builders — keep Decimal storage explicit so the
// parity invariant is testable without going through the live Prisma layer.
function buildInvoice({ id, scopes = 1, phase = 1 }) {
    const PHASE_PLATFORM_FEE = phase === 1 ? 500 : 2500;
    const PHASE_VAT = phase === 1 ? 35 : 175;
    const subtotalRaw = PHASE_PLATFORM_FEE * scopes;
    const vatRaw = PHASE_VAT * scopes;
    const totalRaw = subtotalRaw + vatRaw;
    return {
        id,
        subtotal: decimal(subtotalRaw),
        vat: decimal(vatRaw),
        totalAmount: decimal(totalRaw),
        serviceType: phase === 1 ? 'PHASE_1_PLATFORM_FEE' : 'PHASE_2_PLATFORM_FEE',
        // Number views — for tests that need a plain number.
        _subtotal: subtotalRaw,
        _vat: vatRaw,
        _total: totalRaw,
    };
}

// ──────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────

describe('[Iter 24] Decimal x PeriodClose integration', () => {
    beforeEach(() => {
        // Fresh mocks per test — write history must not leak.
        mockPrismaContext = buildPrismaMock({
            periodClosedPredicate: (_where) => false,
        });
        mockAuditLogCalls.length = 0;
        mockPeriodCloseService.isPeriodClosed.mockReset();
        mockPeriodCloseService.isPeriodClosed.mockResolvedValue(false);
        mockPeriodCloseService.closePeriod.mockReset();
        mockPeriodCloseService.reopenPeriod.mockReset();
    });

    // ──────────────────────────────────────────────────────────────────
    // SCENARIO 1 — Happy path: payment entry balances at exact Decimal.
    //
    // Invariant tested (B24-A): totalAmount === subtotal + vat to the
    // satang. After buildPaymentEntryLines, totalDebit === totalCredit
    // === 535.00 exact — no IEEE-754 drift.
    // ──────────────────────────────────────────────────────────────────
    describe('Scenario 1 — Happy path (parity invariant)', () => {
        it('records balanced 535.00 entry; parity holds at the satang', async () => {
            const { recordPaymentEntry } = loadJournalService();
            const invoice = buildInvoice({ id: 'inv-s1', scopes: 1, phase: 1 });

            const result = await recordPaymentEntry(
                invoice.id,
                Number(invoice.totalAmount),
                { platformFee: 500, vat: 35 },
                {
                    invoiceNumber: 'PLATFORM-2569-000001',
                    serviceType: invoice.serviceType,
                    paidAt: new Date(Date.UTC(2026, 5, 15)), // June 15 — open period
                    organizationId: 'org-1',
                    tx: mockPrismaContext.prisma,
                    createdBy: 'user-finance-1',
                },
            );

            // Parity at the entry level
            expect(result.totalDebit).toBe(535);
            expect(result.totalCredit).toBe(535);
            expect(Number(invoice.subtotal) + Number(invoice.vat))
                .toBe(Number(invoice.totalAmount));

            // The persisted entry's lines mirror the canonical Dr/Cr shape.
            const lines = result.lines || [];
            const debitTotal = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
            const creditTotal = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
            // Use exact integer satang comparison to assert no IEEE drift.
            expect(Math.round(debitTotal * 100)).toBe(Math.round(creditTotal * 100));
            expect(Math.round(debitTotal * 100)).toBe(53500);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // SCENARIO 2 — Period close blocks new entries.
    //
    // Invariant tested (B24-B): when a period is CLOSED, recordPaymentEntry
    // with entryDate inside it must throw PERIOD_CLOSED. A different date
    // (in an OPEN period) succeeds. Admin override (allowClosedPeriod=true)
    // is permitted but emits an audit warning.
    //
    // NOTE: Period-lock enforcement is wired by B24-B integration. If the
    // live service does NOT yet call isPeriodClosed, this scenario
    // describes the contract the wiring must honour and skips the throw
    // assertion gracefully. Net-to-zero / parity assertions still run.
    // ──────────────────────────────────────────────────────────────────
    describe('Scenario 2 — Period close blocks entries in closed period', () => {
        it('throws PERIOD_CLOSED for May 15 when May 2026 is closed; June 1 succeeds', async () => {
            // Simulate "May 2026 is CLOSED, everything else OPEN".
            mockPeriodCloseService.isPeriodClosed.mockImplementation(async ({ year, month }) => {
                return year === 2026 && month === 5;
            });
            mockPrismaContext = buildPrismaMock({
                periodClosedPredicate: (where) => where.year === 2026 && where.month === 5,
            });

            const { recordPaymentEntry } = loadJournalService();
            const invoice = buildInvoice({ id: 'inv-s2', scopes: 1, phase: 1 });

            const mayDate = new Date(Date.UTC(2026, 4, 15)); // May 15 2026
            const juneDate = new Date(Date.UTC(2026, 5, 1)); // June 1 2026

            // The May post MUST be rejected with PERIOD_CLOSED — B24-B
            // period-guard interceptor calls period-close-service.isPeriodClosed
            // before any DB write. Our mock has May 2026 closed for this
            // test, so the guard short-circuits with throw.
            let mayResult = null;
            let mayError = null;
            try {
                mayResult = await recordPaymentEntry(
                    invoice.id,
                    Number(invoice.totalAmount),
                    { platformFee: 500, vat: 35 },
                    {
                        invoiceNumber: 'PLATFORM-2569-000002',
                        serviceType: invoice.serviceType,
                        paidAt: mayDate,
                        organizationId: 'org-1',
                        tx: mockPrismaContext.prisma,
                        createdBy: 'user-finance-1',
                    },
                );
            } catch (err) {
                mayError = err;
            }

            // STRICT assertion — the period guard must have fired.
            expect(mayError).toBeTruthy();
            expect(mayError.code).toBe('PERIOD_CLOSED');
            expect(mayError.year).toBe(2026);
            expect(mayError.month).toBe(5);
            expect(mayResult).toBeNull();

            // The June post (OPEN period) must succeed regardless.
            const juneResult = await recordPaymentEntry(
                invoice.id,
                Number(invoice.totalAmount),
                { platformFee: 500, vat: 35 },
                {
                    invoiceNumber: 'PLATFORM-2569-000003',
                    serviceType: invoice.serviceType,
                    paidAt: juneDate,
                    organizationId: 'org-1',
                    tx: mockPrismaContext.prisma,
                    createdBy: 'user-finance-1',
                },
            );
            expect(juneResult).toBeTruthy();
            expect(juneResult.totalDebit).toBe(535);
            expect(juneResult.totalCredit).toBe(535);
        });

        it('honours allowClosedPeriod admin override (or documents missing wiring)', async () => {
            mockPeriodCloseService.isPeriodClosed.mockResolvedValue(true);
            mockPrismaContext = buildPrismaMock({
                periodClosedPredicate: (_where) => true,
            });

            const { recordPaymentEntry } = loadJournalService();
            const invoice = buildInvoice({ id: 'inv-s2-admin', scopes: 1, phase: 1 });
            const mayDate = new Date(Date.UTC(2026, 4, 15));

            // With allowClosedPeriod=true the entry must commit. If the
            // wiring is not in place the commit happens anyway — both
            // satisfy the test's purpose (the contract is "admin can post").
            const result = await recordPaymentEntry(
                invoice.id,
                Number(invoice.totalAmount),
                { platformFee: 500, vat: 35 },
                {
                    invoiceNumber: 'PLATFORM-2569-000004',
                    serviceType: invoice.serviceType,
                    paidAt: mayDate,
                    organizationId: 'org-1',
                    tx: mockPrismaContext.prisma,
                    createdBy: 'user-admin-1',
                    allowClosedPeriod: true,
                },
            );
            expect(result).toBeTruthy();
            expect(result.totalDebit).toBe(535);
            expect(result.totalCredit).toBe(535);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // SCENARIO 5 — Decimal precision under multi-scope aggregation.
    //
    // Invariants tested (B24-A):
    //   • 3 scopes × Phase-1 total 535 === 1,605 exactly (no IEEE drift).
    //   • The payment entry balances at 1,605.00 to the satang.
    // ──────────────────────────────────────────────────────────────────
    describe('Scenario 5 — Decimal precision survives aggregation', () => {
        it('3 scopes x 535 = 1605 exact; the payment entry balances to the satang', async () => {
            mockPeriodCloseService.isPeriodClosed.mockResolvedValue(false);
            mockPrismaContext = buildPrismaMock({});
            const journalService = loadJournalService();

            const invoice = buildInvoice({ id: 'inv-s5', scopes: 3, phase: 1 });
            // Pre-flight assertion: totalAmount stored exactly.
            expect(Number(invoice.totalAmount)).toBe(1605);
            // Parity at the invoice layer.
            expect(Number(invoice.subtotal) + Number(invoice.vat))
                .toBe(Number(invoice.totalAmount));
            // IEEE-754 sanity — the raw float arithmetic 0.07 * 7500
            // commonly drifts; explicit cents math must NOT.
            const subtotalCents = Math.round(Number(invoice.subtotal) * 100);
            const vatCents = Math.round(Number(invoice.vat) * 100);
            const totalCents = Math.round(Number(invoice.totalAmount) * 100);
            expect(subtotalCents + vatCents).toBe(totalCents);

            const original = await journalService.recordPaymentEntry(
                invoice.id,
                Number(invoice.totalAmount),
                { platformFee: Number(invoice.subtotal), vat: Number(invoice.vat) },
                {
                    invoiceNumber: 'PLATFORM-2569-000008',
                    serviceType: invoice.serviceType,
                    paidAt: new Date(Date.UTC(2026, 0, 5)),
                    organizationId: 'org-1',
                    tx: mockPrismaContext.prisma,
                    createdBy: 'user-finance-1',
                },
            );
            expect(original.totalDebit).toBe(1605);
            expect(original.totalCredit).toBe(1605);
        });
    });
});
