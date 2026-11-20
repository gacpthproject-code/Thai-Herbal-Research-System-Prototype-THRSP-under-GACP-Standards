'use client';

/**
 * แก้ไขเอกสารตามที่เจ้าหน้าที่ขอ — the applicant's end of the per-slot loop.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────────
 * A filing used to come back as "แก้ไข" with one note, and the applicant
 * re-uploaded everything because they could not tell which paper was wrong. This
 * page shows ONLY the papers the officer asked for, each with the officer's own
 * words and a due date, and nothing else — the papers already accepted are not
 * on this screen at all, because re-sending them is exactly the work being
 * removed.
 *
 * ── THE RULES ARE NOT HERE ────────────────────────────────────────────────────
 * `revision-state.ts` holds whether a paper counts as replaced and whether the
 * filing may be sent back, mirroring the server. The screen may be LESS
 * permissive than the door, never more.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { apiClient as api } from '@/lib/api';
import { Button } from '@/components/ui/primitives/button';
import { Badge } from '@/components/ui/primitives/badge';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { formatThaiDate } from '@/lib/format/thai-date';
import { uploadDraftDocument } from '@/lib/services/draft-document-upload';
import { refusedFields, submitGateRefusalTh, type RefusedField } from '@/lib/services/application-requirements';
import {
    REVISION_COPY_TH as COPY,
    isReplaced,
    submitState,
    daysLeftLabel,
    type RequestedDocument,
} from './revision-state';

interface RequirementSlot {
    slotId: string;
    labelTH: string;
    uploadedAt: string | null;
}
interface RequirementsPayload {
    slots: RequirementSlot[];
    /** What the requirement engine cannot judge as filed: the applicant's answers, not a paper. */
    blockingIssues?: Array<{ code: string; messageTH: string }>;
    /** null means the ask could not be read — never "nothing was asked". */
    requestedDocuments: Array<{
        slotId: string; reason: string | null; dueDate: string | null; workingDaysLeft?: number | null; calendarDaysLeft?: number | null; requestedAt: string;
    }> | null;
}

function ReplaceButton({ applicationId, slotId, onUploaded }: { applicationId: string; slotId: string; onUploaded: () => Promise<void> }) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleFile(file: File | undefined) {
        if (!file) { return; }
        setBusy(true);
        setError(null);
        const result = await uploadDraftDocument({ file, slotId, applicationId, stepKey: 'revision' });
        if (result.error) {
            setError(result.error);
        } else {
            await onUploaded();
        }
        setBusy(false);
    }

    return (
        <div className="space-y-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
                {COPY.replaceCta}
            </Button>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }}
            />
        </div>
    );
}

