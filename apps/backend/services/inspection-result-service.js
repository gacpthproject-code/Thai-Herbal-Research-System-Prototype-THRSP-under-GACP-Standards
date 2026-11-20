'use strict';

/**
 * The one writer of the field inspector's result of a visit, for the job sheet
 * (routes/api/provider/handlers/auditor-audit-decision-handler.js) and the field screen
 * (services/audit-onsite-service.js submitDecision). Order 56(2): "ไม่ผ่าน" sends the file to
 * the certificate approver and never closes the application; the outcome table is
 * shared/inspection-verdicts.js.
 *
 * Every result that is not PASS clears a PASS stamp left by an earlier visit: issuance accepts
 * a PASS from the auditResult column or formData (certificate-service.js), and nothing else
 * clears it.
 */

const { VERDICT_TARGET } = require('../shared/inspection-verdicts');
const { ERROR_CODES } = require('../shared/error-codes');
const { CANONICAL_ROLES } = require('../shared/canonical-rbac');
const { ROLE_TRANSITIONS, resolveStateFromApplication } = require('./workflow-transition-service');
const { writeApplicationStatus } = require('./application-status-writer');
const { lockApplicationRow } = require('./checkout/application-row-lock');
const { requestOnsiteCorrection, tellPartiesOfCorrection, findingLines } = require('./onsite-correction');
const { filesOfRound, unopenedFilesOfRound } = require('./car-evidence-files');

/** The refusals this writer raises, each a catalogued 4xx with its Thai message. */
const RESULT_REFUSALS = new Set(['FINDINGS_REQUIRED', 'CAR_COMMENT_REQUIRED', 'CAR_REVIEW_CANNOT_FAIL', 'CAR_EVIDENCE_MISSING', 'CAR_EVIDENCE_NOT_OPENED', 'APPLICATION_STATE_CHANGED']);

function refusal(code) {
    const row = ERROR_CODES[code];
    return Object.assign(new Error(row.messageTh), { code: row.code, statusCode: row.httpStatus, status: row.httpStatus, messageTh: row.messageTh });
}

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

/** The findings a result carries, each with what was found and how to correct it. */
function normalizeFindings(findings) {
    return asArray(findings).map((finding, index) => ({
        index: index + 1,
        nonConformity: String(finding?.nonConformity || '').trim(),
        correctiveAction: String(finding?.correctiveAction || '').trim(),
        category: String(finding?.category || '').trim() || null,
    })).filter((finding) => finding.nonConformity || finding.correctiveAction);
}

/**
 * The checks that need no database: the result is known, a FAIL names at least one finding
 * with its correction (56(2) "พร้อมข้อบกพร่อง"), and a correction request says what to fix.
 */
function assertResultIsComplete({ verdict, notes, reasonCode, findings }) {
    if (!VERDICT_TARGET[verdict]) {
        throw new TypeError(`recordInspectionResult: unknown result ${verdict}`);
    }
    if (verdict === 'FAIL' && !findings.some((finding) => finding.nonConformity && finding.correctiveAction)) {
        throw refusal('FINDINGS_REQUIRED');
    }
    if ((verdict === 'MINOR' || verdict === 'MAJOR') && !notes && !reasonCode && findings.length === 0) {
        throw refusal('CAR_COMMENT_REQUIRED');
    }
}

function assertCarEvidenceToJudge({ fromStatus, verdict, formData, inspectorId }) {
    if (fromStatus !== 'CAR_REVIEWING' || verdict !== 'PASS') { return; }
    if (Number.isNaN(Date.parse(asObject(formData).carRequestedAt))) { return; }
    if (filesOfRound(formData).length === 0) { throw refusal('CAR_EVIDENCE_MISSING'); }
    if (unopenedFilesOfRound(formData, inspectorId).length > 0) { throw refusal('CAR_EVIDENCE_NOT_OPENED'); }
}

/**
 * @param {object} tx the caller's transaction
 * @param {object} args
 * @param {string} args.applicationId
 * @param {string} args.expectedStatus the status the caller decided on; a row that moved since is refused
 * @param {string} args.inspectorId
 * @param {string} args.inspectorRole
 * @param {'PASS'|'MINOR'|'MAJOR'|'FAIL'} args.verdict
 * @param {string|null} [args.notes]
 * @param {Array<{nonConformity: string, correctiveAction: string, category?: string}>} [args.findings]
 * @param {Array} [args.checklist]
 * @param {Array} [args.evidence]
 * @param {string|null} [args.reasonCode]
 * @param {string|null} [args.onsiteAuditId] the visit the field screen decided on
 * @param {Function} [args.onAudit] the caller's in-transaction audit hook (writer default when omitted)
 * @param {string} [args.reason] the transition's reason code, naming the door (AUDIT_DECISION_<verdict> by default)
 * @param {Date} [args.at]
 * @returns {Promise<{ application: object, toStatus: string, carDueAt: Date|null, findings: object[] }>}
 */
