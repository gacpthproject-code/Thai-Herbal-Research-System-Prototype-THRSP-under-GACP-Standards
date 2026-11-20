/**
 * กำแพงองค์กรของประตูอ่าน/เขียนการเงิน — fix round 1 (security review S3 · S4 · S5 · L3 · L4)
 *
 * ทุกคนในเทสอื่นอยู่ org-1 จึงมองไม่เห็นว่าประตูไหนหลุดข้ามองค์กร (review S5) · ไฟล์นี้ให้ผู้เรียก
 * อยู่ org-2 และข้อมูลตัวอย่างเป็นของ org-1 แล้ววัดสามอย่าง:
 *   1. ประตูที่ส่งองค์กรลงชั้นข้อมูล: ต้องส่ง org ของผู้เรียก (org-2) เสมอ แม้ query จะอ้าง org อื่น
 *   2. ประตูอ่านตาม id: แถวของ org-1 ต้องได้ 403/404 สำหรับผู้เรียก org-2
 *   3. ผู้เรียกที่ไม่มี organizationId: ต้องถูกปฏิเสธ (fail closed) ไม่ใช่ได้ข้อมูลทุกองค์กร
 * ประตูที่พึ่ง tenant-prisma-extension (ขอบเขตองค์กรฉีดที่ prisma client จริง ซึ่งถูกปลอมในเทสนี้)
 * ประกาศไว้ใน EXTENSION_SCOPED อย่างชัดแจ้ง — ไม่ข้ามเงียบ ๆ
 *
 * ของจริง: router · ด่านบทบาท · purchase-invoice / refund / wht / credit-note / debit-note service
 * ของปลอม: การยืนยันตัวตน (หัว x-test-role / x-test-org) · prisma · service รายงาน (บันทึกการเรียก)
 */

'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const auth = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role) { return res.status(401).json({ success: false }); }
        const org = req.headers['x-test-org'];
        req.user = { id: 'user-1', role, organizationId: org === 'none' ? null : (org || 'org-2') };
        return next();
    };
    return { authenticateProvider: auth, authenticateHealth: auth, authenticate: auth, authenticateAny: auth };
});
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(null) },
    AuditCategory: new Proxy({}, { get: (_t, k) => String(k) }),
    AuditSeverity: new Proxy({}, { get: (_t, k) => String(k) }),
    ResourceType: new Proxy({}, { get: (_t, k) => String(k) }),
}));

// service รายงาน — บันทึกว่าถูกเรียกด้วยองค์กรอะไร (ไม่สะท้อนอาร์กิวเมนต์กลับเป็น payload)
const mockTB = jest.fn(() => Promise.resolve({ balanced: true, rows: [] }));
const mockPL = jest.fn(() => Promise.resolve({ netProfit: 0, revenue: { total: 0 }, expense: { total: 0 } }));
const mockBS = jest.fn(() => Promise.resolve({ balanced: true, assets: { total: 0 }, liabilities: { total: 0 }, equity: { total: 0 } }));
const mockGL = jest.fn(() => Promise.resolve({ pagination: { returned: 0, totalRows: 0 } }));
const mockVAT = jest.fn(() => Promise.resolve({ rows: [] }));
const mockClosable = jest.fn(() => Promise.resolve({ closable: true }));
const mockAging = jest.fn(() => Promise.resolve({ rows: [] }));
const mockStatement = jest.fn(() => Promise.resolve({ applicant: null, applications: [] }));
const mockExport = jest.fn(() => Promise.resolve({ buffer: Buffer.from('x'), filename: 'x.csv', contentType: 'text/csv' }));
jest.mock('../../services/trial-balance-service', () => ({ generateTrialBalance: (...a) => mockTB(...a), generateTrialBalanceCSV: (...a) => mockTB(...a).then(() => 'csv') }));
jest.mock('../../services/financial-statements-service', () => ({ generateProfitAndLoss: (...a) => mockPL(...a), generateBalanceSheet: (...a) => mockBS(...a) }));
jest.mock('../../services/general-ledger-service', () => ({ queryGeneralLedger: (...a) => mockGL(...a) }));
jest.mock('../../services/vat-report-service', () => ({
    generateOutputVatReport: (...a) => mockVAT(...a),
    generateOutputVatReportCSV: (...a) => mockVAT(...a).then(() => 'csv'),
    checkPeriodClosable: (...a) => mockClosable(...a),
}));
jest.mock('../../services/ar-aging-service', () => ({ generateArAgingReport: (...a) => mockAging(...a), generateArAgingReportCSV: (...a) => mockAging(...a).then(() => 'csv') }));
jest.mock('../../services/customer-statement-service', () => ({ generateCustomerStatement: (...a) => mockStatement(...a) }));
jest.mock('../../services/financial-export-service', () => ({ exportCSV: (...a) => mockExport(...a) }));
const mockSummary = jest.fn(() => Promise.resolve({ invoiceCount: { total: 0 } }));
const mockExceptions = jest.fn(() => Promise.resolve([]));
jest.mock('../../services/invoice-service', () => ({
    getById: () => Promise.resolve(null),
    getSummary: (...a) => mockSummary(...a),
    listReceiptExceptions: (...a) => mockExceptions(...a),
}));

