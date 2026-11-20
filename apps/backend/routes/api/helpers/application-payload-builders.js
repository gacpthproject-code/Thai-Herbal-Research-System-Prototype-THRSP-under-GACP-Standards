/**
 * Application Payload Builders
 *
 * Functions that build API response payloads for application detail,
 * history, tracking, action cards, and deadline display.
 *
 * Extracted from applications.js to comply with ≤ 300 line rule.
 *
 * @module routes/api/helpers/application-payload-builders
 */

const {
    asObject,
    asArray,
    upper,
    TRACKING_STEPS,
    DISPLAY_STATUS_BY_RAW_STATUS,
    STEP_BY_DISPLAY_STATUS,
    TERMINAL_DISPLAY_STATUSES,
    buildStepResponse,
    WIZARD_OWNED_FORM_DATA_KEYS,
} = require('./application-constants');
const { defectsOfRound, stagedFileView } = require('../../../services/car-evidence-files');

// Thai-holiday-aware Asia/Bangkok engine — the SAME one that stamps the
// deadline (#646). The legacy services/working-days-service was holiday-blind
// (sources never seeded), so "เหลือ X วันทำการ" over-counted by one in weeks
// containing a Thai holiday while enforcement (reading the stored stamp) was
// correct.
const {
    countWorkingDaysBetween,
} = require('../../../utils/working-days');
const { isRenewalFiling } = require('../../../shared/instalment-service-names');
const { storedCultivationScopeCount } = require('../../../shared/application-scope');
const { renewalPriceEstimate } = require('../../../services/billing/renewal-amount');

// Workflow SSOT — used to resolve legacy DB status values to a canonical state
// before projecting them to a display bucket.
const { resolveStateFromApplication } = require('../../../services/workflow-transition-service');
const { assignedOfficerName, UNASSIGNED_TH } = require('../../../shared/assigned-officer-name');
const { recordedReasonsOf } = require('../../../shared/dispatcher-reasons');
const { CERTIFICATION_REFUSAL_REASONS, recordedReasonLabel } = require('../../../shared/certification-decision-reasons');
const { siteContactEditable } = require('../../../shared/site-contact-window');
const { applicantNoteTh } = require('../../../services/correction-windows');

/**
 * The person on site as the application page shows it (order 65(2)): the contact, whether the
 * filing lacks a name or a phone, and whether the applicant may still change it.
 */
function buildSiteContactView(application, formData) {
    const farm = asObject(formData.farmData);
    const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    const siteContactName = text(farm.siteContactName);
    const sitePhone = text(farm.sitePhone);
    return {
        siteContactName,
        sitePhone,
        siteContactIsApplicant: farm.siteContactIsApplicant === true,
        missing: !siteContactName || !sitePhone,
        editable: siteContactEditable(application),
    };
}

/**
 * What the applicant is told about a booked inspection (always on site, order 27): when and by whom. Only while
 * the visit is booked (AUDIT_CONFIRMED) and a date exists. The inspector's NAME only, the
 * same thing the booking notification already says; no id, e-mail or phone.
 */
function buildAuditScheduleView(application, formData) {
    if (resolveStateFromApplication(application) !== 'AUDIT_CONFIRMED') { return null; }
    const schedule = asObject(formData.auditSchedule);
    const when = application.scheduledDate || schedule.scheduledDate || null;
    const whenDate = when ? new Date(when) : null;
    if (!whenDate || Number.isNaN(whenDate.getTime())) { return null; }
    const name = assignedOfficerName({
        officerId: application.auditorId,
        officer: application.auditor,
        storedName: schedule.auditorName,
    });
    return {
        scheduledDate: whenDate.toISOString(),
        auditorName: name === UNASSIGNED_TH ? null : name,
    };
}

/**
 * An officer comment as the applicant sees it (ApplicationComment: content, role). The
 * author is named by role, never by id.
 */
function applicantComment(item) {
    return {
        id: item.id,
        authorRole: item.role || null,
        commentText: item.content,
        createdAt: item.createdAt,
    };
}

// Detail Payload

/**
 * Why a refused application was not certified, as the order states it to the applicant: the
 * reason, the consideration and the date. No officer is named (F6-R); null on any other status.
 */
function certificationRefusalView(application, formData) {
    const record = asObject(formData.certificationDecision);
    if (application.status !== 'REJECTED' || record.outcome !== 'REFUSED') { return null; }
    return {
        reasonLabel: recordedReasonLabel(CERTIFICATION_REFUSAL_REASONS, record),
        consideration: record.consideration || null,
        decidedAt: record.decidedAt || null,
    };
}

