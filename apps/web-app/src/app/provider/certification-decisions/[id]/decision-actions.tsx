'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClipboardList, Undo2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/primitives/button';
import { notifications } from '@/lib/notifications';
import { providerApiPaths } from '@/lib/services/provider-api';
import { formatThaiDate } from '@/lib/format/thai-date';
import { PROVIDERRequest } from '../../audits/auditor-types';
import { ReasonDialog, type ReasonDialogSubmit } from '../reason-dialog';
import { CorrectionDialog, type CorrectionDialogSubmit } from '../correction-dialog';
import type { DecisionAction, DecisionFile } from './decision-file-types';

const OUTCOME_TH: Record<string, string> = {
    APPROVED: 'อนุมัติให้การรับรองแล้ว',
    REFUSED: 'ไม่ให้การรับรอง',
    RETURNED: 'ส่งกลับให้ผู้ตรวจพื้นที่ทบทวน',
    CORRECTION_REQUESTED: 'ส่งกลับให้ผู้ยื่นแก้ไขข้อบกพร่อง',
};

const ACTION_BUTTON: Record<DecisionAction, { label: string; variant: 'primary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    APPROVE: { label: 'อนุมัติให้การรับรอง', variant: 'primary', icon: <CheckCircle2 size={16} aria-hidden="true" /> },
    REFUSE: { label: 'ไม่ให้การรับรอง', variant: 'destructive', icon: <XCircle size={16} aria-hidden="true" /> },
    RETURN: { label: 'ส่งกลับให้ผู้ตรวจพื้นที่ทบทวน', variant: 'outline', icon: <Undo2 size={16} aria-hidden="true" /> },
    REQUEST_CORRECTION: { label: 'ส่งกลับให้แก้ไขข้อบกพร่อง', variant: 'outline', icon: <ClipboardList size={16} aria-hidden="true" /> },
};

/**
 * ปุ่มตัดสินของผู้อนุมัติ อยู่ในแฟ้มคำขอเท่านั้น (คำสั่ง 29): การเปิดแฟ้มนี้คือสิ่งที่เซิร์ฟเวอร์
 * บันทึกว่าผู้อนุมัติเห็นหลักฐานแล้ว · ปุ่มมาจากทางที่แฟ้มเสนอ (file.actions): แฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน
 * มีแค่ ไม่ให้การรับรอง กับ ส่งกลับให้แก้ไขข้อบกพร่อง (คำสั่ง 56(2)) · ทุกปุ่มเปิดหน้าต่างยืนยัน ·
 * แฟ้มที่ตัดสินแล้วแสดงผลการตัดสินแทนปุ่ม
 */
