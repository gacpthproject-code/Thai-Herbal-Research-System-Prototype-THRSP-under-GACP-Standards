'use client';

import { formatThaiDate } from '@/lib/format/thai-date';

interface CertificationDecision {
    outcome?: string | null;
    decidedAt?: string | null;
    comment?: string | null;
}

const asObject = (value: unknown): Record<string, unknown> =>
    (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * The approver sent this file back for review (F-A8b-08): the inspector reads the reason
 * on the job sheet, with the day it was sent back. Renders nothing for any other outcome.
 */
export function ApproverReturnPanel({ formData }: { formData: Record<string, unknown> }) {
    const decision = asObject(formData.certificationDecision) as CertificationDecision;
    if (decision.outcome !== 'RETURNED') { return null; }
    const reason = typeof decision.comment === 'string' ? decision.comment.trim() : '';
    return (
        <section
            data-testid="approver-return-panel"
            role="alert"
            className="mb-4 rounded-lg border border-warning/40 bg-amber-50 p-4 text-sm text-amber-900"
        >
            <p className="font-bold">ผู้อนุมัติส่งกลับให้ทบทวน</p>
            <p className="mt-1 text-xs">ส่งกลับเมื่อ {formatThaiDate(decision.decidedAt)}</p>
            <p className="mt-2 whitespace-pre-wrap">{reason || 'ไม่ได้บันทึกเหตุผล'}</p>
        </section>
    );
}