/** Every applicant-writable key, as stored; null for one the draft never answered. */
function wizardAnswersEcho(formData) {
    const echo = {};
    for (const key of WIZARD_OWNED_FORM_DATA_KEYS) { echo[key] = formData[key] ?? null; }
    return echo;
}

function buildApplicationDetailPayload(application) {
    const formData = asObject(application?.formData);
    const workflowHistory = asArray(application?.workflowHistory);
    const comments = asArray(application?.comments).map(applicantComment);

    return {
        id: application.id,
        applicationId: application.id,
        applicationNumber: application.applicationNumber,
        // The holder, fixed at create. The wizard resumes an existing draft's holder from here.
        entityId: application.entityId ?? null,
        healthId: application.healthId,
        serviceType: application.serviceType,
        areaType: application.areaType,
        certificationPurpose: application.certificationPurpose || null, // Legacy
        certificationPurposes: Array.isArray(application.certificationPurposes) ? application.certificationPurposes : [], // New
        previousCertNumber: application.previousCertNumber || null,
        consentedPDPA: Boolean(application.consentedPDPA),
        status: application.status,
        // round 3: a renewal is one charge (the renewal service), never งวดที่ 2; and the
        // stored cultivation-type count the quotation priced, for the served-price fallback.
        isRenewal: isRenewalFiling(application),
        cultivationScopeCount: storedCultivationScopeCount(application),
        // round 4: the engine's renewal price for this application's billable types (as the
        // quotation prices it) — the detail page's last fallback after its invoice and
        // quotation. null for a new filing. The stored phase1Amount/phase2Amount columns
        // were sent here too: no screen read them, and for a renewal they were not its price.
        renewalPriceEstimate: renewalPriceEstimate(application),
        workflowState: formData.workflowState || application.status || null,
        workflowStateUpdatedAt: formData.workflowStateUpdatedAt || null,
        submittedAt: formData.submittedAt || null,
        auditSchedule: buildAuditScheduleView(application, formData),
        // Why a visit was booked late or the field inspector moved during a correction, in Thai with
        // the side the delay counts against (order 65(1)). The dispatcher's reason only, no staff id.
        recordedReasons: recordedReasonsOf(formData),
        certificationRefusal: certificationRefusalView(application, formData),
        siteContact: buildSiteContactView(application, formData),
        carRound: carRoundView(application, formData),
        // Canonical phase status — source of truth for "did the user already pay
        // phase 1 / phase 2?". The frontend's resolvePaymentFacts() previously
        // had to guess this from workflow-history text, which fails when an app
        // is in REGISTERED state but phase1 is paid (real prod case 2026-04-28).
        phase1Status: application.phase1Status || null,
        phase1PaidAt: application.phase1PaidAt || null,
        phase2Status: application.phase2Status || null,
        phase2PaidAt: application.phase2PaidAt || null,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        steps: buildStepResponse(formData),
        // What the edit view (apps/web-app/.../[id]/edit/client-view.tsx) rebuilds the
        // wizard store from. Its next save posts the whole store back through POST
        // /draft's allowlist, so the echo is that same list, every key as stored: a key
        // left out here comes back as its blank and the first save in the edit view
        // writes the blank over the stored answer (2026-10-28, step 4 lost this way).
        // Beyond the allowlist, only the server-owned facts the edit page shows.
        formData: {
            ...wizardAnswersEcho(formData),
            requestType: formData.requestType || null,
            applicantType: formData.applicantType || null,
            certScope: formData.certScope || null,
            _lastReviewComment: formData._lastReviewComment || null,
        },
        metadata: {
            lastDraftStep: formData.lastDraftStep || null,
            lastDraftSavedAt: formData.lastDraftSavedAt || null,
            revisionDueAt: formData.revisionDueAt || formData.revision_due_at || null,
            carDueAt: formData.carDueAt || formData.car_due_at || null,
            workflowHistoryCount: workflowHistory.length,
            commentsCount: comments.length,
        },
        comments,
    };
}

function carRoundView(application, formData) {
    if (application.status !== 'CAR_PENDING') { return null; }
    return {
        defects: defectsOfRound(formData),
        stagedFiles: asArray(formData.carStagedFiles).map((entry) => stagedFileView(entry, formData)),
    };
}

// History Payload

