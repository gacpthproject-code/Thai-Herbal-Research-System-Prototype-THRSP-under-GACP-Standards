/**
 * Why an admin closed an application the applicant cannot fix (operator orders 29 and 35,
 * 2026-10-07). The application closes as ยกเลิก (CANCELLED), never as a rejection.
 * Mirrors apps/backend/shared/application-closure-reasons.js, pinned by
 * apps/backend/__tests__/unit/frontend-closure-reasons-mirror.test.js.
 */

export const APPLICATION_CLOSURE_REASONS = {
  HOLDER_NOT_ELIGIBLE: 'ผู้ขอรับรองไม่อยู่ในประเภทที่ขอรับรองพืชชนิดนี้ได้ และแก้ไขในคำขอเดิมไม่ได้',
  HERB_NOT_IN_SCOPE: 'ชนิดพืชสมุนไพรที่ขอยังไม่อยู่ในขอบข่ายการรับรอง',
  PURPOSE_NOT_IN_SCOPE: 'วัตถุประสงค์ที่ระบุในคำขอไม่อยู่ในขอบข่ายการรับรองแล้ว',
  LICENCE_REVOKED: 'ใบอนุญาตที่ใช้ยื่นคำขอถูกเพิกถอนหรือสิ้นผล',
  HOLDER_DISSOLVED: 'นิติบุคคลผู้ขอรับรองเลิกกิจการหรือสิ้นสภาพ',
  DUPLICATE_APPLICATION: 'คำขอนี้ซ้ำกับคำขออื่นของผู้ขอรับรองรายเดียวกัน',
  AUTHORITY_ORDER: 'มีคำสั่งศาลหรือคำสั่งของหน่วยงานรัฐให้ยุติการพิจารณาคำขอ',
} as const;

export type ApplicationClosureReason = keyof typeof APPLICATION_CLOSURE_REASONS;
