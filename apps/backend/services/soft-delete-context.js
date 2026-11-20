/**
 * Soft-Delete Context (Wave A Phase 16)
 *
 * Async-local opt-out for the soft-delete auto-filter applied by
 * soft-delete-extension.js. The default behaviour is to filter out
 * tombstoned rows (`isDeleted = true`) on read/aggregate paths so callers
 * that don't think about soft-delete still get correct results.
 *
 * Two ways to read tombstoned rows when you actually need them:
 *
 *   1. Wrap the call in `withDeletedRows()` — the most common pattern for
 *      admin recycle-bin views and PDPA delete-by-user pipelines.
 *
 *      withDeletedRows(async () => prisma.application.findMany({ where: { id } }));
 *
 *      The callback must be async: a Prisma query is lazy and runs when it is
 *      awaited, and a plain arrow hands it back to be awaited outside the
 *      context, where the filter applies again.
 *
 *   2. Pass `where.isDeleted` explicitly. The extension respects what the
 *      caller provided, so `where: { isDeleted: true }` finds tombstones.
 *      A Boolean column takes no `in` filter; use option 1 to see both.
 *
 * Single rule: if `getSoftDeleteContext()` returns `{ includeDeleted: true }`,
 * the extension is a no-op for that async chain. Otherwise it injects
 * `isDeleted: false` on read/aggregate operations.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

/**
 * @returns {{ includeDeleted: boolean } | null}
 */
function getSoftDeleteContext() {
  return storage.getStore() || null;
}

/**
 * Run `fn` with the soft-delete auto-filter disabled. All reads see
 * tombstoned rows alongside live ones for the duration of the callback.
 *
 * @param {() => any} fn
 */
function withDeletedRows(fn) {
  return storage.run({ includeDeleted: true }, fn);
}

module.exports = {
  getSoftDeleteContext,
  withDeletedRows,
};