/** An event that says nothing beyond its act: no status move, no words. */
const carriesNoNews = (event) => event.fromStatus === event.toStatus && !event.comment && !event.reason;

/** Whether `next` repeats `prev`: same act by the same actor, and neither carries news. */
function repeatsWithoutNews(prev, next) {
    return prev.action === next.action
        && prev.actorRole === next.actorRole
        && prev.sameActorKey === next.sameActorKey
        && carriesNoNews(prev) && carriesNoNews(next);
}

/**
 * Folds each run of repeated events (the wizard autosave writes one every few seconds,
 * live walk F12: 114 in a row) into its last entry, with `repeatCount` and the run's
 * `firstTimestamp`. A read-side view only: the stored history keeps every event.
 */
function foldRepeatedEvents(entries) {
    const folded = [];
    for (const entry of entries) {
        const last = folded[folded.length - 1];
        if (last && repeatsWithoutNews(last, entry)) {
            folded[folded.length - 1] = { ...entry, repeatCount: last.repeatCount + 1, firstTimestamp: last.firstTimestamp };
        } else {
            folded.push({ ...entry, repeatCount: 1, firstTimestamp: entry.timestamp });
        }
    }
    return folded.map(({ sameActorKey: _sameActorKey, ...entry }) => entry);
}


function buildApplicationHistoryPayload(application) {
    const formData = asObject(application?.formData);
    const workflowHistory = foldRepeatedEvents(asArray(application?.workflowHistory).map((entry, index) => {
        const event = asObject(entry);
        return {
            index: index + 1,
            timestamp: event.timestamp || null,
            action: event.action || null,
            fromStatus: event.fromStatus || null,
            toStatus: event.toStatus || null,
            // Staff are named by role, never by id, on the applicant's screens.
            actorId: String(event.actorRole || '').toLowerCase() === 'health' ? event.actorId || null : null,
            actorRole: event.actorRole || null,
            step: event.step ?? null,
            reason: applicantNoteTh(event.reason) || null,
            comment: applicantNoteTh(event.comment) || null,
            sameActorKey: event.actorId || null,
        };
    }));
    const comments = asArray(application?.comments).map(applicantComment);
    const revisionHistory = asArray(formData._revisionHistory);
    const rejectionHistory = asArray(formData._rejectionHistory);

    return {
        applicationId: application.id,
        applicationNumber: application.applicationNumber,
        status: application.status,
        workflowHistory,
        comments,
        revisions: revisionHistory,
        rejections: rejectionHistory,
    };
}

// Display Status & Action Card

function resolveDisplayStatus(application) {
    const status = upper(application?.status);
    const direct = DISPLAY_STATUS_BY_RAW_STATUS[status];
    if (direct) {
        return direct;
    }

    // No `|| status` fallthrough — leaking the raw enum key is how "EXPIRED"
    // reached a farmer's screen untranslated. The column holds canonical states
    // only (PR 2b + 2c), so ask the SSOT — which also handles the case where
    // formData.workflowState leads the status column — and project that.
    // Falling straight to DRAFT would tell someone mid-flow to finish a draft.
    const canonicalState = resolveStateFromApplication(application);
    return DISPLAY_STATUS_BY_RAW_STATUS[canonicalState] || 'DRAFT';
}

function isTerminalDisplayStatus(displayStatus) {
    return TERMINAL_DISPLAY_STATUSES.has(displayStatus);
}

function resolveDeadlinePayload(displayStatus, formData, now) {
    let deadlineAt = null;
    let type = null;

    if (displayStatus === 'REVISION_REQUESTED') {
        deadlineAt = formData.revisionDueAt || formData.revision_due_at || null;
        type = 'REVISION';
    } else if (displayStatus === 'CAR_PENDING') {
        deadlineAt = formData.carDueAt || formData.car_due_at || null;
        type = 'CAR';
    }

    const dueDate = deadlineAt ? new Date(String(deadlineAt)) : null;
    if (!dueDate || !Number.isFinite(dueDate.getTime())) {
        return null;
    }

    const remainingMs = dueDate.getTime() - now.getTime();
    const remainingHours = Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));
    const remainingWorkingDays = remainingMs <= 0
        ? 0
        : Math.max(0, countWorkingDaysBetween(now, dueDate));

    return {
        type,
        dueAt: dueDate.toISOString(),
        remainingHours,
        remainingWorkingDays,
        isOverdue: remainingMs < 0,
    };
}

