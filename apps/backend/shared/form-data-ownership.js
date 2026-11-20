/**
 * Ownership rules for the shared `formData` JSON blob.
 *
 * Application.formData and ApplicationDraft.formData are single JSON columns
 * written by TWO different parties:
 *
 *   • the APPLICANT, through the wizard — their own answers (applicantData,
 *     farmData, plantId, certificationPurposes, …)
 *   • the SERVER and PROVIDER STAFF — records that downstream code later reads
 *     back as FACTS (the audit outcome, who is assigned to audit, SLA
 *     deadlines, admin overrides, the list of stored upload paths)
 *
 * Because it is one blob, an applicant-facing endpoint that spreads the request
 * body into it hands the applicant a pen for the second category too. That is
 * not a theoretical concern: certificate-service.js reads
 * `formData.auditResult === 'PASS'` plus `formData.auditedAt` and accepts the
 * pair as proof of a passing audit, and the (since deleted) wizard-controller.js
 * read `formData.uploadedDocuments[].filePath` and passed it to fs.unlink().
 *
 * ONE DIRECTION: keys listed here flow server -> client only.
 *
 * Adding a key here is always safe. Removing one needs proof that no
 * authorization, money or filesystem decision reads it.
 */

'use strict';

/**
 * Keys an applicant may never write into formData.
 *
 * Grouped by who owns them and what breaks if an applicant can forge one.
 */
