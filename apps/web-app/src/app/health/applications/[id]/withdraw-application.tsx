'use client';

/**
 * ถอนคำขอ, offered only before document review starts (standing order 32). The dialog
 * states the consequence and the no-refund rule in the payment terms' own words before
 * anything is sent.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/primitives/button';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/primitives/dialog';
import { REFUND_CASES } from '@/constants/service-facts';
import {
    WITHDRAW_REASON_MIN_LENGTH, canWithdraw, withdrawApplication,
} from '@/lib/services/withdraw-application';

const SELF_CANCEL_REFUND_TH = REFUND_CASES.find((row) => row.situation === 'ขอยกเลิกคำขอเอง')?.refund ?? '';

/**
 * Offered only when the server would accept it: a withdrawable status and a membership
 * holding SUBMIT_APPLICATION on the holder (live walk F4: a MANAGER or VIEWER was offered a
 * button the server answers 403).
 */
export function WithdrawApplication({ applicationId, status, canSubmit, onWithdrawn }: {
    applicationId: string;
    status: string;
    canSubmit: boolean;
    onWithdrawn: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!canSubmit || !canWithdraw(status)) { return null; }

    const reasonReady = reason.trim().length >= WITHDRAW_REASON_MIN_LENGTH;

    const confirm = async () => {
        if (!reasonReady || sending) { return; }
        setSending(true);
        setError(null);
        const outcome = await withdrawApplication(applicationId, reason);
        setSending(false);
        if (!outcome.ok) { setError(outcome.message); return; }
        setOpen(false);
        onWithdrawn();
    };

    return (
        <>
            <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setOpen(true); }}>
                ถอนคำขอ
            </Button>
            <Dialog open={open} onOpenChange={(next) => { if (!sending) { setOpen(next); } }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>ถอนคำขอ</DialogTitle>
                        <DialogDescription>
                            เมื่อยืนยันแล้ว คำขอนี้จะถูกยกเลิกและเปิดต่อไม่ได้ ถ้าต้องการรับรองภายหลังต้องยื่นคำขอใหม่
                        </DialogDescription>
                    </DialogHeader>
                    <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100">
                        ค่าบริการที่ชำระแล้ว: {SELF_CANCEL_REFUND_TH} (เงื่อนไขการชำระเงิน ข้อ 7.1)
                    </p>
                    <div className="space-y-1">
                        <label htmlFor="withdraw-reason" className="block text-sm font-medium text-foreground">
                            เหตุผลที่ถอนคำขอ
                            <span aria-hidden className="ml-1 text-destructive">*</span>
                        </label>
                        <textarea
                            id="withdraw-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            aria-required="true"
                            className="w-full rounded-xl border-2 border-muted bg-card px-4 py-2.5 text-sm text-foreground focus:border-leaf-700 focus:outline-none"
                        />
                        <p className="text-xs text-muted-foreground">อย่างน้อย {WITHDRAW_REASON_MIN_LENGTH} ตัวอักษร</p>
                    </div>
                    {error && (
                        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-200">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="subtle" onClick={() => setOpen(false)} disabled={sending}>
                            ไม่ถอนคำขอ
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => { void confirm(); }} disabled={!reasonReady || sending}>
                            ยืนยันถอนคำขอ
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
