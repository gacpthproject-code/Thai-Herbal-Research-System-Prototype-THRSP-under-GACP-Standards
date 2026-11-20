/**
 * ตรึงชุดบทบาทที่ผ่านด่าน **เขียน** ของทุกประตูเขียนที่ mount จริงใต้ /api/finance
 * และ /api/invoices
 *
 * operator 2026-09-27 (AskUserQuestion): (A) "กรมฯ ดูอย่างเดียว" — finance_officer_dtam เห็น
 * ทุกอย่างที่ finance_officer_platform เห็น แต่ไม่มีอำนาจเขียนบัญชีเลย · บริษัทเป็นผู้ออกเอกสาร
 * รายเดียว (B) "การเงินได้ทั้งสองฝั่ง" (คำขออนุโลม — ไฟล์ waiver-approver-both-finance)
 *
 * ไฟล์นี้กันสองอย่าง:
 *   1. ครอบคลุม — ไล่ stack ของ router ที่ routes/api/index.js mount จริงทุกตัว เก็บทุก route
 *      ที่ไม่ใช่ GET แล้วบังคับว่าต้องมีแถวใน PINNED_WRITES (รอบก่อนพลาดประตูส่งเงินกรม ใบลดหนี้
 *      ใบเพิ่มหนี้ และใบเสนอราคา เพราะรายการเขียนมือ — security review S5)
 *   2. ชุดบทบาท — ยิงแต่ละประตูผ่าน router จริง + ด่านจริงด้วยทุกบทบาทที่เป็นคน · "ถูกปฏิเสธ" =
 *      401/403 · อย่างอื่น (2xx/400/404/409/5xx จาก prisma ปลอม) = ผ่านด่านบทบาทไปแล้ว
 *
 * ของปลอม: การยืนยันตัวตน (หัว x-test-role · authenticateHealth รับเฉพาะ health เหมือนของจริง)
 * และชั้นข้อมูล · ไม่มีชุดบทบาทที่คัดลอกมาเอง
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const providerAuth = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role || role === 'health') { return res.status(401).json({ success: false, error: 'Unauthorized' }); }
        req.user = { id: 'user-1', email: 'u@example.com', role, organizationId: 'org-1' };
        return next();
    };
    const healthAuth = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (role !== 'health') { return res.status(401).json({ success: false, error: 'Unauthorized' }); }
        req.user = { id: 'user-h', role, organizationId: 'org-1', healthId: 'h-1', canonicalId: 'h-1' };
        return next();
    };
    const anyAuth = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role) { return res.status(401).json({ success: false, error: 'Unauthorized' }); }
        req.user = { id: 'user-1', role, organizationId: 'org-1', healthId: role === 'health' ? 'h-1' : null };
        return next();
    };
    return {
        authenticateProvider: providerAuth,
        authenticateHealth: healthAuth,
        authenticate: anyAuth,
        authenticateAny: anyAuth,
    };
});

const mockInvoices = {
    'inv-platform': { id: 'inv-platform', serviceType: 'PHASE_1_PLATFORM_FEE', organizationId: 'org-1', status: 'PAID' },
    'inv-state': { id: 'inv-state', serviceType: 'PHASE_1_STATE_FEE', organizationId: 'org-1', status: 'PAID' },
};
jest.mock('../../services/invoice-service', () => ({
    getById: (id) => Promise.resolve(mockInvoices[id] || null),
}));
jest.mock('../../services/financial-export-service', () => ({ exportCSV: jest.fn() }));
jest.mock('../../services/wht-service', () => {
    const real = jest.requireActual('../../services/wht-service');
    return { ...real, recordWhtCertificate: () => Promise.resolve({ ok: true }) };
});
// refund / credit-note / debit-note = ของจริงทั้งตัว บน prisma ปลอม
jest.mock('../../services/prisma-database', () => {
    const invoice = {
        id: 'INV-1', invoiceNumber: 'INV-1', organizationId: 'org-1', serviceType: 'PHASE_1_PLATFORM_FEE',
        subtotal: 1000, vat: 70, totalAmount: 1070, status: 'PAID', isDeleted: false,
        metadata: {}, application: { status: 'CERTIFIED' },
    };
    const note = { id: 'n-1', status: 'DRAFT', organizationId: 'org-1', originalInvoice: invoice };
    const reject = () => Promise.reject(new Error('stub: no write in this test'));
    return {
        prisma: {
            invoice: { findUnique: () => Promise.resolve(invoice), findFirst: () => Promise.resolve(invoice) },
            creditNote: { create: reject, findUnique: () => Promise.resolve(note), aggregate: () => Promise.resolve({ _sum: {} }) },
            debitNote: { create: reject, findUnique: () => Promise.resolve(note) },
            $transaction: reject,
        },
    };
});
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(null) },
    AuditCategory: new Proxy({}, { get: (_t, k) => String(k) }),
    AuditSeverity: new Proxy({}, { get: (_t, k) => String(k) }),
    ResourceType: new Proxy({}, { get: (_t, k) => String(k) }),
}));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');

const HUMAN_ROLES = Object.values(CANONICAL_ROLES).filter((r) => r !== CANONICAL_ROLES.SYSTEM).sort();

/**
 * router ที่ routes/api/index.js mount ใต้ /finance · /invoices
 * เทียบกับไฟล์ index.js จริงในเทสแรก ⇒ router ใหม่ที่ถูก mount เพิ่มโดยไม่เข้าชุดนี้จะแดง
 */
