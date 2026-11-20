'use client';

/**
 * Step 2 — ผู้ขอรับการรับรอง (กทล.1 ส่วนที่ ๑).
 *
 * Two halves, each from a different authority:
 *
 *   the IDENTITY is the holder record chosen at step 1 (order 142): shown read-only, exactly
 *   what กทล.1, the certificate and the receipt will print, with one link to the holder
 *   page to change it. Nothing about the holder is typed into the application;
 *
 *   the DOCUMENT CARDS come from the SERVER's requirements payload, intersected with the
 *   papers this step owns. The engine has already scoped that payload by holder type.
 *
 * Presentational on purpose: the step page owns fetching, so this half renders in a test
 * without a store, a router or a network.
 */

import Link from 'next/link';
import { AlertTriangle, BadgeCheck, Pencil } from 'lucide-react';
import { useApplicationFlowStore } from '../hooks/use-application-flow-store';
import { useRequirementSlots, SLOTS_LOADING_TH, SLOTS_PENDING_TH } from '../hooks/use-requirement-slots';
import { STEP2_COPY_TH } from './step2-identity-config';
import { step2QualificationSlots } from './requirement-slot-card-state';
import { RequirementSlotCard } from './requirement-slot-card';
import { useHolderRecord } from '@/lib/holder/use-holder-record';
import {
    HOLDER_PAGE_COPY_TH,
    holderPrintRows,
    type HolderRecord,
} from '@/lib/holder/holder-registry';
import type { RequirementBlockingIssue, RequirementSlot } from '@/lib/services/application-requirements';

export interface Step2IdentityProps {
    holder: HolderRecord | null;
    holderLoading: boolean;
    holderError: string | null;
    onRetryHolder: () => void;
    /** The server's answer for this filing. Never a list this screen keeps. */
    slots: readonly RequirementSlot[];
    blockingIssues?: readonly RequirementBlockingIssue[] | null;
    appId: string;
    /** Re-read the server's answer after an upload. */
    onChanged: () => void;
    /** The server's word that this filing still takes document writes (delete control). */
    editable?: boolean;
}

export function holderPageHref(holderId: string): string {
    return `/health/holders/${encodeURIComponent(holderId)}?from=application`;
}

