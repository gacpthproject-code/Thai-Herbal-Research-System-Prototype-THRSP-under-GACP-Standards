'use client';

/**
 * /health/holders/[id] — the holder record (order 142, layer b).
 *
 * Whom a certificate is issued to, filled once and reused by every application: กทล.1,
 * the certificate, the receipt and tax invoice all print what is saved here. Step 2 of an
 * application shows this record read-only and links here to change it
 * (?from=application returns there after saving).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, AlertTriangle, ArrowLeft, BadgeCheck, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api/api-client';
import { SummaryHeader } from '@/components/feature';
import { HolderForm } from '@/components/holder/holder-form';
import { useMyEntities } from '@/lib/services/my-entities-provider';
import { useHolderRecord, type HolderEntityResponse } from '@/lib/holder/use-holder-record';
import {
    HOLDER_PAGE_COPY_TH,
    HOLDER_TYPES,
    fieldErrorsOf,
    holderInputFrom,
    holderPlaceholders,
    holderValues,
} from '@/lib/holder/holder-registry';

const COPY_TH = Object.freeze({
    eyebrow: 'ทะเบียนผู้ถือ',
    title: 'ข้อมูลผู้ถือใบรับรอง',
    description: 'ใบรับรอง แบบคำขอ กทล.1 ใบเสร็จรับเงิน และใบกำกับภาษี จะพิมพ์ข้อมูลชุดนี้',
    back: 'กลับ',
    backToApplication: 'กลับไปที่คำขอ',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
    saved: 'บันทึกแล้ว',
    savedIncomplete: 'บันทึกแล้ว แต่ข้อมูลผู้ถือยังไม่ครบ',
    incomplete: 'ข้อมูลผู้ถือยังไม่ครบ ยังขาด',
    incompleteConsequence: 'กรอกให้ครบแล้วบันทึก ข้อมูลที่ยังไม่ครบใช้ยื่นคำขอไม่ได้ และออกใบรับรองไม่ได้',
    saveFailed: 'บันทึกไม่สำเร็จ ตรวจข้อมูลที่ระบบแจ้งแล้วลองอีกครั้ง',
    lockedRefused: 'ข้อมูลที่มาจากการยืนยันตัวตนแก้ไขเองไม่ได้',
    noRight: 'คุณดูข้อมูลผู้ถือนี้ได้ แต่ไม่มีสิทธิ์แก้ไข ติดต่อเจ้าของหรือผู้ดูแล',
    loading: 'กำลังโหลดข้อมูลผู้ถือ…',
    registration: 'เลขทะเบียน',
});

interface SaveError {
    message: string;
    fieldErrors: Record<string, string>;
}

export default function HolderRecordPage() {
    const params = useParams<{ id: string }>();
    const entityId = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const router = useRouter();
    const fromApplication = useSearchParams()?.get('from') === 'application';
    const { refresh } = useMyEntities();
    const { entity, holder, loading, error, reload } = useHolderRecord(entityId ?? null);

    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<SaveError | null>(null);

    useEffect(() => {
        if (entity && holder) { setValues(holderValues(holder, entity.type)); }
    }, [entity, holder]);

    const backHref = fromApplication ? '/health/applications/new/step/2' : '/health/workspaces';
    const canEdit = entity?.role === 'OWNER' || entity?.role === 'ADMIN';

    const save = async () => {
        if (!entity) { return; }
        setSaving(true);
        setSaved(false);
        setSaveError(null);
        try {
            const response = await apiClient.put<HolderEntityResponse>(
                `/entities/${encodeURIComponent(entity.id)}/holder`,
                holderInputFrom(entity.type, values),
            );
            if (!response.success) {
                setSaveError({
                    message: response.errorCode === 'HOLDER_FIELD_LOCKED' ? COPY_TH.lockedRefused : COPY_TH.saveFailed,
                    fieldErrors: fieldErrorsOf(response.meta),
                });
                return;
            }
            await Promise.all([reload(), refresh()]);
            setSaved(true);
            if (fromApplication) { router.push(backHref); }
        } catch {
            setSaveError({ message: COPY_TH.saveFailed, fieldErrors: {} });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full space-y-6">
            <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                {fromApplication ? COPY_TH.backToApplication : COPY_TH.back}
            </Link>

            <SummaryHeader eyebrow={COPY_TH.eyebrow} title={COPY_TH.title} description={COPY_TH.description} />

            {loading && <p role="status" className="text-sm text-muted-foreground">{COPY_TH.loading}</p>}
            {!loading && error && (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                    <button type="button" onClick={() => { void reload(); }} className="ms-2 font-semibold underline underline-offset-2">
                        {HOLDER_PAGE_COPY_TH.retry}
                    </button>
                </p>
            )}

            {entity && holder && (
                <>
                    <div className="space-y-2 rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-700">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                                {HOLDER_TYPES[entity.type].labelTh}
                            </span>
                            {holder.verified ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf-onSoft">
                                    <BadgeCheck className="h-3.5 w-3.5" />
                                    {HOLDER_PAGE_COPY_TH.verifiedBy[holder.identitySource as 'THAID' | 'MORPROM']}
                                </span>
                            ) : entity.type === 'INDIVIDUAL' && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                    {HOLDER_PAGE_COPY_TH.unverified}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-foreground">
                            <span className="text-muted-foreground">{HOLDER_TYPES[entity.type].registrationLabelTh}</span>
                            <span className="ms-2 font-mono">{holder.registrationNo || '-'}</span>
                        </p>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-700">
                        <HolderForm
                            type={entity.type}
                            values={values}
                            onChange={(path, value) => { setSaved(false); setValues((v) => ({ ...v, [path]: value })); }}
                            lockedFields={canEdit ? holder.lockedFields : Object.keys(values)}
                            fieldErrors={saveError?.fieldErrors ?? {}}
                            placeholders={holderPlaceholders(holder, entity.type)}
                        />
                    </div>

                    {!holder.complete && (
                        <div data-testid="holder-incomplete" role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                                {COPY_TH.incomplete} {(holder.missing ?? []).map((m) => m.labelTh).join(' ')}
                                <br />
                                {COPY_TH.incompleteConsequence}
                            </span>
                        </div>
                    )}

                    {!canEdit && <p role="status" className="text-sm text-muted-foreground">{COPY_TH.noRight}</p>}

                    {saveError && (
                        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{saveError.message}</span>
                        </div>
                    )}

                    {canEdit && (
                        <div className="flex items-center justify-end gap-3">
                            {saved && (holder.complete ? (
                                <span data-testid="holder-saved" role="status" className="inline-flex items-center gap-1 text-sm text-leaf-700">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {COPY_TH.saved}
                                </span>
                            ) : (
                                <span data-testid="holder-saved" role="status" className="inline-flex items-center gap-1 text-sm text-amber-800">
                                    <AlertTriangle className="h-4 w-4" />
                                    {COPY_TH.savedIncomplete}
                                </span>
                            ))}
                            <button
                                type="button"
                                onClick={() => { void save(); }}
                                disabled={saving}
                                className="rounded-lg bg-leaf-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-leaf-800 disabled:opacity-50"
                            >
                                {saving ? COPY_TH.saving : COPY_TH.save}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
