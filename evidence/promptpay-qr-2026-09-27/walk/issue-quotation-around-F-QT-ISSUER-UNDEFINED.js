'use strict';
/**
 * Scratch-DB only. Issues the walk application's quotation through the REAL
 * quotation-service.issueQuotationsForApplication (real fee math, real QT-PRD
 * numbering), on a Prisma client that drops `undefined` from
 * `quotation.findMany({ where: { issuerType: { in: [...] } } })`.
 *
 * Why: on this tree every quotation issuance fails — quotation-service.js:490
 * asks for issuerType IN [ISSUER.DTAM, ISSUER.PLATFORM], and ISSUER.DTAM is
 * undefined since config/invoice-issuers.js dropped DTAM (3fc6a56a, 2026-09-11).
 * Prisma rejects the undefined ("Can not use `undefined` value within array").
 * Found by this walk (GET /api/applications/:id/quotations self-heal logged
 * "late issue failed"); recorded in BACKLOG-FOUND.md, not fixed here (out of
 * this branch's scope). The workaround touches nothing in the tree.
 */
const { PrismaClient } = require('@prisma/client');

const url = process.env.DATABASE_URL || '';
if (!url.includes('127.0.0.1:55461/gacp_walk')) {
    console.error('refusing: not the scratch walk database');
    process.exit(2);
}

(async () => {
    const base = new PrismaClient();
    const client = base.$extends({
        query: {
            quotation: {
                async findMany({ args, query }) {
                    const inList = args?.where?.issuerType?.in;
                    if (Array.isArray(inList)) {
                        args.where.issuerType.in = inList.filter((v) => v !== undefined);
                    }
                    return query(args);
                },
            },
        },
    });
    const { issueQuotationsForApplication } = require('../../../apps/backend/services/quotation-service');
    const result = await issueQuotationsForApplication(process.argv[2], { tx: client });
    const row = result.platform || result.company;
    console.log(JSON.stringify({
        quotationNumber: row.quotationNumber, status: row.status,
        subtotal: String(row.subtotal), vat: String(row.vat), totalAmount: String(row.totalAmount),
    }));
    await base.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
