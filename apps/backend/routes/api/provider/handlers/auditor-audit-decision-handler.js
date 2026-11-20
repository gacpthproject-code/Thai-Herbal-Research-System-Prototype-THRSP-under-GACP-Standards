const {
    authenticateProvider,
    logger,
    PERMISSIONS,
    requireCanonicalPermission,
    obj,
    arr,
    prisma, // retained ONLY as the transaction handle the result writers run in
    workflowTransitionService,
    getRequestIp,
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
    applicationService,
} = require('./auditor-handler-deps');
const { auditDecisionErrorResponse } = require('../../../../services/audit-decision-error-response');
const { notifyApplicationParties } = require('../../../../services/notification/application-parties');
const { recordInspectionResult, tellPartiesOfInspectionResult, assertCarEvidenceToJudge, RESULT_REFUSALS } = require('../../../../services/inspection-result-service');
const { answerTypedRefusal } = require('../../../../shared/api-response');
// Separation of duties at decision time (operator ruling 2026-10-05).
const { assertDecisionNotByReviewerAndInspector, answerSeparation } = require('../../../../shared/reviewer-inspector-separation');
const { assertOnsiteEvidenceForPass } = require('../../../../services/onsite-evidence-gate');
const { lookup: lookupErrorCode } = require('../../../../shared/error-codes');
// AUDIT-001 / #539 (extended 2026-06-24, multi-role system test): admin is NOT in
// the audit-decision path (SoD — "admin is not in the workflow"). Gate this PRIMARY
// surface to AUDITORS (which excludes ADMIN) like the /onsite/:auditId/decision
// sibling; previously this route gated only on the
// APPLICATION_AUDIT_RECORD permission (which ADMIN holds via the all-perms set) +
// an ADMIN ownership-bypass, so an admin could record PASS and auto-issue a cert.
// Admin recovery is the workflow `force` path, never this route.
const { requireRole } = require('../../../../middleware/auth-middleware');
const { ROLE_GROUPS } = require('../../../../shared/canonical-rbac');
// Closing-review NEW-2 (2026-05-15): mask the raw 13-digit identifier before
// writing it into the hash-chained audit row. Raw nationals IDs in audit are a
// PDPA Section 27 violation when admins read the audit feed.
const { maskThaiId } = require('../../../../utils/field-encryption');

/**
 * Record the inspector's "a second visit is needed" on corrective evidence. The status stays
 * CAR_REVIEWING; formData.reinspection marks it REQUESTED, which is the one state the dispatcher
 * books a re-inspection from. The inspector's evidence review is done and the dispatcher's task
 * opens in the same transaction; the dispatchers, the applicant and the holder are told after it.
 */
