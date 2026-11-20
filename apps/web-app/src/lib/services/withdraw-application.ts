/**
 * ถอนคำขอ: POST /applications/:id/withdraw { reason } (standing order 32).
 *
 * Allowed only before document review starts. The application becomes CANCELLED and fees
 * already paid are not refunded (payment terms §7.1 (ก)). The server is the gate; the
 * status list here only decides whether the button is offered.
 */
import { apiClient } from '@/lib/api/api-client';

const WITHDRAWABLE_STATUSES: ReadonlySet<string> = new Set(['PENDING_DOC_FEE', 'DOC_FEE_PAID']);

export const WITHDRAW_REASON_MIN_LENGTH = 5;

export function canWithdraw(status: string | null | undefined): boolean {
    return WITHDRAWABLE_STATUSES.has(String(status ?? '').toUpperCase());
}

const WITHDRAW_REFUSAL_TH: Readonly<Record<string, string>> = Object.freeze({
    WITHDRAW_REASON_REQUIRED: `ระบุเหตุผลที่ถอนคำขออย่างน้อย ${WITHDRAW_REASON_MIN_LENGTH} ตัวอักษร แล้วกดยืนยันอีกครั้ง`,
    WITHDRAW_NOT_ALLOWED: 'ถอนคำขอนี้ไม่ได้แล้ว เพราะเจ้าหน้าที่เริ่มตรวจเอกสารหรือคำขอเปลี่ยนสถานะไปแล้ว โหลดหน้านี้ใหม่เพื่อดูสถานะล่าสุด',
    ENTITY_PERMISSION_DENIED: 'บัญชีของคุณไม่มีสิทธิ์ถอนคำขอในนามผู้ถือรายนี้ ติดต่อผู้ดูแลของผู้ถือใบรับรอง',
});

const WITHDRAW_FAILED_TH = 'ถอนคำขอไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง';

export function withdrawRefusalTh(code: string | null | undefined): string {
    return (code && WITHDRAW_REFUSAL_TH[code]) || WITHDRAW_FAILED_TH;
}

export type WithdrawOutcome = { ok: true } | { ok: false; message: string };

export async function withdrawApplication(applicationId: string, reason: string): Promise<WithdrawOutcome> {
    try {
        const response = await apiClient.post<{ id: string; status: string }>(
            `/applications/${applicationId}/withdraw`,
            { reason: reason.trim() },
        );
        if (response.success) { return { ok: true }; }
        const code = [response.errorCode, response.code, response.error]
            .find((candidate) => candidate && WITHDRAW_REFUSAL_TH[candidate]);
        return { ok: false, message: withdrawRefusalTh(code) };
    } catch {
        return { ok: false, message: WITHDRAW_FAILED_TH };
    }
}
