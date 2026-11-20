'use client';

/**
 * /health/status — single-page ตรวจสอบสถานะ (N8, tile-home-redesign task 6).
 *
 * One card per application: number, plant name, the status label and sentence,
 * the stepper every applicant page uses, and a prominent action button when the
 * applicant must act. All of it comes from `applicantStatus` in
 * lib/health-dashboard-stage.ts, the mapping the list, detail and dashboard read.
 * Cards needing action get a warning border and float to the top.
 *
 * Data source: `/applications/my`, the SAME endpoint + apiClient shape
 * already used by app/health/applications/client-view.tsx (the applications
 * list page) and lib/navigation/use-nav-chips.ts — no new backend endpoint.
 *
 * BackHomeCrumb: this page used to render it directly, but the redesign
 * shipped with exactly this ONE production caller — every other inner page
 * had no back-home affordance at all. Task 1 (D1/D2, W10) moved it to the
 * SHELL level (DashboardLayout, wrapping every /health/* route via
 * app/health/layout.tsx) so every inner page gets it by default; this page
 * no longer renders its own, or it would double up with the shell's copy.
 * See components/layout/__tests__/dashboard-layout-back-home-crumb.test.tsx
 * for the coverage that moved with it.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Leaf } from 'lucide-react';

import { apiClient as api } from '@/lib/api/api-client';
import { EmptyState } from '@/components/feature/empty-state';
import { Button } from '@/components/ui/primitives/button';
import { Card, CardContent } from '@/components/ui/primitives/card';
import {
  applicantStatus,
  STAGE_BADGE_STYLE,
  stepCounterTH,
  stepperStepsFor,
  type ApplicantStatus,
} from '@/lib/health-dashboard-stage';

interface ApplicationRecord {
  id: string;
  applicationNumber?: string;
  plantName?: string;
  status?: string;
  isRenewal?: boolean;
}

/** A closed file offers a new application; it is not "waiting on you" otherwise. */
function offersAction(view: ApplicantStatus): boolean {
  return view.needsUserAction || view.stage === 'CLOSED';
}

/**
 * Where the action button sends the applicant. Reuses existing routes —
 * mirrors applications/client-view.tsx's PENDING_*_FEE -> /health/payments
 * split, plus the detail page's own edit/car sub-routes for the other
 * action-required statuses. No new route is introduced.
 */
function actionHref(id: string, rawStatus: string | undefined): string {
  const status = String(rawStatus || '').trim().toUpperCase();
  switch (status) {
    case 'DRAFT':
    case 'REVISION_REQUESTED':
      return `/health/applications/${id}/edit`;
    case 'PENDING_DOC_FEE':
    case 'PENDING_AUDIT_FEE':
      return `/health/payments?app=${id}`;
    case 'CAR_PENDING':
      return `/health/applications/${id}/car`;
    case 'REJECTED':
    case 'EXPIRED':
    case 'CANCELLED':
      return '/health/applications/new';
    default:
      return `/health/applications/${id}`;
  }
}

