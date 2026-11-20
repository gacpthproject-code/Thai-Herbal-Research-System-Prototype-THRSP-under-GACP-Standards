'use strict';

/**
 * เหตุที่ผู้อนุมัติใบรับรองเลือกได้ (คำสั่ง 29 และ 34(4), operator 2026-10-07)
 *
 * รายการตายตัว ข้อความในวงเล็บคือสิ่งที่ผู้ยื่นและผู้ถือเห็นในแจ้งเตือน และสิ่งที่พิมพ์ลง
 * revokedReason / suspendedReason ของใบรับรอง · บันทึกเพิ่มเติมของเจ้าหน้าที่เป็นข้อมูลภายใน
 * อยู่ในบันทึกตรวจสอบเท่านั้น
 *
 * operator อนุมัติถ้อยคำ 2026-10-08 และสั่งเพิ่ม "อื่น ๆ (โปรดระบุ)" (OTHER) ทั้งสามรายการ ·
 * เลือก OTHER ต้องพิมพ์เหตุผล ข้อความที่พิมพ์คือเหตุที่ผู้ยื่นและผู้ถือเห็นตรงที่ข้อความของ
 * รายการตายตัวเคยอยู่ · หน้าเว็บอ่านรายการจากเซิร์ฟเวอร์ (แฟ้มตัดสิน / รายการใบรับรองของ
 * ผู้อนุมัติ) จึงไม่มีสำเนาฝั่งเว็บ
 */

const OTHER_REASON_CODE = 'OTHER';
const OTHER_REASON_LABEL = 'อื่น ๆ (โปรดระบุ)';
const OTHER_REASON_TEXT_MIN = 10;
const OTHER_REASON_TEXT_MAX = 500;

/** ไม่ให้การรับรอง — คำขอปิดเป็น REJECTED */
const CERTIFICATION_REFUSAL_REASONS = Object.freeze({
    CRITICAL_NONCONFORMITY: 'พบข้อบกพร่องร้ายแรงที่ขัดต่อมาตรฐาน GACP และแก้ไขให้เป็นไปตามมาตรฐานไม่ได้',
    FALSE_INFORMATION: 'ข้อมูลหรือเอกสารที่ยื่นไม่ตรงกับความจริง',
    LICENCE_NOT_VALID: 'ใบอนุญาตที่ใช้ประกอบคำขอไม่มีผลใช้บังคับ',
    SITE_NOT_ELIGIBLE: 'สถานที่ปลูกไม่เป็นไปตามเงื่อนไขของมาตรฐาน GACP',
    SCOPE_NOT_SUPPORTED: 'ผลการตรวจประเมินไม่สนับสนุนขอบข่ายที่ขอรับรอง',
    [OTHER_REASON_CODE]: OTHER_REASON_LABEL,
});

/** พักใช้ใบรับรอง — ชั่วคราว คืนสภาพได้ */
const CERTIFICATE_SUSPENSION_REASONS = Object.freeze({
    NONCONFORMITY_FOUND: 'ตรวจติดตามพบข้อบกพร่องที่ต้องแก้ไขก่อนใช้ใบรับรองต่อ',
    LICENCE_LAPSED: 'ใบอนุญาตที่ใช้ประกอบการรับรองหมดอายุหรือถูกพักใช้',
    MISUSE_OF_CERTIFICATE: 'ใช้ใบรับรองหรือเครื่องหมายรับรองไม่ถูกต้อง',
    SURVEILLANCE_REFUSED: 'ผู้ถือใบรับรองไม่ให้เจ้าหน้าที่เข้าตรวจติดตาม',
    COMPLAINT_UNDER_INVESTIGATION: 'อยู่ระหว่างตรวจสอบข้อร้องเรียนที่เกี่ยวกับผลผลิตหรือสถานที่ปลูก',
    HOLDER_REQUEST: 'ผู้ถือใบรับรองขอพักใช้',
    [OTHER_REASON_CODE]: OTHER_REASON_LABEL,
});

/** เพิกถอนใบรับรอง — ถาวร */
const CERTIFICATE_REVOCATION_REASONS = Object.freeze({
    FALSE_INFORMATION: 'ข้อมูลหรือเอกสารที่ใช้ขอรับรองเป็นเท็จ',
    NONCONFORMITY_NOT_CORRECTED: 'ไม่แก้ไขข้อบกพร่องภายในกำหนดหลังถูกพักใช้',
    LICENCE_REVOKED: 'ใบอนุญาตที่ใช้ประกอบการรับรองถูกเพิกถอนหรือสิ้นสุด',
    SERIOUS_MISUSE: 'ใช้ใบรับรองหรือเครื่องหมายรับรองโดยมิชอบอย่างร้ายแรง',
    OPERATION_CEASED: 'ผู้ถือเลิกปลูกหรือเลิกกิจการในสถานที่ที่ได้รับการรับรอง',
    HOLDER_REQUEST: 'ผู้ถือใบรับรองขอยกเลิกใบรับรอง',
    ISSUED_IN_ERROR: 'ออกใบรับรองโดยผิดพลาด',
    [OTHER_REASON_CODE]: OTHER_REASON_LABEL,
});

/** @param {Record<string,string>} reasons @returns {{code:string,label:string}[]} */
function reasonOptions(reasons) {
    return Object.entries(reasons).map(([code, label]) => ({ code, label }));
}

/** @param {Record<string,string>} reasons @param {unknown} code */
function labelOf(reasons, code) {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(reasons, code) ? reasons[code] : null;
}

/**
 * The reason the approver states, as the applicant and holder will read it.
 *
 * @param {Record<string,string>} reasons
 * @param {unknown} code
 * @param {unknown} otherText the approver's own words, read only under OTHER
 * @returns {{ code: string, label: string, text: string|null } | { refused: 'UNKNOWN_CODE' | 'OTHER_TEXT_REQUIRED' }}
 *   `label` is what every applicant-facing surface prints: the fixed label, or the typed text
 *   under OTHER. `text` is the typed text to store beside the code (null for a fixed code).
 */
function statedReason(reasons, code, otherText) {
    const fixed = labelOf(reasons, code);
    if (!fixed) { return { refused: 'UNKNOWN_CODE' }; }
    if (code !== OTHER_REASON_CODE) { return { code, label: fixed, text: null }; }
    const text = typeof otherText === 'string' ? otherText.trim() : '';
    if (text.length < OTHER_REASON_TEXT_MIN || text.length > OTHER_REASON_TEXT_MAX) {
        return { refused: 'OTHER_TEXT_REQUIRED' };
    }
    return { code, label: text, text };
}

/**
 * The label a stored { reasonCode, reasonText } prints, or null.
 * @param {Record<string,string>} reasons @param {{ reasonCode?: unknown, reasonText?: unknown }} record
 */
function recordedReasonLabel(reasons, record) {
    if (record?.reasonCode === OTHER_REASON_CODE) {
        return typeof record.reasonText === 'string' && record.reasonText ? record.reasonText : null;
    }
    return labelOf(reasons, record?.reasonCode);
}

module.exports = {
    CERTIFICATION_REFUSAL_REASONS,
    CERTIFICATE_SUSPENSION_REASONS,
    CERTIFICATE_REVOCATION_REASONS,
    OTHER_REASON_CODE,
    OTHER_REASON_LABEL,
    OTHER_REASON_TEXT_MIN,
    OTHER_REASON_TEXT_MAX,
    reasonOptions,
    labelOf,
    statedReason,
    recordedReasonLabel,
};
