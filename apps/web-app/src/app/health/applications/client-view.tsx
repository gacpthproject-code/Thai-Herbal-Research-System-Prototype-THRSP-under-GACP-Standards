'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Leaf } from 'lucide-react';
import { ConfirmDialog, EmptyState, FilterBar, SummaryHeader } from '@/components/feature';
import { Button } from '@/components/ui/primitives/button';
import { Card } from '@/components/ui/primitives/card';
import { apiClient as api } from '@/lib/api/api-client';
import {
  type ApplicantStatus,
  type HealthDashboardStage,
  applicantStatus,
  STAGE_BADGE_STYLE,
  stepperStepsFor,
  stepperIndexFor,
} from '@/lib/health-dashboard-stage';
import { AuthService } from '@/lib/services/auth-service';
import { daysLeftLabel } from './[id]/revision/revision-state';
import { unfiledLabel } from '@/lib/filing-date';
import { useLanguage } from '@/lib/i18n/language-context';
import { HolderFilterChips, HolderLine, useHolderFilter } from '@/components/holder/holder-list';
import type { EntityMembership } from '@/lib/services/my-entities-provider';

interface Application {
  /** round 3: from GET /applications/my — names a renewal's charge as the renewal. */
  isRenewal?: boolean;
  id: string;
  applicationNumber?: string;
  status: string;
  workflowState?: string;
  /** The holder entity the application is filed for. */
  entityId?: string | null;
  /** The user who filed it; a draft's creator may delete it. */
  submitterId?: string | null;
  createdAt: string;
  submittedAt?: string | null;
  plantType?: string;
  plantName?: string;
  farmName?: string | null;
  province?: string;
  revisionWorkingDaysLeft?: number | null;
  carCalendarDaysLeft?: number | null;
}

type FilterKey = 'ALL' | 'ACTION_REQUIRED' | 'IN_PROGRESS' | 'COMPLETED';

// W3-C: the filter labels are computed inside the component now via
// dict.applicationsList + dict.filters so they react to the language
// toggle. Keeping the FilterKey list immutable; the labels were
// extracted into buildFilterOptions(dict) below.

type StageFilterGroup = Exclude<FilterKey, 'ALL'>;

const FINISHED_STAGES: ReadonlySet<HealthDashboardStage> = new Set(['APPROVED', 'CERTIFIED', 'CLOSED']);

/** Which filter chip an application belongs to: a partition, so every row counts once. */
function statusFilterGroup(view: ApplicantStatus): StageFilterGroup {
  if (view.needsUserAction) return 'ACTION_REQUIRED';
  return FINISHED_STAGES.has(view.stage) ? 'COMPLETED' : 'IN_PROGRESS';
}

function formatThaiDate(dateValue: string, locale: string = 'th-TH'): string {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: '2-digit' });
}

function countdownOf(days: { workingDaysLeft: number | null; calendarDaysLeft: number | null }): { label: string; urgency: 'critical' | 'warning' | 'info' } | null {
  const left = daysLeftLabel(days);
  if (!left) return null;
  const count = days.workingDaysLeft ?? days.calendarDaysLeft ?? 0;
  return { label: left.text, urgency: left.overdue || count === 0 ? 'critical' : count <= 2 ? 'warning' : 'info' };
}

/**
 * What the caller may do with a draft, by the rule the server enforces
 * (holder-access.js, spec 2026-09-30 §3.3): continuing needs edit on the holder;
 * deleting needs the holder's OWNER, or the draft's creator who may still edit.
 * A holder missing from /entities/mine offers neither.
 */
function draftActionsFor(app: Application, holder: EntityMembership | undefined, myUserId: string | undefined) {
  const canEdit = holder?.can.edit === true;
  const isOwner = holder?.membershipStatus === 'ACTIVE' && holder.role === 'OWNER';
  return {
    canContinue: canEdit,
    canDelete: isOwner || (canEdit && Boolean(myUserId) && app.submitterId === myUserId),
  };
}

function statusMatchesFilter(view: ApplicantStatus, filter: FilterKey): boolean {
  if (filter === 'ALL') return true;
  return statusFilterGroup(view) === filter;
}

// ── Stepper Sub-Component ───────────────────────────────────────────────────

