/**
 * fix round 1 (2026-09-27) — เรื่องเล็กที่ review ชี้ แต่ละข้อวัดกับโค้ดจริง
 *
 *   L1  403 ของประตูการเงินคืนแค่รหัส ไม่พิมพ์รายชื่อบทบาทที่ผ่านได้ / บทบาทของผู้เรียก
 *   L2  5xx ไม่คืน err.message ดิบ (ข้อความจากชั้นฐานข้อมูลอาจมีรายละเอียดภายใน)
 *   L5  การเงินกรมไม่ถือสิทธิ์เขียนที่ไม่มีประตูใช้ (บัญชีธนาคาร / รีวิวสลิป) · S6 ผู้ตรวจประเมิน
 *       ไม่ถือสิทธิ์อ่านสลิปการเงิน
 *   L7  getSummary จำกัดองค์กรจากผู้ดู (organizationScope) เสมอ ไม่พึ่งธง TENANT_READ_ORG_SCOPE
 *       และปฏิเสธผู้ดูที่ไม่มีองค์กร (order 17 — แทน predicate เดิมที่ผูกกับ tenant-prisma-extension)
 *   E3  ลบพารามิเตอร์ "ฝั่ง" ที่ไม่มีผู้เรียกแล้ว (ผนังอ่านที่ถูกรื้อ) ทั้งหลังบ้านและเว็บ
 *   —   ชุดบทบาทฝั่งเว็บมาจากที่เดียวและตรงกับหลังบ้าน
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const auth = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role) { return res.status(401).json({ success: false }); }
        req.user = { id: 'user-1', role, organizationId: 'org-1' };
        return next();
    };
    return { authenticateProvider: auth, authenticateHealth: auth, authenticate: auth, authenticateAny: auth };
});
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});
const RAW = 'relation "credit_notes" does not exist at host db-internal-7';
jest.mock('../../services/prisma-database', () => {
    const boom = () => Promise.reject(new Error('relation "credit_notes" does not exist at host db-internal-7'));
    return {
        prisma: {
            invoice: { update: boom, findMany: boom, findUnique: boom, findFirst: boom, aggregate: boom, count: boom },
            creditNote: { create: boom, findMany: boom, findUnique: boom, findFirst: boom, count: boom, update: boom },
            debitNote: { create: boom, findMany: boom, findUnique: boom, findFirst: boom, count: boom, update: boom },
        },
    };
});

const REPO = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/finance/wht', require('../../routes/api/finance/wht'));
    a.use('/api/finance/refunds', require('../../routes/api/finance/refunds'));
    a.use('/api/finance/credit-notes', require('../../routes/api/finance/credit-notes'));
    a.use('/api/finance/debit-notes', require('../../routes/api/finance/debit-notes'));
    return a;
}

describe('L1 — 403 คืนรหัส ไม่คืนรายชื่อบทบาท', () => {
    test.each([
        ['get', '/api/finance/credit-notes'],
    ])('%s %s โดย document_reviewer', async (method, url) => {
        const res = await request(app())[method](url).set('x-test-role', 'document_reviewer').send({});
        expect(res.status).toBe(403);
        expect(res.body.code || res.body.error).toBeTruthy();
        const text = JSON.stringify(res.body);
        for (const role of ['system_admin_dtam', 'finance_officer_platform', 'finance_officer_dtam', 'document_reviewer']) {
            expect([role, text.includes(role)]).toEqual([role, false]);
        }
    });
});

describe('L2 — 5xx ไม่คืนข้อความดิบจากชั้นข้อมูล', () => {
    test.each([
        ['get', '/api/finance/wht/certificates'],
        ['get', '/api/finance/refunds/inv-1/status'],
        // fix round 2 N2 — CN/DN routers kept their own sendServiceError
        ['get', '/api/finance/credit-notes'],
        ['get', '/api/finance/credit-notes/n-1'],
        ['get', '/api/finance/debit-notes'],
        ['get', '/api/finance/debit-notes/n-1'],
    ])('%s %s', async (method, url) => {
        const res = await request(app())[method](url).set('x-test-role', 'finance_officer_platform');
        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(JSON.stringify(res.body)).not.toContain(RAW);
        expect(JSON.stringify(res.body)).not.toContain('db-internal-7');
    });
});

describe('L5 + S6 — สิทธิ์ที่ไม่ควรถือ', () => {
    const { hasPermission, PERMISSIONS, CANONICAL_ROLES } = require('../../shared/canonical-rbac');
    test('field_inspector ไม่ถือสิทธิ์อ่านเรื่องเงิน (operator 2026-09-27 S6)', () => {
        for (const perm of [PERMISSIONS.INVOICE_VIEW_ALL, PERMISSIONS.ACCOUNTING_DASHBOARD_READ]) {
            expect(hasPermission(CANONICAL_ROLES.FIELD_INSPECTOR, perm)).toBe(false);
        }
    });
});

describe('L7 — getSummary จำกัดองค์กรจากผู้ดูเสมอ (order 17)', () => {
    test('invoice-service ไม่อ่านธง TENANT_READ_ORG_SCOPE / orgReadScopeEnabled — ขอบเขตมาจาก organizationScope(viewer)', () => {
        const src = read('apps/backend/services/invoice-service.js');
        expect(src).not.toMatch(/TENANT_READ_ORG_SCOPE\s*===\s*'true'/);
        expect(src).not.toMatch(/orgReadScopeEnabled|getTenantContext/);
    });
    test('ผู้ดูที่ไม่มีองค์กรถูกปฏิเสธ FORBIDDEN_TENANT ก่อนแตะชั้นข้อมูล', async () => {
        const invoiceService = require('../../services/invoice-service');
        for (const role of ['finance_officer_platform', 'finance_officer_dtam', 'system_admin_dtam']) {
            await expect(invoiceService.getSummary({ viewer: { id: 'u-1', role, organizationId: null } }))
                .rejects.toMatchObject({ code: 'FORBIDDEN_TENANT', statusCode: 403 });
        }
    });
});

describe('E3 — พารามิเตอร์ "ฝั่ง" ที่ไม่มีผู้เรียกถูกลบ', () => {
    test('getSummary รับอ็อบเจ็กต์ { viewer, now } ตัวเดียว · getRevenueSummary (ผนัง A/B เดิม) ถูกถอด', () => {
        const invoiceService = require('../../services/invoice-service');
        expect(invoiceService.getSummary.length).toBe(0);
        expect(invoiceService.getRevenueSummary).toBeUndefined();
    });
    test('services/invoice/invoice-finance-ops.js ถูกลบ', () => {
        expect(fs.existsSync(path.join(REPO, 'apps/backend/services/invoice/invoice-finance-ops.js'))).toBe(false);
    });
    test.each([
        'apps/backend/services/invoice-service.js',
        'apps/backend/services/finance/invoice-side.js',
    ])('%s ไม่มี sideWhere / invoiceSideWhere', (rel) => {
        expect(read(rel)).not.toMatch(/sideWhere|invoiceSideWhere/);
    });
    test('routes/api/index.js ไม่มีคอมเมนต์ที่บอกว่าการเงินกรมถูกปฏิเสธ', () => {
        const src = read('apps/backend/routes/api/index.js');
        expect(src).not.toMatch(/ACCOUNT_DTAM is denied|DTAM books live in/);
    });
    test('เว็บ payment-service.ts ไม่มี InvoiceSide / classifyInvoiceSide ที่ไม่มีผู้ใช้', () => {
        const src = read('apps/web-app/src/lib/services/payment-service.ts');
        expect(src).not.toMatch(/classifyInvoiceSide|export type InvoiceSide/);
    });
});

describe('ชุดบทบาทฝั่งเว็บมาจากที่เดียวและตรงกับหลังบ้าน', () => {
    const src = read('apps/web-app/src/lib/constants/canonical-roles.ts');
    const { CANONICAL_ROLES, hasPermission, PERMISSIONS } = require('../../shared/canonical-rbac');
    const KEY = Object.fromEntries(Object.entries(CANONICAL_ROLES).map(([k, v]) => [k, v]));
    function webSet(name) {
        const m = src.match(new RegExp(`export const ${name}[^=]*= new Set<CanonicalRole>\\(\\[([\\s\\S]*?)\\]\\)`));
        expect([name, Boolean(m)]).toEqual([name, true]);
        return [...m[1].matchAll(/CANONICAL_ROLES\.(\w+)/g)].map((x) => KEY[x[1]]).sort();
    }
    const human = Object.values(CANONICAL_ROLES).filter((r) => r !== 'system');

    test('ACCOUNTING_READ_ROLES = ชุดอ่านของหลังบ้าน และชุดอ่านทุก service ตรงกัน', () => {
        const base = [...require('../../services/credit-note-service').READ_ROLES].sort();
        for (const svc of ['refund-service', 'debit-note-service']) {
            expect([svc, [...require(`../../services/${svc}`).READ_ROLES].sort()]).toEqual([svc, base]);
        }
        expect(webSet('ACCOUNTING_READ_ROLES')).toEqual(base);
    });
    test('ACCOUNTING_WRITE_ROLES = credit-note-service WRITE_ROLES', () => {
        expect(webSet('ACCOUNTING_WRITE_ROLES')).toEqual([...require('../../services/credit-note-service').WRITE_ROLES].sort());
    });
    test('wht/client-view.tsx ไม่มีชุดบทบาทของตัวเอง', () => {
        const wht = read('apps/web-app/src/app/provider/accounting/wht/client-view.tsx');
        expect(wht).not.toMatch(/const READ_ROLES|const WRITE_ROLES/);
    });
});
