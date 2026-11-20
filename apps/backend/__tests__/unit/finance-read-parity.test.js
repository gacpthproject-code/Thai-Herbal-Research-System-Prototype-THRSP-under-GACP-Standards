/**
 * ฝ่ายการเงินสองบทบาทเห็นข้อมูลชุดเดียวกัน — ด่านอ่าน (operator 2026-09-11)
 *
 *   "finance ต้องเห็นเหมือนกัน หรือว่าตัวเลขที่ต้องมากระทบยอด ต้องเท่ากัน เพื่อแสดงความโปร่งใส
 *    คือทั้งคู่จะเห็น เป็นรูปแบบ billing ที่จะเห็น transaction, status ต่างๆ หมายเลขคำขอ
 *    เลขการจ่ายเงิน หรืออะไรที่ต้องมีที่บัญชี หรือระบบ billing ต้องมี"
 *
 * เทสนี้ยิงทุกประตู **อ่าน** ที่หน้า /provider/accounting ใช้ ด้วย finance_officer_dtam และ
 * finance_officer_platform แล้วเทียบ status + payload ต้องเท่ากันทุกไบต์
 *
 * ของจริง: router ทุกตัว · ด่านบทบาททุกตัว (middleware ใน route + assert ใน service
 * ของ wht / refund) · canonical-rbac · effective-permissions engine
 * ของปลอม: การยืนยันตัวตน (หัว x-test-role → req.user) และชั้นข้อมูล — ตัวที่ถูกปลอม
 * ตอบ "สะท้อนอาร์กิวเมนต์ที่ได้รับ" กลับไป ⇒ payload เท่ากันก็ต่อเมื่อ route ส่งคำถาม
 * ชุดเดียวกันลงชั้นข้อมูลให้ทั้งสองบทบาท (ตัวกรองฝั่งตามบทบาทจะโผล่เป็น payload ต่างกัน)
 * refund ใช้ service ของจริงทั้งตัวบน prisma ปลอม
 */

'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const headerUser = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role) { return res.status(401).json({ success: false, error: 'Unauthorized' }); }
        req.user = { id: 'user-1', email: 'u@example.com', role, organizationId: 'org-1' };
        return next();
    };
    return {
        authenticateProvider: headerUser,
        authenticateHealth: headerUser,
        authenticate: headerUser,
        authenticateAny: headerUser,
    };
});

// ชั้นข้อมูล — สะท้อนอาร์กิวเมนต์ (ตัด actor/viewer ออก เพราะคือ "ใครถาม" ไม่ใช่ "ถามอะไร")
function mockEcho(name) {
    // Who asks (viewer, or the signed-in actor) differs by role by definition; what is read must not.
    const withoutCaller = (arg) => {
        if (!arg || typeof arg !== 'object' || !('viewer' in arg || 'actor' in arg)) { return arg; }
        const { viewer: _viewer, actor: _actor, ...rest } = arg;
        return rest;
    };
    return (...args) => Promise.resolve({ echo: name, args: JSON.parse(JSON.stringify(args.map(withoutCaller))) });
}

const mockPlatformInvoice = {
    id: 'inv-platform', invoiceNumber: 'INV-P-1', serviceType: 'PHASE_1_PLATFORM_FEE',
    totalAmount: 1070, status: 'PAID', organizationId: 'org-1',
};
const mockStateInvoice = {
    id: 'inv-state', invoiceNumber: 'INV-S-1', serviceType: 'PHASE_1_STATE_FEE',
    totalAmount: 5000, status: 'PAID', organizationId: 'org-1',
};

