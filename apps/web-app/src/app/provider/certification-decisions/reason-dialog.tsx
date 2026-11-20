'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/primitives/dialog';
import { Button } from '@/components/ui/primitives/button';
import { Textarea } from '@/components/ui/primitives/textarea';
import type { ReasonOption } from './[id]/decision-file-types';

export interface ReasonDialogSubmit {
    reasonCode: string | null;
    /** The approver's own words, only when reasonCode is OTHER; the applicant and holder read it. */
    reasonText: string | null;
    /** The consideration the order prints for the applicant (APA s.37), when the dialog asks for one. */
    consideration: string | null;
    note: string;
}

/** Mirrors shared/certification-decision-reasons.js (OTHER_REASON_*), which the server enforces. */
export const OTHER_REASON_CODE = 'OTHER';
const OTHER_REASON_TEXT_MIN = 10;
const OTHER_REASON_TEXT_MAX = 500;
const CONSIDERATION_MIN = 20;
const CONSIDERATION_MAX = 1000;

interface ReasonDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    /** A fixed list to choose one from; omitted = no list. */
    reasons?: ReasonOption[];
    /** Ask for the consideration the applicant reads in the order (the refusal). */
    asksConsideration?: boolean;
    noteLabel: string;
    noteHint: string;
    noteRequired: boolean;
    confirmLabel: string;
    destructive?: boolean;
    /** Resolves to a Thai error to show, or null when done (the dialog then closes). */
    onSubmit: (input: ReasonDialogSubmit) => Promise<string | null>;
}

const NOTE_MAX_LENGTH = 1000;

/**
 * หน้าต่างยืนยันการตัดสินของผู้อนุมัติ: เลือกเหตุจากรายการตายตัว (ถ้ามี) + ข้อพิจารณา (ถ้าถาม) + ช่องบันทึก
 * เลือก "อื่น ๆ (โปรดระบุ)" ต้องพิมพ์เหตุผล 10 ถึง 500 ตัวอักษร ซึ่งผู้ยื่นและผู้ถือเห็นตามที่พิมพ์ ·
 * ข้อพิจารณา 20 ถึง 1,000 ตัวอักษรพิมพ์ลงหนังสือแจ้งคำสั่ง · กดยืนยันได้เมื่อครบ ·
 * ส่งไม่สำเร็จ หน้าต่างยังเปิดอยู่พร้อมเหตุและสิ่งที่ต้องทำต่อ
 */
export function ReasonDialog({
    open, onOpenChange, title, description, reasons, asksConsideration = false, noteLabel, noteHint, noteRequired,
    confirmLabel, destructive = false, onSubmit,
}: ReasonDialogProps) {
    const [reasonCode, setReasonCode] = useState<string | null>(null);
    const [reasonText, setReasonText] = useState('');
    const [consideration, setConsideration] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const typesReason = reasonCode === OTHER_REASON_CODE;
    const typedLength = reasonText.trim().length;
    const typedReasonReady = !typesReason
        || (typedLength >= OTHER_REASON_TEXT_MIN && typedLength <= OTHER_REASON_TEXT_MAX);
    const considerationLength = consideration.trim().length;
    const considerationReady = !asksConsideration
        || (considerationLength >= CONSIDERATION_MIN && considerationLength <= CONSIDERATION_MAX);
    const ready = (!reasons || reasonCode !== null) && typedReasonReady && considerationReady
        && (!noteRequired || note.trim().length > 0);

    const change = (next: boolean) => {
        if (!next && submitting) { return; }
        if (!next) {
            setReasonCode(null);
            setReasonText('');
            setConsideration('');
            setNote('');
            setError(null);
        }
        onOpenChange(next);
    };

    const submit = async () => {
        if (!ready || submitting) { return; }
        setSubmitting(true);
        setError(null);
        const failure = await onSubmit({
            reasonCode,
            reasonText: typesReason ? reasonText.trim() : null,
            consideration: asksConsideration ? consideration.trim() : null,
            note: note.trim(),
        });
        setSubmitting(false);
        if (failure) {
            setError(failure);
            return;
        }
        change(false);
    };

    return (
        <Dialog open={open} onOpenChange={change}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                {reasons ? (
                    <fieldset className="space-y-2" disabled={submitting}>
                        <legend className="mb-1 text-sm font-semibold text-foreground">เหตุผล (เลือกหนึ่งข้อ)</legend>
                        {reasons.map((r) => (
                            <label key={r.code} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2 text-sm">
                                <input
                                    type="radio"
                                    name="reason"
                                    value={r.code}
                                    checked={reasonCode === r.code}
                                    onChange={() => setReasonCode(r.code)}
                                    className="mt-1"
                                />
                                <span>{r.label}</span>
                            </label>
                        ))}
                    </fieldset>
                ) : null}
                {typesReason ? (
                    <div>
                        <Textarea
                            data-field="reason-text"
                            label="ระบุเหตุผล"
                            required
                            maxLength={OTHER_REASON_TEXT_MAX}
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                            disabled={submitting}
                            description="ผู้ยื่นและผู้ถือใบรับรองเห็นข้อความนี้ตามที่พิมพ์ พิมพ์อย่างน้อย 10 ตัวอักษร"
                        />
                        <p className="mt-1 text-right text-xs text-muted-foreground" aria-live="polite">
                            {typedLength}/{OTHER_REASON_TEXT_MAX}
                        </p>
                    </div>
                ) : null}
                {asksConsideration ? (
                    <div>
                        <Textarea
                            data-field="consideration"
                            label="ข้อพิจารณา (ผู้ยื่นจะได้อ่านในหนังสือ)"
                            required
                            maxLength={CONSIDERATION_MAX}
                            value={consideration}
                            onChange={(e) => setConsideration(e.target.value)}
                            disabled={submitting}
                            description="เขียนว่าข้อเท็จจริงและเหตุผลที่เลือกนำไปสู่การไม่ให้การรับรองอย่างไร พิมพ์อย่างน้อย 20 ตัวอักษร"
                        />
                        <p className="mt-1 text-right text-xs text-muted-foreground" aria-live="polite">
                            {considerationLength}/{CONSIDERATION_MAX}
                        </p>
                    </div>
                ) : null}
                <Textarea
                    data-field="note"
                    label={noteLabel}
                    required={noteRequired}
                    maxLength={NOTE_MAX_LENGTH}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={submitting}
                    description={noteHint}
                />
                {error ? (
                    <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground">
                        {error}
                    </div>
                ) : null}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => change(false)} disabled={submitting}>
                        ยกเลิก
                    </Button>
                    <Button
                        type="button"
                        variant={destructive ? 'destructive' : 'primary'}
                        onClick={() => void submit()}
                        disabled={!ready || submitting}
                        loading={submitting}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
