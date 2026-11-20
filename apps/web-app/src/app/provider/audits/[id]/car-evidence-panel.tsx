'use client';

import { useState } from 'react';
import { DocumentViewerModal, type DocumentViewerFile } from '@/components/feature/document-viewer-modal';
import { formatThaiDateTime } from '@/lib/format/thai-date';
import { defectsOfRound, type CarDefect } from '@/lib/services/car-round';

interface CarDocument {
    id?: string | null;
    filename?: string | null;
    originalName?: string | null;
    path?: string | null;
    uploadedAt?: string | null;
    findingNo?: number | null;
}

export interface CarEvidenceFile {
    id: string;
    name: string;
    uploadedAt: string | null;
    findingNo: number;
}

export interface CarEvidenceRound {
    requested: boolean;
    files: CarEvidenceFile[];
    notes: string | null;
    submitted: boolean;
    defects: CarDefect[];
    viewedIds: Set<string>;
    allOpened: boolean;
}

const asObject = (value: unknown): Record<string, unknown> =>
    (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export function carEvidenceOfRound(formData: Record<string, unknown>): CarEvidenceRound {
    const askedAt = typeof formData.carRequestedAt === 'string' ? Date.parse(formData.carRequestedAt) : Number.NaN;
    const docs = Array.isArray(formData.carDocuments) ? (formData.carDocuments as CarDocument[]) : [];
    const files = docs
        .filter((d) => typeof d?.path === 'string' && d.path)
        .filter((d) => Date.parse(String(d.uploadedAt || '')) > askedAt)
        .map((d) => ({
            id: String(d.id || d.filename || String(d.path).split('/').pop()),
            name: d.originalName || 'หลักฐานการแก้ไข',
            uploadedAt: d.uploadedAt || null,
            findingNo: Number(d.findingNo) || 1,
        }));
    const notes = typeof formData.carNotes === 'string' && formData.carNotes.trim() ? formData.carNotes.trim() : null;
    const views = asObject(formData.carEvidenceViews);
    const viewedIds = new Set(files.filter((f) => Object.keys(asObject(views[f.id])).length > 0).map((f) => f.id));
    return {
        requested: !Number.isNaN(askedAt),
        files,
        notes,
        submitted: files.length > 0,
        defects: defectsOfRound(formData),
        viewedIds,
        allOpened: files.every((f) => viewedIds.has(f.id)),
    };
}

export const carEvidenceFileUrl = (applicationId: string, fileId: string) =>
    `/api/provider/auditor/applications/${encodeURIComponent(applicationId)}/car-evidence/${encodeURIComponent(fileId)}`;

export const CAR_EVIDENCE_COPY_TH = Object.freeze({
    title: 'หลักฐานการแก้ไขที่ผู้ยื่นส่งในรอบนี้',
    notesLabel: 'คำอธิบายจากผู้ยื่น',
    none: 'ผู้ยื่นยังไม่ได้ส่งหลักฐานการแก้ไขในรอบนี้ จึงยังบันทึกผลผ่านไม่ได้',
    defectHeading: (no: number) => `ข้อบกพร่องข้อ ${no}`,
    unmatched: 'ไฟล์ที่ไม่ตรงกับข้อบกพร่องในรอบนี้',
    noFileForDefect: 'ผู้ยื่นไม่ได้ส่งไฟล์สำหรับข้อนี้',
    opened: 'เปิดดูแล้ว',
    notOpened: 'ยังไม่ได้เปิดดู',
    progress: (opened: number, total: number) => `เปิดดูแล้ว ${opened} จาก ${total} ไฟล์`,
    mustOpenAll: 'ต้องเปิดดูหลักฐานครบทุกไฟล์ก่อน จึงบันทึกผลผ่านได้',
});

export function CarEvidencePanel({
    applicationId, round, onViewerClosed,
}: {
    applicationId: string;
    round: CarEvidenceRound;
    onViewerClosed?: () => void;
}) {
    const [viewing, setViewing] = useState<DocumentViewerFile | null>(null);
    const unmatched = round.files.filter((f) => !round.defects.some((d) => d.no === f.findingNo));
    return (
        <section data-testid="car-evidence-panel" className="mb-4 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">{CAR_EVIDENCE_COPY_TH.title}</h2>
            {round.submitted ? (
                <>
                    <p data-testid="car-evidence-progress" className="mt-1 text-xs text-muted-foreground">
                        {CAR_EVIDENCE_COPY_TH.progress(round.viewedIds.size, round.files.length)}
                    </p>
                    {[...round.defects, ...(unmatched.length > 0 ? [{ no: 0, nonConformity: '', correctiveAction: '' }] : [])].map((defect) => {
                        const mine = defect.no === 0 ? unmatched : round.files.filter((f) => f.findingNo === defect.no);
                        return (
                            <div key={defect.no} data-testid={`car-evidence-defect-${defect.no}`} className="mt-3 border-t border-border pt-2">
                                <h3 className="text-sm font-medium text-foreground">
                                    {defect.no === 0 ? CAR_EVIDENCE_COPY_TH.unmatched : CAR_EVIDENCE_COPY_TH.defectHeading(defect.no)}
                                </h3>
                                {defect.nonConformity && <p className="text-xs text-muted-foreground">{defect.nonConformity}</p>}
                                {mine.length === 0 ? (
                                    <p className="mt-1 text-xs text-muted-foreground">{CAR_EVIDENCE_COPY_TH.noFileForDefect}</p>
                                ) : (
                                    <ul className="mt-1 space-y-1 text-sm">
                                        {mine.map((f) => {
                                            const seen = round.viewedIds.has(f.id);
                                            return (
                                                <li key={f.id} data-testid="car-evidence-file" data-opened={seen} className="flex flex-wrap items-center gap-x-2">
                                                    <button
                                                        type="button"
                                                        className="min-h-[44px] break-all text-left text-info underline"
                                                        onClick={() => setViewing({ url: carEvidenceFileUrl(applicationId, f.id), name: f.name })}
                                                    >
                                                        {f.name}
                                                    </button>
                                                    <span className={seen ? 'text-xs text-foreground' : 'text-xs text-destructive'}>
                                                        {seen ? CAR_EVIDENCE_COPY_TH.opened : CAR_EVIDENCE_COPY_TH.notOpened}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{formatThaiDateTime(f.uploadedAt)}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </>
            ) : (
                <p role="status" className="mt-2 text-sm text-destructive">{CAR_EVIDENCE_COPY_TH.none}</p>
            )}
            {round.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    <span className="font-medium">{CAR_EVIDENCE_COPY_TH.notesLabel}: </span>{round.notes}
                </p>
            )}
            <DocumentViewerModal file={viewing} onClose={() => { setViewing(null); onViewerClosed?.(); }} />
        </section>
    );
}
