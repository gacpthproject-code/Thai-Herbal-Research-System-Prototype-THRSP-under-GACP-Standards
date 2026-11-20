'use strict';

/**
 * สถานะที่คำขอไปรอทันทีที่ยื่นเข้ามา
 *
 * คำขอใหม่และใบแทน: รอค่าบริการงวดที่ 1 แล้วเข้าด่านตรวจเอกสาร
 *
 * ต่ออายุ (มติ operator 2026-10-06 ข้อ 25(11): การต่ออายุไม่ข้ามการตรวจเอกสาร ตรวจแบบสั้น
 * เฉพาะใบอนุญาต สิทธิในที่ดิน และคำรับรองว่ามีอะไรเปลี่ยน): ไม่มีค่าตรวจเอกสาร ค่าบริการ
 * ต่ออายุก้อนเดียวถูกบันทึกในช่อง M2 (stripe-checkout-service: RENEWAL_MILESTONE) และจ่าย
 * หลังเอกสารผ่าน จึงไปรอที่คิวมอบหมายผู้ตรวจเอกสาร (DOC_FEE_PAID) โดยตรง ตัวเขียนสถานะ
 * ปฏิเสธขา SUBMITTED → DOC_FEE_PAID ของคำขอที่ไม่ใช่การต่ออายุ
 *
 * ค่าเริ่มต้นคือเส้นทางที่ยาวกว่า: คำขอที่ไม่ได้บอกประเภท หรือบอกด้วยคำที่ไม่รู้จัก ถูกปฏิบัติ
 * เป็นขอใหม่ ซึ่งเก็บค่าตรวจเอกสาร
 *
 * @module services/application-service/submission-entry-state
 */

/** ขอใหม่และใบแทน: รอค่าธรรมเนียมงวดที่ 1 แล้วเข้าด่านตรวจเอกสาร */
const NEW_ENTRY_STATE = 'PENDING_DOC_FEE';

/** ต่ออายุ: ไม่มีค่าตรวจเอกสาร เข้าคิวมอบหมายผู้ตรวจเอกสารเลย */
const RENEWAL_ENTRY_STATE = 'DOC_FEE_PAID';

/**
 * @param {object|null} formData  formData ของคำขอ — `requestType` เป็นคีย์ที่เซิร์ฟเวอร์เป็น
 *   เจ้าของ (shared/form-data-ownership) และถูกตัดสินโดย application-law-dimensions ซึ่ง
 *   ตรวจใบรับรองเดิมว่าเป็นของผู้ยื่นจริงและยังมีผล ก่อนจะยอมเรียกคำขอนี้ว่าเป็นการต่ออายุ
 * @returns {'PENDING_DOC_FEE'|'DOC_FEE_PAID'}
 */
function entryStateForSubmission(formData) {
    const requestType = formData && typeof formData === 'object'
        ? String(formData.requestType || '').trim().toUpperCase()
        : '';
    return requestType === 'RENEWAL' ? RENEWAL_ENTRY_STATE : NEW_ENTRY_STATE;
}

module.exports = {
    entryStateForSubmission,
    NEW_ENTRY_STATE,
    RENEWAL_ENTRY_STATE,
};
