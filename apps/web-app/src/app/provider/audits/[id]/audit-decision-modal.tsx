'use client';

import { Badge } from '@/components/ui/primitives/badge';
import { Button } from '@/components/ui/primitives/button';
import { ThemeIcon } from '@/components/ui/icon-buttons';
import { Modal } from '@/components/ui/overlays';
import { Textarea } from '@/components/ui/textarea';
import { ONSITE_CORRECTION_DEADLINE_TH } from '@/constants/service-facts';
import { IconCheck, IconPhoto, IconPlus, IconTrash, IconUpload, IconX } from "@tabler/icons-react";
import { type AuditDecision, type AuditEvidenceFile } from './provider-audit-job-sheet-config';

export interface CARFinding {
    nonConformity: string;
    correctiveAction: string;
    category: string;
}

interface AuditDecisionModalProps {
    opened: boolean;
    decision: AuditDecision;
    decisionNotes: string;
    evidenceFiles: AuditEvidenceFile[];
    findings: CARFinding[];
    isCompressing: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onDecisionNotesChange: (value: string) => void;
    onEvidenceUpload: (files: File[]) => void;
    onRemoveEvidence: (id: string) => void;
    onFindingsChange: (findings: CARFinding[]) => void;
    formatBytes: (bytes: number) => string;
    onSubmit: () => void;
}

const DECISION_LABEL_TH: Record<AuditDecision, string> = {
    PASS: 'ผ่าน',
    MINOR: 'ข้อบกพร่องเล็กน้อย',
    MAJOR: 'ข้อบกพร่องสำคัญ',
    FAIL: 'ไม่ผ่าน',
    REINSPECT: 'ต้องลงพื้นที่ซ้ำ',
};

/** A finding the approver can act on names what was found and how to correct it (order 56(2)). */
const isComplete = (finding: CARFinding) => Boolean(finding.nonConformity.trim() && finding.correctiveAction.trim());