async function recordInspectionResult(tx, {
    applicationId, expectedStatus, inspectorId, inspectorRole, verdict, notes: rawNotes = null, findings: rawFindings = [],
    checklist = [], evidence = [], reasonCode = null, onsiteAuditId = null, onAudit, reason = `AUDIT_DECISION_${verdict}`, at = new Date(),
}) {
    const notes = String(rawNotes || '').trim() || null;
    const findings = normalizeFindings(rawFindings);
    assertResultIsComplete({ verdict, notes, reasonCode, findings });

    const locked = await lockApplicationRow(tx, applicationId);
    if (!locked || locked.status !== expectedStatus) { throw refusal('APPLICATION_STATE_CHANGED'); }
    const stored = await tx.application.findUnique({
        where: { id: applicationId },
        select: { id: true, applicationNumber: true, healthId: true, status: true, formData: true, workflowHistory: true },
    });
    const fromStatus = resolveStateFromApplication(stored);
    const toStatus = VERDICT_TARGET[verdict];
    if (fromStatus === 'CAR_REVIEWING' && !ROLE_TRANSITIONS[CANONICAL_ROLES.FIELD_INSPECTOR].has(`${fromStatus}->${toStatus}`)) {
        throw refusal('CAR_REVIEW_CANNOT_FAIL');
    }
    assertCarEvidenceToJudge({ fromStatus, verdict, formData: stored.formData, inspectorId });

    const nowIso = at.toISOString();
    const record = {
        decision: verdict, notes, checklist, evidence, findings, reasonCode,
        decidedAt: nowIso, decidedBy: inspectorId, decidedByRole: inspectorRole || null,
        ...(onsiteAuditId ? { onsiteAuditId } : {}),
    };
    const { auditedAt: _earlierPass, ...formData } = asObject(stored.formData);
    const additionalData = {
        auditResult: verdict,
        auditNotes: notes,
        formData: {
            ...formData,
            workflowState: toStatus,
            workflowStateUpdatedAt: nowIso,
            auditResult: verdict,
            ...(verdict === 'PASS' ? { auditedAt: nowIso } : {}),
            ...(onsiteAuditId ? { onsiteAuditId } : {}),
            auditDecision: record,
            auditDecisions: [...asArray(formData.auditDecisions), record],
            auditFollowup: verdict === 'MINOR' || verdict === 'MAJOR'
                ? { required: true, type: verdict, requestedAt: nowIso, status: 'REQUESTED' }
                : null,
        },
        workflowHistory: [
            ...asArray(stored.workflowHistory),
            {
                timestamp: nowIso, action: 'AUDIT_DECISION_RECORDED', decision: verdict, reasonCode, notes,
                fromStatus, toStatus, actorId: inspectorId, actorRole: inspectorRole || null,
            },
        ],
    };

    if (toStatus === 'CAR_PENDING') {
        const opened = await requestOnsiteCorrection(tx, {
            application: stored, fromStatus, actorId: inspectorId, actorRole: inspectorRole, reason,
            additionalData, findings, note: notes || reasonCode, onAudit, at,
        });
        return { application: opened.application, toStatus, carDueAt: opened.carDueAt, findings };
    }
    const written = await writeApplicationStatus({
        prisma: tx,
        applicationId,
        fromStatus,
        toStatus,
        actorId: inspectorId,
        actorRole: inspectorRole,
        reason,
        assertTransition: true,
        ...(onAudit ? { onAudit } : {}),
        additionalData,
    });
    return { application: written, toStatus, carDueAt: null, findings };
}

/**
 * After the commit, tell the applicant and the holder (order 32). PASS is told by the status
 * writer's APPLICANT_AUDIT_PASSED; a correction request by its letter and the AUDIT_RESULT_CAR
 * notice with the findings; "not passed" by INSPECTION_RESULT_RECORDED, which names every finding
 * (ISO/IEC 17065 7.4.6) and says the approver decides next. Best effort: the result is committed.
 */
async function tellPartiesOfInspectionResult({ applicationId, applicationNumber, verdict, findings, notes = null, logger }) {
    if (verdict === 'PASS') { return; }
    if (verdict !== 'FAIL') {
        await tellPartiesOfCorrection({ applicationId, applicationNumber, decision: verdict, findings, note: notes, logger });
        return;
    }
    const { fanoutToApplicationParties } = require('./notification/application-parties');
    try {
        await fanoutToApplicationParties(applicationId, {
            type: 'INSPECTION_RESULT_RECORDED',
            payload: { applicationNumber, decision: verdict, findings: findingLines(findings) },
        });
    } catch (error) {
        logger?.warn?.('[inspection-result] party notice failed (non-fatal)', { message: error.message });
    }
}

module.exports = { recordInspectionResult, tellPartiesOfInspectionResult, assertCarEvidenceToJudge, RESULT_REFUSALS };
