/* ────────────────────────── Coordinator Types ────────────────────────── */

export interface SchedulerQueueItem {
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  status: string;
  workflowState: string;
  auditorId: string | null;
  auditorName: string | null;
  // C3 ("งานนี้พาสไปที่ใคร"): the assigned document reviewer (null until assigned),
  // so the coordinator can see who an already-assigned case was passed to.
  reviewerId: string | null;
  reviewerName: string | null;
  scheduledDate: string | null;
  mapLink: string | null;
  location: string | null;
  phase2Paid: boolean;
  receiptIssued: boolean;
  // The field inspector asked for a second visit after reviewing the corrective evidence (order 27).
  isReinspectionRequired: boolean;
  createdAt: string;
  updatedAt: string;
  // The date the company must inspect by, on every visit waiting or booked (order 56(1) 1.3).
  inspectBy?: string | null;
  // On the awaitingApplicant tab: the correction's deadline, and this round's reminder if one went out (3.1, 3.2).
  correctionDueAt?: string | null;
  reminderThisRound?: { sentAt: string | null; sentBy: string | null } | null;
}

export interface CalendarEvent {
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  scheduledDate: string | null;
  auditorName: string | null;
  location: string | null;
}

export interface SchedulerDashboard {
  queues: {
    readyForReview: { total: number; items: SchedulerQueueItem[] };
    readyToSchedule: { total: number; items: SchedulerQueueItem[] };
    scheduledUpcoming: { total: number; items: SchedulerQueueItem[] };
    reinspectionRequired: { total: number; items: SchedulerQueueItem[] };
    awaitingApplicant: { total: number; items: SchedulerQueueItem[] };
  };
  pipeline: {
    submitted: number;
    pendingDocFee: number;
    docFeePaid: number;
    assignedForReview: number;
    docApproved: number;
    pendingAuditFee: number;
    auditFeePaid: number;
    auditConfirmed: number;
  };
  calendar: { events: CalendarEvent[] };
  kpi: {
    scheduledToday: number;
    scheduledThisWeek: number;
    pendingScheduling: number;
    reinspectionBacklog: number;
    // P1-H (Wave-3): scheduler-group work activities that are overdue
    // (dueAt < now) or breached (breachedAt != null). Danger-tone tile.
    overdue: number;
  };
}

/** What the dispatcher reads before assigning or booking (GET /api/provider/scheduler/applications/:id). */
export interface DispatcherApplicationDetail {
  summary: {
    applicationNumber: string;
    status: string;
    applicantName: string;
    farmName: string | null;
    farmAddress: string;
    farmLatitude: number | null;
    farmLongitude: number | null;
    holder: { name: string | null; typeLabel: string | null } | null;
    scope: { cultivationTypes: string[]; plantName: string | null };
    purposes: string[];
  };
  payment: { m1Paid: boolean; m2Paid: boolean };
  reviewerName: string | null;
  inspectorName: string | null;
  schedule: { scheduledDate: string; location: string | null; mapLink: string | null } | null;
  reinspection: { status: string | null; reason: string | null; requestedAt: string | null } | null;
}

export interface ReviewerOption {
  id: string;
  fullName: string;
  role: string;
  canonicalRole: string;
}

export interface UrgentItem {
  id: string;
  applicationNumber: string;
  applicantName: string;
  status: string;
  // What the wait is counted from (order 56(1) 1.2): entering a stage staff hold, or a visit day passed with no result.
  clock?: "STAGE_ENTRY" | "VISIT_DAY";
  scheduledDate?: string | null;
  // Bangkok working days waited (order 27: never hours).
  workingDaysWaiting: number;
  severity: "CRITICAL" | "WARNING" | "INFO";
}

export interface UrgentMonitorData {
  stuckItems: UrgentItem[];
  deadlineItems: Array<Omit<UrgentItem, "workingDaysWaiting"> & { workingDaysLeft: number; deadlineDue: string }>;
  summary: {
    totalStuck: number;
    critical: number;
    warning: number;
    approachingDeadlines: number;
  };
}

export interface AuditorWorkloadItem {
  id: string;
  name: string;
  role: string;
  activeAssignments: number;
  completedLast30Days: number;
  // A document reviewer's load split in two; a field inspector's visits in the cap's window and the corrective evidence it reviews (order 56(1) 2.2).
  toReview?: number;
  waitingOnApplicant?: number;
  visitsWindowEnd?: string | null;
  carReviews?: number;
  // Dated workload cap of the officer's role in force; null when none is in force.
  capacity: number | null;
  utilizationPct: number | null;
  availability: "AVAILABLE" | "BUSY" | "FULL";
}

export interface AuditorWorkloadData {
  auditors: AuditorWorkloadItem[];
  summary: {
    totalAuditors: number;
    available: number;
    busy: number;
    full: number;
    totalActiveAssignments: number;
  };
}

export const EMPTY: SchedulerDashboard = {
  queues: {
    readyForReview: { total: 0, items: [] },
    readyToSchedule: { total: 0, items: [] },
    scheduledUpcoming: { total: 0, items: [] },
    reinspectionRequired: { total: 0, items: [] },
    awaitingApplicant: { total: 0, items: [] },
  },
  pipeline: {
    submitted: 0, pendingDocFee: 0, docFeePaid: 0, assignedForReview: 0,
    docApproved: 0, pendingAuditFee: 0, auditFeePaid: 0, auditConfirmed: 0,
  },
  calendar: { events: [] },
  kpi: {
    scheduledToday: 0,
    scheduledThisWeek: 0,
    pendingScheduling: 0,
    reinspectionBacklog: 0,
    overdue: 0,
  },
};