const MOUNTS = [
    ['/api/invoices', 'routes/api/finance/invoices'],
    ['/api/finance/tax-reports', 'routes/api/finance/tax-reports'],
    ['/api/finance/wht', 'routes/api/finance/wht'],
    ['/api/finance/reports', 'routes/api/finance/reports'],
    ['/api/finance/credit-notes', 'routes/api/finance/credit-notes'],
    ['/api/finance/debit-notes', 'routes/api/finance/debit-notes'],
    ['/api/finance/refunds', 'routes/api/finance/refunds'],
    ['/api/finance', 'routes/api/finance/customer-reports'],
];

function buildApp() {
    const app = express();
    app.use(express.json());
    for (const [mount, mod] of MOUNTS) { app.use(mount, require(`../../${mod}`)); }
    // role-middleware.requireRole throws AuthorizationError — map it the way the real app does.
    app.use((err, _req, res, _next) => {
        if (err && err.name === 'AuthorizationError') { return res.status(403).json({ success: false }); }
        return res.status(500).json({ success: false });
    });
    return app;
}

/** ทุก route ที่ไม่ใช่ GET/HEAD ของ router ที่ mount ไว้ (รวม router ซ้อนที่ mount ที่ '/') */
function mountedWriteRoutes() {
    const out = [];
    const walk = (stack, prefix) => {
        for (const layer of stack) {
            if (layer.route) {
                for (const m of Object.keys(layer.route.methods)) {
                    if (m !== 'get' && m !== 'head' && m !== '_all') { out.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`); }
                }
            } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
                walk(layer.handle.stack, prefix);
            }
        }
    };
    for (const [mount, mod] of MOUNTS) { walk(require(`../../${mod}`).stack, mount); }
    return out.map((r) => r.replace(/\/$/, '')).sort();
}

const D = 'finance_officer_dtam';
const P = 'finance_officer_platform';
const ADMIN = 'system_admin_dtam'; // order 29: reads the company's books, writes none of them

const CN_BODY = { originalInvoiceId: 'INV-1', reasonCode: 'CANCELLATION', reason: 'ยกเลิกบริการ', subtotal: 100, vat: 7 };
const DN_BODY = { originalInvoiceId: 'INV-1', reasonCode: 'CORRECTION', reason: 'แก้ไขยอด', subtotal: 100, vat: 7 };

/**
 * [route template, concrete URL, body, roles that pass the role gate]
 * ห้ามแก้ชุดบทบาทเพื่อให้เทสเขียว — ถ้าแก้ต้องมีคำสั่ง operator · คอมเมนต์ท้ายแถว = base f6c3ea30
 * (operator 2026-10-06: ประตูออกใบเสร็จ/ระงับ/ปลดระงับใบแจ้งหนี้ด้วยมือถูกถอด — ไม่มีคนแตะสถานะการชำระเงิน)
 */
const PINNED_WRITES = [
    ['POST /api/finance/credit-notes', '/api/finance/credit-notes', CN_BODY, [P]], // order 29 · the DTAM admin writes nothing in the company's books (security re-review 2026-10-07 H-1)
    ['POST /api/finance/credit-notes/:id/issue', '/api/finance/credit-notes/n-1/issue', {}, [P]], // order 29 · the DTAM admin writes nothing in the company's books (security re-review 2026-10-07 H-1)
    ['POST /api/finance/credit-notes/:id/post', '/api/finance/credit-notes/n-1/post', {}, [P]], // order 29 · the DTAM admin writes nothing in the company's books (security re-review 2026-10-07 H-1)
    ['POST /api/finance/credit-notes/:id/refund-transfer', '/api/finance/credit-notes/n-1/refund-transfer', { transferredOn: '2026-10-01', bankReference: 'KBANK-123' }, [P]], // order 29 · finance records the refund transfer the company made outside the system
    ['POST /api/finance/credit-notes/:id/cancel', '/api/finance/credit-notes/n-1/cancel', { reason: 'ยกเลิก' }, [P]], // order 29 · the DTAM admin writes nothing in the company's books (security re-review 2026-10-07 H-1)
    ['POST /api/finance/debit-notes', '/api/finance/debit-notes', DN_BODY, [P]], // order 29 · only the company finance officer writes the company's books
    ['POST /api/finance/debit-notes/:id/issue', '/api/finance/debit-notes/n-1/issue', {}, [P]], // order 29 · only the company finance officer writes the company's books
    ['POST /api/finance/debit-notes/:id/post', '/api/finance/debit-notes/n-1/post', {}, [P]], // order 29 · only the company finance officer writes the company's books
    ['POST /api/finance/debit-notes/:id/cancel', '/api/finance/debit-notes/n-1/cancel', { reason: 'ยกเลิก' }, [P]], // order 29 · only the company finance officer writes the company's books
    ['POST /api/finance/refunds/:invoiceId/duplicate-charge', '/api/finance/refunds/inv-platform/duplicate-charge', { amount: 100, idempotencyKey: 'k-1' }, [P]], // order 22 · refunds are company money (security review 2026-10-06 H1)
    ['POST /api/finance/refunds/:invoiceId/provider-cancellation', '/api/finance/refunds/inv-platform/provider-cancellation', { reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทหยุดให้บริการนี้แล้ว' }, [P]], // order 22 · refunds are company money (security review 2026-10-06 H1)
    ['POST /api/finance/wht/certificate', '/api/finance/wht/certificate', {}, [P]], // order 29 · only the company finance officer writes the company's books
];

describe('ครอบคลุม — ทุกประตูเขียนที่ mount จริงมีแถวในตาราง', () => {
    test('MOUNTS ตรงกับ routes/api/index.js (router การเงินใหม่ต้องเข้าชุดนี้)', () => {
        const src = fs.readFileSync(path.join(__dirname, '../../routes/api/index.js'), 'utf8');
        const found = [...src.matchAll(/router\.use\('(\/(?:finance[^']*|invoices))'/g)].map((m) => `/api${m[1]}`);
        expect([...new Set(found)].sort()).toEqual(MOUNTS.map(([m]) => m).sort());
    });

    test('ทุก route ที่ไม่ใช่ GET อยู่ใน PINNED_WRITES และไม่มีแถวที่ชี้ประตูที่ไม่มีอยู่', () => {
        const mounted = [...new Set(mountedWriteRoutes())];
        const pinned = [...new Set(PINNED_WRITES.map(([t]) => t))].sort();
        expect(mounted).toEqual(pinned);
    });
});

describe('ชุดบทบาทที่ผ่านด่านเขียน — กรมฯ ดูอย่างเดียว (operator 2026-09-27)', () => {
    const app = buildApp();

    test.each(PINNED_WRITES)('%s  (%s)', async (template, url, body, expected) => {
        const method = template.split(' ')[0].toLowerCase();
        const admitted = [];
        for (const role of HUMAN_ROLES) {
            const res = await request(app)[method](url).set('x-test-role', role).send(body);
            if (res.status !== 403 && res.status !== 401) { admitted.push(role); }
        }
        expect(admitted.sort()).toEqual([...expected].sort());
    });

    test('ชุดบทบาทเขียนที่ service ส่งออก — ไม่มี finance_officer_dtam', () => {
        for (const svc of ['refund-service', 'credit-note-service', 'debit-note-service']) {
            const { WRITE_ROLES } = require(`../../services/${svc}`);
            expect([svc, WRITE_ROLES.has(D)]).toEqual([svc, false]);
        }
    });

    test('ชุดบทบาทเขียนสมุดบัญชีบริษัท — ไม่มี system_admin_dtam (order 29)', () => {
        for (const svc of ['refund-service', 'credit-note-service', 'debit-note-service']) {
            const { WRITE_ROLES } = require(`../../services/${svc}`);
            expect([svc, WRITE_ROLES.has(ADMIN)]).toEqual([svc, false]);
        }
        const { BOOKS_WRITE_ROLES } = require('../../services/finance/company-books-access');
        expect([...BOOKS_WRITE_ROLES]).toEqual([P]);
    });
});
