export interface SchedulerQueueItem {
    id: string;
    applicationId: string;
    applicationNumber: string;
    applicantName: string;
    status: string;
    workflowState: string;
    phase2Paid: boolean;
    receiptIssued: boolean;
    auditorId: string | null;
    auditorName: string | null;
    scheduledDate: string | null;
    mapLink: string | null;
    location: string | null;
    notes: string | null;
    estimatedDuration: number;
    // The field inspector asked for a second visit after reviewing the corrective evidence (order 27).
    isReinspectionRequired: boolean;
    overdueDays: number;
    // The date the company must inspect by: 60 working days after the second payment (order 56(1) 1.3).
    inspectBy?: string | null;
    // Whether the filing names someone on site, and when the applicant was asked to add one (order 65(2)).
    siteContactGiven?: boolean;
    siteContactRequestedAt?: string | null;
    siteContactRequestPending?: boolean;
}

export interface SchedulerCalendarEvent {
    applicationId: string;
    applicationNumber: string;
    applicantName: string;
    scheduledDate: string;
    auditorName: string | null;
    mapLink: string | null;
    location: string | null;
}

export interface SchedulerDashboardData {
    queues: {
        readyToSchedule: { total: number; items: SchedulerQueueItem[] };
        scheduledUpcoming: { total: number; items: SchedulerQueueItem[] };
        reinspectionRequired: { total: number; items: SchedulerQueueItem[] };
    };
    calendar: {
        events: SchedulerCalendarEvent[];
    };
    kpi: {
        scheduledToday: number;
        scheduledThisWeek: number;
        // Must match the key the backend scheduler-dashboard-handler.js emits
        // (`pendingScheduling`). A global AUDIT_FEE_PAID rename once drifted this
        // to `pendingAUDIT_FEE_PAID`, so the tile silently rendered 0. The sibling
        // /coordinator page already reads the correct `pendingScheduling`.
        pendingScheduling: number;
        reinspectionBacklog: number;
    };
}

export interface AuditorOption {
    id: string;
    fullName: string;
}

export const EMPTY_DASHBOARD: SchedulerDashboardData = {
    queues: {
        readyToSchedule: { total: 0, items: [] },
        scheduledUpcoming: { total: 0, items: [] },
        reinspectionRequired: { total: 0, items: [] },
    },
    calendar: { events: [] },
    kpi: {
        scheduledToday: 0,
        scheduledThisWeek: 0,
        pendingScheduling: 0,
        reinspectionBacklog: 0,
    },
};
