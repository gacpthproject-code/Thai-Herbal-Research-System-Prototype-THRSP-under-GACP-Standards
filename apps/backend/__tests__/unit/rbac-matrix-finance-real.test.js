/**
 * เมทริกซ์ RBAC ฝั่งการเงิน — ยิงโค้ดจริง ไม่ใช่ด่านที่เทสสร้างเอง
 *
 * `rbac-matrix-final.test.js` สร้าง guard สังเคราะห์จาก `admitRoles` ที่ประกาศไว้ใน
 * `__tests__/helpers/rbac-matrix-routes.js` แล้วทดสอบ guard นั้น ⇒ มันพิสูจน์ได้แค่ว่า
 * requireRole ทำงาน ไม่ได้พิสูจน์ว่าประตูจริงมีด่านตามที่ประกาศ · วัดได้จริง 2026-09-27:
 * แถวสร้างใบกำกับภาษีซื้อ (ประตูถูกถอด 2026-10-27 ตามคำสั่ง 59/12) ประกาศ [platform, admin]
 * แต่ประตูจริงบน base f6c3ea30 ไม่มีด่านบทบาทเลย และเมทริกซ์เขียวมาตลอด
 *
 * ไฟล์นี้เอาแถวการเงินประเภท mutation ทุกแถวที่มีประตูอยู่จริง มายิงผ่าน router จริง +
 * ด่านจริง (route middleware · assert ใน service) แล้วเทียบชุดบทบาทที่ผ่านกับ `admitRoles`
 * ที่ประกาศ · แถวที่ประตูไม่มีอยู่แล้ว (สลิป/บัญชีธนาคาร — ปลดระวาง) ต้องอยู่ในรายการ
 * RETIRED ข้างล่างอย่างชัดแจ้ง ไม่ถูกข้ามเงียบ ๆ
 *
 * ของปลอม: การยืนยันตัวตน (หัว x-test-role) + ชั้นข้อมูล (prisma ปลอมที่พอให้ด่านได้ทำงาน)
 * "ผ่าน" = สถานะไม่ใช่ 403 · "ถูกปฏิเสธ" = 403
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
jest.mock('../../services/wht-service', () => {
    const real = jest.requireActual('../../services/wht-service');
    return { ...real, recordWhtCertificate: () => Promise.resolve({ ok: true }) };
});
// refund-service = ของจริงทั้งตัว บน prisma ปลอม
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        invoice: {
            findUnique: ({ where }) => Promise.resolve({
                id: where.id, invoiceNumber: 'INV-1', organizationId: 'org-1', serviceType: 'PHASE_1_PLATFORM_FEE',
                subtotal: 1000, vat: 70, totalAmount: 1070, status: 'PAID', isDeleted: false,
                metadata: {}, application: { status: 'CERTIFIED' },
            }),
        },
    },
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

const { HUMAN_ROLES, ROUTES } = require('../helpers/rbac-matrix-routes');

/** แถวการเงินที่ประตูไม่มีอยู่ในระบบแล้ว — ประกาศชัด ไม่ข้ามเงียบ */
const RETIRED = new Set([
    'finance.slips.approve', // payment-slips ปลดระวาง (สลิป + อนุมัติบัญชีถูกถอด)
    'finance.bank-accounts.create', // ไม่มี router /api/finance/bank-accounts
]);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/finance/refunds', require('../../routes/api/finance/refunds'));
    app.use('/api/finance/wht', require('../../routes/api/finance/wht'));
    return app;
}

const BODIES = {
    'finance.refunds.initiate': { reason: 'คืนเงิน', reasonCode: 'DUPLICATE' },
    'finance.refunds.cancel': { reason: 'x' },
};

const FINANCE_MUTATIONS = ROUTES.filter((r) => r.surface === 'Finance' && r.mutationOrRead === 'mutation');
const LIVE_ROWS = FINANCE_MUTATIONS.filter((r) => !RETIRED.has(r.id));

describe('เมทริกซ์การเงิน (mutation) — ชุดที่ประกาศ = ชุดที่ประตูจริงยอมให้ผ่าน', () => {
    const app = buildApp();

    test('ทุกแถว mutation ของการเงินถูกยิงจริง หรืออยู่ใน RETIRED อย่างชัดแจ้ง', () => {
        const ids = FINANCE_MUTATIONS.map((r) => r.id).sort();
        expect(ids).toEqual([...LIVE_ROWS.map((r) => r.id), ...RETIRED].sort());
        expect(LIVE_ROWS.length).toBeGreaterThan(0);
    });

    test.each(LIVE_ROWS.map((r) => [r.id, r]))('%s', async (_id, route) => {
        const admitted = [];
        for (const role of HUMAN_ROLES) {
            const res = await request(app)[route.method.toLowerCase()](route.path)
                .set('x-test-role', role)
                .send(BODIES[route.id] || {});
            if (res.status !== 403) { admitted.push(role); }
        }
        const declared = [...new Set(route.admitRoles)].filter((r) => HUMAN_ROLES.includes(r));
        expect(admitted.sort()).toEqual(declared.sort());
    });
});