const SERVER_OWNED_FORM_DATA_KEYS = Object.freeze([
    // Lifecycle position. Read as the application's true state by workflow code.
    'workflowState',

    // กทล.๑ ส่วนที่ ๔ — WHEN the applicant certified the filing. The client may say
    // "accepted"; it may not say when, because a timestamp the browser supplied is
    // evidence of nothing about a person. An applicant who could write this key
    // through /prepare could file today and date the certification last year, or
    // let a stale draft carry a time nobody was at the keyboard for. The submit
    // door stamps it (services/application-declarations-gate.js).
    'declarationsAcceptedAt',
    // The renewal's statement of what changed since the certificate it renews, stamped by
    // the submit door with the time (services/application-declarations-gate.js).
    'renewalChangeDeclaration',

    // Audit outcome — certificate-service.js accepts auditResult + auditedAt as
    // proof of a passing audit, one of the two gates on issuing a certificate.
    'auditResult',
    'auditedAt',
    'auditExecution',
    'auditSchedule',
    'auditMode',

    // Who audits this application, and any approved reschedules.
    'PROVIDERAssignment',
    'rescheduleRequests',

    // The officers' record of the review (security review 2026-10-06, F2). The applicant's
    // edit page shows `_lastReviewComment` as what the officer asked for, and
    // `onsiteAuditId` is the pin certificate issuance verifies. An applicant who could
    // write them through /prepare could rewrite what the officer said, or the progress
    // and decisions the officer screens read back.
    '_lastReviewComment',
    'reviewProgress',
    'reviewerName',
    'auditDecisions',
    'onsiteAuditId',
    // The inspector's own record of a decision (the approver's decision file reads auditDecision
    // and auditNotes as what the inspector found) and the second visit the inspector asked for:
    // the dispatcher books from reinspection, and a refund reads it as service started (security
    // review 2026-10-09 F3). The wizard is open again in CAR_PENDING, so all three are reachable.
    'auditDecision',
    'auditNotes',
    'reinspection',
    // Every move of the field inspector, with the dispatcher's reason (order 60(a)): the applicant
    // reads the reasons from it and a move for conflict of interest flags the approver's decision
    // file (order 65(1)), so an applicant who could write it could erase the flag.
    '_reassignmentHistory',
    // The certificate approver's record (order 29): who opened the decision file (the approve
    // door refuses without it) and the outcome. An applicant who could write them could
    // pretend a file was read, or rewrite what was decided.
    'decisionFileViews',
    'certificationDecision',
    'submittedAt',
    'workflowStateUpdatedAt',

    // SLA deadlines. Applicant-set deadlines are self-granted extensions.
    'carDueAt',
    'car_due_at',
    'revisionDueAt',
    'revision_due_at',
    // Which deadline reminders went out (jobs/correction-deadline-sweep.js): an applicant who could
    // write it would mute the reminders that cannot be muted (orders 48, 52; security re-review M2).
    'deadlineReminders',
    // The dispatcher's one manual reminder per correction round (order 56(1) 3.2) and the visit
    // reminder that cannot be muted (3.3): written by the server, never by the applicant.
    'dispatcherReminder',
    'visitReminder',
    // When the applicant was asked to add the person on site (order 65(2)).
    'siteContactRequest',

    // Staff escape hatches.
    'adminOverrides',

    // Stored upload records. filePath / s3Key from here reach fs.unlink() and
    // storageService.deleteObject(), so a forged entry is arbitrary deletion.
    'uploadedDocuments',
    'draftDocuments',
    'carDocuments',
    'carStagedFiles',
    'carEvidenceViews',
    'carRequest',

    // M2 — what the SERVER concluded about this filing's documents, written at
    // the submit doors and read back as fact afterwards:
    //   serverRequirementSnapshot — which requirement rules judged this filing,
    //     stamped at first submit. Every later resubmit (CAR / revision /
    //     revision-deadline / bundle) is judged against THIS list, so an
    //     applicant who could write it would choose the law that judges them.
    //   serverVaultSnapshot — which entity-vault documents were used (M2b).
    //     Declared here now, with the key it will be written under, so the
    //     ownership rule exists before the first writer does rather than after.
    'serverRequirementSnapshot',
    'serverVaultSnapshot',

    // WHICH FARM THIS FILING IS ABOUT (F-QA-06). Written by the submit door when it
    // materialises the Farm row from the applicant's own site answers, and read back as
    // a fact by certificate issuance — it is the FIRST thing
    // resolveFarmForCertificate looks at, and it decides which farm a certificate names.
    // The resolver already scopes the id to the applicant's own entity/owner before it
    // trusts it, so a forged value could never reach someone else's land; it is
    // server-owned so that an applicant cannot repoint their own filing at a different
    // farm than the one their submitted site described, and so a door that REPLACES
    // formData wholesale lays the stored value back on top instead of dropping it.
    'farmId',

    // Renewal linkage, written by renewal-service from a verified certificate.
    'renewalOf',
    'renewalOfCertificateNumber',
    'renewalOfExpiryDate',
    'renewalReminders',
    // Which certificate's filing the draft's steps 3-4 were started from, and whether the
    // wizard has said it loaded them (`{ from, loaded }`, stamped by the draft door, order
    // 143 (3)). The door offers the filing again on every save until `loaded`, so the reply
    // that carried it may be lost without the next save writing blanks over it. An applicant
    // who could write `loaded` could not gain anything, but one who could write `from` could
    // make the door refill fields they had cleared.
    'renewalPrefilled',

    // WHICH LAW JUDGES THIS FILING (กทล.1 v2, spec 2026-09-01 §2.1).
    //
    // requestType and certScope are dimensions of the requirement engine, and both
    // of them can REMOVE requirements: a filing that says REPLACEMENT is judged by
    // the two replacement rows instead of the whole ส่วนที่ ๓ set, and PLANTING skips
    // the controlled-herb licence that PROCESSING carries. An applicant who could
    // write them would be choosing the law that judges them — the same reason
    // serverRequirementSnapshot is on this list.
    //
    // So they are server-owned from the day the key exists rather than from the day
    // someone notices. The wizard asks the question (T5); the door that accepts the
    // answer is what writes it, after checking it — for a renewal or a replacement
    // that means a previous certificate the platform itself issued.
    'requestType',
    'replacementOf',
    'certScope',

    // WHO IS APPLYING (spec 2026-09-30-remove-workspace-mode §3.2). The draft door
    // writes it once, at create, from the holder's own Entity.type, so the type the
    // paper declares and the holder the certificate names can never disagree on a
    // new filing (F-HOLDER-01). An applicant who could write it could declare a
    // company on a person's draft, or the reverse; changing the holder means
    // deleting the draft and starting a new one (M2 G7).
    'applicantType',
]);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A revision answer ends its round: the officer's note leaves the applicant's edit page, and the
 * round's revision clock is retired so it cannot judge a later state.
 */
function withRevisionAnswered(formData) {
    return { ...(isPlainObject(formData) ? formData : {}), _lastReviewComment: null, revisionDueAt: null, revision_due_at: null };
}

module.exports = {
    withRevisionAnswered,
    SERVER_OWNED_FORM_DATA_KEYS,
};