function MiniStepper({ stage, isRenewal }: { stage: HealthDashboardStage; isRenewal?: boolean | undefined }) {
  const currentIdx = stepperIndexFor(stage, { isRenewal });
  // Show condensed 8-step stepper
  return (
    <div className="flex items-center gap-0.5">
      {stepperStepsFor({ isRenewal }).map((step, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={step.stage} className="flex items-center">
            <div
              className={`h-2 w-2 rounded-full transition-all ${
                isComplete ? 'bg-leaf' : isCurrent ? 'scale-125 bg-leaf ring-2 ring-leaf/30' : 'bg-slate-200'
              }`}
              title={step.label}
            />
            {idx < stepperStepsFor({ isRenewal }).length - 1 && (
              <div className={`h-0.5 w-3 ${isComplete ? 'bg-leaf/50' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dict, language } = useLanguage();
  const listDict = dict.applicationsList;
  const dateLocale = language === 'en' ? 'en-US' : 'th-TH';

  // W3-C: filter labels mirror the dict.filters keys so the segmented
  // control localizes alongside the rest of the page.
  const filterOptions = useMemo<Array<{ key: FilterKey; label: string }>>(() => [
    { key: 'ALL', label: dict.common.all },
    { key: 'ACTION_REQUIRED', label: dict.filters.actionRequired },
    { key: 'IN_PROGRESS', label: dict.filters.inProgress },
    { key: 'COMPLETED', label: dict.filters.completed },
  ], [dict]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterKey>('ALL');
  const holder = useHolderFilter();
  const holderSelectedId = holder.selectedId;
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  // Wave E.3-C follow-up: ConfirmDialog state for "cancel draft".
  // Stores the draft id awaiting confirmation; null when no dialog is open.
  const [pendingDeleteDraftId, setPendingDeleteDraftId] = useState<string | null>(null);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);

  useEffect(() => {
    const user = AuthService.getUser();
    if (!user) {
      router.replace('/auth/health/login');
      return;
    }

    const requestedStatus = (searchParams.get('status') || 'ALL').toUpperCase() as FilterKey;
    if (filterOptions.some((item) => item.key === requestedStatus)) {
      setStatusFilter(requestedStatus);
    }
    setSearchQuery(searchParams.get('q') || '');
    void loadApplications();
    // filterOptions only swaps display labels (keys are stable), so omit
    // it from deps to avoid re-loading the listing on every language
    // toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  const loadApplications = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.get<Application[]>('/applications/my');
      if (!result.success || !result.data) {
        setLoadError(result.error || listDict.loadError);
        setApplications([]);
      } else {
        const list = Array.isArray(result.data)
          ? result.data
          : ((result.data as unknown as { data?: Application[] }).data || []);
        setApplications(list);
      }
    } catch {
      setLoadError(listDict.loadErrorRetry);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  // Phase 9: cancel a DRAFT row in place. Backend endpoint exists since
  // 2026-04-29 (DELETE /api/applications/draft/:id) but had no UI before.
  // Wave E.3-C follow-up: confirmation moved from window.confirm to
  // ConfirmDialog (state-driven, i18n-aware).
  async function performDeleteDraft(id: string) {
    setIsDeletingDraft(true);
    try {
      const res = await api.delete<{ deleted: boolean }>(`/applications/draft/${encodeURIComponent(id)}`);
      if (!res.success) {
        setLoadError(res.error || listDict.deleteDraftError);
        return;
      }
      await loadApplications();
    } catch {
      setLoadError(listDict.deleteDraftErrorGeneric);
    } finally {
      setIsDeletingDraft(false);
      setPendingDeleteDraftId(null);
    }
  }

  const stageMap = useMemo(
    () => new Map(applications.map((app) => [app.id, applicantStatus(app.status, { isRenewal: app.isRenewal })])),
    [applications],
  );

  const stats = useMemo(() => {
    let actionRequired = 0;
    let inProgress = 0;
    let completed = 0;
    applications.forEach((app) => {
      const group = statusFilterGroup(stageMap.get(app.id)!);
      if (group === 'ACTION_REQUIRED') actionRequired++;
      else if (group === 'IN_PROGRESS') inProgress++;
      else completed++;
    });
    return { total: applications.length, actionRequired, inProgress, completed };
  }, [applications, stageMap]);

  const tabCount = useMemo(() => {
    const counts: Record<FilterKey, number> = { ALL: 0, ACTION_REQUIRED: 0, IN_PROGRESS: 0, COMPLETED: 0 };
    applications.forEach((app) => {
      counts.ALL++;
      counts[statusFilterGroup(stageMap.get(app.id)!)]++;
    });
    return counts;
  }, [applications, stageMap]);

  const filteredApplications = useMemo(() => {
    return applications
      .filter((app) => statusMatchesFilter(stageMap.get(app.id)!, statusFilter))
      .filter((app) => holderSelectedId === null || app.entityId === holderSelectedId)
      .filter((app) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return [app.applicationNumber, app.id, app.farmName, app.plantName, app.plantType, app.province]
          .some((field) => String(field || '').toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [applications, searchQuery, sortBy, stageMap, statusFilter, holderSelectedId]);

  const myUserId = AuthService.getUser()?.id;
  const holderById = new Map(holder.entities.map((e) => [e.id, e]));

  const listRows = filteredApplications.map((app) => {
    const view = stageMap.get(app.id)!;
    const stage = view.stage;
    const rawStatus = String(app.status || '').toUpperCase();
    const rawWorkflow = String(app.workflowState || '').toUpperCase();
    const isCarPending = rawStatus === 'CAR_PENDING' || rawWorkflow === 'CAR_PENDING';
    const deadlineCountdown = countdownOf({ workingDaysLeft: app.revisionWorkingDaysLeft ?? null, calendarDaysLeft: app.carCalendarDaysLeft ?? null });

    return {
      id: app.id,
      code: app.applicationNumber || `APP-${app.id.slice(-6).toUpperCase()}`,
      farmName: app.farmName || '-',
      holderName: holder.holderOf(app),
      stage,
      view,
      stageLabel: view.label,
      dateLabel: app.submittedAt
        ? `${dict.common.submitDate} ${formatThaiDate(app.submittedAt, dateLocale)}`
        : unfiledLabel(app.status),
      actionLabel: view.nextAction,
      isRenewal: app.isRenewal,
      // Pending-fee stages get an explicit, separate "pay" button on the card
      // (the rest of the card navigates to the status page — matching the
      // dashboard). 2026-06-25: previously the WHOLE card linked to /payments,
      // so the applicant could never open the status page from the list.
      isPaymentStage: stage === 'PENDING_FEE_PHASE1' || stage === 'PENDING_FEE_PHASE2',
      deadlineCountdown,
      isCarPending,
      draftActions: draftActionsFor(app, app.entityId ? holderById.get(app.entityId) : undefined, myUserId),
    };
  });

  return (
    <div className="flow-stack-lg animate-fade-in-up" role="main">
      <SummaryHeader
        eyebrow={dict.eyebrow.applicantApplications}
        title={listDict.title}
        description={listDict.subtitle}
        metrics={[
          // The list below already refuses its empty state while `loadError` is set.
          // These four tiles are the same claim as a number: '0 คำขอทั้งหมด' over a
          // failed read tells an applicant they have filed nothing.
          { label: listDict.metricTotal, value: loadError ? '—' : stats.total.toLocaleString(dateLocale) },
          { label: listDict.metricActionRequired, value: loadError ? '—' : stats.actionRequired.toLocaleString(dateLocale) },
          { label: listDict.metricInProgress, value: loadError ? '—' : stats.inProgress.toLocaleString(dateLocale) },
          { label: listDict.metricCompleted, value: loadError ? '—' : stats.completed.toLocaleString(dateLocale) },
        ]}
        actions={
          // h-11 below sm:, h-9 from sm: up — 44px for a thumb, compact for a mouse.
          <Button asChild variant="secondary" size="sm" className="h-11 sm:h-9">
            <Link href="/health/applications/new" className="no-underline" aria-label={dict.common.newApplication}>
              {listDict.newApplicationBtn}
            </Link>
          </Button>
        }
      />

      <HolderFilterChips entities={holder.entities} selectedId={holder.selectedId} onSelect={holder.setSelectedId} />

      <FilterBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        activeFilter={statusFilter}
        onFilterChange={(value) => setStatusFilter(value as FilterKey)}
        options={filterOptions.map((option) => ({
          key: option.key,
          label: option.label,
          count: tabCount[option.key],
        }))}
      />

      {/* X1-FIX-C / H-2 — upgraded error surface.
          The previous one-liner destructive card was easy to scroll past
          and lacked a retry CTA, so applicants whose backend was down
          saw an EmptyState below ("no applications match this filter")
          and assumed they had to use the wizard. Now we render a
          prominent rose-bordered card with title + body + retry,
          mirroring the pattern from certificates/client-view.tsx
          (data-testid="cert-list-error") so users get one consistent
          recovery affordance across HEALTH pages. */}
      {loadError ? (
        <Card
          data-testid="applications-list-error"
          role="alert"
          className="rounded-[1.375rem] border-2 border-rose-200 bg-rose-50/60 p-8 text-center"
        >
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" aria-hidden="true" focusable="false" />
          <h3 className="text-base font-bold text-rose-800">
            {dict.common?.fetchError?.title || 'Unable to load data'}
          </h3>
          <p className="mt-1 text-sm text-rose-700">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 border-rose-300 text-rose-700 hover:bg-rose-100"
            onClick={() => loadApplications()}
          >
            {dict.common?.fetchError?.retry || 'Try again'}
          </Button>
        </Card>
      ) : null}

      {/* Application Cards with Mini Stepper */}
      <section className="flow-stack-md" aria-label={listDict.listHeading}>
        <div className="flex flex-col flex-wrap items-start justify-between gap-2 sm:flex-row sm:items-center">
          <h2 className="text-base font-semibold text-foreground sm:text-lg lg:text-xl">{listDict.listHeading}</h2>
          <p className="text-sm text-muted-foreground">{listRows.length.toLocaleString(dateLocale)} {listDict.itemCount}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-[1.375rem]" />)}
          </div>
        ) : loadError ? null : listRows.length === 0 ? (
          <EmptyState
            title={listDict.emptyTitle}
            hint={listDict.emptyHint}
          />
        ) : (
          <div className="space-y-3">
            {listRows.map((row) => {
              const badge = STAGE_BADGE_STYLE[row.stage];
              const isActionRequired = row.view.needsUserAction;
              const deadline = row.deadlineCountdown;
              return (
                <div
                  key={row.id}
                  className="group rounded-[1.375rem] border border-mint-bg bg-card shadow-leaf-card transition-all hover:shadow-leaf-card-hover"
                >
                {/* Card body → the status/detail page, via a stretched link
                    BEHIND the content (matches how the dashboard links an app).
                    The pay button (pending-fee) opts back into pointer events so
                    clicking it goes to /payments, while clicking anywhere else on
                    the card opens the status page. (2026-06-25 — previously the
                    WHOLE card linked to /payments, so the status page was
                    unreachable from the list.) */}
                <div className="relative p-4 active:scale-[0.995] sm:p-5">
                  <Link
                    href={`/health/applications/${row.id}`}
                    aria-label={`${row.code} — ${row.stageLabel}`}
                    className="absolute inset-0 z-0 rounded-[1.375rem] no-underline"
                  />
                  <div className="pointer-events-none relative z-10">
                  {/* Top row: Code + Badge + Date.
                      Mobile: code/badge/date stack vertically and the
                      CTA pill wraps onto its own row below — this stops
                      long Thai action labels (e.g.
                      "ชำระเงินงวดที่ 1") from squeezing the
                      application number into 2-3 chars at 360px. */}
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* ui_kit reskin (Wave 3, 2026-06-09): leaf-icon row + pill
                        status chip, matching the ref applications table + the
                        verified dashboard. Functionality (filters/stepper/
                        deadline/draft) is unchanged. */}
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-leaf-onSoft">
                        <Leaf className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{row.code}</span>
                          <span data-testid="applicant-status-label" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                            {row.stageLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{row.farmName} · {row.dateLabel}</p>
                        <HolderLine name={row.holderName} />
                      </div>
                    </div>
                    {/* CTA. Pending-fee → a SEPARATE pay Link (pointer-events
                        re-enabled) so it routes to /payments while the rest of
                        the card opens the status page. Other stages render a
                        non-interactive label — the card's stretched link carries
                        the click to the status page. */}
                    <div className={`w-full shrink-0 sm:w-auto ${row.isPaymentStage ? 'pointer-events-auto' : ''}`}>
                      {row.isPaymentStage ? (
                        <Link
                          href={`/health/payments?app=${row.id}`}
                          className="relative z-10 inline-flex min-h-[44px] w-full items-center justify-center gap-1 whitespace-normal rounded-full bg-leaf px-4 py-2 text-xs font-semibold text-white no-underline shadow-leaf-btn transition-colors hover:bg-leaf-600 sm:min-h-0 sm:w-auto sm:py-2"
                        >
                          {row.actionLabel}
                          <span className="transition-transform group-hover:translate-x-0.5">→</span>
                        </Link>
                      ) : (
                        <span className={`inline-flex min-h-[44px] w-full items-center justify-center gap-1 whitespace-normal rounded-full px-4 py-2 text-xs font-semibold transition-colors sm:min-h-0 sm:w-auto sm:py-2 ${
                          isActionRequired
                            ? 'bg-leaf text-white shadow-leaf-btn group-hover:bg-leaf-600'
                            : 'bg-leaf-soft text-leaf-onSoft group-hover:bg-leaf-soft/70'
                        }`}>
                          {row.actionLabel}
                          <span className="transition-transform group-hover:translate-x-0.5">→</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress stepper */}
                  <div className="mt-3 flex items-center justify-between">
                    <MiniStepper stage={row.stage} isRenewal={row.isRenewal} />
                    {row.view.step !== null && (
                      <span data-testid="applicant-status-step" className="text-[10px] text-muted-foreground">
                        {listDict.stepLabel
                          .replace('{current}', String(row.view.step))
                          .replace('{total}', String(row.view.totalSteps))}
                      </span>
                    )}
                  </div>

                  {/* Description overlay for action-required items */}
                  {isActionRequired && (
                    <div data-testid="applicant-status-description" className="mt-2 rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
                      {row.view.description}
                    </div>
                  )}

                  {/* Deadline countdown — Phase 9 (revision) + Phase 10 (CAR).
                      Same urgency tones; copy switches based on which deadline
                      applies. */}
                  {deadline ? (
                    <div
                      className={`mt-2 rounded-xl px-3 py-1.5 text-[11px] font-semibold ${
                        deadline.urgency === 'critical'
                          ? 'bg-red-50 text-red-700'
                          : deadline.urgency === 'warning'
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {deadline.label}{' '}
                      {deadline.urgency === 'critical'
                        ? (row.isCarPending ? dict.deadline.carUrgent : dict.deadline.revisionUrgent)
                        : (row.isCarPending ? dict.deadline.beforeCarDeadline : dict.deadline.beforeRevisionDeadline)}
                    </div>
                  ) : null}
                  </div>
                </div>
                {/* Draft footer — continue/delete actions. Both outside
                    the Link so the click doesn't propagate. The
                    detail-page CTA (CONTINUE_DRAFT in
                    application-detail-page-helpers) routes to the same
                    edit page; mirroring it here saves the farmer one
                    extra click — they reported having to drill through
                    the detail page to find the resume button. */}
                {row.stage === 'DRAFT' && (row.draftActions.canContinue || row.draftActions.canDelete) ? (
                  <div className="flex items-center justify-between border-t border-mint-bg px-4 py-1 sm:px-5">
                    {row.draftActions.canContinue ? (
                      <Link
                        href={`/health/applications/${row.id}/edit`}
                        className="inline-flex min-h-[44px] items-center text-xs font-semibold text-leaf-700 hover:underline"
                      >
                        {listDict.continueDraft}
                      </Link>
                    ) : <span />}
                    {row.draftActions.canDelete ? (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteDraftId(row.id)}
                        className="inline-flex min-h-[44px] items-center text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                      >
                        {listDict.deleteDraft}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Wave E.3-C follow-up: replacement for window.confirm() on the
          delete-draft button. Caller-controlled state pattern preserves
          the per-row context (we know which row is being deleted via
          pendingDeleteDraftId). */}
      <ConfirmDialog
        open={pendingDeleteDraftId !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingDraft) setPendingDeleteDraftId(null);
        }}
        onConfirm={() => {
          if (pendingDeleteDraftId) performDeleteDraft(pendingDeleteDraftId);
        }}
        title={listDict.deleteDraftTitle}
        description={listDict.deleteDraftDesc}
        confirmLabel={listDict.deleteDraftConfirm}
        variant="destructive"
      />
    </div>
  );
}
