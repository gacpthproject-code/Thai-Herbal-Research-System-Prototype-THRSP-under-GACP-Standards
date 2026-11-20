/**
 * Application Constants & Pure Utility Functions
 *
 * Extracted from applications.js to comply with ≤ 300 line rule.
 * Contains all constants, step definitions, status mappings, and
 * pure helper functions with zero I/O dependencies.
 *
 * @module routes/api/helpers/application-constants
 */

const crypto = require('crypto');
const { WORKFLOW_STATES } = require('../../../services/workflow-transition-service');
const { localYear } = require('../../../utils/working-days');

const MASTER_STEPS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

// Tracking Steps & Status Mappings

const TRACKING_STEPS = Object.freeze([
    { step: 1, key: 'SUBMITTED', label: 'Submitted' },
    { step: 2, key: 'PENDING_DOC_FEE', label: 'Awaiting instalment 1 payment' },
    { step: 3, key: 'DOC_REVIEWING', label: 'Document review in progress' },
    { step: 4, key: 'REVISION_REQUESTED', label: 'Revision required' },
    { step: 5, key: 'DOC_APPROVED', label: 'Document approved' },
    { step: 6, key: 'PENDING_AUDIT_FEE', label: 'Awaiting service fee payment' },
    { step: 7, key: 'AUDIT_SCHEDULING', label: 'Audit scheduling' },
    { step: 8, key: 'CAR_PENDING', label: 'Field audit / CAR pending' },
    { step: 9, key: 'FINAL_REVIEW', label: 'Final approval review' },
    { step: 10, key: 'CERTIFIED', label: 'Certified' },
]);

/**
 * Raw workflow state → applicant-facing display bucket.
 *
 * Values are display *keys*, never prose. The frontend owns the wording
 * (apps/web-app/src/lib/constants/workflow-states.ts STATUS_LABELS plus the
 * display-only aliases in application-detail-page-config.ts STATUS_META), so
 * a Thai string here would be a second, un-translatable copy — and, because
 * it is not a key of STEP_BY_DISPLAY_STATUS, it also silently dropped the
 * progress ladder to 0 for anyone waiting on a payment-slip review.
 *
 * Several states deliberately collapse many-to-one: that is a product
 * decision (an applicant does not need to know whether their file has been
 * *assigned* to a reviewer yet, only that it is under review). The collapse
 * is why this map cannot be derived from the SSOT and must be maintained by
 * hand — which is what assertDisplayMapsAreTotal() below guards.
 */
const DISPLAY_STATUS_BY_RAW_STATUS = Object.freeze({
    DRAFT: 'DRAFT',
    // Legacy DB value, not a canonical workflow state. Retained so rows
    // written before the SSOT landed still render.
    REGISTERED: 'DRAFT',
    SUBMITTED: 'SUBMITTED',
    PENDING_DOC_FEE: 'PENDING_DOC_FEE',
    DOC_FEE_PAID: 'DOC_REVIEWING',
    ASSIGNED_FOR_REVIEW: 'DOC_REVIEWING',
    REVISION_REQUESTED: 'REVISION_REQUESTED',
    DOC_APPROVED: 'DOC_APPROVED',
    PENDING_AUDIT_FEE: 'PENDING_AUDIT_FEE',
    AUDIT_FEE_PAID: 'AUDIT_SCHEDULING',
    AUDIT_CONFIRMED: 'AUDIT_SCHEDULING',
    CAR_PENDING: 'CAR_PENDING',
    CAR_REVIEWING: 'CAR_REVIEWING',
    AUDIT_PASSED: 'FINAL_REVIEW',
    AUDIT_NOT_PASSED: 'FINAL_REVIEW',
    APPROVED: 'FINAL_REVIEW',
    CERTIFIED: 'CERTIFIED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
});

/**
 * Display buckets that close the case. The tracking ladder does not apply to
 * them — they are not "step 0, nothing done yet", they are "this file is
 * finished". Callers must read the `terminal` flag rather than inferring
 * closure from the step number, which DRAFT also occupies.
 */
const TERMINAL_DISPLAY_STATUSES = Object.freeze(new Set([
    'REJECTED',
    'EXPIRED',
    'CANCELLED',
]));

const STEP_BY_DISPLAY_STATUS = Object.freeze({
    DRAFT: 0,
    SUBMITTED: 1,
    PENDING_DOC_FEE: 2,
    DOC_REVIEWING: 3,
    REVISION_REQUESTED: 4,
    DOC_APPROVED: 5,
    PENDING_AUDIT_FEE: 6,
    AUDIT_SCHEDULING: 7,
    CAR_PENDING: 8,
    CAR_REVIEWING: 8,
    FINAL_REVIEW: 9,
    CERTIFIED: 10,
    // Terminal — see TERMINAL_DISPLAY_STATUSES.
    REJECTED: 0,
    EXPIRED: 0,
    CANCELLED: 0,
});

