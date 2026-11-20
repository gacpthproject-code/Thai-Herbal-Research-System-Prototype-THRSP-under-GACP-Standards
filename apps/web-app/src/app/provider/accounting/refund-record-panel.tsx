import { useState } from "react";
import { Button } from '@/components/ui/primitives/button';
import { apiClient, type ApiResponse } from '@/lib/api/api-client';
import { checkoutMilestoneOf } from '@/lib/services/payment-service';
import { toast } from 'sonner';
import {
    CANCELLATION_NOTE_MIN_LENGTH,
    PROVIDER_CANCELLATION_REASONS,
    PROVIDER_CANCELLATION_REASON_MILESTONES,
    type ProviderCancellationReason,
    type RefundKind,
} from '@/constants/refund-kinds';
import type { InvoiceItem } from "./accounting-types";

/**
 * Finance records a refund the company already made outside the system
 * (order 22, payment terms v1.3 §7). Two kinds only:
 *   DUPLICATE           POST /finance/refunds/:id/duplicate-charge { amount, idempotencyKey }
 *   PROVIDER_CANCELLED  POST /finance/refunds/:id/provider-cancellation { reasonCode, note }
 * The backend decides the credit-note figures, the VAT split and whether the
 * milestone may still be refunded; this form sends only what the officer chose.
 */

const REFUND_ERROR_TH: Record<string, string> = {
    REFUND_AMOUNT_INVALID: 'จำนวนเงินไม่ถูกต้อง กรอกจำนวนบาทที่มากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง',
    REFUND_EXCEEDS_REMAINING: 'จำนวนเงินเกินยอดที่ยังคืนได้ของใบนี้ ตรวจใบลดหนี้ที่ออกไปแล้วก่อนบันทึกใหม่',
    REFUND_SERVICE_ALREADY_STARTED: 'งวดนี้เริ่มดำเนินการตรวจแล้ว จึงคืนเงินไม่ได้ตามเงื่อนไขข้อ 7.2.3',
    REFUND_CANCELLATION_REASON_INVALID: 'เลือกเหตุที่ยกเลิกจากรายการก่อนบันทึก',
    REFUND_CANCELLATION_NOTE_REQUIRED: `เขียนรายละเอียดอย่างน้อย ${CANCELLATION_NOTE_MIN_LENGTH} ตัวอักษร`,
    INVOICE_NOT_PAID: 'ใบนี้ยังไม่ได้ชำระ จึงไม่มีเงินให้คืน',
    INVOICE_NOT_FOUND: 'ไม่พบใบแจ้งหนี้นี้',
    FORBIDDEN_ROLE: 'บัญชีของคุณไม่มีสิทธิ์บันทึกการคืนเงิน',
    FORBIDDEN_TENANT: 'บัญชีของคุณยังไม่ได้สังกัดหน่วยงาน จึงบันทึกการคืนเงินไม่ได้ ติดต่อผู้ดูแลแพลตฟอร์มให้กำหนดหน่วยงานของบัญชีนี้',
    REFUND_CANCELLATION_REASON_NOT_APPLICABLE: 'เหตุที่เลือกใช้กับงวดของใบแจ้งหนี้นี้ไม่ได้ เลือกเหตุอื่นจากรายการ',
    INVOICE_DELETED: 'ใบแจ้งหนี้นี้ถูกยกเลิกไปแล้ว จึงบันทึกการคืนเงินไม่ได้ รีเฟรชหน้าจอเพื่อดูรายการล่าสุด',
    DB_UNAVAILABLE: 'ระบบเชื่อมต่อฐานข้อมูลไม่ได้ จึงยังไม่ได้บันทึกการคืนเงิน รอสักครู่แล้วกดบันทึกอีกครั้ง',
    REFUND_FAILED: 'บันทึกการคืนเงินไม่สำเร็จ ยังไม่มีการออกใบลดหนี้ ลองอีกครั้ง หากยังไม่สำเร็จ แจ้งผู้ดูแลแพลตฟอร์ม',
};

function refundErrorMessage(res: ApiResponse<unknown>): string {
    const code = String(res?.code || '').trim();
    return REFUND_ERROR_TH[code] || String(res?.error || '').trim() || 'บันทึกการคืนเงินไม่สำเร็จ กรุณาลองใหม่';
}