jest.mock('../../services/invoice-service', () => ({
    listAll: (...a) => mockEcho('listAll')(...a),
    getSummary: (...a) => mockEcho('getSummary')(...a),
    listReceiptExceptions: (...a) => mockEcho('listReceiptExceptions')(...a).then((r) => [r]),
    getById: (id) => Promise.resolve(
        id === 'inv-platform' ? mockPlatformInvoice : id === 'inv-state' ? mockStateInvoice : null,
    ),
    generateReceiptPdf: (id) => Promise.resolve(Buffer.from(`%PDF receipt ${id}`)),
}));
jest.mock('../../services/financial-export-service', () => ({
    exportCSV: (...a) => Promise.resolve({
        buffer: Buffer.from(JSON.stringify(a)), filename: 'x.csv', contentType: 'text/csv',
    }),
}));
jest.mock('../../services/trial-balance-service', () => ({
    generateTrialBalance: (...a) => mockEcho('generateTrialBalance')(...a)
        .then((r) => ({ ...r, balanced: true, rows: [] })),
    generateTrialBalanceCSV: (...a) => Promise.resolve(JSON.stringify(a)),
}));
jest.mock('../../services/financial-statements-service', () => ({
    generateProfitAndLoss: (...a) => mockEcho('generateProfitAndLoss')(...a)
        .then((r) => ({ ...r, netProfit: 0, revenue: { total: 0 }, expense: { total: 0 } })),
    generateBalanceSheet: (...a) => mockEcho('generateBalanceSheet')(...a)
        .then((r) => ({ ...r, balanced: true, assets: { total: 0 }, liabilities: { total: 0 }, equity: { total: 0 } })),
}));
jest.mock('../../services/general-ledger-service', () => ({
    queryGeneralLedger: (...a) => mockEcho('queryGeneralLedger')(...a)
        .then((r) => ({ ...r, pagination: { returned: 0, totalRows: 0 } })),
}));
jest.mock('../../services/vat-report-service', () => ({
    generateOutputVatReport: (...a) => mockEcho('generateOutputVatReport')(...a),
    generateOutputVatReportCSV: (...a) => Promise.resolve(JSON.stringify(a)),
    checkPeriodClosable: (...a) => mockEcho('checkPeriodClosable')(...a),
}));
jest.mock('../../services/customer-statement-service', () => ({
    generateCustomerStatement: (...a) => mockEcho('generateCustomerStatement')(...a)
        .then((r) => ({ ...r, applicant: null, applications: [] })),
}));
jest.mock('../../services/ar-aging-service', () => ({
    generateArAgingReport: (...a) => mockEcho('generateArAgingReport')(...a),
    generateArAgingReportCSV: (...a) => Promise.resolve(JSON.stringify(a)),
}));
// wht: ด่าน assertReadRole ของจริง · ปลอมแค่ตัวอ่านข้อมูล
jest.mock('../../services/wht-service', () => {
    const real = jest.requireActual('../../services/wht-service');
    return {
        ...real,
        listWhtCertificates: (...a) => mockEcho('listWhtCertificates')(...a).then((r) => [r]),
        isWhtApplicableForInvoice: (...a) => mockEcho('isWhtApplicableForInvoice')(...a),
    };
});
// refund-service = ของจริงทั้งตัว บน prisma ปลอม
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        userPermissionGrant: { findMany: () => Promise.resolve([]) },
        invoice: {
            findUnique: ({ where }) => Promise.resolve({
                id: where.id, invoiceNumber: 'INV-P-1', organizationId: 'org-1',
                metadata: {}, totalAmount: 1070, status: 'PAID',
            }),
        },
    },
}));
// The staff PDF doors of the quotation, credit note and debit note: the document reads and the
// renderer are stand-ins, the routers and their role gates are the real ones.
jest.mock('../../services/quotation-service', () => ({
    ...jest.requireActual('../../services/quotation-service'),
    findQuotationsByApplicationId: () => Promise.resolve({
        dtam: null,
        platform: { id: 'qt-1', quotationNumber: 'QT-PRD-2026-000001', issuerType: 'PLATFORM', organizationId: 'org-1' },
    }),
}));
jest.mock('../../services/application-service', () => ({
    ...jest.requireActual('../../services/application-service'),
    getApplicationSlice: () => Promise.resolve({ id: 'app-1', applicationNumber: 'APP-1', formData: {} }),
}));
jest.mock('../../services/credit-note-service', () => ({
    ...jest.requireActual('../../services/credit-note-service'),
    findCreditNoteForDocument: (id) => Promise.resolve({ id, creditNoteNumber: 'CN-PRD-2026-000001', organizationId: 'org-1' }),
}));
jest.mock('../../services/debit-note-service', () => ({
    ...jest.requireActual('../../services/debit-note-service'),
    findDebitNoteForDocument: (id) => Promise.resolve({ id, debitNoteNumber: 'DN-PRD-2026-000001', organizationId: 'org-1' }),
}));
jest.mock('../../services/pdf/invoice-template-service', () => ({
    ...jest.requireActual('../../services/pdf/invoice-template-service'),
    generateQuotationPdf: () => Promise.resolve(Buffer.from('%PDF quotation')),
    generateCreditNotePdf: () => Promise.resolve(Buffer.from('%PDF credit note')),
    generateDebitNotePdf: () => Promise.resolve(Buffer.from('%PDF debit note')),
}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(null) },
    AuditCategory: { PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { PAYMENT: 'PAYMENT' },
}));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', require('../../routes/api/finance/invoices'));
    app.use('/api/finance/reports', require('../../routes/api/finance/reports'));
    app.use('/api/finance/tax-reports', require('../../routes/api/finance/tax-reports'));
    app.use('/api/finance/wht', require('../../routes/api/finance/wht'));
    app.use('/api/finance/refunds', require('../../routes/api/finance/refunds'));
    app.use('/api/finance', require('../../routes/api/finance/customer-reports'));
    app.use('/api/applications/:applicationId/quotations', require('../../routes/api/applications/quotations'));
    app.use('/api/finance/credit-notes', require('../../routes/api/finance/credit-notes'));
    app.use('/api/finance/debit-notes', require('../../routes/api/finance/debit-notes'));
    return app;
}