async function requestReinspection({ req, res, application, notes }) {
    const workActivityService = require('../../../../services/work-activity-service');
    const { notifyDispatchersOfQueuedWork } = require('../../../../services/notification/domain-helpers');
    const nowIso = new Date().toISOString();
    const formData = obj(application.formData);
    const record = { decision: 'REINSPECT', notes, decidedAt: nowIso, decidedBy: req.user.id, decidedByRole: req.user.canonicalRole || req.user.role || null };

    const written = await prisma.$transaction(async (tx) => {
        // Compare-and-set on the version read (security review 2026-10-09 J1): a second request
        // racing the first writes over neither its record nor its history.
        const updated = await tx.application.updateMany({
            where: { id: application.id, status: 'CAR_REVIEWING', auditorId: req.user.id, version: application.version },
            data: {
                updatedBy: req.user.id,
                version: { increment: 1 },
                formData: {
                    ...formData,
                    reinspection: { status: 'REQUESTED', reason: notes, requestedAt: nowIso, requestedBy: req.user.id },
                    auditDecision: record,
                    auditDecisions: [...arr(formData.auditDecisions), record],
                },
                workflowHistory: [
                    ...arr(application.workflowHistory),
                    { timestamp: nowIso, action: 'REINSPECTION_REQUESTED', notes, actorId: req.user.id, actorRole: record.decidedByRole },
                ],
            },
        });
        if (updated.count === 0) { return false; }
        await workActivityService.completeAdHocActivity({
            prisma: tx, applicationId: application.id, workType: 'CAR_REVIEW', triggeredAtStage: 'CAR_REVIEWING', completedBy: req.user.id,
        });
        await workActivityService.createDispatcherTask({
            prisma: tx, applicationId: application.id, triggeredAtStage: 'CAR_REVIEWING', organizationId: application.organizationId, note: notes,
        });
        return true;
    });
    if (!written) {
        return res.status(409).json({ success: false, error: 'สถานะคำขอเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่' });
    }

    await notifyDispatchersOfQueuedWork(application.id, {
        title: 'มีคำขอต้องนัดลงพื้นที่ซ้ำ',
        message: `คำขอเลขที่ ${application.applicationNumber} ผู้ตรวจพื้นที่ต้องลงพื้นที่ตรวจซ้ำ: ${notes}`,
        data: { reinspection: true },
    });
    await notifyApplicationParties(application.id, {
        type: 'INFO',
        title: 'ต้องลงพื้นที่ตรวจซ้ำ',
        message: `คำขอเลขที่ ${application.applicationNumber} ผู้ตรวจพื้นที่พิจารณาหลักฐานการแก้ไขแล้ว และต้องลงพื้นที่ตรวจซ้ำ ผู้จัดคิวจะแจ้งวันนัดให้ทราบ`,
        data: { applicationNumber: application.applicationNumber, decision: 'REINSPECT' },
    }).catch((notificationError) => {
        logger.warn('[provider] reinspection notice failed', { message: notificationError.message });
    });
    await auditLogger.log({
        category: AuditCategory.APPLICATION,
        action: 'REINSPECTION_REQUESTED',
        severity: AuditSeverity.INFO,
        actorId: req.user.id,
        actorRole: req.user.canonicalRole || req.user.role || 'UNKNOWN',
        actorType: 'PROVIDER',
        resourceType: ResourceType.APPLICATION,
        resourceId: application.id,
        ipAddress: getRequestIp(req),
        userAgent: req.get('user-agent'),
        metadata: { applicationNumber: application.applicationNumber, notes },
    }).catch((auditError) => logger.warn('[provider] REINSPECTION_REQUESTED audit failed', { message: auditError.message }));

    return res.json({
        success: true,
        data: { id: application.id, applicationNumber: application.applicationNumber, status: 'CAR_REVIEWING', reinspection: 'REQUESTED' },
        message: 'บันทึกว่าต้องลงพื้นที่ตรวจซ้ำแล้ว ผู้จัดคิวจะนัดวันตรวจ',
    });
}

