-- Refunds are paid outside the system (order 20, operator 2026-10-06); finance records the
-- day the money left the company's bank and the bank's reference on the credit note that
-- documents the refund (order 29, operator 2026-10-07). Additive, nullable: no row changes.
ALTER TABLE "credit_notes" ADD COLUMN "refundTransferredOn" DATE;
ALTER TABLE "credit_notes" ADD COLUMN "refundBankReference" TEXT;
ALTER TABLE "credit_notes" ADD COLUMN "refundTransferRecordedBy" TEXT;
ALTER TABLE "credit_notes" ADD COLUMN "refundTransferRecordedAt" TIMESTAMP(3);