// prisma ปลอม — ทุกแถวเป็นของ org-1 · บันทึก where / data ที่ service ส่งมา
const mockPrismaCalls = [];
jest.mock('../../services/prisma-database', () => {
    const rec = (model, op, ret) => (args) => { mockPrismaCalls.push({ model, op, args }); return Promise.resolve(typeof ret === 'function' ? ret(args) : ret); };
    const invoiceRow = {
        id: 'inv-1', invoiceNumber: 'INV-1', organizationId: 'org-1', serviceType: 'PHASE_1_PLATFORM_FEE', status: 'PAID',
        subtotal: 100, vat: 7, totalAmount: 107, metadata: {}, isDeleted: false, applicant: { entityType: 'JURISTIC' },
    };
    const noteRow = { id: 'n-1', organizationId: 'org-1', status: 'ISSUED', originalInvoice: invoiceRow };
    return {
        prisma: {
            userPermissionGrant: { findMany: rec('userPermissionGrant', 'findMany', []) },
            invoice: {
                findUnique: rec('invoice', 'findUnique', invoiceRow),
                findFirst: rec('invoice', 'findFirst', invoiceRow),
                findMany: rec('invoice', 'findMany', []),
                update: rec('invoice', 'update', {}),
            },
            creditNote: {
                create: rec('creditNote', 'create', {}),
                findMany: rec('creditNote', 'findMany', []),
                findUnique: rec('creditNote', 'findUnique', noteRow),
            },
            debitNote: {
                create: rec('debitNote', 'create', {}),
                findMany: rec('debitNote', 'findMany', []),
                findUnique: rec('debitNote', 'findUnique', noteRow),
            },
            $transaction: (fn) => (typeof fn === 'function' ? fn(this) : Promise.all(fn)),
        },
    };
});

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', require('../../routes/api/finance/invoices'));
    app.use('/api/finance/reports', require('../../routes/api/finance/reports'));
    app.use('/api/finance/tax-reports', require('../../routes/api/finance/tax-reports'));
    app.use('/api/finance/wht', require('../../routes/api/finance/wht'));
    app.use('/api/finance/refunds', require('../../routes/api/finance/refunds'));
    app.use('/api/finance/credit-notes', require('../../routes/api/finance/credit-notes'));
    app.use('/api/finance/debit-notes', require('../../routes/api/finance/debit-notes'));
    app.use('/api/finance', require('../../routes/api/finance/customer-reports'));
    return app;
}

const P = 'finance_officer_platform';
const D = 'finance_officer_dtam';
const ADMIN = 'system_admin_dtam';

/** ประตูที่ส่งองค์กรลงชั้นข้อมูล: [url, mock, index ของอาร์กิวเมนต์ที่ถือ org, key] */
const ORG_PARAM_DOORS = [
    ['/api/finance/reports/trial-balance?asOfDate=2026-09-27', mockTB],
    ['/api/finance/reports/profit-and-loss?from=2026-09-01&to=2026-09-27', mockPL],
    ['/api/finance/reports/balance-sheet?asOfDate=2026-09-27', mockBS],
    ['/api/finance/reports/general-ledger?accountCode=4110-001', mockGL],
    ['/api/finance/tax-reports/output-vat?year=2026&month=9', mockVAT],
    ['/api/finance/tax-reports/period-closable?year=2026&month=9', mockClosable],
    ['/api/finance/ar-aging?bookSide=PLATFORM&asOfDate=2026-09-27', mockAging],
    ['/api/finance/customer-statement?applicantHealthId=h-1', mockStatement],
];
function orgArg(mock) {
    const [first] = mock.mock.calls[mock.mock.calls.length - 1];
    // A door that hands the service the signed-in caller passes its organization inside it.
    return typeof first === 'string' || first === null ? first : (first.organizationId ?? first.actor?.organizationId);
}

/**
 * ประตูอ่านที่ขอบเขตองค์กรมาจาก tenant-prisma-extension บน prisma client จริง (findMany/findFirst/
 * count ถูก inject organizationId จาก tenant context ของคำขอ) — วัดในระดับ route ไม่ได้เพราะ prisma
 * ถูกปลอม · ตรวจที่ __tests__/unit/tenant-prisma-extension*.test.js
 * /summary และ /receipts/exceptions ส่งผู้ดู (viewer) ลง service แล้ว จำกัดองค์กรเองโดยไม่พึ่ง
 * extension (order 17) — วัดในระดับ route ข้างล่าง · /revenue-summary ถูกถอด (ผนัง A/B เดิม)
 */
// GET /api/invoices/:invoiceId/receipt/pdf left this list in B0 (fix/finance-read-leaks): it reads
// with the caller's organization itself, proven on real Postgres with the extension switched off
// (__tests__/integration/finance-read-leaks-real-postgres.test.js, item 4).
const EXTENSION_SCOPED = [
    'GET /api/invoices', 'GET /api/invoices/:invoiceId',
];

