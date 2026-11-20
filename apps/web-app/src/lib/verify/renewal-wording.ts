import { formatThaiDate } from '@/lib/format/thai-date';

export type RenewalPointer = {
  successorCertificateNumber?: string | null;
  verifyUrl?: string | null;
  successorIssuedDate?: string | null;
  lapsedBeforeRenewal?: boolean | null;
  expiredOn?: string | null;
} | null | undefined;

export function lapsedRenewalSentence(renewal: RenewalPointer): string | null {
  if (renewal?.lapsedBeforeRenewal !== true || !renewal.successorCertificateNumber) return null;
  return `หมดอายุเมื่อ ${formatThaiDate(renewal.expiredOn)} · มีใบรับรองฉบับใหม่ ${renewal.successorCertificateNumber} มีผลตั้งแต่ ${formatThaiDate(renewal.successorIssuedDate)}`;
}