function newIdempotencyKey(): string {
    return globalThis.crypto?.randomUUID?.() ?? `refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface RefundRecordPanelProps {
    invoice: InvoiceItem;
    formatCurrency: (amt: number) => string;
    onRecorded: () => void;
    onCancel: () => void;
}

export function RefundRecordPanel({ invoice, formatCurrency, onRecorded, onCancel }: RefundRecordPanelProps) {
    const [kind, setKind] = useState<RefundKind | null>(null);
    const [amount, setAmount] = useState('');
    const [reasonCode, setReasonCode] = useState<ProviderCancellationReason | ''>('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    // One key per refund the officer means to record: a retry after a network
    // failure resends it, so the backend records the refund once.
    const [idempotencyKey] = useState(newIdempotencyKey);
    const milestone = checkoutMilestoneOf(invoice.serviceType);
    const reasons = (Object.keys(PROVIDER_CANCELLATION_REASONS) as ProviderCancellationReason[])
        .filter((code) => milestone !== null && PROVIDER_CANCELLATION_REASON_MILESTONES[code].includes(milestone));

    const amountValue = Number(amount);
    const ready = kind === 'DUPLICATE'
        ? amount.trim() !== '' && Number.isFinite(amountValue) && amountValue > 0
        : kind === 'PROVIDER_CANCELLED'
            ? reasonCode !== '' && note.trim().length >= CANCELLATION_NOTE_MIN_LENGTH
            : false;

    const submit = async () => {
        if (!ready || submitting) return;
        setSubmitting(true);
        try {
            const res = kind === 'DUPLICATE'
                ? await apiClient.post(`/finance/refunds/${invoice.id}/duplicate-charge`, { amount: amountValue, idempotencyKey })
                : await apiClient.post(`/finance/refunds/${invoice.id}/provider-cancellation`, { reasonCode, note: note.trim() });
            if (!res.success) {
                toast.error(refundErrorMessage(res));
                return;
            }
            toast.success(kind === 'DUPLICATE'
                ? 'บันทึกการคืนเงินส่วนที่เก็บเกินแล้ว และออกใบลดหนี้แล้ว'
                : 'บันทึกการคืนเงินแล้ว ออกใบลดหนี้แล้ว และปิดคำขอเป็น "ยกเลิกแล้ว"');
            onRecorded();
        } finally {
            setSubmitting(false);
        }
    };

    const option = (value: RefundKind, title: string, detail: string) => (
        <label
            htmlFor={`refund-kind-${value}`}
            className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${kind === value ? 'border-primary bg-primary/5' : 'border-border/50'}`}
        >
            <input
                id={`refund-kind-${value}`}
                type="radio"
                name="refund-kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="mt-1"
            />
            <span>
                <span className="block text-sm font-semibold text-foreground">{title}</span>
                <span className="block text-xs text-muted-foreground">{detail}</span>
            </span>
        </label>
    );

    return (
        // X4-FIX-D H-11 + H-9 — the safe button receives focus, both are 44px,
        // because recording a refund issues a credit note that cannot be undone.
        <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-4" key="refund-confirm-pane">
            <div>
                <p className="text-sm font-bold text-rose-700">บันทึกการคืนเงิน</p>
                <p className="text-xs text-rose-600">หมายเลข {invoice.invoiceNumber} ยอด {formatCurrency(invoice.amount)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                    ระบบไม่ได้โอนเงินให้ บริษัทโอนคืนเองนอกระบบ แล้วบันทึกที่นี่เพื่อออกใบลดหนี้
                </p>
            </div>

            <fieldset className="space-y-2">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">เหตุที่คืนเงิน</legend>
                {option(
                    'DUPLICATE',
                    'เรียกเก็บซ้ำหรือเก็บเกิน',
                    'คืนเฉพาะส่วนที่เก็บเกิน คำขอเดินต่อตามปกติ และงวดนี้ยังถือว่าชำระแล้ว',
                )}
                {option(
                    'PROVIDER_CANCELLED',
                    'บริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการ',
                    'คืนเต็มงวด ได้เฉพาะงวดที่ยังไม่เริ่มตรวจ คำขอจะถูกปิดเป็น "ยกเลิกแล้ว" ผู้ยื่นต้องยื่นคำขอใหม่หากต้องการดำเนินการต่อ',
                )}
                <p className="text-xs text-muted-foreground">
                    ผู้ยื่นขอยกเลิกเอง หรือคำขอถูกปิดเพราะระบบผิดพลาด ไม่มีการคืนเงิน
                </p>
            </fieldset>

            {kind === 'DUPLICATE' && (
                <div className="space-y-1">
                    <label htmlFor="refund-amount" className="text-xs font-medium text-muted-foreground">
                        จำนวนเงินที่คืน (บาท รวมภาษีมูลค่าเพิ่ม)
                    </label>
                    <input
                        id="refund-amount"
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">ไม่เกินยอดที่ยังไม่ได้คืนของใบนี้</p>
                </div>
            )}

            {kind === 'PROVIDER_CANCELLED' && (
                <div className="space-y-3">
                    <div className="space-y-1">
                        <label htmlFor="refund-reason" className="text-xs font-medium text-muted-foreground">เหตุที่ยกเลิก</label>
                        <select
                            id="refund-reason"
                            value={reasonCode}
                            onChange={(e) => setReasonCode(e.target.value as ProviderCancellationReason | '')}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                            <option value="">เลือกเหตุที่ยกเลิก</option>
                            {reasons.map((code) => (
                                <option key={code} value={code}>{PROVIDER_CANCELLATION_REASONS[code]}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="refund-note" className="text-xs font-medium text-muted-foreground">
                            รายละเอียดสำหรับบันทึกภายใน เช่น เลขที่หนังสือหรือคำสั่ง (อย่างน้อย {CANCELLATION_NOTE_MIN_LENGTH} ตัวอักษร ผู้ยื่นไม่เห็นข้อความนี้)
                        </label>
                        <textarea
                            id="refund-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        />
                    </div>
                </div>
            )}

            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="destructive"
                    className="min-h-[44px] min-w-[44px] flex-1 rounded-xl"
                    disabled={!ready || submitting}
                    onClick={submit}
                >
                    {submitting ? 'กำลังบันทึก...' : 'ยืนยัน บันทึกการคืนเงิน'}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px] min-w-[44px] flex-1 rounded-xl"
                    onClick={onCancel}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- reason: WAI-ARIA APG safe-action focus (X4-FIX-D H-11).
                    autoFocus
                >
                    ยกเลิก
                </Button>
            </div>
        </div>
    );
}