export function AuditDecisionModal({
    opened,
    decision,
    decisionNotes,
    evidenceFiles,
    findings,
    isCompressing,
    isSubmitting,
    onClose,
    onDecisionNotesChange,
    onEvidenceUpload,
    onRemoveEvidence,
    onFindingsChange,
    formatBytes,
    onSubmit,
}: AuditDecisionModalProps) {
    const isCAR = decision === 'MINOR' || decision === 'MAJOR';
    // "ไม่ผ่าน" goes to the certificate approver with its findings; the inspector does not close the application.
    const isFail = decision === 'FAIL';
    const withFindings = isCAR || isFail;
    // A second visit is booked by the dispatcher on this reason, so it cannot be blank (order 27).
    const needsReason = decision === 'REINSPECT';
    const missingFinding = isFail && !findings.some(isComplete);
    const decisionLabel = DECISION_LABEL_TH[decision];

    const addFinding = () => {
        onFindingsChange([...findings, { nonConformity: '', correctiveAction: '', category: '' }]);
    };

    const updateFinding = (index: number, field: keyof CARFinding, value: string) => {
        const updated = findings.map((f, i) =>
            i === index ? { ...f, [field]: value } : f
        );
        onFindingsChange(updated);
    };

    const removeFinding = (index: number) => {
        onFindingsChange(findings.filter((_, i) => i !== index));
    };

    return (
        <Modal opened={opened} onClose={onClose} title={isFail ? 'บันทึกผลไม่ผ่าน' : `ส่งผลการตรวจ: ${decisionLabel}`} centered size="lg">
            <div className="flex flex-col">
                {isFail && (
                    <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50/70 p-4 dark:border-orange-900/40 dark:bg-orange-950/20" role="note">
                        <p className="text-sm text-orange-900 dark:text-orange-200">
                            ผลนี้จะส่งให้ผู้อนุมัติพิจารณา คุณไม่ได้ปิดคำขอ ผู้อนุมัติเป็นผู้ตัดสินว่าจะไม่ให้การรับรองหรือให้ผู้ยื่นแก้ไขข้อบกพร่อง
                        </p>
                        <p className="mt-1 text-xs text-orange-900/80 dark:text-orange-200/80">
                            ระบุข้อบกพร่องอย่างน้อยหนึ่งข้อ ทั้งข้อที่พบและแนวทางแก้ไข
                        </p>
                    </div>
                )}
                {/* ── Structured findings: a correction request, or the reasons a visit did not pass ── */}
                {withFindings && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-foreground">
                                    สิ่งที่ไม่เป็นไปตามข้อกำหนด
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    ระบุจุดที่ผิดและสิ่งที่ต้องแก้ไข
                                </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={addFinding} className="rounded-lg">
                                <IconPlus size={14} className="mr-1" aria-hidden="true" />
                                เพิ่มรายการ
                            </Button>
                        </div>
                        {findings.length === 0 && (
                            <p className="py-4 text-center text-sm italic text-muted-foreground">
                                กดปุ่ม &quot;เพิ่มรายการ&quot; เพื่อเพิ่มข้อบกพร่อง
                            </p>
                        )}
                        <div className="space-y-3">
                            {findings.map((finding, idx) => (
                                <div key={idx} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                                    <div className="mb-2 flex items-center justify-between">
                                        <Badge variant="secondary" className="rounded-md text-xs">
                                            ข้อ {idx + 1}
                                        </Badge>
                                        {/* X3-FIX-C H-10: 28×28 → 44×44 to meet WCAG 2.5.5 tap target. */}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => removeFinding(idx)}
                                            className="h-11 min-h-[44px] w-11 min-w-[44px] p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                                            aria-label="ลบรายการ"
                                        >
                                            <IconTrash size={14} aria-hidden="true" />
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Textarea
                                            label="ข้อที่พบ"
                                            required={isFail}
                                            placeholder="ระบุข้อบกพร่องที่พบ เช่น ไม่มีการบันทึกการใช้สารเคมี"
                                            value={finding.nonConformity}
                                            onChange={(e) => updateFinding(idx, 'nonConformity', e.currentTarget.value)}
                                            // X3-FIX-C H-11: autoFocus first CAR finding so auditor can
                                            // immediately type without tab-hunting.
                                            // eslint-disable-next-line jsx-a11y/no-autofocus -- reason: modal dialog focus per WAI-ARIA APG (see X2-FIX-A M-13).
                                            autoFocus={idx === 0}
                                        />
                                        <Textarea
                                            label="แนวทางแก้ไข"
                                            required={isFail}
                                            placeholder={`ระบุการแก้ไข เช่น จัดทำบันทึกการใช้สารเคมีแล้วส่งหลักฐานภายใน ${ONSITE_CORRECTION_DEADLINE_TH}`}
                                            value={finding.correctiveAction}
                                            onChange={(e) => updateFinding(idx, 'correctiveAction', e.currentTarget.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Textarea
                    label={isFail ? "บันทึกสรุป" : "บันทึกผลการตัดสิน"}
                    placeholder="ระบุรายละเอียดผลการตัดสิน"
                    value={decisionNotes}
                    onChange={(event) => onDecisionNotesChange(event.currentTarget.value)}
                    // X3-FIX-C H-11: in PASS mode there is no CAR section, so the decision-notes
                    // Textarea is the first interactive field — focus it on open. In CAR mode the
                    // first finding's nonConformity Textarea takes focus instead (see above).
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- reason: modal dialog focus per WAI-ARIA APG (see X2-FIX-A M-13).
                    autoFocus={!withFindings}
                />

                <div className="rounded-lg bg-card p-4 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold">ภาพถ่ายหลักฐาน</p>
                        <Badge color="teal">{evidenceFiles.length} ไฟล์</Badge>
                    </div>
                    <p className="mb-4 text-xs text-slate-500">อัปโหลดภาพถ่ายภาคสนาม ระบบจะบีบอัดภาพความละเอียดสูงโดยอัตโนมัติเพื่อประหยัด bandwidth ก่อนส่งขึ้น server</p>

                    <div className="relative">
                        <Button
                            leftSection={<IconUpload size={16} aria-hidden="true" />}
                            loading={isCompressing}
                        >
                            <label htmlFor="evidence-upload" className="cursor-pointer">
                                เลือกภาพ
                            </label>
                            <input
                                id="evidence-upload"
                                type="file"
                                className="sr-only"
                                title="เลือกภาพหลักฐาน"
                                aria-label="เลือกภาพหลักฐาน"
                                multiple
                                accept="image/*"
                                onChange={(event) => {
                                    if (event.target.files) {
                                        onEvidenceUpload(Array.from(event.target.files));
                                        event.target.value = '';
                                    }
                                }}
                            />
                        </Button>
                    </div>

                    {evidenceFiles.length > 0 && (
                        <div className="mt-4 flex flex-col gap-2">
                            {evidenceFiles.map((evidence) => (
                                <div className="rounded-lg bg-card p-2 shadow-sm" key={evidence.id}>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <ThemeIcon color="blue" size="md"><IconPhoto size={14} aria-hidden="true" /></ThemeIcon>
                                            <div className="min-w-0 flex-1 overflow-hidden">
                                                <p className="truncate text-sm font-medium">{evidence.file.name}</p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-xs text-slate-500 line-through">{formatBytes(evidence.originalSize)}</p>
                                                    <p className="text-xs font-semibold">{formatBytes(evidence.compressedSize)}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <Button size="sm" color="red" variant="subtle" onClick={() => onRemoveEvidence(evidence.id)}>ลบ</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                    <Button variant="default" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
                    <Button
                        color={decision === "PASS" ? "teal" : decision === "MINOR" ? "orange" : decision === "MAJOR" ? "red" : decision === "REINSPECT" ? "grape" : "dark"}
                        onClick={onSubmit}
                        loading={isSubmitting}
                        disabled={(needsReason && !decisionNotes.trim()) || missingFinding}
                        leftSection={decision === "PASS" ? <IconCheck size={16} aria-hidden="true" /> : <IconX size={16} aria-hidden="true" />}
                    >
                        {isFail ? 'ยืนยันบันทึกผลไม่ผ่าน' : `ยืนยันผล ${decisionLabel}`}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

