'use strict';

/**
 * F1 (live walk 2026-10-07): the finance reports page died with
 * "Cannot read properties of undefined (reading 'isBalanced')" because the web page
 * read a trial-balance shape the server never sent. One shape, server truth.
 *
 * The real payloads of every report door on real Postgres are the fixture the web
 * page's own test renders (apps/web-app/src/lib/services/__fixtures__/
 * finance-report-payloads.json). This suite fails when a door's shape drifts from
 * that file; WRITE_FINANCE_REPORT_FIXTURE=1 rewrites the file from the live doors.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const mockActor = { current: null };
jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const attach = (req, res, next) => { req.user = { ...mockActor.current }; next(); };
    return { ...actual, authenticateAny: attach, authenticateProvider: attach, authenticateToken: attach };
});

const FIXTURE = path.resolve(
    __dirname, '../../../web-app/src/lib/services/__fixtures__/finance-report-payloads.json',
);

/** The type skeleton of a JSON value: keys and leaf types; an array is its first element's skeleton. */
function shapeOf(value) {
    if (Array.isArray(value)) { return value.length ? [shapeOf(value[0])] : []; }
    if (value === null) { return 'null'; }
    if (typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shapeOf(value[k])]));
    }
    return typeof value;
}

d('finance report doors: one shape, server truth (real Postgres)', () => {
    let raw;
    let app;
    const sfx = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let org;
    const entryIds = [];
    const payloads = {};

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        org = (await raw.organization.create({
            data: { name: `frc-${sfx}`, slug: `frc-${sfx}`, code: `FRC_${sfx}`.toUpperCase().slice(0, 24) },
        })).id;
        const entry = await raw.journalEntry.create({
            data: {
                entryDate: new Date('2026-10-05T03:00:00Z'),
                reference: `RC-FRC-${sfx}`,
                description: 'รับชำระค่าบริการ',
                totalDebit: 5885, totalCredit: 5885, organizationId: org,
                lines: { create: [
                    { lineNumber: 1, accountCode: '1110-001', accountName: 'เงินสด/เงินฝากธนาคาร · บัญชีหลัก', debit: 5885 },
                    { lineNumber: 2, accountCode: '4110-001', accountName: 'รายได้ค่าบริการ', credit: 5500 },
                    { lineNumber: 3, accountCode: '2131-001', accountName: 'ภาษีขายตั้งพัก (Output VAT 7%)', credit: 385, taxableAmount: 5500 },
                ] },
            },
        });
        const fee = await raw.journalEntry.create({
            data: {
                entryDate: new Date('2026-10-06T03:00:00Z'),
                reference: `BF-FRC-${sfx}`,
                description: 'ค่าธรรมเนียมธนาคาร',
                totalDebit: 100, totalCredit: 100, organizationId: org,
                lines: { create: [
                    { lineNumber: 1, accountCode: '5110', accountName: 'ค่าใช้จ่ายในการดำเนินงาน', debit: 100 },
                    { lineNumber: 2, accountCode: '1110-001', accountName: 'เงินสด/เงินฝากธนาคาร · บัญชีหลัก', credit: 100 },
                ] },
            },
        });
        entryIds.push(entry.id, fee.id);
        app = express();
        app.use(express.json());
        app.use('/api/finance/reports', require('../../routes/api/finance/reports'));
        app.use('/api/finance/tax-reports', require('../../routes/api/finance/tax-reports'));
        mockActor.current = {
            id: crypto.randomUUID(), role: 'finance_officer_platform',
            canonicalRole: 'finance_officer_platform', organizationId: org,
        };
    });

    afterAll(async () => {
        if (!raw) { return; }
        if (process.env.WRITE_FINANCE_REPORT_FIXTURE === '1') {
            fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
            let text = JSON.stringify(payloads).split(org).join('00000000-0000-4000-8000-000000000000').split(sfx).join('fixture');
            entryIds.forEach((id, i) => { text = text.split(id).join(`00000000-0000-4000-8000-00000000000${i + 1}`); });
            const scrubbed = JSON.parse(text);
            fs.writeFileSync(FIXTURE, `${JSON.stringify(scrubbed, null, 2)}\n`);
        }
        await raw.journalEntry.deleteMany({ where: { id: { in: entryIds } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { actorId: mockActor.current.id } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: org } }).catch(() => {});
        await raw.$disconnect();
    });

    const doors = [
        ['trialBalance', '/api/finance/reports/trial-balance?asOfDate=2026-10-31'],
        ['profitAndLoss', '/api/finance/reports/profit-and-loss?from=2026-10-01&to=2026-10-31'],
        ['balanceSheet', '/api/finance/reports/balance-sheet?asOfDate=2026-10-31'],
        ['generalLedger', '/api/finance/reports/general-ledger?accountCode=4110-001&from=2026-10-01&to=2026-10-31'],
        ['chartOfAccounts', '/api/finance/reports/chart-of-accounts'],
        ['outputVat', '/api/finance/tax-reports/output-vat?year=2026&month=10'],
        ['periodClosable', '/api/finance/tax-reports/period-closable?year=2026&month=10'],
    ];

    test.each(doors)('%s answers 200 with the shape the web page renders', async (name, url) => {
        const res = await request(app).get(url);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        payloads[name] = res.body.data;
        if (process.env.WRITE_FINANCE_REPORT_FIXTURE === '1') { return; }
        const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
        expect(shapeOf(res.body.data)).toEqual(shapeOf(fixture[name]));
    });

    test('the seeded entry is in the numbers, so the fixture is not an empty report', () => {
        expect(payloads.trialBalance.totalDebit).toBe(5885);
        expect(payloads.profitAndLoss.expense.total).toBe(100);
        expect(payloads.trialBalance.balanced).toBe(true);
        expect(payloads.profitAndLoss.revenue.total).toBe(5500);
        expect(payloads.outputVat.totals.vatAmount).toBe(385);
        expect(payloads.generalLedger.lines).toHaveLength(1);
        expect(payloads.chartOfAccounts.accounts.map((a) => a.code)).toContain('4110-001');
        expect(payloads.chartOfAccounts.accounts.some((a) => a.code.startsWith('9'))).toBe(false);
    });
});
