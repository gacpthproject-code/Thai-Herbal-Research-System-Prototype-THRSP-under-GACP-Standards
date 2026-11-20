'use strict';

/**
 * Privacy notice v1.4 §7 item 4 (operator order 100): the audit log keeps the IP address for
 * security and to prove the records were not altered, for item 4's period, readable only by the
 * roles the code lets through, and not cleared when an account is anonymized. Each test ties one
 * of those claims to the code that makes it true, and reads the sentence off the page.
 */

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', '..');
const PAGE = path.join(BACKEND, '..', 'web-app', 'src', 'app', '(marketing)', 'privacy-policy', 'page.tsx');
const ITEM_4_PREFIX = 'บันทึกการตรวจสอบและบันทึกเหตุการณ์ความปลอดภัยในฐานข้อมูล:';
const REWRITE_ITEM_4 = 'ต้องแก้ข้อ 7 รายการที่ 4 ของหน้านโยบายความเป็นส่วนตัว '
    + '(apps/web-app/src/app/(marketing)/privacy-policy/page.tsx) ในการเปลี่ยนแปลงเดียวกัน';

// Thai role words of apps/web-app/src/lib/role-utils.ts, the words §6 of the page uses.
const THAI_ROLE = Object.freeze({
    health: 'ผู้ยื่นคำขอ',
    document_reviewer: 'ผู้ตรวจเอกสาร',
    field_inspector: 'ผู้ตรวจพื้นที่',
    certificate_approver: 'ผู้อนุมัติใบรับรอง',
    dispatcher: 'ผู้จัดคิว',
    finance_officer_dtam: 'เจ้าหน้าที่การเงินและบัญชีของกรม',
    finance_officer_platform: 'เจ้าหน้าที่การเงินและบัญชีของบริษัท',
    system_admin_dtam: 'ผู้ดูแลระบบ',
    system_admin_platform: 'ผู้ดูแลแพลตฟอร์ม',
});

// Every runtime file that reads audit_logs rows itself, and every file that calls the canonical
// reader. A new one may hand the IP address to a role §7 item 4 does not name.
const AUDIT_LOG_READERS = Object.freeze({
    'middleware/audit-logger.js': 'the writer: previous hash and verifyChain',
    'services/audit-trail.js': 'the canonical reader',
    'services/identity-service.js': 'followsEmergencyReset selects createdAt and counts rows, no ipAddress',
    'services/invoice-service.js': 'maps rows to fields without ipAddress',
});
const AUDIT_TRAIL_CALLERS = Object.freeze({
    'routes/api/admin/audit-log.js': 'returns ipAddress; mounted under requireAdmin',
    'routes/api/provider/handlers/audit-log-viewer-handler.js': 'returns ipAddress; requireRole(ADMIN_ONLY)',
    'routes/api/provider/handlers/workflow-audit-timelines-handler.js': 'TIMELINE_COLUMNS, no ipAddress',
});

function because(reason, check) {
    try {
        check();
    } catch (err) {
        err.message = `${reason}\n\n${err.message}`;
        throw err;
    }
}

function itemFour() {
    const line = fs.readFileSync(PAGE, 'utf8').split('\n').find((l) => l.includes(`'${ITEM_4_PREFIX}`));
    if (!line) {
        throw new Error(`§7 item 4 starting "${ITEM_4_PREFIX}" is no longer on the privacy page`);
    }
    return line;
}

function runtimeSources(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__tests__', 'scripts', 'prisma', 'coverage', 'eslint-rules'].includes(entry.name)
            || entry.name.startsWith('.')) {continue;}
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {runtimeSources(full, out);} else if (/\.(js|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)) {out.push(full);}
    }
    return out;
}

function loadGuards() {
    jest.resetModules();
    jest.doMock('../../services/prisma-database', () => ({ prisma: {} }));
    const { requireAdmin } = require('../../middleware/require-admin');
    const { adminAuditLogList, adminAuditLogCsv } = require('../../routes/api/provider/handlers/audit-log-viewer-handler');
    const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
    return { requireAdmin, providerGuards: [adminAuditLogList[1], adminAuditLogCsv[1]], CANONICAL_ROLES };
}

function passes(guard, role) {
    const req = { user: { id: 'u1', role, canonicalRole: role }, method: 'GET', originalUrl: '/audit-log', path: '/audit-log' };
    const res = { status: () => res, json: () => res };
    let passed = false;
    guard(req, res, (err) => { passed = !err; });
    return passed;
}