function buildActionCard(displayStatus) {
    switch (displayStatus) {
        case 'DRAFT':
            return { key: 'CONTINUE_DRAFT', title: 'Continue draft', enabled: true };
        // ยอดไม่อยู่ตรงนี้โดยตั้งใจ: ตัวเลขที่ฮาร์ดโค้ดไว้เดิม (5,535 / 27,675) เป็นสูตรที่
        // เลิกใช้ตั้งแต่ W14 และไม่มีใครแก้ตามเพราะไม่มีด่านอ่านมัน · ราคาที่แสดงบนปุ่มมาจาก
        // ACTION_META ฝั่งเว็บ ซึ่งมีด่าน declared-prices-match-the-fee-constants ตรึงกับ
        // ตัวคิดเงินจริงอยู่แล้ว — ที่นี่ส่งแค่ "ต้องทำอะไร" ไม่ใช่ "เท่าไร"
        case 'PENDING_DOC_FEE':
            return { key: 'PAY_DOC_FEE', title: 'Pay instalment 1', enabled: true };
        case 'REVISION_REQUESTED':
            return { key: 'SUBMIT_REVISION', title: 'Submit revision within 5 working days', enabled: true };
        case 'PENDING_AUDIT_FEE':
            // A renewal is here too, so the title names no instalment (round 3).
            return { key: 'PAY_AUDIT_FEE', title: 'Pay the service fee before the site assessment', enabled: true };
        case 'AUDIT_SCHEDULING':
            return { key: 'WAIT_SCHEDULE', title: 'Waiting for coordinator schedule', enabled: false };
        case 'CAR_PENDING':
            return { key: 'SUBMIT_CAR_EVIDENCE', title: 'Submit CAR evidence', enabled: true };
        case 'CAR_REVIEWING':
            return { key: 'WAIT_CAR_REVIEW', title: 'Waiting for the field inspector to review the evidence', enabled: false };
        case 'CERTIFIED':
            return { key: 'DOWNLOAD_CERTIFICATE', title: 'Download certificate', enabled: true };
        // Terminal — the file is closed and the only way forward is a new application. A refusal
        // says it was not certified (the page shows why); an expiry or a cancellation says it closed.
        case 'REJECTED':
            return { key: 'NOT_CERTIFIED', title: 'Not certified', enabled: true };
        case 'EXPIRED':
        case 'CANCELLED':
            return { key: 'REAPPLY', title: 'Reapply required', enabled: true };
        default:
            return { key: 'WAITING', title: 'Waiting for next workflow step', enabled: false };
    }
}

function buildTrackingPayload(application, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const formData = asObject(application?.formData);
    const rawStatus = upper(application?.status);
    const displayStatus = resolveDisplayStatus(application);
    // resolveDisplayStatus only ever returns a key of DISPLAY_STATUS_BY_RAW_STATUS,
    // and assertDisplayMapsAreTotal() guarantees every such value has a step —
    // so this lookup is total and needs no `|| 0` fallback. The `?? 0` is a
    // belt-and-braces coercion, not a fallthrough path.
    const currentStep = STEP_BY_DISPLAY_STATUS[displayStatus] ?? 0;
    const terminal = isTerminalDisplayStatus(displayStatus);

    return {
        applicationId: application.id,
        applicationNumber: application.applicationNumber,
        status: rawStatus || 'DRAFT',
        displayStatus,
        // round 3: which charge PENDING_AUDIT_FEE is for this application (renewal or
        // a new filing's second instalment) — the screen names it from this.
        isRenewal: isRenewalFiling(application),
        tracking: {
            currentStep,
            totalSteps: TRACKING_STEPS.length,
            // DRAFT and the terminal states share step 0. Without this flag the
            // ladder renders identically for "not started" and "closed", so the
            // UI must branch on `terminal`, never on `currentStep === 0`.
            terminal,
            steps: TRACKING_STEPS.map((step) => ({
                ...step,
                active: !terminal && step.step === currentStep,
                completed: !terminal && step.step < currentStep,
            })),
        },
        actionCard: buildActionCard(displayStatus),
        deadline: resolveDeadlinePayload(displayStatus, formData, now),
        payment: {
            phase1Status: upper(application?.phase1Status || 'PENDING'),
            phase2Status: upper(application?.phase2Status || 'PENDING'),
        },
    };
}

module.exports = {
    buildApplicationDetailPayload,
    buildApplicationHistoryPayload,
    resolveDisplayStatus,
    isTerminalDisplayStatus,
    resolveDeadlinePayload,
    buildActionCard,
    buildTrackingPayload,
};