describe('S5 — ผู้เรียก org-2: ประตูที่ส่งองค์กรลงชั้นข้อมูลส่ง org-2 เสมอ', () => {
    const app = buildApp();
    beforeEach(() => { jest.clearAllMocks(); mockPrismaCalls.length = 0; });

    test.each(ORG_PARAM_DOORS)('GET %s', async (url, mock) => {
        const res = await request(app).get(`${url}${url.includes('?') ? '&' : '?'}organizationId=org-1`)
            .set('x-test-role', P).set('x-test-org', 'org-2');
        expect(res.status).toBe(200);
        expect(mock).toHaveBeenCalled();
        expect(orgArg(mock)).toBe('org-2');
    });

    test.each([
        ['/api/invoices/summary', mockSummary, (call) => call[0].viewer],
        ['/api/invoices/receipts/exceptions', mockExceptions, (call) => call[1].viewer],
    ])('GET %s ส่งผู้ดู org-2 ลง service (order 17)', async (url, mock, viewerOf) => {
        for (const role of [P, D, ADMIN]) {
            mock.mockClear();
            const res = await request(app).get(`${url}?organizationId=org-1`).set('x-test-role', role).set('x-test-org', 'org-2');
            expect([role, res.status]).toEqual([role, 200]);
            expect([role, viewerOf(mock.mock.calls[0]).organizationId]).toEqual([role, 'org-2']);
        }
    });

    test('GET /api/invoices/export ส่ง org-2', async () => {
        const res = await request(app).get('/api/invoices/export?type=tax&month=9&year=2026').set('x-test-role', P).set('x-test-org', 'org-2');
        expect(res.status).toBe(200);
        expect(mockExport.mock.calls[0][3]).toEqual({ organizationId: 'org-2' });
    });

    test.each([
        ['/api/finance/credit-notes?organizationId=org-1', 'creditNote'],
        ['/api/finance/debit-notes?organizationId=org-1', 'debitNote'],
        ['/api/finance/wht/certificates', 'invoice'],
    ])('GET %s — query ?organizationId= ถูกไม่สนใจ ใช้ org ของผู้เรียก (S3)', async (url, model) => {
        for (const role of [P, D, ADMIN]) {
            mockPrismaCalls.length = 0;
            const res = await request(app).get(url).set('x-test-role', role).set('x-test-org', 'org-2');
            expect([role, res.status]).toEqual([role, 200]);
            const call = mockPrismaCalls.find((c) => c.model === model && c.op === 'findMany');
            expect([role, call.args.where.organizationId]).toEqual([role, 'org-2']);
        }
    });

});

describe('S5 — ผู้เรียก org-2 อ่านแถวของ org-1 ตาม id ไม่ได้', () => {
    const app = buildApp();

    test.each([
        '/api/finance/refunds/inv-1/status',
        '/api/finance/credit-notes/n-1',
        '/api/finance/debit-notes/n-1',
        '/api/finance/wht/applicable/inv-1',
    ])('GET %s → 403/404', async (url) => {
        for (const role of [P, D]) {
            const res = await request(app).get(url).set('x-test-role', role).set('x-test-org', 'org-2');
            expect([role, [403, 404].includes(res.status)]).toEqual([role, true]);
        }
    });

    test('ประตูที่พึ่ง tenant-prisma-extension ถูกประกาศไว้ครบ (ไม่ข้ามเงียบ)', () => {
        expect(EXTENSION_SCOPED).toHaveLength(2);
    });
});

describe('L3 — ผู้เรียกที่ไม่มี organizationId ถูกปฏิเสธ (fail closed) ไม่ใช่ได้ทุกองค์กร', () => {
    const app = buildApp();
    beforeEach(() => { jest.clearAllMocks(); mockPrismaCalls.length = 0; });

    test.each([
        ['/api/finance/tax-reports/output-vat?year=2026&month=9', mockVAT],
        ['/api/finance/tax-reports/period-closable?year=2026&month=9', mockClosable],
    ])('GET %s → 400 และไม่แตะชั้นข้อมูล', async (url, mock) => {
        const res = await request(app).get(url).set('x-test-role', P).set('x-test-org', 'none');
        expect(res.status).toBe(400);
        expect(res.body.error || res.body.code).toBe('NO_ORGANIZATION');
        expect(mock).not.toHaveBeenCalled();
    });

    test.each([
        '/api/finance/wht/certificates',
        '/api/finance/wht/applicable/inv-1',
        '/api/finance/refunds/inv-1/status',
    ])('GET %s → 400/403 และไม่มี query ข้ามองค์กร', async (url) => {
        const res = await request(app).get(url).set('x-test-role', P).set('x-test-org', 'none');
        expect([400, 403]).toContain(res.status);
        expect(mockPrismaCalls.filter((c) => c.op === 'findMany')).toEqual([]);
    });
});
