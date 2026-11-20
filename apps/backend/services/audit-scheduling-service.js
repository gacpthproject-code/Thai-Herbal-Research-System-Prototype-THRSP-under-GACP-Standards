/**
 * Audit Scheduling Service — Iter 25 (2026-05-16).
 *
 * Bridges the AUDIT_FEE_PAID → AUDIT_CONFIRMED segment of the canonical
 * GACP workflow (workflow-transition-service.js).
 *
 *      AUDIT_FEE_PAID  ──── SCHEDULER assigns auditor + date ───►  AUDIT_CONFIRMED
 *           │                                                       │
 *           │  ◄── HEALTH applicant requests reschedule ────────────┘
 *           │       (RESCHEDULE_REQUESTED in Audit.metadata)
 *           │
 *           └──► SCHEDULER approves reschedule → date updated, status stays
 *                AUDIT_CONFIRMED
 *
 * Cited Thai workflow conventions:
 *   - GACP master workflow per workflow-transition-service.js (states +
 *     allowed transitions). Only SCHEDULER / ADMIN may transition
 *     AUDIT_FEE_PAID → AUDIT_CONFIRMED (ROLE_TRANSITIONS contract).
 *   - Working-day rule (ไม่นัดวันเสาร์-อาทิตย์/วันหยุดราชการ) per
 *     utils/working-days.isWorkingDay.
 *   - Notification of farmer + auditor per Iter 23 fanout layer
 *     (notification-fanout-service.AUDIT_SCHEDULED template).
 *   - Conflict detection (no overlap, max 2 audits/day cap) per
 *     Bureau of Audit operational guideline 2566/2.4.
 *
 * Storage: reschedule requests + scheduling metadata are stored on
 * Application.formData.auditSchedule.* and Application.formData.rescheduleRequests[]
 * to avoid a Prisma migration. Future schema iteration MAY promote
 * RescheduleRequest to a first-class model — this layer is forward-compatible
 * because all JSON keys survive a migration to typed columns.
 *
 * @module services/audit-scheduling-service
 */

'use strict';

const { randomUUID } = require('crypto');
const logger = require('../shared/logger');
const { normalizeRole, CANONICAL_ROLES } = require('../shared/canonical-rbac');
const { organizationScope, DENY_ALL } = require('../shared/application-visibility');
const { assertAssignableStaff } = require('./assignable-staff-service');
const workflowTransitionService = require('./workflow-transition-service');
const { computePhaseSettlement } = require('./phase-billing-service');
const { writeApplicationStatus } = require('./application-status-writer');
const { notifyAuditScheduled } = require('./audit/audit-schedule-notices');
// A reviewer may not also inspect the same application (operator ruling 2026-10-05).
const { assertInspectorIsNotReviewer } = require('../shared/reviewer-inspector-separation');
// One place decides whether a confirmed audit arms the evidence chain — both scheduling
// doors call it, so the rule cannot drift between them. See the module header.
const { armOnsiteEvidence, rebindEvidenceAuditor } = require('./audit/arm-onsite-evidence');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../middleware/audit-logger');
const {
    isWorkingDay,
    getZonedParts,
    startOfLocalCalendarDay,
    endOfLocalDay,
    localWallClock,
} = require('../utils/working-days');
const { recordAssignment } = require('./assignment-ledger-service');
const { isReadyToSchedule } = require('../shared/dispatcher-queue');
const { lookup: lookupErrorCode } = require('../shared/error-codes');
const { lockApplicationRow } = require('./checkout/application-row-lock');
const { holderScopeForUser, holderReadWhere, assertHolderCapability } = require('./holder-access');
const {
    lockOfficerLoad, assertWithinCapOrStated, inspectionDueFor, inspectionDueByApplication, assertVisitInTimeOrStated, recordStatedReasons, statedReasonsRecord,
} = require('./assignment-policy');
const { siteContactStateOf } = require('../shared/applicant-contact');
const { dailyVisitCapOn } = require('./dispatcher-rules');
const { moveVisitClock } = require('./work-activity-service');

let prismaModule;
try {
    prismaModule = require('./prisma-database');
} catch (_e) {
    prismaModule = { prisma: null };
}

// ── Constants ──────────────────────────────────────────────────────────────


const SCHEDULER_ROLES = new Set([
    CANONICAL_ROLES.DISPATCHER,
    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
]);

const APPLICANT_ROLES = new Set([
    CANONICAL_ROLES.HEALTH,
]);

const RESCHEDULE_STATUS = Object.freeze({
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
});

// ── Errors ─────────────────────────────────────────────────────────────────

function makeError(code, message, statusCode = 400, extra) {
    const err = new Error(message);
    err.code = code;
    err.statusCode = statusCode;
    if (extra) {err.data = extra;}
    return err;
}

/** The application changed after this caller read it; the caller reloads and decides again. */
function stateChanged() {
    const row = lookupErrorCode('APPLICATION_STATE_CHANGED');
    return makeError(row.code, row.messageTh, row.httpStatus);
}

function resolvePrisma() {
    return prismaModule && prismaModule.prisma ? prismaModule.prisma : null;
}

// ── Role helpers ───────────────────────────────────────────────────────────

function assertSchedulerRole(actor) {
    const role = normalizeRole(actor?.canonicalRole || actor?.role);
    if (!role || !SCHEDULER_ROLES.has(role)) {
        throw makeError(
            'FORBIDDEN_ROLE',
            'SCHEDULER or ADMIN role required',
            403,
        );
    }
    return role;
}

/**
 * The organization a scheduler acts in (order 17): a `where` fragment, null for
 * system_admin_platform, and a refusal when the actor has none.
 */
function schedulerOrganizationWhere(actor) {
    const organizationWhere = organizationScope(actor);
    if (organizationWhere === DENY_ALL) {
        throw makeError('NO_ORGANIZATION', 'Scheduler is not bound to an organization', 400);
    }
    return organizationWhere;
}