export function DecisionActions({ file }: { file: DecisionFile }) {
    const router = useRouter();
    const [open, setOpen] = useState<DecisionAction | null>(null);
    const id = file.application.id;
    const actions = file.actions ?? [];
    const refusalHold = file.refusalHold ?? null;

    if (!file.decidable) {
        return (
            <section data-testid="decision-outcome" className="rounded-xl border border-border bg-card p-4 text-sm">
                <h2 className="mb-1 font-bold text-foreground">ผลการตัดสิน</h2>
                {file.decision ? (
                    <>
                        <p>
                            {OUTCOME_TH[file.decision.outcome] || file.decision.outcome}
                            {file.decision.decidedAt ? ` เมื่อ ${formatThaiDate(file.decision.decidedAt)}` : ''}
                            {file.decision.reasonLabel ? ` เหตุผล: ${file.decision.reasonLabel}` : ''}
                        </p>
                        {file.decision.consideration ? (
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">ข้อพิจารณา: {file.decision.consideration}</p>
                        ) : null}
                    </>
                ) : (
                    <p>คำขอนี้ไม่ได้รอการตัดสินแล้ว</p>
                )}
            </section>
        );
    }

    const send = async (path: string, body: object, done: { title: string; message: string }): Promise<string | null> => {
        const result = await PROVIDERRequest(path, { method: 'POST', body: JSON.stringify(body) });
        if (!result.success) {
            return result.error || 'บันทึกการตัดสินไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่แล้วลองอีกครั้ง';
        }
        notifications.show({ color: 'teal', title: done.title, message: done.message });
        router.push('/provider/certification-decisions');
        return null;
    };

    const submitFor: Record<Exclude<DecisionAction, 'REQUEST_CORRECTION'>, (input: ReasonDialogSubmit) => Promise<string | null>> = {
        APPROVE: ({ note }) => send(providerApiPaths.auditorFinalApproval(id), { reason: note }, {
            title: 'อนุมัติให้การรับรองแล้ว',
            message: 'ออกใบรับรองแล้ว ระบบแจ้งผู้ยื่นและผู้ถือใบรับรองพร้อมเลขที่ใบรับรอง',
        }),
        REFUSE: ({ reasonCode, reasonText, consideration, note }) => send(
            providerApiPaths.auditorCertificationRefusal(id),
            { reasonCode, ...(reasonText ? { reasonText } : {}), consideration, note },
            { title: 'บันทึกการไม่ให้การรับรองแล้ว', message: 'ระบบส่งหนังสือแจ้งคำสั่งถึงผู้ยื่นและสมาชิกผู้ถือใบรับรองแล้ว' },
        ),
        RETURN: ({ note }) => send(providerApiPaths.auditorRejectToAuditor(id), { comment: note }, {
            title: 'ส่งกลับให้ทบทวนแล้ว',
            message: 'คำขอถูกส่งกลับไปให้ผู้ตรวจพื้นที่ทบทวน',
        }),
    };
    const submitCorrection = ({ findingIndexes, note }: CorrectionDialogSubmit) => send(
        providerApiPaths.auditorCertificationCorrection(id),
        { findingIndexes, note },
        { title: 'ส่งกลับให้แก้ไขข้อบกพร่องแล้ว', message: 'ระบบส่งหนังสือสั่งแก้ไขถึงผู้ยื่น และแจ้งสมาชิกผู้ถือใบรับรองแล้ว' },
    );
    const dialogProps = (action: DecisionAction) => ({ open: open === action, onOpenChange: (o: boolean) => setOpen(o ? action : null) });

    return (
        <section data-testid="decision-actions" className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-bold text-foreground">ตัดสินให้การรับรอง</h2>
            <p className="mb-3 text-sm text-muted-foreground">ตรวจแฟ้มด้านบนให้ครบก่อนตัดสิน ทุกการตัดสินต้องระบุเหตุผล</p>
            <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                    <Button
                        key={action}
                        variant={ACTION_BUTTON[action].variant}
                        onClick={() => setOpen(action)}
                        leftSection={ACTION_BUTTON[action].icon}
                        disabled={action === 'REFUSE' && refusalHold !== null}
                        aria-describedby={action === 'REFUSE' && refusalHold ? 'refusal-hold' : undefined}
                    >
                        {ACTION_BUTTON[action].label}
                    </Button>
                ))}
            </div>
            {refusalHold && actions.includes('REFUSE') ? (
                <p id="refusal-hold" data-testid="refusal-hold" role="note" className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
                    {refusalHold.message}
                </p>
            ) : null}

            {actions.includes('APPROVE') ? (
                <ReasonDialog
                    {...dialogProps('APPROVE')}
                    title={`อนุมัติให้การรับรองคำขอ ${file.application.applicationNumber}`}
                    description={`ระบบจะออกใบรับรองในนาม ${file.application.holder?.name || 'ผู้ถือที่ระบุในคำขอ'} ทันที และแจ้งผู้ยื่นกับผู้ถือใบรับรอง การอนุมัติย้อนกลับไม่ได้`}
                    noteLabel="เหตุผลการอนุมัติ"
                    noteHint="บันทึกไว้เป็นหลักฐานภายใน ผู้ยื่นไม่เห็นข้อความนี้"
                    noteRequired
                    confirmLabel="ยืนยันอนุมัติและออกใบรับรอง"
                    onSubmit={submitFor.APPROVE}
                />
            ) : null}
            {actions.includes('REFUSE') && !refusalHold ? (
                <ReasonDialog
                    {...dialogProps('REFUSE')}
                    title={`ไม่ให้การรับรองคำขอ ${file.application.applicationNumber}`}
                    description="คำขอจะสิ้นสุดและไม่ออกใบรับรอง ผู้ยื่นและสมาชิกผู้ถือใบรับรองได้รับหนังสือแจ้งคำสั่งพร้อมข้อเท็จจริง เหตุผล และข้อพิจารณา การตัดสินนี้ย้อนกลับไม่ได้"
                    reasons={file.refusalReasons}
                    asksConsideration
                    noteLabel="บันทึกภายใน (ไม่บังคับ)"
                    noteHint="บันทึกไว้เป็นหลักฐานภายใน ผู้ยื่นไม่เห็นข้อความนี้"
                    noteRequired={false}
                    confirmLabel="ยืนยันไม่ให้การรับรอง"
                    destructive
                    onSubmit={submitFor.REFUSE}
                />
            ) : null}
            {actions.includes('RETURN') ? (
                <ReasonDialog
                    {...dialogProps('RETURN')}
                    title="ส่งกลับให้ผู้ตรวจพื้นที่ทบทวน"
                    description="ใช้เมื่อหลักฐานยังไม่พอให้ตัดสิน คำขอจะกลับไปที่ผู้ตรวจพื้นที่คนเดิม"
                    noteLabel="สิ่งที่ต้องการให้ทบทวน"
                    noteHint="ผู้ตรวจพื้นที่เห็นข้อความนี้"
                    noteRequired
                    confirmLabel="ยืนยันส่งกลับ"
                    onSubmit={submitFor.RETURN}
                />
            ) : null}
            {actions.includes('REQUEST_CORRECTION') ? (
                <CorrectionDialog
                    {...dialogProps('REQUEST_CORRECTION')}
                    applicationNumber={file.application.applicationNumber}
                    findings={file.inspectorSummary?.findings ?? []}
                    onSubmit={submitCorrection}
                />
            ) : null}
        </section>
    );
}
