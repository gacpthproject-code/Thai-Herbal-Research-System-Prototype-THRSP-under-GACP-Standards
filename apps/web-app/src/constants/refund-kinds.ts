/**
 * The two refunds finance may record (order 22, operator 2026-10-06; payment
 * terms v1.3 §7). The company returns the money outside the system; recording
 * it here issues the credit note. Mirrors apps/backend/shared/refund-kinds.js,
 * pinned by apps/backend/__tests__/unit/frontend-refund-kinds-mirror.test.js.
 */

import type { PaymentMilestone } from '@/lib/services/payment-service';

export type RefundKind = 'DUPLICATE' | 'PROVIDER_CANCELLED';

export const PROVIDER_CANCELLATION_REASONS = {
  DEPARTMENT_STOPPED_CERTIFYING: 'กรมการแพทย์แผนไทยและการแพทย์ทางเลือก หรือหน่วยงานของรัฐที่มีอำนาจ ยุติหรือระงับการรับรอง GACP สำหรับชนิดพืชสมุนไพรหรือรูปแบบการปลูกที่ขอรับรอง',
  BARRED_BY_LAW_OR_ORDER: 'มีกฎหมาย ระเบียบ ประกาศ หรือคำสั่งของหน่วยงานของรัฐ ที่ห้ามหรือทำให้บริษัทไม่อาจให้บริการตามคำขอต่อได้',
  COMPANY_STOPPED_SERVICE: 'บริษัทยุติการให้บริการ ทั้งหมด หรือเฉพาะชนิดพืชสมุนไพรหรือรูปแบบการปลูกที่ขอรับรอง',
  COMPANY_CANNOT_INSPECT: 'บริษัทไม่สามารถตรวจประเมินแปลงได้ภายใน 60 วันทำการ นับจากวันที่ชำระเงินงวดที่ 2 ด้วยเหตุฝ่ายบริษัท เช่น ไม่มีผู้ตรวจที่จะไปตรวจได้',
} as const;

export type ProviderCancellationReason = keyof typeof PROVIDER_CANCELLATION_REASONS;

/** The milestones each reason may cancel: reason (ง) is about the field inspection, which M2 pays for. */
export const PROVIDER_CANCELLATION_REASON_MILESTONES: Readonly<Record<ProviderCancellationReason, readonly PaymentMilestone[]>> = {
  DEPARTMENT_STOPPED_CERTIFYING: ['M1', 'M2'],
  BARRED_BY_LAW_OR_ORDER: ['M1', 'M2'],
  COMPANY_STOPPED_SERVICE: ['M1', 'M2'],
  COMPANY_CANNOT_INSPECT: ['M2'],
};

/** The shortest note the backend accepts (refund-service NOTE_MIN_LENGTH). */
export const CANCELLATION_NOTE_MIN_LENGTH = 10;

/** Payment terms v1.3 §7.4: the company transfers a refund within this many working days. */
export const REFUND_TRANSFER_WORKING_DAYS = 15;