/**
 * Load-time exhaustiveness check — the JavaScript stand-in for a TypeScript
 * `never` guard on a discriminated union.
 *
 * Both defects PR 2a fixes were "a state was added to the SSOT and nobody
 * updated the projection", which stayed invisible because every lookup was
 * written `map[key] || fallback`. Failing at require() turns that class of
 * mistake into a boot failure in CI instead of raw enum keys on a farmer's
 * screen.
 */
function assertDisplayMapsAreTotal() {
    const problems = [];

    for (const state of WORKFLOW_STATES) {
        if (!Object.prototype.hasOwnProperty.call(DISPLAY_STATUS_BY_RAW_STATUS, state)) {
            problems.push(`workflow state ${state} has no DISPLAY_STATUS_BY_RAW_STATUS entry`);
        }
    }

    for (const [state, bucket] of Object.entries(DISPLAY_STATUS_BY_RAW_STATUS)) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(bucket)) {
            problems.push(`display bucket for ${state} must be a key, got prose: ${bucket}`);
        }
        if (!Object.prototype.hasOwnProperty.call(STEP_BY_DISPLAY_STATUS, bucket)) {
            problems.push(`display bucket ${bucket} has no STEP_BY_DISPLAY_STATUS entry`);
        }
    }

    if (problems.length > 0) {
        throw new Error(`[application-constants] status display maps are not total:\n  - ${problems.join('\n  - ')}`);
    }
}

assertDisplayMapsAreTotal();

// Pure Utility Functions

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function upper(value) {
    return String(value || '').trim().toUpperCase();
}