/** ทุกประตูอ่านที่หน้าบัญชีเรียก */
const READ_ENDPOINTS = [
    '/api/invoices',
    '/api/invoices/summary',
    '/api/invoices/receipts/exceptions',
    '/api/invoices/export?type=monthly&month=9&year=2026',
    '/api/invoices/inv-platform',
    '/api/invoices/inv-state',
    '/api/finance/reports/trial-balance?asOfDate=2026-09-27',
    '/api/finance/reports/trial-balance?asOfDate=2026-09-27&format=csv',
    '/api/finance/reports/profit-and-loss?from=2026-09-01&to=2026-09-27',
    '/api/finance/reports/balance-sheet?asOfDate=2026-09-27',
    '/api/finance/reports/general-ledger?accountCode=4110-001&from=2026-09-01&to=2026-09-27',
    '/api/finance/tax-reports/period-closable?year=2026&month=9',
    '/api/finance/ar-aging?bookSide=DTAM&asOfDate=2026-09-27',
    '/api/finance/ar-aging?bookSide=PLATFORM&asOfDate=2026-09-27',
    '/api/finance/ar-aging?bookSide=PLATFORM&asOfDate=2026-09-27&format=csv',
    '/api/finance/customer-statement?applicantHealthId=h-1&asOfDate=2026-09-27',
    '/api/finance/wht/applicable/inv-platform',
    '/api/finance/refunds/inv-platform/status',
];

const FINANCE = ['finance_officer_dtam', 'finance_officer_platform'];
// S5: certificate_approver ถูกเพิ่ม · S6 (operator 2026-09-27): field_inspector ไม่เห็นเรื่องเงิน
// order 47 (operator 2026-10-08): system_admin_platform runs the platform, it reads no finance
const NON_FINANCE = ['health', 'document_reviewer', 'dispatcher', 'certificate_approver', 'field_inspector', 'system_admin_platform'];

describe('การเงินสองบทบาท — ทุกประตูอ่านตอบเหมือนกันทุกไบต์ (operator 2026-09-11)', () => {
    const app = buildApp();

    test.each(READ_ENDPOINTS)('GET %s → dtam กับ platform ได้ status + payload เดียวกัน และเป็น 200', async (url) => {
        const [dtam, platform] = await Promise.all(
            FINANCE.map((role) => request(app).get(url).set('x-test-role', role)),
        );
        expect({ status: dtam.status, body: dtam.body, text: dtam.text })
            .toEqual({ status: platform.status, body: platform.body, text: platform.text });
        expect(platform.status).toBe(200);
    });
});

describe('รายงานภาษีขาย: ต่างกันได้ที่เดียวคือเลขผู้เสียภาษีเต็ม ซึ่งเป็นของการเงินบริษัท (order 34)', () => {
    const app = buildApp();

    test('GET /api/invoices/export?type=tax → คำขอเดียวกัน ต่างแค่ fullTaxIds และเต็มเฉพาะ finance_officer_platform', async () => {
        const [dtam, platform] = await Promise.all(
            FINANCE.map((role) => request(app).get('/api/invoices/export?type=tax&month=9&year=2026').set('x-test-role', role)),
        );
        expect([dtam.status, platform.status]).toEqual([200, 200]);
        const [dtamArgs, platformArgs] = [dtam, platform].map((res) => JSON.parse(res.text));
        expect({ dtam: dtamArgs.pop(), platform: platformArgs.pop() })
            .toEqual({ dtam: { fullTaxIds: false }, platform: { fullTaxIds: true } });
        expect(dtamArgs).toEqual(platformArgs);
    });
});

