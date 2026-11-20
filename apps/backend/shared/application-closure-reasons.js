'use strict';

/**
 * Why an admin closed an application the applicant cannot fix (operator orders 29 and 35,
 * 2026-10-07). Closed list: the admin picks one; a free-text note stays in the internal
 * audit record only. The application closes as CANCELLED, never REJECTED: REJECTED is the
 * field inspector's or the certificate approver's decision (shared/decision-states.js).
 * The application's closedReason is CANCELLED_BY_ADMIN; this code is on formData.adminClosure.
 * apps/web-app/src/constants/application-closure-reasons.ts mirrors it.
 */
const APPLICATION_CLOSURE_REASONS = Object.freeze({
    HOLDER_NOT_ELIGIBLE: 'ผู้ขอรับรองไม่อยู่ในประเภทที่ขอรับรองพืชชนิดนี้ได้ และแก้ไขในคำขอเดิมไม่ได้',
    HERB_NOT_IN_SCOPE: 'ชนิดพืชสมุนไพรที่ขอยังไม่อยู่ในขอบข่ายการรับรอง',
    PURPOSE_NOT_IN_SCOPE: 'วัตถุประสงค์ที่ระบุในคำขอไม่อยู่ในขอบข่ายการรับรองแล้ว',
    LICENCE_REVOKED: 'ใบอนุญาตที่ใช้ยื่นคำขอถูกเพิกถอนหรือสิ้นผล',
    HOLDER_DISSOLVED: 'นิติบุคคลผู้ขอรับรองเลิกกิจการหรือสิ้นสภาพ',
    DUPLICATE_APPLICATION: 'คำขอนี้ซ้ำกับคำขออื่นของผู้ขอรับรองรายเดียวกัน',
    AUTHORITY_ORDER: 'มีคำสั่งศาลหรือคำสั่งของหน่วยงานรัฐให้ยุติการพิจารณาคำขอ',
});

const APPLICATION_CLOSURE_NEXT_STEPS = Object.freeze({
    PURPOSE_NOT_IN_SCOPE: 'หากยังต้องการขอใบรับรอง ผู้ที่มีสิทธิ์ยื่นคำขอในนามผู้ขอรับรองยื่นคำขอใหม่ได้ โดยเลือกวัตถุประสงค์ที่ยังอยู่ในขอบข่ายการรับรอง และแนบใบอนุญาตที่วัตถุประสงค์นั้นกำหนด',
});

function isApplicationClosureReason(code) {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(APPLICATION_CLOSURE_REASONS, code);
}

module.exports = { APPLICATION_CLOSURE_REASONS, APPLICATION_CLOSURE_NEXT_STEPS, isApplicationClosureReason };
