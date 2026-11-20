'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives/button';
import { apiClient, type ApiResponse } from '@/lib/api/api-client';
import { bangkokTodayIso, formatThaiDate } from '@/lib/format/thai-date';

/**
 * The refunds recorded on an invoice, and whether the company's bank has paid each one.
 * The system never moves refund money (order 20); the company finance officer records the
 * day the bank paid and the bank's reference on the refund's credit note (order 29), once.
 *   GET  /finance/refunds/:invoiceId/status
 *   POST /finance/credit-notes/:creditNoteId/refund-transfer { transferredOn, bankReference }
 */

interface RefundLine {
    creditNoteId: string;
    creditNoteNumber: string | null;
    amount: number;
    refundTransferredOn: string | null;
    refundBankReference: string | null;
}

interface RefundStatus {
    cancellation: null | {
        creditNoteId?: string;
        creditNoteNumber?: string | null;
        amount: number;
        creditNote?: { refundTransferredOn?: string | null; refundBankReference?: string | null } | null;
    };
    duplicateChargeRefunds: RefundLine[];
}

const TRANSFER_ERROR_TH: Record<string, string> = {
    REFUND_TRANSFER_DATE_INVALID: 'วันที่โอนต้องไม่เป็นวันในอนาคต และไม่ก่อนวันที่ออกใบลดหนี้',
    REFUND_TRANSFER_REFERENCE_INVALID: 'เลขอ้างอิงธนาคาร 3 ถึง 64 ตัวอักษร ใช้ตัวอักษรอังกฤษ ตัวเลข ช่องว่าง . / - ได้',
    REFUND_TRANSFER_ALREADY_RECORDED: 'บันทึกการโอนคืนของใบลดหนี้นี้ไว้แล้วด้วยข้อมูลอื่น',
    REFUND_TRANSFER_NOTE_NOT_POSTED: 'ใบลดหนี้นี้ยังไม่ได้ลงบัญชี',
    CREDIT_NOTE_NOT_FOUND: 'ไม่พบใบลดหนี้นี้',
    FORBIDDEN_ROLE: 'บัญชีของคุณไม่มีสิทธิ์บันทึกการโอนคืน',
    FORBIDDEN_TENANT: 'บัญชีของคุณยังไม่ได้สังกัดหน่วยงาน จึงบันทึกการโอนคืนไม่ได้ ติดต่อผู้ดูแลแพลตฟอร์มให้กำหนดหน่วยงานของบัญชีนี้',
};

function linesOf(status: RefundStatus | null): RefundLine[] {
    if (!status) return [];
    const lines = [...status.duplicateChargeRefunds];
    const c = status.cancellation;
    if (c?.creditNoteId) {
        lines.unshift({
            creditNoteId: c.creditNoteId,
            creditNoteNumber: c.creditNoteNumber ?? null,
            amount: c.amount,
            refundTransferredOn: c.creditNote?.refundTransferredOn ? String(c.creditNote.refundTransferredOn).slice(0, 10) : null,
            refundBankReference: c.creditNote?.refundBankReference ?? null,
        });
    }
    return lines;
}

export function RefundTransferPanel({ invoiceId, canWrite, formatCurrency }: {
    invoiceId: string;
    canWrite: boolean;
    formatCurrency: (amt: number) => string;
}) {
    const [status, setStatus] = useState<RefundStatus | null>(null);
    const load = useCallback(async () => {
        const res = await apiClient.get<RefundStatus>(`/finance/refunds/${encodeURIComponent(invoiceId)}/status`);
        setStatus(res?.success && res.data ? res.data : null);
    }, [invoiceId]);

    useEffect(() => { void load(); }, [load]);

    const lines = linesOf(status);
    if (lines.length === 0) return null;

    return (
        <section className="space-y-3 rounded-xl border border-rose-100 bg-card p-4" data-testid="refund-transfer-panel">
            <p className="text-sm font-bold text-foreground">การคืนเงินของใบนี้</p>
            {lines.map((line) => (
                <RefundTransferLine key={line.creditNoteId} line={line} canWrite={canWrite} formatCurrency={formatCurrency} onSaved={load} />
            ))}
        </section>
    );
}

function RefundTransferLine({ line, canWrite, formatCurrency, onSaved }: {
    line: RefundLine;
    canWrite: boolean;
    formatCurrency: (amt: number) => string;
    onSaved: () => void;
}) {
    const [transferredOn, setTransferredOn] = useState(bangkokTodayIso());
    const [bankReference, setBankReference] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        setSaving(true);
        setError(null);
        const res: ApiResponse<unknown> = await apiClient.post(
            `/finance/credit-notes/${encodeURIComponent(line.creditNoteId)}/refund-transfer`,
            { transferredOn, bankReference },
        );
        setSaving(false);
        if (res?.success) {
            onSaved();
            return;
        }
        setError(TRANSFER_ERROR_TH[String(res?.code || res?.error || '')] || 'บันทึกการโอนคืนไม่สำเร็จ กรุณาลองใหม่');
    };

    return (
        <div className="rounded-lg border border-border/60 p-3 text-sm">
            <p className="font-medium text-foreground">
                ใบลดหนี้ <span className="font-mono">{line.creditNoteNumber || '-'}</span> ยอดคืน {formatCurrency(line.amount)}
            </p>
            {line.refundTransferredOn ? (
                <p className="mt-1 text-muted-foreground">
                    โอนคืนแล้ว วันที่ {formatThaiDate(line.refundTransferredOn)} เลขอ้างอิงธนาคาร {line.refundBankReference}
                </p>
            ) : canWrite ? (
                <div className="mt-2 space-y-2">
                    <p className="text-muted-foreground">ยังไม่ได้บันทึกการโอนคืน บันทึกเมื่อธนาคารของบริษัทโอนเงินแล้ว</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="flex flex-col text-xs text-muted-foreground">
                            วันที่โอน
                            <input
                                type="date"
                                value={transferredOn}
                                max={bangkokTodayIso()}
                                onChange={(e) => setTransferredOn(e.target.value)}
                                className="mt-1 h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                            />
                        </label>
                        <label className="flex flex-1 flex-col text-xs text-muted-foreground">
                            เลขอ้างอิงธนาคาร
                            <input
                                type="text"
                                value={bankReference}
                                onChange={(e) => setBankReference(e.target.value)}
                                className="mt-1 h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                            />
                        </label>
                    </div>
                    {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
                    <Button type="button" onClick={save} disabled={saving || bankReference.trim().length < 3} className="min-h-[44px] rounded-lg">
                        {saving ? 'กำลังบันทึก...' : 'บันทึกการโอนคืน'}
                    </Button>
                </div>
            ) : (
                <p className="mt-1 text-muted-foreground">ยังไม่ได้บันทึกการโอนคืน</p>
            )}
        </div>
    );
}
