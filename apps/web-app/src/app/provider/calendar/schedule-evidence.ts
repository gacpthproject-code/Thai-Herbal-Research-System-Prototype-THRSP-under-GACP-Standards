/**
 * What the booking door says about whether the visit can lead to a certificate.
 *
 * POST /api/provider/scheduler/audits/schedules answers every booking with
 * `canLeadToCertificate` and `evidenceNote` (backend services/audit/arm-onsite-evidence.js).
 * Every booking is on site (order 27), so a "no" now only means the evidence chain could not be
 * armed; the dispatcher is still told rather than finding out at issuance.
 */

export interface ScheduleAnswer {
    canLeadToCertificate?: boolean;
    evidenceNote?: string | null;
}

const NO_EVIDENCE_FALLBACK_TH =
    'ระบบยังไม่ได้เตรียมแบบบันทึกหลักฐานการลงพื้นที่ จึงออกใบรับรองจากการตรวจครั้งนี้ไม่ได้ กรุณาแจ้งผู้ดูแลระบบ';

/**
 * The sentence to keep on screen after a save, or null when the visit can lead to a
 * certificate. The backend's own note wins; the fixed sentence is only the fallback for an
 * answer that says "no" without saying why.
 */
export function evidenceWarningFrom(
    answer: ScheduleAnswer | null | undefined,
    applicationNumber: string,
): string | null {
    if (!answer || answer.canLeadToCertificate !== false) {
        return null;
    }
    const note = typeof answer.evidenceNote === 'string' ? answer.evidenceNote.trim() : '';
    return `คำขอ ${applicationNumber}: ${note || NO_EVIDENCE_FALLBACK_TH}`;
}
