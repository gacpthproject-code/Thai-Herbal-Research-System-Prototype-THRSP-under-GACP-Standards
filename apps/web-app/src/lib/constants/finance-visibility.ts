/**
 * What a company member without VIEW_FINANCIAL is told where the money would be
 * (operator order 41: amounts, quotations, invoices, receipts and credit notes are shown
 * only to members with that permission; the server refuses the others). Only the holder
 * OWNER grants it per member (ruling 2026-10-08), so the notice names the owner.
 */
export const MONEY_HIDDEN_TH = 'ยอดเงินและเอกสารการเงินของบริษัทแสดงเฉพาะสมาชิกที่ได้รับสิทธิ์ ติดต่อเจ้าของบริษัทเพื่อขอสิทธิ์ดูข้อมูลการเงิน';