export default function StatusClientView() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await api.get<ApplicationRecord[]>('/applications/my');
        if (cancelled) return;
        if (!result.success || !result.data) {
          setLoadError(result.error || 'ไม่สามารถโหลดรายการคำขอได้ในขณะนี้');
          setApplications([]);
        } else {
          setApplications(Array.isArray(result.data) ? result.data : []);
        }
      } catch {
        if (!cancelled) {
          setLoadError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
          setApplications([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // needsUserAction cards float to the top; Array#sort is stable, so the
  // relative order within each group (server's own order — newest first)
  // is preserved.
  const rows = useMemo(() => {
    return applications
      .map((app) => ({ app, view: applicantStatus(app.status, { isRenewal: app.isRenewal }) }))
      .sort((a, b) => Number(offersAction(b.view)) - Number(offersAction(a.view)));
  }, [applications]);

  return (
    <div className="flow-stack-lg animate-fade-in-up" role="main">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">ตรวจสอบสถานะ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          สถานะคำขอรับรอง GACP ของคุณ พร้อมสิ่งที่ต้องดำเนินการ
        </p>
      </div>

      {loadError ? (
        <Card
          data-testid="status-list-error"
          role="alert"
          className="border-2 border-rose-200 bg-rose-50/60 p-6 text-center"
        >
          <p className="text-sm text-rose-700">{loadError}</p>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-[1.375rem]" />
          ))}
        </div>
      ) : loadError ? null : rows.length === 0 ? (
        <EmptyState
          title="คุณยังไม่มีคำขอ"
          hint="เริ่มต้นสมัครขอใบรับรอง GACP แรกของคุณได้ทันที"
          action={
            <Button asChild variant="filled">
              <Link href="/health/applications/new" className="no-underline">
                สมัครขอใบรับรอง
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ app, view }) => {
            const id = app.id;
            const code = app.applicationNumber || `APP-${id.slice(-6).toUpperCase()}`;
            const plantName = app.plantName || 'พืชที่ยื่นขอ';
            const isTerminal = view.step === null;
            const needsAction = offersAction(view);
            const badge = STAGE_BADGE_STYLE[view.stage];
            const steps = stepperStepsFor({ isRenewal: app.isRenewal });

            return (
              <Card
                key={id}
                data-testid="status-app-card"
                data-needs-action={needsAction ? 'true' : 'false'}
                className={
                  needsAction
                    ? 'relative overflow-hidden border-2 border-amber-300'
                    : 'relative overflow-hidden border border-mint-bg'
                }
              >
                <Link
                  href={`/health/applications/${id}`}
                  aria-label={`${code} สถานะ ${view.label}`}
                  className="absolute inset-0 z-0 no-underline"
                />
                <CardContent className="relative z-10 p-5 pt-5 sm:p-6 sm:pt-6">
                  <div className="pointer-events-none flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={
                          needsAction
                            ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700'
                            : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-leaf-onSoft'
                        }
                      >
                        {needsAction ? (
                          <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" focusable="false" />
                        ) : (
                          <Leaf className="h-[18px] w-[18px]" aria-hidden="true" focusable="false" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{code}</span>
                          <span className="text-xs text-muted-foreground">{plantName}</span>
                          <span
                            data-testid="applicant-status-label"
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.bg} ${badge.text}`}
                          >
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                            {view.label}
                          </span>
                        </div>
                        <p data-testid="applicant-status-description" className="mt-1 text-sm text-foreground">{view.description}</p>
                      </div>
                    </div>

                    {needsAction ? (
                      <div className="pointer-events-auto relative z-10 w-full shrink-0 sm:w-auto">
                        <Button asChild variant="filled" size="sm" className="w-full sm:w-auto">
                          <Link href={actionHref(id, app.status)} data-testid="status-action-btn" className="no-underline">
                            {view.nextAction}
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {/* A closed file is off the ladder: no dot is marked current. */}
                  <div className="pointer-events-none mt-4">
                    <div className="flex items-center">
                      {steps.map((step, idx) => {
                        const rung = idx + 1;
                        const isComplete = !isTerminal && rung < (view.step ?? 0);
                        const isCurrent = !isTerminal && rung === view.step;
                        return (
                          <div key={step.stage} className="flex flex-1 items-center last:flex-none">
                            <span
                              data-testid="status-step-dot"
                              data-current={isCurrent ? 'true' : 'false'}
                              title={step.label}
                              className={
                                isComplete || isCurrent
                                  ? isCurrent
                                    ? 'h-2.5 w-2.5 shrink-0 rounded-full bg-leaf ring-2 ring-leaf/30'
                                    : 'h-2 w-2 shrink-0 rounded-full bg-leaf'
                                  : 'h-2 w-2 shrink-0 rounded-full bg-muted'
                              }
                            />
                            {idx < steps.length - 1 && (
                              <div className={isComplete ? 'h-0.5 flex-1 bg-leaf/50' : 'h-0.5 flex-1 bg-muted'} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {isTerminal ? (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">คำขอนี้สิ้นสุดกระบวนการแล้ว</p>
                    ) : (
                      <p data-testid="applicant-status-step" className="mt-1.5 text-[11px] text-muted-foreground">
                        {stepCounterTH(view)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