function assertApplicantRole(actor) {
    const role = normalizeRole(actor?.canonicalRole || actor?.role);
    if (!role || !APPLICANT_ROLES.has(role)) {
        throw makeError(
            'FORBIDDEN_ROLE',
            'HEALTH (applicant) role required to request reschedule',
            403,
        );
    }
    return role;
}

// ── Date validation ────────────────────────────────────────────────────────

function _coerceDate(input) {
    if (!input) {return null;}
    if (input instanceof Date) {return Number.isFinite(input.getTime()) ? input : null;}
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Combine `scheduledDate` (YYYY-MM-DD or ISO) with optional `scheduledTime`
 * (HH:mm, 24-hour). When `scheduledTime` is omitted the time portion of
 * `scheduledDate` is honoured.
 *
 * `scheduledTime` is a Bangkok wall-clock time on the Bangkok day that
 * `scheduledDate` falls in. No deployment manifest sets TZ, so the process
 * clock is UTC; setHours() on it booked "09:00" at 16:00 in Bangkok
 * (CODE-X1, audit 2026-09-17). The instant is built from the Bangkok day
 * start instead. Bangkok keeps no daylight saving, so adding the minutes to
 * local midnight is exact.
 */
function _resolveScheduledAt(scheduledDate, scheduledTime) {
    const d = _coerceDate(scheduledDate);
    if (!d) {return null;}
    if (!scheduledTime || typeof scheduledTime !== 'string') {return d;}
    const m = scheduledTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {return d;}
    const hours = Number.parseInt(m[1], 10);
    const minutes = Number.parseInt(m[2], 10);
    if (hours > 23 || minutes > 59) {return d;}
    const { year, month, day } = getZonedParts(d);
    const dayStart = startOfLocalCalendarDay(year, month, day);
    return new Date(dayStart.getTime() + (hours * 60 + minutes) * 60 * 1000);
}

function _isFutureDate(d, nowMs = Date.now()) {
    if (!d) {return false;}
    return d.getTime() > nowMs;
}

// ── Conflict detection ─────────────────────────────────────────────────────

const SLOT_HOLDING_STATUSES = Object.freeze(['AUDIT_CONFIRMED']);
const NOT_A_VISIT_OF_THE_DAY = Object.freeze(['REJECTED', 'CANCELLED', 'APPROVED', 'CERTIFIED']);
const auditorVisitsBetween = (auditorId, from, to) => ({
    isDeleted: false, auditorId, scheduledDate: { gte: from, lte: to }, status: { notIn: NOT_A_VISIT_OF_THE_DAY },
});
const DEFAULT_VISIT_MINUTES = 120;

const visitMinutes = (row) => row.formData?.auditSchedule?.estimatedDuration || DEFAULT_VISIT_MINUTES;

async function _findAuditorVisitsOnDate(prisma, { auditorId, scheduledAt, excludeApplicationId } = {}) {
    if (!prisma || !auditorId || !scheduledAt) {return [];}
    // The Bangkok day of the appointment, not the process clock's day.
    const { year, month, day } = getZonedParts(scheduledAt);
    const dayStart = startOfLocalCalendarDay(year, month, day);
    const dayEnd = endOfLocalDay(scheduledAt);

    const rows = await prisma.application.findMany({
        where: {
            ...auditorVisitsBetween(auditorId, dayStart, dayEnd),
            ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
        },
        select: {
            id: true,
            applicationNumber: true,
            scheduledDate: true,
            status: true,
            formData: true,
        },
    });
    return rows.map(({ formData, ...row }) => ({ ...row, durationMinutes: visitMinutes({ formData }) }));
}

/**
 * Validates the slot. Returns `{ ok: true }` or throws with structured
 * `AUDITOR_BUSY` / `AUDITOR_OVER_CAP` errors carrying conflict metadata.
 */
async function _assertSlotAvailable(prisma, {
    auditorId, scheduledAt, excludeApplicationId, durationMinutes = DEFAULT_VISIT_MINUTES,
} = {}) {
    const visits = await _findAuditorVisitsOnDate(prisma, { auditorId, scheduledAt, excludeApplicationId });

    // Visits per inspector per Bangkok day: the dated rule in force on the visit's day (order 56(1) 2.3).
    const cap = dailyVisitCapOn(scheduledAt);
    if (cap !== null && visits.length >= cap) {
        throw makeError(
            'AUDITOR_OVER_CAP',
            `Auditor already has ${visits.length} audits on ${getZonedParts(scheduledAt).isoDate} (cap: ${cap})`,
            409,
            { conflictCount: visits.length, cap, conflicts: visits },
        );
    }

    const requestedStart = scheduledAt.getTime();
    const requestedEnd = requestedStart + durationMinutes * 60 * 1000;
    const conflicting = visits.find((row) => {
        if (!SLOT_HOLDING_STATUSES.includes(row.status) || !row.scheduledDate) {return false;}
        const existing = new Date(row.scheduledDate).getTime();
        const existingEnd = existing + row.durationMinutes * 60 * 1000;
        return existing < requestedEnd && requestedStart < existingEnd;
    });

    if (conflicting) {
        throw makeError(
            'AUDITOR_BUSY',
            `Auditor has overlapping audit at ${new Date(conflicting.scheduledDate).toISOString()} `
                + `(application ${conflicting.applicationNumber})`,
            409,
            { conflictingApplicationId: conflicting.id, conflictingApplicationNumber: conflicting.applicationNumber, conflictingScheduledDate: conflicting.scheduledDate },
        );
    }
}

// Bounded retry for serialization failures (P2034) on the slot-booking transaction.
const SLOT_TX_MAX_ATTEMPTS = 3;
// A booking waits this long for a row another write holds (an inspector's decision can hold the
// application for the length of a certificate mint), then answers a retriable 409. Shorter than the
// transaction's own timeout, so the wait never ends as a 500 (security re-review 2026-10-09 I5).
const SLOT_TX_LOCK_TIMEOUT = '3s';
const SLOT_TX_TIMEOUT_MS = 10000;

/**
 * A conflict a retry resolves, however Prisma reports it: P2034 (a write conflict or a deadlock in its
 * own queries), or P2010 carrying SQLSTATE 40001 or 40P01 from a raw one. The status writer's row lock
 * is a raw SELECT ... FOR UPDATE: a row another transaction changed after this one's snapshot fails
 * there (security review 2026-10-09 F4), and so does the loser of a deadlock (re-review L-B).
 */
function isRetriableConflict(err) {
    return err?.code === 'P2034' || (err?.code === 'P2010' && ['40001', '40P01'].includes(err?.meta?.code));
}

/** The booking gave up waiting for a row lock (SQLSTATE 55P03) or its transaction ran out of time (P2028). */
function isLockWaitExhausted(err) {
    return err?.code === 'P2028' || err?.meta?.code === '55P03' || /\b55P03\b|lock timeout/i.test(String(err?.message || ''));
}

/**
 * The ONE way to book (or move) an inspector's slot. The availability check and the write run
 * in a single Serializable transaction: two dispatchers taking the last slot of a day cannot
 * both commit (PostgreSQL aborts one with P2034). A P2034 is retried a bounded number of
 * times (the retry re-reads the busy set, so the loser then gets the real AUDITOR_OVER_CAP /
 * AUDITOR_BUSY refusal); when attempts run out it surfaces as a retriable 409
 * AUDITOR_SLOT_CONFLICT, never a 500.
 *
 * `work(tx)` must only touch `tx` (it is re-run on retry). `scheduledAt` null skips the
 * availability check (a reassignment of an application that has no visit date yet) but keeps
 * the Serializable transaction.
 */
async function runSlotBooking(prisma, {
    auditorId, scheduledAt, excludeApplicationId, durationMinutes = 120,
} = {}, work) {
    let lastErr = null;
    for (let attempt = 1; attempt <= SLOT_TX_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT set_config('lock_timeout', ${SLOT_TX_LOCK_TIMEOUT}, true)`;
                if (scheduledAt) {
                    await _assertSlotAvailable(tx, { auditorId, scheduledAt, excludeApplicationId, durationMinutes });
                }
                return work(tx);
            }, { isolationLevel: 'Serializable', timeout: SLOT_TX_TIMEOUT_MS });
        } catch (err) {
            if (isLockWaitExhausted(err)) {
                lastErr = err;
                break;
            }
            if (!isRetriableConflict(err)) { throw err; }
            lastErr = err;
        }
    }
    throw makeError(
        'AUDITOR_SLOT_CONFLICT',
        'Concurrent scheduling detected for this auditor/date — please retry',
        409,
        { auditorId, scheduledAt: scheduledAt ? scheduledAt.toISOString() : null, cause: lastErr && lastErr.code },
    );
}

// ── Audit logging helper ───────────────────────────────────────────────────

async function _safeAudit(action, severity, actor, applicationId, metadata) {
    try {
        await auditLogger.log({
            category: AuditCategory.APPLICATION,
            action,
            severity,
            actorId: actor?.id || 'SYSTEM',
            actorEmail: actor?.email || null,
            actorRole: actor?.canonicalRole || actor?.role || 'UNKNOWN',
            actorType: actor?.providerId ? 'PROVIDER' : 'USER',
            resourceType: ResourceType.APPLICATION,
            resourceId: applicationId,
            organizationId: actor?.organizationId || null,
            metadata: metadata || {},
        });
    } catch (err) {
        logger.warn(`[audit-scheduling] audit log failed (non-fatal): ${err?.message}`);
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * The state an application sits in while it waits for a site visit to be
 * scheduled. Named because two other things now have to agree with it:
 * assignAuditor below refuses any other state, and renewal-service places a
 * renewal one settled payment away from it (W12, operator ruling 2026-08-22).
 * Exported so those callers and their tests read this rather than re-spelling
 * the string, which is how the two would drift apart.
 */
const SCHEDULING_QUEUE_STATUS = 'AUDIT_FEE_PAID';

/**
 * Get the scheduling queue — applications in AUDIT_FEE_PAID waiting for
 * SCHEDULER to assign an auditor + date.
 *
 * @param {object} args
 * @param {string} [args.organizationId] — tenant filter
 * @param {string} [args.status]         — defaults to 'AUDIT_FEE_PAID'
 * @returns {Promise<Array>} queue rows for the scheduler UI
 */
async function getSchedulingQueue({ organizationId, status } = {}) {
    const prisma = resolvePrisma();
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }
    const where = {
        isDeleted: false,
        status: status || SCHEDULING_QUEUE_STATUS,
    };
    if (organizationId) {where.organizationId = organizationId;}

    const rows = await prisma.application.findMany({
        where,
        select: {
            id: true,
            applicationNumber: true,
            status: true,
            organizationId: true,
            auditorId: true,
            scheduledDate: true,
            formData: true,
            createdAt: true,
            updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: 500,
    });
    const invoices = rows.length === 0 ? [] : await prisma.invoice.findMany({
        where: { applicationId: { in: rows.map((row) => row.id) }, isDeleted: false },
        select: {
            applicationId: true, serviceType: true, status: true, receiptIssuedAt: true,
            receiptNumber: true, metadata: true, createdAt: true, updatedAt: true,
        },
    });
    // The date the company must have inspected by, shown on every row (order 56(1) 1.3).
    const inspectBy = await inspectionDueByApplication(prisma, rows.map((row) => row.id));

    // H1 contract fix: the FE (scheduler/queue) + AssignAuditorModal read
    // { items, summary } with `applicationId` (getRowKey + the assign POST),
    // `applicantNameMasked`, `region`, and `ageDays`. Previously this returned a
    // BARE ARRAY with `id`/`province` and no summary → the queue rendered empty
    // and every summary tile showed "—". Map to the SchedulingQueueItem shape.
    const now = Date.now();
    const items = rows.map((row) => {
        const applicantName = row.formData && (row.formData.firstName || row.formData.lastName)
            ? `${row.formData.firstName || ''} ${row.formData.lastName || ''}`.trim()
            : '-';
        const region = row.formData?.farmProvince || row.formData?.province || null;
        // Queue-wait proxy: days since the row last changed. While an application
        // sits in AUDIT_FEE_PAID awaiting scheduling nothing else mutates it, so
        // updatedAt ≈ when it entered the queue. (An exact audit-fee paid date would
        // need an invoice join — left for a follow-up; paymentDate stays absent → '-'.)
        const ageDays = row.updatedAt
            ? Math.max(0, Math.floor((now - new Date(row.updatedAt).getTime()) / 86400000))
            : 0;
        return {
            applicationId: row.id,
            applicationNumber: row.applicationNumber,
            status: row.status,
            applicantName,
            // The scheduler is authorised staff assigning auditors and needs the
            // applicant name; the FE renders applicantNameMasked ?? applicantName.
            applicantNameMasked: applicantName,
            region: region || undefined,
            ageDays,
            // Extras the AssignAuditorModal / parity rely on (harmless to the table).
            organizationId: row.organizationId,
            auditorId: row.auditorId,
            scheduledDate: row.scheduledDate ? row.scheduledDate.toISOString() : null,
            inspectBy: inspectBy.get(row.id) ? inspectBy.get(row.id).toISOString() : null,
            // Whether the filing names someone on site, never who (orders 56(3) and 65(2)).
            ...siteContactStateOf(row),
            phase2Paid: computePhaseSettlement(
                invoices.filter((invoice) => invoice.applicationId === row.id), 'PHASE_2',
            ).phasePaid,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    });

    // One queue (order 27): an application whose second milestone is not paid is not waiting for
    // the dispatcher, whatever its status column says.
    const ready = (status || SCHEDULING_QUEUE_STATUS) === SCHEDULING_QUEUE_STATUS ? items.filter(isReadyToSchedule) : items;

    const byRegionMap = new Map();
    for (const it of ready) {
        const key = it.region || 'ไม่ระบุ';
        byRegionMap.set(key, (byRegionMap.get(key) || 0) + 1);
    }
    const summary = {
        totalPending: ready.length,
        byRegion: Array.from(byRegionMap, ([region, count]) => ({ region, count })),
        oldestPendingDays: ready.reduce((max, it) => Math.max(max, it.ageDays || 0), 0),
    };

    return { items: ready, summary };
}

/**
 * Assign an auditor + date to an application in AUDIT_FEE_PAID, transitioning
 * it atomically to AUDIT_CONFIRMED.
 *
 * Atomic flow inside one $transaction:
 *   1. validate role + application state + auditor identity
 *   2. assert future-date + working-day
 *   3. assert no auditor conflict + per-day cap
 *   4. writeApplicationStatus(AUDIT_FEE_PAID → AUDIT_CONFIRMED) with auditSchedule
 *      written into formData and `auditorId`+`scheduledDate` written onto the row
 *
 * Outside the transaction (best effort):
 *   - notification-fanout-service.send(AUDIT_SCHEDULED) to applicant
 *
 * @param {object} args
 * @param {string} args.applicationId   — Application.id OR applicationNumber
 * @param {string} args.auditorId       — auditor User.id (must hold AUDITOR role)
 * @param {string|Date} args.scheduledDate — YYYY-MM-DD or ISO timestamp
 * @param {string} [args.scheduledTime] — HH:mm (optional). Merged into scheduledDate
 * @param {string} [args.location]      — onsite address (free text)
 * @param {string} [args.notes]
 * @param {string} [args.inspectionMode] — only 'ONSITE' (or absent); anything else is refused
 * @param {number} [args.estimatedDuration] — minutes (15–600, default 120)
 * @param {{ reasonCode: string, reasonText?: string }} [args.overCap] — the dispatcher's confirmation
 *   past the inspector's workload cap (order 56(1) 2.1)
 * @param {{ reasonCode: string, reasonText?: string }} [args.lateVisit] — the reason for a visit after
 *   the date the company must inspect by (1.3)
 * @param {string} args.actorId         — scheduler User.id
 * @param {object} [args.actor]         — full actor (preferred over actorId)
 * @returns {Promise<{ auditId, scheduledAt, auditor, applicationId, workflowState }>}
 */
async function assignAuditor({
    applicationId,
    auditorId,
    scheduledDate,
    scheduledTime,
    location,
    notes,
    inspectionMode,
    estimatedDuration,
    overCap: overCapStatement = null,
    lateVisit: lateVisitStatement = null,
    actorId,
    actor,
} = {}) {
    const effectiveActor = actor || (actorId ? { id: actorId, role: CANONICAL_ROLES.DISPATCHER } : null);
    if (!effectiveActor) {
        throw makeError('VALIDATION_ERROR', 'actor or actorId is required');
    }
    assertSchedulerRole(effectiveActor);

    if (!applicationId) {throw makeError('VALIDATION_ERROR', 'applicationId is required');}
    if (!auditorId) {throw makeError('VALIDATION_ERROR', 'auditorId is required');}
    if (!scheduledDate) {throw makeError('VALIDATION_ERROR', 'scheduledDate is required');}

    const scheduledAt = _resolveScheduledAt(scheduledDate, scheduledTime);
    if (!scheduledAt) {
        throw makeError('VALIDATION_ERROR', 'scheduledDate must be a valid date');
    }
    if (!_isFutureDate(scheduledAt)) {
        throw makeError('VALIDATION_ERROR', 'scheduledDate must be in the future', 400);
    }
    if (!isWorkingDay(scheduledAt)) {
        throw makeError(
            'NON_WORKING_DAY',
            'Cannot schedule on weekends or Thai public holidays '
                + '(ไม่สามารถนัดหมายในวันหยุดราชการหรือวันเสาร์-อาทิตย์ได้)',
        );
    }

    const duration = Number.isFinite(Number(estimatedDuration))
        ? Math.min(600, Math.max(15, Number.parseInt(estimatedDuration, 10)))
        : 120;
    // Every inspection is on site (order 27); asking for another mode is refused, never rewritten.
    if (inspectionMode && String(inspectionMode).trim().toUpperCase() !== 'ONSITE') {
        throw makeError('ONLINE_INSPECTION_RETIRED', lookupErrorCode('ONLINE_INSPECTION_RETIRED').messageTh, 400);
    }
    const mode = 'ONSITE';

    const prisma = resolvePrisma();
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }

    const app = await prisma.application.findFirst({
        where: {
            isDeleted: false,
            OR: [{ id: applicationId }, { applicationNumber: applicationId }],
            ...schedulerOrganizationWhere(effectiveActor),
        },
        select: {
            id: true,
            applicationNumber: true,
            status: true,
            healthId: true,
            organizationId: true,
            auditorId: true,
            reviewerId: true,
            scheduledDate: true,
            formData: true,
            workflowHistory: true,
        },
    });
    if (!app) {throw makeError('APPLICATION_NOT_FOUND', `Application ${applicationId} not found`, 404);}

    const currentState = workflowTransitionService.resolveStateFromApplication(app);
    if (currentState !== SCHEDULING_QUEUE_STATUS) {
        throw makeError(
            'INVALID_STATE',
            `Application must be in ${SCHEDULING_QUEUE_STATUS} before scheduling (current: ${currentState})`,
            409,
        );
    }

    // The inspector: an active field inspector of the application's own organization.
    const auditor = await assertAssignableStaff({
        userId: auditorId, roles: [CANONICAL_ROLES.FIELD_INSPECTOR], organizationId: app.organizationId, client: prisma,
    });

    // Separation of duties: the application's document reviewer cannot also inspect it.
    assertInspectorIsNotReviewer({ reviewerId: app.reviewerId, auditorId });

    // Pre-transaction fast-fail: a cheap availability probe that returns the
    // rich AUDITOR_BUSY / AUDITOR_OVER_CAP errors without paying for a
    // serializable transaction in the common "slot already full" case.
    await _assertSlotAvailable(prisma, {
        auditorId,
        scheduledAt,
        excludeApplicationId: app.id,
        durationMinutes: duration,
    });

    const lateVisit = assertVisitInTimeOrStated({
        inspectBy: await inspectionDueFor(prisma, app.id), visitAt: scheduledAt, lateVisit: lateVisitStatement,
    });

    const auditId = randomUUID();
    const ts = new Date().toISOString();
    const fd = (app.formData && typeof app.formData === 'object') ? app.formData : {};
    const auditSchedule = {
        auditId,
        scheduledDate: scheduledAt.toISOString(),
        auditorId,
        auditorName: [auditor.firstName, auditor.lastName].filter(Boolean).join(' ').trim() || null,
        location: location || null,
        notes: notes || null,
        estimatedDuration: duration,
        scheduledBy: effectiveActor.id || actorId || null,
        scheduledAt: ts,
    };

    await runSlotBooking(prisma, {
        auditorId,
        scheduledAt,
        excludeApplicationId: app.id,
        durationMinutes: duration,
    }, async (tx) => {
            const overCap = await assertWithinCapOrStated(tx, {
                role: CANONICAL_ROLES.FIELD_INSPECTOR, officerId: auditorId, excludeApplicationId: app.id,
                visitAt: scheduledAt, overCap: overCapStatement,
            });
            await writeApplicationStatus({
                prisma: tx,
                applicationId: app.id,
                fromStatus: app.status,
                toStatus: 'AUDIT_CONFIRMED',
                actorId: effectiveActor.id || actorId,
                actorRole: effectiveActor.canonicalRole || effectiveActor.role || CANONICAL_ROLES.DISPATCHER,
                reason: 'AUDIT_SCHEDULED',
                additionalData: {
                    auditorId,
                    scheduledDate: scheduledAt,
                    formData: {
                        ...fd,
                        workflowState: 'AUDIT_CONFIRMED',
                        workflowStateUpdatedAt: ts,
                        auditSchedule: { ...auditSchedule, statedReasons: statedReasonsRecord({ overCap, lateVisit }) },
                    },
                },
            });
            await recordStatedReasons(tx, {
                actor: effectiveActor, application: app, officerId: auditorId, role: CANONICAL_ROLES.FIELD_INSPECTOR,
                overCap, lateVisit, visitAt: scheduledAt,
            });

            // cert-integrity follow-up (onsite evidence, 2026-08-17): the onsite evidence
            // gate counts photos + checklist items keyed to an AuditChecklist row, but
            // nothing created it — every real app resolved to null.
            //
            // Moved into services/audit/arm-onsite-evidence.js on 2026-08-25 because a
            // SECOND door reaches AUDIT_CONFIRMED (the /provider/calendar handler) and did
            // not do this at all, so a scheduler booking through the calendar produced an
            // audit that could never issue a certificate. Copying the block there would
            // have left two copies of an evidence rule free to drift; one function is the
            // point.
            await armOnsiteEvidence(tx, {
                applicationId: app.id,
                auditorId,
                organizationId: app.organizationId,
                createdBy: effectiveActor.id || actorId || null,
                inspectionMode: mode,
            });
    });

    // Tell the applicant, the holder and the assigned inspector, in Thai, with the Bangkok date. The same
    // builder the calendar door uses (best effort: the schedule has already committed).
    let notification = null;
    try {
        notification = await notifyAuditScheduled({
            auditorId,
            applicationId: app.id,
            applicationNumber: app.applicationNumber,
            scheduledAt,
            auditorName: auditSchedule.auditorName,
            location: auditSchedule.location,
        });
    } catch (err) {
        logger.warn(`[audit-scheduling] notification failed (non-fatal): ${err?.message}`);
    }

    await _safeAudit('AUDIT_SCHEDULED', AuditSeverity.INFO, effectiveActor, app.id, {
        applicationNumber: app.applicationNumber,
        auditId,
        auditorId,
        scheduledAt: scheduledAt.toISOString(),
    });

    // Work-distribution ledger (best-effort, AFTER the tx commits so a ledger
    // failure can never roll back the assignment): scheduler pushed this auditor.
    await recordAssignment({
        prisma,
        entityType: 'APPLICATION',
        entityId: app.id,
        action: 'ASSIGN',
        assigneeUserId: auditorId,
        assignedByUserId: effectiveActor?.id || actorId || null,
        role: CANONICAL_ROLES.FIELD_INSPECTOR,
        source: 'SCHEDULER',
        reason: `Auditor scheduled (${app.status} → AUDIT_CONFIRMED)`,
        organizationId: app.organizationId,
    });

    return {
        auditId,
        scheduledAt: scheduledAt.toISOString(),
        auditor: {
            id: auditor.id,
            name: auditSchedule.auditorName,
        },
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
        workflowState: 'AUDIT_CONFIRMED',
        notification,
    };
}

/**
 * Applicant-initiated reschedule request. Creates a PENDING entry inside
 * Application.formData.rescheduleRequests[] and notifies the scheduler.
 *
 * Does NOT change application status; the schedule stays in place until
 * approveReschedule(...) lands.
 *
 * @param {object} args
 * @param {string} args.applicationId   — Application.id OR applicationNumber
 * @param {string|Date} args.requestedDate
 * @param {string} args.reason          — Thai-language free-text, ≥3 chars
 * @param {string} args.actorId         — applicant User.id (HEALTH role)
 * @param {object} [args.actor]
 * @returns {Promise<{ rescheduleId, status, applicationId }>}
 */
async function requestReschedule({ applicationId, requestedDate, reason, actorId, actor } = {}) {
    const effectiveActor = actor || (actorId ? { id: actorId, role: CANONICAL_ROLES.HEALTH } : null);
    if (!effectiveActor) {throw makeError('VALIDATION_ERROR', 'actor or actorId is required');}
    assertApplicantRole(effectiveActor);

    if (!applicationId) {throw makeError('VALIDATION_ERROR', 'applicationId is required');}
    const requestedAt = _coerceDate(requestedDate);
    if (!requestedAt) {throw makeError('VALIDATION_ERROR', 'requestedDate must be a valid date');}
    if (!_isFutureDate(requestedAt)) {
        throw makeError('VALIDATION_ERROR', 'requestedDate must be in the future');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        throw makeError('VALIDATION_ERROR', 'reason is required (Thai free-text ≥3 chars)');
    }

    const prisma = resolvePrisma();
    if (!prisma) {throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);}

    // A member of the holder reads the application (the membership set, spec
    // 2026-09-30-remove-workspace-mode §3.1), and asking to move its visit is acting on it, so the
    // member needs SUBMIT_APPLICATION on the holder. Outside the set the application does not exist.
    const scope = await holderScopeForUser(effectiveActor.id || actorId);
    const holderWhere = holderReadWhere(scope, 'Application');
    const app = await prisma.application.findFirst({
        where: {
            isDeleted: false,
            OR: [{ id: applicationId }, { applicationNumber: applicationId }],
            ...holderWhere,
        },
        select: { id: true, applicationNumber: true, entityId: true },
    });
    if (!app) {throw makeError('APPLICATION_NOT_FOUND', `Application ${applicationId} not found`, 404);}
    await assertHolderCapability(effectiveActor.id || actorId, app.entityId, 'SUBMIT_APPLICATION');

    const rescheduleId = randomUUID();
    const ts = new Date().toISOString();
    // Lock, then read the row again: a reassignment or a reschedule committed after the read above
    // is kept, not written over with what this request read first (security re-review 2026-10-09 L6).
    await prisma.$transaction(async (tx) => {
        await lockApplicationRow(tx, app.id);
        const locked = await tx.application.findFirst({
            where: { id: app.id, ...holderWhere },
            select: { status: true, scheduledDate: true, auditorId: true, formData: true },
        });
        if (!locked || workflowTransitionService.resolveStateFromApplication(locked) !== 'AUDIT_CONFIRMED') {
            throw makeError(
                'INVALID_STATE',
                `Reschedule allowed only when application is AUDIT_CONFIRMED (current: ${locked ? locked.status : 'unknown'})`,
                409,
            );
        }
        const fd = (locked.formData && typeof locked.formData === 'object') ? locked.formData : {};
        const requests = Array.isArray(fd.rescheduleRequests) ? fd.rescheduleRequests : [];
        await tx.application.update({
            where: { id: app.id },
            data: {
                formData: {
                    ...fd,
                    rescheduleRequests: [...requests, {
                        id: rescheduleId,
                        requestedDate: requestedAt.toISOString(),
                        reason: reason.trim(),
                        requestedBy: effectiveActor.id || actorId || null,
                        requestedAt: ts,
                        status: RESCHEDULE_STATUS.PENDING,
                        previousScheduledDate: locked.scheduledDate ? locked.scheduledDate.toISOString() : null,
                        previousAuditorId: locked.auditorId || null,
                    }],
                },
                version: { increment: 1 },
                updatedAt: new Date(),
            },
        });
    });

    // Notify scheduler(s) — best effort. The fanout layer is bypassed here
    // since SCHEDULER is a provider role without an in-app/email template
    // for RESCHEDULE_REQUESTED; we emit an audit-log entry which the
    // scheduler dashboard polls. The fanout layer can be wired in later
    // once a RESCHEDULE_REQUESTED template lands in notification-fanout-service.
    await _safeAudit('AUDIT_RESCHEDULE_REQUESTED', AuditSeverity.WARNING, effectiveActor, app.id, {
        applicationNumber: app.applicationNumber,
        rescheduleId,
        requestedDate: requestedAt.toISOString(),
        reason: reason.trim(),
    });

    return {
        rescheduleId,
        status: RESCHEDULE_STATUS.PENDING,
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
    };
}

/**
 * Approve a PENDING reschedule request. Updates the audit schedule (date and
 * optionally auditor) and marks the request APPROVED. Application status
 * stays AUDIT_CONFIRMED — the only mutation is the schedule itself.
 *
 * @param {string} rescheduleId
 * @param {object} args
 * @param {string|Date} args.newDate
 * @param {string} [args.newAuditor] — optional auditor reassignment
 * @param {string} args.actorId      — scheduler User.id
 * @param {object} [args.actor]
 */
async function approveReschedule(rescheduleId, {
    newDate, newAuditor, overCap: overCapStatement = null, lateVisit: lateVisitStatement = null, actorId, actor,
} = {}) {
    const effectiveActor = actor || (actorId ? { id: actorId, role: CANONICAL_ROLES.DISPATCHER } : null);
    if (!effectiveActor) {throw makeError('VALIDATION_ERROR', 'actor or actorId is required');}
    assertSchedulerRole(effectiveActor);

    if (!rescheduleId) {throw makeError('VALIDATION_ERROR', 'rescheduleId is required');}
    const newAt = _coerceDate(newDate);
    if (!newAt) {throw makeError('VALIDATION_ERROR', 'newDate must be a valid date');}
    if (!_isFutureDate(newAt)) {throw makeError('VALIDATION_ERROR', 'newDate must be in the future');}
    if (!isWorkingDay(newAt)) {
        throw makeError(
            'NON_WORKING_DAY',
            'Cannot reschedule onto weekends or Thai public holidays',
        );
    }

    const prisma = resolvePrisma();
    if (!prisma) {throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);}

    // Locate the application containing this reschedule id.
    // Because the request lives in formData JSON we cannot index it; we scan
    // applications in AUDIT_CONFIRMED with any rescheduleRequests in formData.
    // Only the actor's organization is scanned (order 17).
    const candidateWhere = { isDeleted: false, status: 'AUDIT_CONFIRMED', ...schedulerOrganizationWhere(effectiveActor) };
    const candidates = await prisma.application.findMany({
        where: candidateWhere,
        select: {
            id: true,
            applicationNumber: true,
            healthId: true,
            auditorId: true,
            reviewerId: true,
            scheduledDate: true,
            formData: true,
            organizationId: true,
            version: true,
        },
        take: 2000,
    });

    let app = null;
    let request = null;
    for (const candidate of candidates) {
        const requests = Array.isArray(candidate.formData?.rescheduleRequests)
            ? candidate.formData.rescheduleRequests
            : [];
        const found = requests.find((r) => r && r.id === rescheduleId);
        if (found) {
            app = candidate;
            request = found;
            break;
        }
    }
    if (!app || !request) {
        throw makeError('RESCHEDULE_NOT_FOUND', `Reschedule ${rescheduleId} not found`, 404);
    }
    if (request.status !== RESCHEDULE_STATUS.PENDING) {
        throw makeError(
            'RESCHEDULE_NOT_PENDING',
            `Reschedule is ${request.status} — only PENDING requests may be approved`,
            409,
        );
    }

    const finalAuditorId = newAuditor || app.auditorId;
    if (!finalAuditorId) {throw makeError('VALIDATION_ERROR', 'auditor cannot be empty after reschedule');}

    // If auditor changes, validate new auditor exists + AUDITOR role
    let newAuditorName = null;
    if (newAuditor && newAuditor !== app.auditorId) {
        const auditor = await assertAssignableStaff({
            userId: newAuditor, roles: [CANONICAL_ROLES.FIELD_INSPECTOR], organizationId: app.organizationId, client: prisma,
        });
        newAuditorName = [auditor.firstName, auditor.lastName].filter(Boolean).join(' ').trim() || null;
        // Separation of duties: the application's document reviewer cannot also inspect it.
        assertInspectorIsNotReviewer({ reviewerId: app.reviewerId, auditorId: newAuditor });
    }

    // The new date after the date the company must inspect by needs the dispatcher's reason (order 56(1) 1.3).
    const lateVisit = assertVisitInTimeOrStated({
        inspectBy: await inspectionDueFor(prisma, app.id), visitAt: newAt, lateVisit: lateVisitStatement,
    });

    const ts = new Date().toISOString();
    const existingSchedule = (app.formData?.auditSchedule && typeof app.formData.auditSchedule === 'object') ? app.formData.auditSchedule : {};
    let updatedSchedule = null;

    // Application and evidence row move together: an inspector swapped here must also own the
    // AuditChecklist row, or the field app answers him 403 AUDIT_AUDITOR_MISMATCH. The row is locked
    // and must still be the one this approval was decided on: a reassignment, another approval or the
    // applicant's new request committed after the read above refuses this one instead of being
    // written over (security re-review 2026-10-09 L6).
    await runSlotBooking(prisma, {
        auditorId: finalAuditorId,
        scheduledAt: newAt,
        excludeApplicationId: app.id,
        durationMinutes: visitMinutes(app),
    }, async (tx) => {
        // The inspector's workload first, then the application row: the order every assigning door
        // takes them in (security re-review 2026-10-09 L-B).
        await lockOfficerLoad(tx, finalAuditorId);
        const locked = await lockApplicationRow(tx, app.id);
        if (!locked || locked.status !== 'AUDIT_CONFIRMED' || locked.version !== app.version) { throw stateChanged(); }
        const stored = await tx.application.findUnique({ where: { id: app.id }, select: { formData: true } });
        const fd = (stored && stored.formData && typeof stored.formData === 'object') ? stored.formData : {};
        const storedRequest = (Array.isArray(fd.rescheduleRequests) ? fd.rescheduleRequests : []).find((r) => r && r.id === rescheduleId);
        if (!storedRequest || storedRequest.status !== RESCHEDULE_STATUS.PENDING) {
            throw makeError('RESCHEDULE_NOT_PENDING', `Reschedule is ${storedRequest ? storedRequest.status : 'gone'} — only PENDING requests may be approved`, 409);
        }
        // Past the inspector's workload cap the new date goes ahead only with the dispatcher's reason (2.1).
        const overCap = await assertWithinCapOrStated(tx, {
            role: CANONICAL_ROLES.FIELD_INSPECTOR, officerId: finalAuditorId, excludeApplicationId: app.id,
            visitAt: newAt, overCap: overCapStatement,
        });
        updatedSchedule = {
            ...(fd.auditSchedule && typeof fd.auditSchedule === 'object' ? fd.auditSchedule : {}),
            scheduledDate: newAt.toISOString(),
            auditorId: finalAuditorId,
            // The name on the schedule follows the inspector; it used to keep the previous one.
            ...(newAuditorName ? { auditorName: newAuditorName } : {}),
            rescheduledAt: ts,
            rescheduledBy: effectiveActor.id || actorId || null,
            statedReasons: statedReasonsRecord({ overCap, lateVisit }),
        };
        await recordStatedReasons(tx, {
            actor: effectiveActor, application: app, officerId: finalAuditorId, role: CANONICAL_ROLES.FIELD_INSPECTOR,
            overCap, lateVisit, visitAt: newAt,
        });
        await tx.application.update({
            where: { id: app.id },
            data: {
                auditorId: finalAuditorId,
                scheduledDate: newAt,
                version: { increment: 1 },
                formData: {
                    ...fd,
                    auditSchedule: updatedSchedule,
                    rescheduleRequests: fd.rescheduleRequests.map((r) => (r && r.id === rescheduleId
                        ? {
                            ...r,
                            status: RESCHEDULE_STATUS.APPROVED,
                            approvedAt: ts,
                            approvedBy: effectiveActor.id || actorId || null,
                            approvedNewDate: newAt.toISOString(),
                            approvedNewAuditor: finalAuditorId,
                        }
                        : r)),
                },
                updatedAt: new Date(),
            },
        });
        await rebindEvidenceAuditor(tx, {
            applicationId: app.id,
            auditorId: finalAuditorId,
            actorId: effectiveActor.id || actorId || null,
        });
        await moveVisitClock({ prisma: tx, applicationId: app.id, visitAt: newAt });
    });

    // Best effort: the applicant, the holder and the inspector are told through the shared Thai builder.
    try {
        await notifyAuditScheduled({
            auditorId: finalAuditorId,
            applicationId: app.id,
            applicationNumber: app.applicationNumber,
            scheduledAt: newAt,
            auditorName: updatedSchedule.auditorName,
            location: existingSchedule.location,
            mapLink: existingSchedule.mapLink,
            rescheduled: true,
            previousScheduledAt: app.scheduledDate,
        });
    } catch (err) {
        logger.warn(`[audit-scheduling] reschedule notification failed (non-fatal): ${err?.message}`);
    }

    await _safeAudit('AUDIT_RESCHEDULED', AuditSeverity.WARNING, effectiveActor, app.id, {
        applicationNumber: app.applicationNumber,
        rescheduleId,
        newDate: newAt.toISOString(),
        previousDate: request.previousScheduledDate,
        newAuditor: finalAuditorId,
        previousAuditor: app.auditorId,
    });

    return {
        rescheduleId,
        status: RESCHEDULE_STATUS.APPROVED,
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
        scheduledDate: newAt.toISOString(),
        auditorId: finalAuditorId,
    };
}

/**
 * Auditor availability over a date range — returns the busy slots that already
 * have AUDIT_CONFIRMED audits assigned. Powers the scheduler UI calendar.
 *
 * @param {object} args
 * @param {string} args.auditorId
 * @param {object} args.dateRange — { from, to } ISO strings or Dates
 * @param {object|null} [args.organizationWhere] — the caller's organization filter; null crosses organizations
 * @returns {Promise<{ auditorId, dateRange, busySlots, cap }>}
 */
async function getAuditorAvailability({ auditorId, dateRange, organizationWhere = null } = {}) {
    if (!auditorId) {throw makeError('VALIDATION_ERROR', 'auditorId is required');}
    const from = _coerceDate(dateRange?.from);
    const to = _coerceDate(dateRange?.to);
    if (!from || !to) {throw makeError('VALIDATION_ERROR', 'dateRange.from and dateRange.to are required');}
    if (to.getTime() < from.getTime()) {
        throw makeError('VALIDATION_ERROR', 'dateRange.to must be ≥ dateRange.from');
    }

    const prisma = resolvePrisma();
    if (!prisma) {throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);}

    const rows = await prisma.application.findMany({
        where: {
            ...auditorVisitsBetween(auditorId, from, to),
            ...organizationWhere,
        },
        select: {
            id: true,
            applicationNumber: true,
            status: true,
            scheduledDate: true,
            formData: true,
        },
        orderBy: { scheduledDate: 'asc' },
    });

    const busySlots = rows.filter((r) => SLOT_HOLDING_STATUSES.includes(r.status)).map((r) => ({
        applicationId: r.id,
        applicationNumber: r.applicationNumber,
        status: r.status,
        scheduledDate: r.scheduledDate ? r.scheduledDate.toISOString() : null,
        estimatedDuration: visitMinutes(r),
    }));

    const perDay = new Map();
    for (const row of rows) {
        if (!row.scheduledDate) {continue;}
        const dayKey = getZonedParts(row.scheduledDate).isoDate;
        perDay.set(dayKey, (perDay.get(dayKey) || 0) + 1);
    }
    // Each day against the cap in force on that day (order 56(1) 2.3).
    const capOn = (isoDay) => dailyVisitCapOn(localWallClock(isoDay, '12:00'));
    const overCapDays = Array.from(perDay.entries())
        .filter(([day, count]) => capOn(day) !== null && count >= capOn(day))
        .map(([day, count]) => ({ day, count, cap: capOn(day) }));

    return {
        auditorId,
        dateRange: { from: from.toISOString(), to: to.toISOString() },
        busySlots,
        cap: dailyVisitCapOn(from),
        overCapDays,
    };
}

module.exports = {
    SCHEDULING_QUEUE_STATUS,
    RESCHEDULE_STATUS,
    getSchedulingQueue,
    assignAuditor,
    requestReschedule,
    approveReschedule,
    getAuditorAvailability,
    runSlotBooking,
    assertSlotAvailable: _assertSlotAvailable,
    _internals: {
        _resolveScheduledAt,
        _isFutureDate,
        _findAuditorVisitsOnDate,
        _assertSlotAvailable,
        assertSchedulerRole,
        assertApplicantRole,
    },
};
