/**
 * ต่ออายุไม่ข้ามการตรวจเอกสาร (มติ operator 2026-10-06 ข้อ 25(11)) — แทนมติ 2026-09-07 ที่ให้
 * ต่ออายุไปรอค่าตรวจพื้นที่โดยตรง · ต่ออายุไม่มีค่าตรวจเอกสาร จึงเข้าคิวมอบหมายผู้ตรวจเอกสารเลย
 * ส่วนค่าบริการต่ออายุก้อนเดียวยังบันทึกใน M2 และจ่ายหลังเอกสารผ่าน
 *
 * เส้นทางเต็มบน Postgres จริง: renewal-takes-the-short-document-check-real-postgres.test.js
 */
'use strict';

const { entryStateForSubmission, RENEWAL_ENTRY_STATE, NEW_ENTRY_STATE } =
    require('../../services/application-service/submission-entry-state');

describe('คำขอที่ยื่นเข้ามา หยุดที่ด่านที่ถูกต้องของตัวเอง', () => {
    it('ขอใหม่ → รอค่าตรวจเอกสาร (งวดที่ 1)', () => {
        expect(entryStateForSubmission({ requestType: 'NEW' })).toBe(NEW_ENTRY_STATE);
        expect(NEW_ENTRY_STATE).toBe('PENDING_DOC_FEE');
    });

    it('ต่ออายุ → คิวตรวจเอกสาร (ไม่มีค่าตรวจเอกสาร)', () => {
        expect(entryStateForSubmission({ requestType: 'RENEWAL' })).toBe(RENEWAL_ENTRY_STATE);
        expect(RENEWAL_ENTRY_STATE).toBe('DOC_FEE_PAID');
    });

    it('ใบแทนยังเดินเส้นเดิม', () => {
        expect(entryStateForSubmission({ requestType: 'REPLACEMENT' })).toBe(NEW_ENTRY_STATE);
    });

    it('คำขอที่ไม่บอกประเภท ถือเป็นขอใหม่ — เส้นทางที่ยาวกว่า ไม่ใช่สั้นกว่า', () => {
        expect(entryStateForSubmission({})).toBe(NEW_ENTRY_STATE);
        expect(entryStateForSubmission(null)).toBe(NEW_ENTRY_STATE);
        expect(entryStateForSubmission({ requestType: 'อะไรก็ไม่รู้' })).toBe(NEW_ENTRY_STATE);
    });
});

describe('เส้นทางหลังเอกสารผ่าน', () => {
    it('งวดเดียวของการต่ออายุถูกบันทึกใน M2 ซึ่งจ่ายได้หลังเอกสารผ่าน ไม่ใช่ตอนเข้าคิว', () => {
        const { PAYABLE_STATES } = require('../../services/checkout/stripe-checkout-service');
        expect(PAYABLE_STATES.M2).toContain('PENDING_AUDIT_FEE');
        expect(PAYABLE_STATES.M2).not.toContain(RENEWAL_ENTRY_STATE);
        expect(PAYABLE_STATES.M1).not.toContain(RENEWAL_ENTRY_STATE);
    });
});