// The ภ.พ.30 preview, its CSV and the WHT certificate list carry taxpayer ids too (security
// review of a46baa286, HIGH-1): the same request for both roles, full ids for the company's.
const FULL_TAX_ID_DOORS = [
    ['/api/finance/tax-reports/output-vat?year=2026&month=9', (res) => res.body.data.args[0]],
    ['/api/finance/tax-reports/output-vat?year=2026&month=9&format=csv', (res) => JSON.parse(res.text)[0]],
    ['/api/finance/wht/certificates', (res) => res.body.data.certificates[0].args[0]],
];

describe('ภ.พ.30 และรายการหนังสือรับรองหัก ณ ที่จ่าย: ต่างกันได้ที่เดียวคือเลขผู้เสียภาษีเต็ม ซึ่งเป็นของการเงินบริษัท (order 34)', () => {
    const app = buildApp();

    test.each(FULL_TAX_ID_DOORS)('GET %s → คำขอเดียวกัน ต่างแค่ fullTaxIds และเต็มเฉพาะ finance_officer_platform', async (url, askedFor) => {
        const [dtam, platform] = await Promise.all(FINANCE.map((role) => request(app).get(url).set('x-test-role', role)));
        expect([dtam.status, platform.status]).toEqual([200, 200]);
        const [{ fullTaxIds: dtamFull, ...dtamAsked }, { fullTaxIds: platformFull, ...platformAsked }] = [dtam, platform].map(askedFor);
        expect({ dtam: dtamFull, platform: platformFull }).toEqual({ dtam: false, platform: true });
        expect(dtamAsked).toEqual(platformAsked);
    });
});

// The staff PDF doors of finance documents print the buyer's tax id in full, as the law
// requires of a tax document, so they open to the company finance officer only (order 57,
// order 64 ค6 ก). DTAM finance reads the same
// figures as masked rows on the JSON doors above. All four doors are here, so the role gate
// is covered without a database (security review of 1b554df0c, I2).
const QUOTATION_PAPER_DOOR = '/api/applications/app-1/quotations/PLATFORM/pdf';
const FINANCE_PAPER_DOORS = [
    '/api/invoices/inv-platform/receipt/pdf',
    QUOTATION_PAPER_DOOR,
    '/api/finance/credit-notes/cn-1/pdf',
    '/api/finance/debit-notes/dn-1/pdf',
];

describe('เอกสาร PDF ฝั่งเจ้าหน้าที่: การเงินบริษัทดาวน์โหลดได้ การเงินกรมได้ 403 (ค6 ข้อ ก)', () => {
    const app = buildApp();

    test.each(FINANCE_PAPER_DOORS)('GET %s → finance_officer_platform 200, finance_officer_dtam 403', async (url) => {
        const [dtam, platform] = await Promise.all(FINANCE.map((role) => request(app).get(url).set('x-test-role', role)));
        expect({ dtam: dtam.status, platform: platform.status }).toEqual({ dtam: 403, platform: 200 });
    });
});

describe('บทบาทที่ไม่ใช่การเงินยังถูกปฏิเสธทุกประตูที่แตะ', () => {
    const app = buildApp();
    const cases = [
        ...READ_ENDPOINTS, '/api/invoices/export?type=tax&month=9&year=2026',
        ...FULL_TAX_ID_DOORS.map(([url]) => url), ...FINANCE_PAPER_DOORS,
    ]
        .flatMap((url) => NON_FINANCE.map((role) => [role, url]))
        // The quotation paper is also the payer's own door, behind the payer's ownership check.
        .filter(([role, url]) => !(role === 'health' && url === QUOTATION_PAPER_DOOR));

    test.each(cases)('%s → GET %s ได้ 403', async (role, url) => {
        const res = await request(app).get(url).set('x-test-role', role);
        expect(res.status).toBe(403);
    });
});