function ensureApplicationNumber(prefix = 'APP') {
    const year = localYear() + 543; // Bangkok year
    const shortTs = Date.now().toString(36).toUpperCase();
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${year}-${shortTs}-${rand}`;
}

function isMissingApplicationCommentsTableError(error) {
    const message = String(error?.message || '');
    return error?.code === 'P2021' && message.includes('application_comments');
}

/**
 * formData keys the WIZARD owns — the complete set POST /draft's autosave is
 * allowed to write, and the reason the autosave stopped throwing work away.
 *
 * WHAT GOVERNS THIS LIST
 * `formData` is ONE JSON blob written by two parties (see
 * shared/form-data-ownership.js): the applicant, through the wizard, and the
 * server/provider staff, whose entries downstream code later reads back as
 * FACTS — the audit outcome, the auditor assignment, SLA deadlines, the stored
 * upload records, the requirement snapshot that decides which law judges this
 * filing. So the autosave cannot merge `payload.formData` wholesale.
 *
 * ALLOWLIST, NOT DENYLIST. A denylist fails OPEN the day someone adds a
 * server-owned field and forgets to list it; this fails CLOSED — an unlisted
 * key costs the farmer one re-entry, and that is the direction to fail in when
 * the alternative is an applicant writing their own price or their own status.
 *
 * ADDING A WIZARD FIELD? Add its key here too, or it will round-trip as empty
 * after a reload — that is the whole defect this list exists to fix (walk
 * ledger F-G4-14: eleven uploads answered 200 and came back blank). The key
 * must be one the wizard owns end-to-end; a key ANY server or staff path
 * writes belongs in SERVER_OWNED_FORM_DATA_KEYS instead, and the two lists may
 * never intersect (pinned by applications-draft-formdata-allowlist.test.js).
 *
 * Every key below is one the live autosave actually sends
 * (apps/web-app/src/app/health/applications/new/_steps/hooks/use-auto-save.ts)
 * AND one the detail payload hands back to the wizard for hydration
 * (application-payload-builders.js) — sent, stored, re-read, by the wizard only.
 *
 * MONEY (L3): the fee is not stored here and is not writable from here. Fees
 * are recomputed at read time by modules/billing from the applicant's own
 * DECLARATION of how they grow — cultivationMethods / plots / locationType —
 * which the wizard has always owned and which already reach formData through
 * POST /prepare and POST /submit. No amount, rate, quotation or invoice field
 * is on this list. `qrCount` / `estimatedQRCost` are money-SHAPED but are the
 * wizard's own on-screen estimate: no billing path reads them, only the
 * hydration payload echoes them back to the wizard that sent them.
 */
const WIZARD_OWNED_FORM_DATA_KEYS = Object.freeze([
    // What is being certified, and under which service.
    'plantId',
    'serviceType',
    'serviceTypes',
    'certificationPurpose',
    'certificationPurposes',
    'previousCertNumber',

    // กทล.1 ส่วนที่ ๑ + ๒ as the six-step wizard asks them (2026-09-06).
    //
    // ADDED after walking the wizard in a browser: every one of these was missing, and a
    // key that is not on this list is dropped SILENTLY — the save answers 200 and the
    // answer is gone. A filing could be typed in full and the stored application would not
    // know whether it was a new request or a renewal, who was applying, or what was being
    // grown. Nothing failed anywhere; the wizard's own unit tests all passed, because each
    // step was tested against its own props and never against this door.
    //
    // These are ANSWERS, not verdicts: the applicant declares them, the requirements lens
    // decides what they cost in paperwork, and the officer judges the result. Writable is
    // correct. `estimatedFee` stays off this list for the opposite reason — money is
    // derived from a dated rate table, never accepted from the client.
    //
    // `requestType` and `certScope` were briefly added here on 2026-09-06 and REMOVED the
    // same day: shared/form-data-ownership.js already owns them, and its comment says why —
    // both dimensions can REMOVE requirements (a filing claiming REPLACEMENT is judged by two
    // rows instead of the whole ส่วนที่ ๓ set; PLANTING skips the controlled-herb licence that
    // PROCESSING carries), so an applicant able to write them would be choosing the law that
    // judges them. The wizard asks those two questions; a door that CHECKS the answer is what
    // may write them, and that door does not exist yet — see BACKLOG-FOUND F-APPV2-02.
    //
    // `applicantType` left this list on 2026-10-03 (R2 Task 8, spec 2026-09-30 §3.2): the
    // server writes it at create from the holder's Entity.type (form-data-ownership.js).
    'previousCertificateNumber',
    'varieties',
    'varietiesNote',
    'processing',

    // Who is applying, and the land they are applying for.
    'applicantData',
    'generalInfo',
    'farmData',
    'siteData',
    'siteTypes',
    'locationType',
    'plots',
    'lots',

    // How the crop is grown, harvested and secured.
    'cultivationMethod',
    'cultivationMethods',
    'cultivationDetails',
    'productionData',
    'harvestData',
    'securityData',
    'plantTracking',

    // The applicant's OWN paperwork checklist — the wizard's ticked boxes, not
    // evidence. services/application-document-requirements.js refuses to read
    // `documents` for exactly that reason: proof is `draftDocuments[]` (written
    // by the upload route, server-owned) and ApplicationDocument rows. Because
    // nothing authorizes off these, a forged tick buys nothing.
    'documents',
    'stepDocuments',
    'licensePdfUrl',
    'youtubeUrl',

    // Wizard-local QR estimate — see the MONEY note above.
    'qrCount',
    'estimatedQRCost',

    // Consent flags the applicant sets on themselves. The binding consent
    // record lives in its own table; these only drive the wizard's own UI.
    'consentedPDPA',
    'acknowledgedStandards',
]);

/**
 * The part of a client-supplied `formData` blob that may be written.
 *
 * Deliberately absent, though the blob may carry them:
 *   • `steps` — the previous wizard's per-step shape; nothing writes it any more.
 *   • `lastDraftStep` / `lastDraftSavedAt` / `lastPreparedAt` — the server's
 *     record of what it did; the handler stamps them after this merge.
 *   • every server-owned key (SERVER_OWNED_FORM_DATA_KEYS in
 *     shared/form-data-ownership.js, which also names the status and review facts
 *     such as `_lastReviewComment`).
 *
 * @returns {object} only the wizard-owned keys the client actually sent
 */
function pickWizardOwnedFormData(clientFormData) {
    const source = asObject(clientFormData);
    const picked = {};

    for (const key of WIZARD_OWNED_FORM_DATA_KEYS) {
        // hasOwnProperty, not truthiness: `false`, `0` and `[]` are answers a
        // farmer gave (an emptied plot list is an edit, not a missing field).
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
            picked[key] = source[key];
        }
    }

    return picked;
}

function mergeWizardAnswers(existingFormData, clientFormData) {
    return { ...asObject(existingFormData), ...pickWizardOwnedFormData(clientFormData) };
}

/** The previous wizard's per-step shape, read back from stored `formData.steps`; nothing writes it any more. */
function buildStepResponse(formDataValue) {
    const stepMap = asObject(asObject(formDataValue).steps);
    const response = {};

    for (const stepNo of MASTER_STEPS) {
        const step = asObject(stepMap[String(stepNo)]);
        const files = [step.files, step.documents, step.attachments, step.evidence_files, step.evidenceFiles, step.mandatoryFiles, step.mandatory_files]
            .find((entry) => Array.isArray(entry)) || [];
        response[String(stepNo)] = { ...step, files: [...files] };
    }

    return response;
}

module.exports = {
    MASTER_STEPS,
    TRACKING_STEPS,
    DISPLAY_STATUS_BY_RAW_STATUS,
    STEP_BY_DISPLAY_STATUS,
    TERMINAL_DISPLAY_STATUSES,
    assertDisplayMapsAreTotal,
    asObject,
    asArray,
    upper,
    ensureApplicationNumber,
    isMissingApplicationCommentsTableError,
    WIZARD_OWNED_FORM_DATA_KEYS,
    pickWizardOwnedFormData,
    mergeWizardAnswers,
    buildStepResponse,
};