export default function ClientView() {
    const params = useParams();
    const router = useRouter();
    const id = String((params as Record<string, string | string[] | undefined>)?.id || '');

    const [docs, setDocs] = useState<RequestedDocument[] | null>(null);
    const [issues, setIssues] = useState<Array<{ code: string; messageTH: string }>>([]);
    const [refused, setRefused] = useState<RefusedField[]>([]);
    // Two notices, kept apart so neither erases the other: `loadError` says the list on screen
    // could not be read (or re-read, so it may be stale); `error` says why a send-back was refused.
    const [loadError, setLoadError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        if (!id) { return; }
        const res = await api.get<RequirementsPayload>(`/api/applications/${id}/requirements?includeReviews=1`);
        if (!res.success || !res.data) {
            setLoadError(COPY.reviewsUnavailable);
            return;
        }
        if (res.data.requestedDocuments === null) {
            // Reported, not faked as an empty list. "Nothing was asked of you" is
            // the one thing a failed read must not say on this screen.
            setLoadError(COPY.reviewsUnavailable);
            return;
        }
        setIssues(Array.isArray(res.data.blockingIssues) ? res.data.blockingIssues : []);
        const bySlot = new Map(res.data.slots.map((s) => [s.slotId, s]));
        setDocs(res.data.requestedDocuments.map((r) => ({
            slotId: r.slotId,
            // The paper's own name. Nobody outside the codebase knows what
            // `sop_manual` is, and this is the screen where it matters most.
            labelTH: bySlot.get(r.slotId)?.labelTH || r.slotId,
            reason: r.reason,
            dueDate: r.dueDate,
            workingDaysLeft: typeof r.workingDaysLeft === 'number' ? r.workingDaysLeft : null,
            calendarDaysLeft: typeof r.calendarDaysLeft === 'number' ? r.calendarDaysLeft : null,
            requestedAt: r.requestedAt,
            uploadedAt: bySlot.get(r.slotId)?.uploadedAt || null,
        })));
        setLoadError(null);
        setError(null);
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    const state = useMemo(() => submitState(docs || []), [docs]);

    async function sendBack() {
        setSending(true);
        setError(null);
        const res = await api.post(`/api/applications/${id}/revision-resubmit`, {});
        setSending(false);
        if (!res.success) {
            // The gate's Thai travels in `.meta` (the envelope strips `message`), and a
            // successful reload below clears `error`, so the refusal is set after it.
            const fields = refusedFields(res.meta);
            const said = submitGateRefusalTh(res.code ?? res.error, res.meta)
                ?? (typeof res.meta?.messageTh === 'string' ? res.meta.messageTh : null);
            await load();
            setRefused(fields);
            setError(fields.length > 0 ? null : (said || 'ส่งกลับให้เจ้าหน้าที่ไม่สำเร็จ'));
            return;
        }
        router.push(`/health/applications/${id}`);
    }

    if (loadError && !docs) {
        return (
            <div className="mx-auto max-w-3xl p-6">
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {loadError}
                </p>
            </div>
        );
    }
    if (!docs) { return <PageSkeleton />; }

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
                <p className="text-sm text-muted-foreground">{COPY.intro}</p>
            </header>

            {loadError && (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {loadError}
                </p>
            )}

            {error && (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </p>
            )}

            {refused.length > 0 && (
                <section role="alert" className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                    <h2 className="text-sm font-medium text-foreground">{COPY.refusedTitle}</h2>
                    <p className="text-xs text-muted-foreground">{COPY.refusedIntro}</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                        {refused.map((field, index) => <li key={`${field.key}-${index}`}>{field.message}</li>)}
                    </ul>
                    <Button asChild variant="outline">
                        <a href={`/health/applications/${id}/edit`}>{COPY.editAnswersCta}</a>
                    </Button>
                </section>
            )}

            {issues.length > 0 && (
                <section data-blocking-issues className="space-y-3 rounded-2xl border border-amber-400 bg-card p-4">
                    <h2 className="text-sm font-medium text-foreground">{COPY.answersTitle}</h2>
                    <p className="text-xs text-muted-foreground">{COPY.answersIntro}</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                        {issues.map((issue) => <li key={issue.code}>{issue.messageTH}</li>)}
                    </ul>
                    <Button asChild variant="outline">
                        <a href={`/health/applications/${id}/edit`}>{COPY.editAnswersCta}</a>
                    </Button>
                </section>
            )}

            {docs.length === 0 && issues.length === 0 && (
                <p role="status" className="rounded-xl border-2 border-muted bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                    {COPY.nothingRequested}
                </p>
            )}

            {docs.map((doc) => {
                const replaced = isReplaced(doc);
                const left = daysLeftLabel(doc);
                return (
                    <section
                        key={doc.slotId}
                        className={`space-y-2 rounded-2xl border bg-card p-4 ${replaced ? 'border-muted' : 'border-amber-400'}`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-sm font-medium text-foreground">{doc.labelTH}</h2>
                            <Badge className={replaced ? 'bg-leaf-soft text-leaf-800' : 'bg-amber-100 text-amber-900'}>
                                {replaced ? COPY.replaced : COPY.stillNeeded}
                            </Badge>
                        </div>

                        {doc.reason && (
                            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                <span className="font-medium">{COPY.reasonLabel}: </span>{doc.reason}
                            </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                            {COPY.dueLabel} {formatThaiDate(doc.dueDate, { day: 'numeric', month: 'long', year: 'numeric' }, '—')}
                            {left && <span className={`ml-2${left.overdue ? ' text-destructive' : ''}`}>({left.text})</span>}
                        </p>

                        <ReplaceButton applicationId={id} slotId={doc.slotId} onUploaded={load} />
                    </section>
                );
            })}

            <section className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-2xl border border-muted bg-card p-4">
                <Button
                    type="button"
                    className="bg-leaf-700 text-white hover:bg-leaf-800 disabled:bg-leaf-300"
                    disabled={!state.canSubmit || sending}
                    onClick={() => void sendBack()}
                >
                    {COPY.submit}
                </Button>
                {state.blockedReason && (
                    <p className="text-xs text-muted-foreground">{state.blockedReason}</p>
                )}
            </section>
        </div>
    );
}
