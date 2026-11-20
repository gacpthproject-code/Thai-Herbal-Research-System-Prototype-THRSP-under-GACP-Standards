/**
 * The words a citizen reads for a certificate check. One table, so the legend
 * on /verify and the result on /verify/[cert-number] can never use two names
 * for the same answer. Every verdict carries its word in text: colour is a
 * second signal, never the only one.
 */
export type CertificateVerdict =
  | 'VALID'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'NOT_FOUND'
  | 'RENEWED'
  | 'CODE_MISMATCH'
  | 'TAMPERED'
  | 'UNKNOWN';

export type VerdictTone = 'success' | 'warning' | 'danger';

export interface VerdictCopy {
  word: string;
  tone: VerdictTone;
  meaning: string;
}

export const CERTIFICATE_VERDICTS: Readonly<Record<CertificateVerdict, VerdictCopy>> = Object.freeze({
  VALID: { word: 'ใช้ได้', tone: 'success', meaning: 'ใบรับรองยังมีผล ไม่หมดอายุ ไม่ถูกพักใช้หรือเพิกถอน' },
  EXPIRED: { word: 'หมดอายุ', tone: 'warning', meaning: 'เลยวันหมดอายุแล้ว ใช้อ้างอิงไม่ได้' },
  SUSPENDED: { word: 'ถูกพักใช้', tone: 'warning', meaning: 'หน่วยรับรองสั่งพักใช้ชั่วคราว ใช้อ้างอิงไม่ได้จนกว่าจะคืนสถานะ' },
  REVOKED: { word: 'ถูกเพิกถอน', tone: 'danger', meaning: 'หน่วยรับรองยกเลิกใบรับรองแล้ว ใช้อ้างอิงไม่ได้อีก' },
  NOT_FOUND: { word: 'ไม่พบเลขนี้', tone: 'danger', meaning: 'ไม่มีเลขนี้ในทะเบียน ตรวจตัวสะกดอีกครั้ง หรือสอบถามผู้ถือใบรับรอง' },
  RENEWED: { word: 'มีฉบับใหม่แทนแล้ว', tone: 'warning', meaning: 'ใบรับรองฉบับนี้ถูกแทนที่ด้วยฉบับต่ออายุ' },
  CODE_MISMATCH: { word: 'รหัสไม่ตรง', tone: 'danger', meaning: 'รหัสใน QR ไม่ตรงกับใบรับรองในทะเบียน' },
  TAMPERED: { word: 'ข้อมูลไม่ตรงต้นฉบับ', tone: 'danger', meaning: 'ข้อมูลใบรับรองไม่ตรงกับที่ออกไว้' },
  UNKNOWN: { word: 'ใช้อ้างอิงไม่ได้', tone: 'danger', meaning: 'ไม่พบสถานะที่ใช้อ้างอิงได้' },
});

/** The five answers the /verify legend explains, in the order a citizen meets them. */
export const LEGEND_VERDICTS: readonly CertificateVerdict[] = ['VALID', 'EXPIRED', 'SUSPENDED', 'REVOKED', 'NOT_FOUND'];

/** Tailwind classes per tone. Text colours hold at least 4.5:1 on their soft backgrounds. */
export const VERDICT_TONE_CLASSES: Readonly<Record<VerdictTone, { chip: string; panel: string; text: string }>> =
  Object.freeze({
    success: { chip: 'bg-leaf-soft text-leaf-onSoft', panel: 'bg-leaf-soft', text: 'text-leaf-onSoft' },
    warning: { chip: 'bg-amber-100 text-amber-900', panel: 'bg-amber-50', text: 'text-amber-900' },
    danger: { chip: 'bg-red-100 text-red-800', panel: 'bg-red-50', text: 'text-red-700' },
  });

export function isCertificateVerdict(value: unknown): value is CertificateVerdict {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CERTIFICATE_VERDICTS, value);
}

const TRACE_GATE_REASON_VERDICT: Readonly<Record<string, CertificateVerdict>> = Object.freeze({
  certificate_expired: 'EXPIRED',
  certificate_suspended: 'SUSPENDED',
  certificate_revoked: 'REVOKED',
  certificate_renewed: 'RENEWED',
});

/** The trace 410 gate's reason (`certificate_<status>`) as a citizen verdict. */
export function verdictForTraceGateReason(reason: string | null | undefined): CertificateVerdict {
  const key = String(reason ?? '');
  return (Object.prototype.hasOwnProperty.call(TRACE_GATE_REASON_VERDICT, key) ? TRACE_GATE_REASON_VERDICT[key] : undefined) ?? 'UNKNOWN';
}