const auditorAuditDecisions = [
    authenticateProvider,
    requireRole(ROLE_GROUPS.AUDITORS),
    requireCanonicalPermission(PERMISSIONS.APPLICATION_AUDIT_RECORD),
    async (req, res) => {
        try {
            const idOrNumber = String(req.params.id || '').trim();
            const decision = String(req.body?.decision || '').trim().toUpperCase();
            const notes = String(req.body?.notes || '').trim() || null;
            const checklist = arr(req.body?.checklist);
            const evidence = arr(req.body?.evidence);
            const reasonCode = String(req.body?.reasonCode || '').trim().toUpperCase() || null;

            if (!idOrNumber) {
                return res.status(400).json({ success: false, error: 'Application id is required' });
            }
            if (!['PASS', 'MINOR', 'MAJOR', 'FAIL', 'REINSPECT'].includes(decision)) {
                return res.status(400).json({ success: false, error: 'decision must be PASS, MINOR, MAJOR, FAIL or REINSPECT' });
            }

            const application = await applicationService.findAuditDecisionApplication(idOrNumber);
            if (!application) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }

            // Ownership is unconditional now: the AUDITORS gate above already
            // excludes ADMIN, so there is no admin carve-out here — an auditor may
            // only decide on an audit assigned to them.
            if (application.auditorId !== req.user.id) {
                return res.status(403).json({ success: false, error: 'Application is not assigned to this auditor' });
            }

            try {
                assertDecisionNotByReviewerAndInspector({
                    actorId: req.user.id,
                    reviewerId: application.reviewerId,
                    auditorId: application.auditorId,
                });
            } catch (sodError) {
                if (answerSeparation(res, sodError)) { return undefined; }
                throw sodError;
            }

            const currentState = workflowTransitionService.resolveStateFromApplication(application);
            if (!['AUDIT_CONFIRMED', 'CAR_REVIEWING'].includes(currentState)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid state for decision (${currentState}).`,
                });
            }
            // The corrective evidence of a major finding is not enough on paper: the inspector must
            // see it on site, and the dispatcher books that visit (order 27). Only while reviewing
            // the evidence, and only with the reason the dispatcher and the applicant will read.
            if (decision === 'REINSPECT') {
                if (currentState !== 'CAR_REVIEWING' || !notes) {
                    return res.status(400).json({
                        success: false,
                        code: 'REINSPECTION_NEEDS_REASON',
                        error: lookupErrorCode('REINSPECTION_NEEDS_REASON').messageTh,
                    });
                }
                return requestReinspection({ req, res, application, notes });
            }

            // P0-2 (2026-06-10, owner-directed): canon (F1) is human PASS/FAIL only, no automated
            // score overrides the inspector's result. A PASS is evidence-gated instead (below); the
            // certificate is issued later, at APPROVED, by the certificate approver. Every result is written by the one writer
            // the field screen uses too (services/inspection-result-service.js): a FAIL waits for
            // the approver at AUDIT_NOT_PASSED and never closes the application (order 56(2)).
            const inspectorRole = req.user.canonicalRole || req.user.role || null;
            const recorded = await prisma.$transaction(async (tx) => {
                // The inspector's PASS rests on the same onsite evidence the certificate
                // will — refuse it HERE, with the reason, not after the file has reached
                // the approver's queue. Inside the transaction so a refusal writes nothing.
                if (decision === 'PASS') {
                    assertCarEvidenceToJudge({ fromStatus: currentState, verdict: decision, formData: application.formData, inspectorId: req.user.id });
                    await assertOnsiteEvidenceForPass({ prisma: tx, application });
                }
                return recordInspectionResult(tx, {
                    applicationId: application.id,
                    expectedStatus: application.status,
                    inspectorId: req.user.id,
                    inspectorRole,
                    verdict: decision,
                    notes,
                    findings: req.body?.findings,
                    checklist,
                    evidence,
                    reasonCode,
                });
            });
            const updated = await applicationService.findAuditDecisionPostWriteSlice(application.id);
            await tellPartiesOfInspectionResult({
                applicationId: application.id,
                applicationNumber: application.applicationNumber,
                verdict: decision,
                findings: recorded.findings,
                notes,
                logger,
            });

            await auditLogger.log({
                category: AuditCategory.APPLICATION,
                action: 'AUDIT_DECISION_RECORDED',
                severity: (decision === 'MAJOR' || decision === 'FAIL') ? AuditSeverity.WARNING : AuditSeverity.INFO,
                actorId: req.user.id || 'SYSTEM',
                actorRole: inspectorRole || 'UNKNOWN',
                actorType: 'PROVIDER',
                resourceType: ResourceType.APPLICATION,
                resourceId: application.id,
                ipAddress: getRequestIp(req),
                userAgent: req.get('user-agent'),
                metadata: {
                    applicationNumber: application.applicationNumber,
                    decision,
                    reasonCode,
                    notes,
                    previousStatus: application.status,
                    nextStatus: recorded.toStatus,
                    previousWorkflowState: currentState,
                    nextWorkflowState: recorded.toStatus,
                    actorIdentity: maskThaiId(req.user.providerId) || maskThaiId(req.user.healthId) || null,
                },
            }).catch((auditError) => logger.warn('[provider] AUDIT_DECISION_RECORDED audit failed', { message: auditError.message }));

            return res.json({
                success: true,
                data: { id: updated.id, applicationNumber: updated.applicationNumber, status: updated.status },
                message: `Audit decision ${decision} recorded`,
            });
        } catch (error) {
            logger.error('[provider] auditor decision failed:', error);
            // The result writer's own refusals (no finding, desk review, a row that moved) answer with
            // their Thai message; the certificate mapper below would label them a certificate failure.
            if (RESULT_REFUSALS.has(error?.code) && answerTypedRefusal(res, error)) { return undefined; }
            // F-WALK-01: a PASS refused for a coded, correctable reason (no onsite audit
            // recorded, short evidence, a plant/location the certificate must name) used to
            // flatten to a blanket 500 — the auditor read a server error where they should have
            // read what to fix. Surface the reason.
            const mapped = auditDecisionErrorResponse(error);
            if (mapped) {
                return res.status(mapped.status).json(mapped.body);
            }
            if (answerTypedRefusal(res, error)) { return undefined; }
            return res.status(500).json({
                success: false,
                error: 'Failed to record audit decision',
            });
        }
    },
];

module.exports = {
    auditorAuditDecisions,
};