describe('privacy notice §7 item 4: the IP address in the audit log', () => {
    test('the IP address is part of what the hash chain seals, so the record proves it was not altered', () => {
        jest.resetModules();
        jest.doMock('../../services/prisma-database', () => ({ prisma: {} }));
        const { auditLogger } = require('../../middleware/audit-logger');
        const row = {
            logId: 'L1', sequenceNumber: 7, category: 'SECURITY', action: 'LOGIN', actorId: 'u1',
            resourceType: 'USER', resourceId: 'u1', timestamp: '2026-10-21T00:00:00.000Z', ipAddress: '203.0.113.7',
        };
        const sealed = auditLogger.generateHash(auditLogger.buildHashPayload(row), 'GENESIS');
        const edited = auditLogger.generateHash(auditLogger.buildHashPayload({ ...row, ipAddress: null }), 'GENESIS');
        because(`ipAddress ไม่ได้อยู่ในข้อมูลที่ hash chain แฮชแล้ว (middleware/audit-logger.js buildHashPayload) ${REWRITE_ITEM_4}`, () => {
            expect(edited).not.toBe(sealed);
            expect(itemFour()).toContain('บันทึกการตรวจสอบเก็บหมายเลขไอพีไว้เพื่อความปลอดภัยและเพื่อพิสูจน์ว่าบันทึกไม่ถูกแก้ไข ตามระยะเวลาเดียวกันนี้');
        });
    });

    test('the page names exactly the roles the audit-log read doors let through', () => {
        const { requireAdmin, providerGuards, CANONICAL_ROLES } = loadGuards();
        const readers = Object.values(CANONICAL_ROLES)
            .filter((role) => passes(requireAdmin, role) || providerGuards.some((guard) => passes(guard, role)));
        because(`บทบาทที่อ่านบันทึกการตรวจสอบพร้อมหมายเลขไอพีได้เปลี่ยนไป (middleware/require-admin.js, routes/api/provider/handlers/audit-log-viewer-handler.js, middleware/role-middleware.js) ${REWRITE_ITEM_4}`, () => {
            expect(readers.every((role) => THAI_ROLE[role])).toBe(true);
            expect(itemFour()).toContain(`ผู้ที่เปิดดูหมายเลขไอพีในบันทึกการตรวจสอบได้มีเฉพาะ${readers.map((role) => THAI_ROLE[role]).join('และ')} `);
        });
    });

    test('the admin audit-log door sits behind the admin guard', () => {
        const admin = fs.readFileSync(path.join(BACKEND, 'routes', 'api', 'admin', 'index.js'), 'utf8');
        expect(admin.indexOf('router.use(requireAdmin)')).toBeGreaterThan(-1);
        expect(admin.indexOf('router.use(requireAdmin)')).toBeLessThan(admin.indexOf("router.use('/audit-log'"));
    });

    test('no other runtime file reads audit_logs, so no other door hands out the IP address', () => {
        const sources = runtimeSources(BACKEND).map((file) => [path.relative(BACKEND, file), fs.readFileSync(file, 'utf8')]);
        const readers = sources
            .filter(([, text]) => /\.auditLog\.(findMany|findFirst|findUnique|count|groupBy|aggregate)\(|FROM\s+"?audit_logs/.test(text))
            .map(([rel]) => rel).sort();
        const callers = sources
            .filter(([rel, text]) => rel !== 'services/audit-trail.js'
                && /\b(listAuditEvents|queryWithFilters|exportAuditEvents|getTimelineForApplication|getPaymentAuditTrail|getAuditStats)\(/.test(text))
            .map(([rel]) => rel).sort();
        because(`มีโค้ดใหม่อ่านตาราง audit_logs ตรวจว่าส่ง ipAddress ให้บทบาทใด แล้วเพิ่มใน AUDIT_LOG_READERS หรือ AUDIT_TRAIL_CALLERS ถ้าบทบาทเปลี่ยน ${REWRITE_ITEM_4}`, () => {
            expect(readers).toEqual(Object.keys(AUDIT_LOG_READERS).sort());
            expect(callers).toEqual(Object.keys(AUDIT_TRAIL_CALLERS).sort());
        });
    });

    test('no runtime code updates or deletes audit_logs rows, so anonymizing an account leaves the IP address', () => {
        const writers = runtimeSources(BACKEND)
            .filter((file) => /\.auditLog\.(update|updateMany|upsert|delete|deleteMany)\(|UPDATE\s+"?audit_logs|DELETE\s+FROM\s+"?audit_logs|TRUNCATE\s+"?audit_logs/i.test(fs.readFileSync(file, 'utf8')))
            .map((file) => path.relative(BACKEND, file));
        because(`มีโค้ดแก้หรือลบแถว audit_logs ${REWRITE_ITEM_4}`, () => {
            expect(writers).toEqual([]);
            expect(itemFour()).toContain('ระบบไม่ลบหมายเลขไอพีออกจากบันทึกการตรวจสอบเมื่อข้อมูลบัญชีถูกทำให้ไม่สามารถระบุตัวบุคคลได้');
        });
    });
});
