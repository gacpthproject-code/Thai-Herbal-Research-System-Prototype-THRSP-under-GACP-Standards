/**
 * VIS-ACCT-02 — invoice-helpers neither narrows reads by finance role
 * (operator 2026-09-11, parity proven at the real doors in
 * finance-read-parity.test.js) nor carries a finance write: the hold/release
 * side guard went with manual payment handling (operator 2026-10-06).
 *
 * invoice-helpers transitively requires invoice-service → prisma-database, which
 * process.exit(1)s without DATABASE_URL on a dev box — so mock prisma-database first
 * (the canonical pattern; the helper logic itself touches no DB).
 */

'use strict';

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const invoiceHelpers = require('../../routes/api/finance/invoice-helpers');

describe('invoice-helpers carries no finance write and no read narrowing', () => {
  // Reads: both finance roles see the same rows (operator 2026-09-11).
  // Writes: hold/release and its side guard were removed with manual payment
  // handling (operator 2026-10-06); no finance role changes a payment state.
  it.each(['invoiceSideWhere', 'invoiceVisibleSide', 'assertInvoiceSideWritable'])('does not export %s', (name) => {
    expect(Object.keys(invoiceHelpers)).not.toContain(name);
  });
});
