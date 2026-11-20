'use strict';

/**
 * Make requests meet at one lock at the same moment, every run.
 *
 * The test takes a lock in its own transaction, fires each request in turn and waits until
 * Postgres has queued that request behind the lock (directly, or behind a request queued
 * before it), then lets go. The requests then go on in the order they were fired, each one
 * seeing what the one before it committed: the interleaving a read-then-write step loses
 * to, without depending on timing luck.
 *
 * A request that never waits (it failed early, or it does not touch what is locked) fails
 * the wait with the count it reached, instead of hanging the suite.
 */

const QUEUED_BEHIND = `
WITH RECURSIVE queued(pid) AS (
    SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))
    UNION
    SELECT a.pid FROM pg_stat_activity a JOIN queued q ON q.pid = ANY(pg_blocking_pids(a.pid))
)
SELECT count(*)::int AS n FROM queued`;

async function waitUntilQueued(raw, holderPid, wanted, timeoutMs) {
    const until = Date.now() + timeoutMs;
    for (;;) {
        const [{ n }] = await raw.$queryRawUnsafe(QUEUED_BEHIND, holderPid);
        if (n >= wanted) { return; }
        if (Date.now() > until) {
            throw new Error(`only ${n} of ${wanted} requests queued behind the lock`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

/**
 * @param {import('@prisma/client').PrismaClient} raw  the test's own client, not the app's
 * @param {(tx) => Promise<any>} hold                  takes the lock inside the test's transaction
 * @param {Array<() => Promise<any>>} calls             each fires one request and returns its result
 * @param {object} [options]
 * @param {(tx) => Promise<any>} [options.beforeRelease] runs once every request waits: what commits
 *                                                      between a request's read and its write
 * @returns {Promise<any[]>} the results, in firing order
 */
async function raceBehind(raw, hold, calls, { timeoutMs = 15000, beforeRelease } = {}) {
    const fired = [];
    await raw.$transaction(async (tx) => {
        await hold(tx);
        const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        for (const call of calls) {
            fired.push(call());
            await waitUntilQueued(raw, pid, fired.length, timeoutMs);
        }
        if (beforeRelease) { await beforeRelease(tx); }
    }, { timeout: timeoutMs * (calls.length + 1), maxWait: 10000 });
    return Promise.all(fired);
}

/** Race `calls` on one row: the hold is that row's lock (`table` as Postgres names it). */
function raceOnRow(raw, { table, id }, calls, options) {
    return raceBehind(raw, (tx) => tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, id), calls, options);
}

/**
 * Race `calls` on new rows of `table`: the hold lets reads through and stops every insert,
 * so requests that read before they insert all read the same table.
 */
function raceOnInsert(raw, table, calls, options) {
    return raceBehind(raw, (tx) => tx.$executeRawUnsafe(`LOCK TABLE "${table}" IN SHARE MODE`), calls, options);
}

module.exports = { raceBehind, raceOnRow, raceOnInsert, waitUntilQueued };
