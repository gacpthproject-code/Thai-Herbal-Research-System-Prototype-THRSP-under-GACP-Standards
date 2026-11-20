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
import { GACP_ONSITE_CORRECTION_DEADLINE_CALENDAR_DAYS } from '@/constants/service-facts';
import type { DecisionFileFinding } from './[id]/decision-file-types';

export interface CorrectionDialogSubmit {
    /** 1-based numbers of the inspector's findings that still need correcting. */
    findingIndexes: number[];
    note: string;
}

interface CorrectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    applicationNumber: string;
    findings: DecisionFileFinding[];
    /** Resolves to a Thai error to show, or null when done (the dialog then closes). */
    onSubmit: (input: CorrectionDialogSubmit) => Promise<string | null>;
}

const NOTE_MAX_LENGTH = 1000;

export function CorrectionDialog({ open, onOpenChange, applicationNumber, findings, onSubmit }: CorrectionDialogProps) {
    const all = findings.map((_finding, index) => index + 1);
    const [picked, setPicked] = useState<number[]>(all);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const change = (next: boolean) => {
        if (!next && submitting) { return; }
        if (!next) {
            setPicked(all);
            setNote('');
            setError(null);
        }
        onOpenChange(next);
    };

    const toggle = (n: number) => setPicked((now) => (now.includes(n) ? now.filter((x) => x !== n) : [...now, n].sort((a, b) => a - b)));

    const submit = async () => {
        if (picked.length === 0 || submitting) { return; }
        setSubmitting(true);
        setError(null);
        const failure = await onSubmit({ findingIndexes: picked, note: note.trim() });
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
                    <DialogTitle>{`ส่งกลับให้แก้ไขข้อบกพร่อง คำขอ ${applicationNumber}`}</DialogTitle>
                    <DialogDescription>
                        {`ผู้ยื่นมีเวลา ${GACP_ONSITE_CORRECTION_DEADLINE_CALENDAR_DAYS} วันส่งหลักฐานการแก้ไข ผู้ตรวจพื้นที่คนเดิมเป็นผู้พิจารณาหลักฐาน ผู้ยื่นได้รับหนังสือสั่งแก้ไขที่มีข้อบกพร่องที่เลือก`}
                    </DialogDescription>
                </DialogHeader>
                <fieldset className="space-y-2" disabled={submitting}>
                    <legend className="mb-1 text-sm font-semibold text-foreground">ข้อบกพร่องที่ยังต้องแก้ไข</legend>
                    {findings.map((finding, index) => (
                        <label key={`${index}-${finding.nonConformity}`} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2 text-sm">
                            <input
                                type="checkbox"
                                name="finding"
                                checked={picked.includes(index + 1)}
                                onChange={() => toggle(index + 1)}
                                className="mt-1"
                            />
                            <span>
                                <span className="font-medium text-foreground">{finding.nonConformity}</span>
                                {finding.correctiveAction ? <span className="block text-muted-foreground">แนวทางแก้ไข: {finding.correctiveAction}</span> : null}
                            </span>
                        </label>
                    ))}
                </fieldset>
                <Textarea
                    data-field="note"
                    label="คำสั่งเพิ่มเติมถึงผู้ยื่น (ไม่บังคับ)"
                    maxLength={NOTE_MAX_LENGTH}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={submitting}
                    description="ผู้ยื่นเห็นข้อความนี้ในหนังสือสั่งแก้ไข"
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
                        variant="primary"
                        onClick={() => void submit()}
                        disabled={picked.length === 0 || submitting}
                        loading={submitting}
                    >
                        ยืนยันส่งกลับให้แก้ไข
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
