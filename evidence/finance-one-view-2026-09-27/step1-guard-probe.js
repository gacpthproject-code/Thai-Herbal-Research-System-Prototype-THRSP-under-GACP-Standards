// Step 1 map probe — runs the REAL guard middlewares / role sets of every backend
// finance endpoint the /provider/accounting pages call, once per role, and prints
// who is admitted. Final handlers (DB) are never invoked. Read-only.
'use strict';
const path = require('path');
const B = path.resolve(__dirname, '../../apps/backend');
const ROLES = ['finance_officer_dtam', 'finance_officer_platform', 'system_admin_dtam', 'field_inspector', 'health', 'document_reviewer'];

function runGuards(guards, role) {
  // returns true when every guard calls next()
  for (const g of guards) {
    let passed = false;
    const req = { user: { id: 'u1', role, organizationId: 'org1' }, params: {}, query: {}, get: () => '' };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { return this; } };
    const r = g(req, res, () => { passed = true; });
    if (r && typeof r.then === 'function') { throw new Error('async guard — not probed here'); }
    if (!passed) return `DENY ${res.statusCode}`;
  }
  return 'ALLOW';
}

function routeRows(file, mount) {
  const router = require(path.join(B, file));
  const rows = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(',');
    const handles = layer.route.stack.map((s) => s.handle);
    const guards = handles.slice(0, -1).filter((h) => h.name !== 'authenticateProvider' && h.name !== 'authenticateHealth');
    if (guards.length === 0) { rows.push([`${methods} ${mount}${layer.route.path}`, 'no route-level role guard (in-handler)']); continue; }
    const cells = ROLES.map((r) => { try { return `${r}=${runGuards(guards, r)}`; } catch (e) { return `${r}=?(${e.message})`; } });
    rows.push([`${methods} ${mount}${layer.route.path}`, cells.join(' ')]);
  }
  return rows;
}

const out = [];
for (const [file, mount] of [
  ['routes/api/finance/invoices.js', '/api/invoices'],
  ['routes/api/finance/invoice-payment-handlers.js', '/api/invoices'],
  ['routes/api/finance/reports.js', '/api/finance/reports'],
  ['routes/api/finance/tax-reports.js', '/api/finance/tax-reports'],
  ['routes/api/finance/customer-reports.js', '/api/finance'],
  ['routes/api/finance/period-close.js', '/api/finance/period-close'],
  ['routes/api/finance/manual-journal-entries.js', '/api/finance/manual-journal-entries'],
  ['routes/api/finance/wht.js', '/api/finance/wht'],
  ['routes/api/finance/purchase-invoices.js', '/api/finance/purchase-invoices'],
  ['routes/api/finance/refunds.js', '/api/finance/refunds'],
]) {
  for (const [ep, verdict] of routeRows(file, mount)) out.push(`${ep.padEnd(62)} ${verdict}`);
}

out.push('', '-- in-handler service role sets (the guard those routes call) --');
const svc = (label, set) => out.push(`${label.padEnd(44)} ${ROLES.map((r) => `${r}=${set.has(r) ? 'ALLOW' : 'DENY'}`).join(' ')}`);
const wht = require(path.join(B, 'services/wht-service.js'));
const tryAssert = (fn, r) => { try { fn({ role: r }); return true; } catch { return false; } };
out.push(`${'wht-service assertReadRole'.padEnd(44)} ${ROLES.map((r) => `${r}=${tryAssert(wht.assertReadRole, r) ? 'ALLOW' : 'DENY'}`).join(' ')}`);
out.push(`${'wht-service assertWriteRole'.padEnd(44)} ${ROLES.map((r) => `${r}=${tryAssert(wht.assertWriteRole, r) ? 'ALLOW' : 'DENY'}`).join(' ')}`);
const pi = require(path.join(B, 'services/purchase-invoice-service.js'));
svc('purchase-invoice-service READ_ROLES', pi.READ_ROLES); svc('purchase-invoice-service WRITE_ROLES', pi.WRITE_ROLES);
const rf = require(path.join(B, 'services/refund-service.js'));
svc('refund-service READ_ROLES', rf.READ_ROLES); svc('refund-service WRITE_ROLES', rf.WRITE_ROLES); svc('refund-service CANCEL_ROLES', rf.CANCEL_ROLES);

out.push('', '-- read-side data narrowing: invoice-helpers.invoiceSideWhere / invoiceVisibleSide --');
const ih = require(path.join(B, 'routes/api/finance/invoice-helpers.js'));
for (const r of ROLES.slice(0, 4)) out.push(`${r.padEnd(28)} invoiceVisibleSide=${ih.invoiceVisibleSide({ role: r })} invoiceSideWhere=${JSON.stringify(ih.invoiceSideWhere({ role: r }))}`);
console.log(out.join('\n'));
process.exit(0);
