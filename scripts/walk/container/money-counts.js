const { prisma } = require('./services/prisma-database');
const { withoutTenantScope } = require('./services/tenant-context');
const MONEY_EQUATION = `SELECT count(*) FROM checkout_orders
      WHERE platform_fee_gross <> platform_fee_net + platform_fee_vat
         OR (total_payable_amount <> platform_fee_gross AND status <> 'CANCELLED')`;
const QUOTATION_CLOSURE = `SELECT count(*) FROM checkout_orders o
       JOIN quotations q ON q.id = o.quotation_id
      WHERE o.status = 'SETTLED'
        AND ( (o.milestone = 'M1' AND q."phase1InvoicedAt" IS NULL)
           OR (o.milestone = 'M2' AND q."phase2InvoicedAt" IS NULL) )`;
const count = async (sql) => {
    try {
        const rows = await withoutTenantScope(() => prisma.$queryRawUnsafe(sql));
        const n = Number(Object.values(rows[0] || {})[0]);
        return Number.isInteger(n) ? { count: n } : { error: 'not-a-count' };
    } catch (err) { return { error: String(err && (err.code || err.name)) }; }
};
try {
    return { moneyEquation: await count(MONEY_EQUATION), quotationClosure: await count(QUOTATION_CLOSURE) };
} finally { await prisma.$disconnect(); }
