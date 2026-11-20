'use strict';

/**
 * The advisory locks of the company books. Each takes a namespace (key 1) and a key inside it
 * (key 2), so a hash collision between two kinds of lock never makes them wait on each other
 * (the audit chain uses the same form, middleware/audit-logger.js). Every lock here is a
 * transaction lock: it is held until the transaction that took it commits or rolls back.
 */

const NAMESPACES = Object.freeze({
    ACCOUNTING_PERIOD: 0x50455244, // "PERD"
    MANUAL_JOURNAL_NUMBER: 0x4d4a454e, // "MJEN"
});

const periodKey = ({ organizationId, year, month }) => `${organizationId || ''}:${year}-${month}`;

/**
 * One lock per (organization, Bangkok month), taken shared by a journal writer before it asks
 * whether the month is open: writers of one month never wait for each other, and a close of the
 * month waits for every one of them.
 */
async function lockAccountingPeriodForEntry(tx, period) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${NAMESPACES.ACCOUNTING_PERIOD}::int4, hashtext(${periodKey(period)}))`;
}

/**
 * The same lock, taken exclusive by the period close before it writes the CLOSED row: it commits
 * after every writer that found the month open, and every writer after it sees the month closed.
 */
async function lockAccountingPeriodForClose(tx, period) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NAMESPACES.ACCOUNTING_PERIOD}::int4, hashtext(${periodKey(period)}))`;
}

/** One lock per draft-number series (MJE-{year}-), held while the next number is read and used. */
async function lockManualJournalNumberSeries(tx, prefix) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NAMESPACES.MANUAL_JOURNAL_NUMBER}::int4, hashtext(${prefix}))`;
}

module.exports = {
    NAMESPACES,
    lockAccountingPeriodForEntry,
    lockAccountingPeriodForClose,
    lockManualJournalNumberSeries,
};