function HolderSummary({ holder }: { holder: HolderRecord }) {
    const rows = holderPrintRows(holder);
    return (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map((r) => (
                <div key={r.label} className="min-w-0">
                    <dt className="text-[13px] text-foreground/80">{r.label}</dt>
                    <dd className={r.value ? 'break-words text-sm text-foreground' : 'text-sm text-amber-700'}>
                        {r.value || STEP2_COPY_TH.notFilled}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export function Step2Identity({
    holder, holderLoading, holderError, onRetryHolder, slots, blockingIssues = null, appId, onChanged, editable = false,
}: Step2IdentityProps) {
    const qualificationSlots = step2QualificationSlots(slots);
    // The server answered and asked for nothing here: say why, never leave the section out
    // (staging walk ccc4f707d, F13: a silent step 2 read as "no papers needed").
    const emptyAnswer = qualificationSlots.length === 0 && blockingIssues !== null;

    return (
        <div className="space-y-8">
            <section className="space-y-4" aria-labelledby="step2-holder-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                        <h3 id="step2-holder-heading" className="text-sm font-semibold text-foreground">{HOLDER_PAGE_COPY_TH.summaryHeading}</h3>
                        <p className="text-[13px] text-foreground/80">{HOLDER_PAGE_COPY_TH.summaryHelp}</p>
                    </div>
                    {holder && (
                        <Link
                            href={holderPageHref(holder.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-leaf-700 px-3 py-1.5 text-sm font-semibold text-leaf-700 hover:bg-leaf-soft"
                        >
                            <Pencil className="h-4 w-4" />
                            {HOLDER_PAGE_COPY_TH.editHolder}
                        </Link>
                    )}
                </div>

                {holderLoading && (
                    <p role="status" className="rounded-xl border-2 border-muted bg-card px-4 py-3 text-center text-sm text-foreground/80">
                        กำลังโหลดข้อมูลผู้ถือ…
                    </p>
                )}
                {!holderLoading && holderError && (
                    <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {holderError}
                        <button type="button" onClick={onRetryHolder} className="ms-2 font-semibold underline underline-offset-2">
                            {HOLDER_PAGE_COPY_TH.retry}
                        </button>
                    </p>
                )}
                {!holderLoading && !holderError && !holder && (
                    <p role="status" className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
                        {HOLDER_PAGE_COPY_TH.noHolder}
                    </p>
                )}
                {holder && (
                    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                        {holder.verified && (
                            <p className="inline-flex items-center gap-1 rounded-full bg-leaf-soft px-2.5 py-0.5 text-[13px] font-semibold text-leaf-onSoft">
                                <BadgeCheck className="h-3.5 w-3.5" />
                                {HOLDER_PAGE_COPY_TH.verifiedBy[holder.identitySource as 'THAID' | 'MORPROM']}
                            </p>
                        )}
                        <HolderSummary holder={holder} />
                        {!holder.complete && (
                            <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    {HOLDER_PAGE_COPY_TH.incomplete}
                                    {' '}
                                    ({holder.missing.map((m) => m.labelTh).join(' ')})
                                </span>
                            </p>
                        )}
                    </div>
                )}
            </section>

            {emptyAnswer && (
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">{STEP2_COPY_TH.documentsHeading}</h3>
                    {blockingIssues.length > 0
                        ? blockingIssues.map((issue) => (
                            <p key={issue.code} role="status" className="rounded-xl border border-caution-edge bg-card px-4 py-3 text-sm text-foreground">
                                {issue.messageTH}
                            </p>
                        ))
                        : <p role="status" className="text-[13px] text-foreground/80">{STEP2_COPY_TH.noQualificationPapers}</p>}
                </section>
            )}
            {qualificationSlots.length > 0 && (
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">{STEP2_COPY_TH.documentsHeading}</h3>
                    <p className="text-[13px] text-foreground/80">{STEP2_COPY_TH.documentsHelp}</p>
                    <div className="space-y-3">
                        {qualificationSlots.map((slot) => (
                            <RequirementSlotCard
                                key={slot.slotId}
                                slot={slot}
                                appId={appId}
                                onChanged={onChanged}
                                editable={editable}
                                stepKey="identity"
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

export default Step2Identity;

/**
 * The routed step. Separated from the presentational half above so that half can be
 * rendered in a test without a store, a router or a network — and so the fetching
 * lives in exactly one place.
 *
 * It ASKS THE SERVER for the requirement payload and re-asks after every upload. It
 * never marks a card satisfied locally: the server is the only thing that decides
 * whether a slot is filled, and a browser that answers that question for itself is how
 * a farmer was told ครบ on one screen and ไม่ครบ on the next.
 */
export function Step2IdentityStep() {
    const { state } = useApplicationFlowStore();
    const appId = state.applicationId ?? '';
    // Honest states (2026-09-06): a missing appId or an in-flight read must never
    // render this step's slot section as empty-because-nothing-owed.
    const { slots, loading, error: loadError, pending, editable, blockingIssues, reload } = useRequirementSlots(appId);

    const holderRecord = useHolderRecord(state.holderEntityId);

    return (
        <div className="space-y-4">
            {loading && (
                <p role="status" className="rounded-xl border-2 border-muted bg-card px-4 py-3 text-center text-sm text-foreground/80">
                    {SLOTS_LOADING_TH}
                </p>
            )}
            {!loading && pending && (
                <p role="status" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground/80">
                    {SLOTS_PENDING_TH}
                </p>
            )}
            {!loading && !pending && loadError && (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {loadError}
                    <button
                        type="button"
                        onClick={() => { void reload(); }}
                        className="ms-2 font-semibold underline underline-offset-2"
                    >
                        ลองใหม่
                    </button>
                </p>
            )}
            <Step2Identity
                holder={holderRecord.holder}
                holderLoading={holderRecord.loading}
                holderError={holderRecord.error}
                onRetryHolder={() => { void holderRecord.reload(); }}
                slots={[...slots]}
                blockingIssues={loading || pending || loadError ? null : blockingIssues}
                editable={editable}
                appId={appId}
                onChanged={() => { void reload(); }}
            />
        </div>
    );
}
