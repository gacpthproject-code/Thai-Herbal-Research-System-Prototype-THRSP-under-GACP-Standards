/**
 * ผู้ตรวจพื้นที่เห็นเฉพาะงานตรวจพื้นที่ที่ผู้จัดคิวมอบให้ตัวเอง
 *
 * เดิม (2026-09-05) ผู้จัดคิวมอบงานตรวจเอกสารให้ผู้ตรวจพื้นที่ได้ ตัวกรองจึงเปิดให้ผู้ตรวจพื้นที่เห็นคำขอที่
 * reviewerId เป็นตัวเอง · คำสั่ง 27 (operator 2026-10-06) ให้งานตรวจเอกสารเป็นของผู้ตรวจเอกสารคนเดียว
 * และรายงาน role-workflow-auditor (R-H3) พบว่าการมองเห็นนั้นทำให้ผู้ตรวจพื้นที่ที่ถูกบันทึกเป็นผู้ตรวจเอกสาร
 * ตัดสินผลตรวจพื้นที่ของคำขอนั้นแทนผู้ตรวจที่ถูกมอบได้ · สาขา reviewerId ของผู้ตรวจพื้นที่จึงถูกถอด
 */
'use strict';

const { applicationVisibilityFilter } = require('../../shared/application-visibility');

const auditor = { id: 'auditor-1', canonicalRole: 'field_inspector', organizationId: 'org-1' };
const reviewer = { id: 'reviewer-1', canonicalRole: 'document_reviewer', organizationId: 'org-1' };
/** A row of the caller's own organization (order 17). */
const ownOrg = (row) => ({ organizationId: 'org-1', ...row });

/**
 * ประเมินตัวกรองกับ "แถว" จริง แทนการดูรูปร่างของมัน
 *
 * เวอร์ชันแรกของเทสนี้แผ่ OR/AND ออกมาแล้วถามว่ามีเงื่อนไข `reviewerId` อยู่ไหม — **มันผ่าน
 * ทั้งที่ยังไม่ได้แก้อะไร** เพราะการแผ่ทำให้เงื่อนไขที่ถูกครอบด้วย `AND: [{sameReviewerAuditor:
 * true}, {reviewerId}]` ดูเหมือนเงื่อนไขเดี่ยว · การถามว่า "แถวนี้ผ่านตัวกรองไหม" ตอบคำถามจริง
 * ที่เราสนใจ และโกหกแบบนั้นไม่ได้
 */
function matches(filter, row) {
    if (!filter || typeof filter !== 'object') { return true; }
    if (Array.isArray(filter.OR)) { return filter.OR.some((f) => matches(f, row)); }
    if (Array.isArray(filter.AND)) { return filter.AND.every((f) => matches(f, row)); }
    return Object.entries(filter).every(([k, v]) => {
        if (k === 'OR' || k === 'AND') { return true; }
        if (v && typeof v === 'object' && 'path' in v) { return false; }  // legacy JSON fallback
        return row[k] === v;
    });
}

describe('ผู้ตรวจพื้นที่: เฉพาะงานตรวจพื้นที่ของตัวเอง', () => {
    test('ไม่เห็นคำขอที่ตัวเองถูกบันทึกเป็นผู้ตรวจเอกสาร (ข้อมูลเก่า)', () => {
        const f = applicationVisibilityFilter(auditor);
        expect(matches(f, ownOrg({ reviewerId: 'auditor-1', auditorId: null, headAuditorId: null }))).toBe(false);
        expect(matches(f, ownOrg({ sameReviewerAuditor: true, reviewerId: 'auditor-1', auditorId: null }))).toBe(false);
    });

    test('เห็นงานตรวจพื้นที่ของตัวเอง', () => {
        const f = applicationVisibilityFilter(auditor);
        expect(matches(f, ownOrg({ auditorId: 'auditor-1' }))).toBe(true);
    });

    test('ชื่อในช่องผู้อนุมัติใบรับรอง (headAuditorId) ไม่ใช่ทางเข้าของผู้ตรวจพื้นที่', () => {
        const f = applicationVisibilityFilter(auditor);
        expect(matches(f, ownOrg({ headAuditorId: 'auditor-1', auditorId: null }))).toBe(false);
    });

    test('ไม่เห็นงานของคนอื่น — ทั้งงานตรวจเอกสารและงานตรวจแปลง', () => {
        const f = applicationVisibilityFilter(auditor);
        expect(matches(f, ownOrg({ reviewerId: 'someone-else', auditorId: null, headAuditorId: null, sameReviewerAuditor: false }))).toBe(false);
        expect(matches(f, ownOrg({ auditorId: 'someone-else' }))).toBe(false);
        expect(matches(f, ownOrg({}))).toBe(false);
        expect(matches(f, { organizationId: 'org-2', auditorId: 'auditor-1' })).toBe(false);
    });

    test('ผู้ตรวจแปลงที่ไม่มี id ยังถูกปฏิเสธแบบ fail-closed', () => {
        expect(JSON.stringify(applicationVisibilityFilter({ canonicalRole: 'field_inspector', organizationId: 'org-1' })))
            .toContain('__no_application_scope__');
    });

    test('กฎของผู้ตรวจเอกสารไม่เปลี่ยน', () => {
        const f = applicationVisibilityFilter(reviewer);
        expect(matches(f, ownOrg({ reviewerId: 'reviewer-1' }))).toBe(true);
        expect(matches(f, ownOrg({ reviewerId: 'someone-else' }))).toBe(false);
    });
});
