/**
 * Workflow Transition Side-Effects
 * Extracted from workflow-transitions-handler.js for readability.
 *
 * Handles: revision deadlines, notifications, certificate issuance, audit logging.
 *
 * @module routes/api/provider/handlers/workflow-side-effects
 */

const { writeApplicationStatus } = require('../../../../services/application-status-writer');
const { notifyApplicationParties } = require('../../../../services/notification/application-parties');
// Closing-review NEW-2 (2026-05-15): mask the raw 13-digit identifier before
// writing it into the hash-chained audit row (PDPA Section 27).
const { maskThaiId } = require('../../../../utils/field-encryption');
const adminApplicationService = require('../../../../services/admin-application-service');
const { DEFAULT_TIME_ZONE, addWorkingDays } = require('../../../../utils/working-days');
const { PAYMENT } = require('../../../../config/business-rules');

/**
 * The revision clock's start, shared by every door that moves an application to
 * REVISION_REQUESTED: the generic /workflow-transitions door and the reviewer screen's per-slot
 * "ขอเพิ่มเอกสาร" (document-reviews.js POST /:id/document-decision). The applicant's answer stops
 * it in the status writer (stopRevisionClock).
 *
 * Thai-holiday-aware and Asia/Bangkok (utils/working-days), the canonical
 * PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS working days.
 *
 * @param {object} p
 * @param {object} [p.baseFormData]  the application's formData the fields are merged onto
 * @param {Date}   [p.requestedAt]
 * @param {string|null} [p.category]
 * @param {string|null} [p.message]
 * @param {Array}  [p.items]
 * @param {string|null} [p.requestedBy]
 * @param {string|null} [p.requestedByRole]
 * @returns {{ dueAt: Date, requestedAt: Date, slaDays: number, formData: object, eventMetadata: object }}
 */
function buildRevisionDeadlineFormData({
    baseFormData = {}, requestedAt = new Date(), category = null, message = null, items = [],
    requestedBy = null, requestedByRole = null,
} = {}) {
    const slaDays = PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS;
    // Blocker F: Thai-holiday-aware + Asia/Bangkok (utils/working-days).
    // The old services/working-days-service path counted Thai public
    // holidays as working days (its holiday sources were never seeded)
    // → too-short deadline → early auto-EXPIRE → farmer forfeits งวด 1.
    const dueAt = addWorkingDays(requestedAt, slaDays);
    const requestedIso = requestedAt.toISOString();
    const dueIso = dueAt.toISOString();
    const formData = {
        ...baseFormData,
        revisionRequestedAt: requestedIso,
        revisionDueAt: dueIso,
        revisionSlaDays: slaDays,
        revision_requested_at: requestedIso,
        revision_due_at: dueIso,
        revision_sla_days: slaDays,
        revisionRequest: {
            category,
            message,
            items,
            requestedAt: requestedIso,
            dueAt: dueIso,
            requestedBy,
            requestedByRole,
        },
    };
    const eventMetadata = {
        revisionRequestedAt: requestedIso,
        revisionDueAt: dueIso,
        revisionSlaDays: slaDays,
        revision_requested_at: requestedIso,
        revision_due_at: dueIso,
        revision_sla_days: slaDays,
        revisionCategory: category,
        revisionMessage: message,
        revisionItems: items,
    };
    return { dueAt, requestedAt, slaDays, formData, eventMetadata };
}

/**
 * Manage revision deadline records when transitioning states.
 */
async function handleRevisionDeadlines(prisma, { application, transition, reqUser, getRevisionDueAt, updated, arr, logger }) {
    if (transition.nextState === 'REVISION_REQUESTED') {
        const dueAt = getRevisionDueAt(transition.updateData?.formData);
        if (dueAt) {
            // adminApplicationService.findRevisionDeadlineByApplicationId —
            // replaces prisma.revisionDeadline.findUnique.
            const existingDeadline = await adminApplicationService.findRevisionDeadlineByApplicationId(
                application.id,
                { select: { revisionCount: true } },
            );
            const nextRevisionCount = (existingDeadline?.revisionCount || 0) + 1;
            // adminApplicationService.upsertRevisionDeadline — replaces
            // prisma.revisionDeadline.upsert.
            await adminApplicationService.upsertRevisionDeadline({
                applicationId: application.id,
                update: {
                    revisionDue: dueAt,
                    status: 'PENDING',
                    revisionCount: nextRevisionCount,
                    updatedBy: reqUser.id,
                },
                create: {
                    applicationId: application.id,
                    organizationId: application.organizationId,
                    revisionDue: dueAt,
                    status: 'PENDING',
                    revisionCount: 1,
                    createdBy: reqUser.id,
                },
            });
        }
    } else if (transition.nextState === 'DOC_APPROVED') {
        // adminApplicationService.bulkUpdateRevisionDeadlineStatus — replaces
        // prisma.revisionDeadline.updateMany for the APPROVED transition.
        await adminApplicationService.bulkUpdateRevisionDeadlineStatus({
            applicationId: application.id,
            fromStatuses: ['PENDING', 'SUBMITTED', 'EXTENDED'],
            data: {
                status: 'APPROVED',
                updatedBy: reqUser.id,
            },
        });

        // Auto-chain: DOC_APPROVED → PENDING_AUDIT_FEE
        const chainTs = new Date().toISOString();
        const chainedFormData = {
            ...transition.updateData.formData,
            workflowState: 'PENDING_AUDIT_FEE',
            workflowStateUpdatedAt: chainTs,
            docApprovedAt: chainTs,
        };
        const arrFn = arr || ((v) => Array.isArray(v) ? v : []);
        const chainedHistory = [
            ...arrFn(transition.updateData.workflowHistory),
            {
                timestamp: chainTs,
                action: 'AUDIT_FEE_PAYMENT_REQUIRED',
                fromState: 'DOC_APPROVED',
                toState: 'PENDING_AUDIT_FEE',
                actorId: 'SYSTEM',
                actorRole: 'system',
            },
        ];
        await writeApplicationStatus({
            prisma,
            applicationId: application.id,
            fromStatus: 'DOC_APPROVED',
            toStatus: 'PENDING_AUDIT_FEE',
            actorId: 'SYSTEM',
            actorRole: 'system',
            reason: 'AUDIT_FEE_PAYMENT_REQUIRED',
            additionalData: {
                formData: chainedFormData,
                workflowHistory: chainedHistory,
            },
        });
        // เดิมตรงนี้เรียก ensurePhaseInvoices('PHASE_2') ตอนเอกสารผ่าน เพื่อให้มีใบแจ้งหนี้
        // งวดที่ 2 ไว้ให้จ่าย · การแยกใบรัฐ/บริษัทถูกปิดไปตั้งแต่ F-G4-35 และถูกลบทั้งเครื่อง
        // เมื่อ 2026-09-11 ตอน operator สั่งเลิกแยกค่าธรรมเนียม
        // ใบแจ้งหนี้จริงมินต์ที่ /api/payments/checkout ใบเดียวต่องวด ตอนผู้ยื่นกดจ่าย
        // Update local refs so the response and notification reflect final status
        transition.nextState = 'PENDING_AUDIT_FEE';
        transition.nextLegacyStatus = 'PENDING_AUDIT_FEE';
        if (updated) {
            updated.status = 'PENDING_AUDIT_FEE';
            updated.formData = chainedFormData;
        }
        if (logger) {
            logger.info(`[provider] Auto-chained DOC_APPROVED → PENDING_AUDIT_FEE for ${application.applicationNumber}`);
        }
    }
}

function thaiLongDate(at) {
    if (!at) { return 'ภายในเวลาที่กำหนด'; }
    try {
        return new Date(at).toLocaleDateString('th-TH', { timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_e) {
        return new Date(at).toISOString();
    }
}

/**
 * Tell the applicant and the holder (order 32) what this transition means for them.
 * Best-effort: the transition has committed, a notification fault is only logged.
 */
async function sendTransitionNotifications(prisma, logger, { application, transition, getRevisionDueAt, revisionCategory, revisionMessage, effectiveComment, revisionItems }) {
    const base = { applicationNumber: application.applicationNumber };
    const notices = {
        REVISION_REQUESTED: () => {
            const dueAt = getRevisionDueAt(transition.updateData.formData);
            return {
                type: 'WARNING',
                title: 'คำขอต้องแก้ไข',
                message: `คำขอเลขที่ ${application.applicationNumber} ต้องแก้ไข กรุณาแก้ไขและส่งกลับภายในวันที่ ${thaiLongDate(dueAt)}`,
                data: {
                    ...base, action: 'REVISION_REQUESTED', revisionCategory,
                    revisionMessage: revisionMessage || effectiveComment, revisionItems,
                    revisionDueAt: dueAt ? dueAt.toISOString() : null,
                },
            };
        },
        PENDING_AUDIT_FEE: () => ({
            type: 'INFO',
            title: 'เอกสารผ่านการตรวจ กรุณาชำระงวดที่ 2',
            message: `คำขอเลขที่ ${application.applicationNumber} ผ่านการตรวจเอกสารแล้ว กรุณาชำระงวดที่ 2 ค่าบริการตรวจประเมินแปลงและออกใบรับรอง เพื่อดำเนินการขั้นต่อไป`,
            data: { ...base, action: 'PENDING_AUDIT_FEE', nextRequiredAction: 'PAY_PHASE_2' },
            actionUrl: `/health/payments?app=${application.id}`,
        }),
        CERTIFIED: () => {
            const certificateNumber = transition.updateData?.formData?.certificateNumber
                || transition.updateData?.certificateNumber || application.certificateNumber || '-';
            const certificateUrl = transition.updateData?.formData?.certificateUrl || transition.updateData?.certificateUrl || null;
            return {
                type: 'SUCCESS',
                title: 'ยินดีด้วย คำขอได้รับการรับรอง GACP',
                message: `คำขอเลขที่ ${application.applicationNumber} ได้รับการรับรอง GACP แล้ว เลขที่ใบรับรอง ${certificateNumber}`,
                data: { ...base, action: 'CERTIFIED', certificateNumber, certificateUrl },
            };
        },
    };
    const build = notices[transition.nextState];
    if (!build) { return; }
    try {
        await notifyApplicationParties(application.id, build());
    } catch (err) {
        logger.warn('[provider] transition notification failed', { message: err.message, applicationId: application.id, state: transition.nextState });
    }
}

/**
 * Log the workflow transition to the audit trail.
 */
async function logTransitionAudit(auditLogger, logger, { AuditCategory, AuditSeverity, ResourceType, application, transition, reqUser, reasonCode, effectiveComment, force, getRequestIp, req }) {
    try {
        await auditLogger.log({
            category: AuditCategory.APPLICATION,
            action: force ? 'WORKFLOW_FORCE_TRANSITION' : 'WORKFLOW_TRANSITION',
            severity: force ? AuditSeverity.WARNING : AuditSeverity.INFO,
            actorId: reqUser.id || 'SYSTEM',
            actorRole: reqUser.canonicalRole || reqUser.role || 'UNKNOWN',
            actorType: 'PROVIDER',
            resourceType: ResourceType.APPLICATION,
            resourceId: application.id,
            ipAddress: getRequestIp(req),
            userAgent: req.get('user-agent'),
            metadata: {
                applicationNumber: application.applicationNumber,
                previousWorkflowState: transition.previousState,
                nextWorkflowState: transition.nextState,
                previousStatus: application.status,
                nextStatus: transition.nextLegacyStatus,
                reasonCode,
                comment: effectiveComment,
                force,
                actorIdentity: maskThaiId(reqUser.providerId) || maskThaiId(reqUser.healthId) || null,
            },
        });
    } catch (auditError) {
        logger.warn('[provider] workflow transition audit failed', {
            message: auditError.message,
            applicationId: application.id,
        });
    }
}


/**
 * What a document approval CAUSES, wherever the approval was decided.
 *
 * Two doors approve documents now: the generic workflow-transition handler and,
 * since 2026-09-05, the per-slot document-decision screen. The consequences are
 * the same either way — close the revision deadlines this approval settles, and
 * open the audit fee, because `DOC_APPROVED → PENDING_AUDIT_FEE` is a chain the
 * applicant cannot trigger themselves.
 *
 * The new door wrote DOC_APPROVED and stopped, so a filing approved through it sat
 * there forever: the applicant was told their papers passed and was never asked
 * for the audit fee, and no job picks such a filing up (payment-closure-job only
 * closes applications ALREADY in PENDING_AUDIT_FEE). Rather than copy the chain
 * into the second door — where the two copies would drift the first time either
 * changed — it lives here and both call it.
 *
 * Dependencies are injected so this is testable without the whole handler graph,
 * and so the caller decides which prisma/transaction client is in play.
 *
 * NEVER THROWS. The status write that produced DOC_APPROVED has already
 * committed; a throw here would 500 a decision that did happen and the officer
 * would press the button again. Same discipline as the notification branches.
 *
 * @returns {{chained: boolean, error: string|null}}
 */
async function applyDocumentApprovalConsequences({
    prisma, applicationId, actorId, actorRole, formData, workflowHistory,
    writeApplicationStatus, bulkUpdateRevisionDeadlineStatus, logger: log,
    // Injected so the consequence can be tested without dragging the numbering
    // chain into this module's load; defaults to the real issuer.
    issueQuotationOnSubmit: issueQuotation,
}) {
    const at = new Date().toISOString();
    try {
        await bulkUpdateRevisionDeadlineStatus({
            applicationId,
            fromStatuses: ['PENDING', 'SUBMITTED', 'EXTENDED'],
            data: { status: 'APPROVED', updatedBy: actorId },
        });

        await writeApplicationStatus({
            prisma,
            applicationId,
            fromStatus: 'DOC_APPROVED',
            toStatus: 'PENDING_AUDIT_FEE',
            actorId: 'SYSTEM',
            actorRole: 'system',
            reason: 'AUDIT_FEE_PAYMENT_REQUIRED',
            additionalData: {
                formData: {
                    ...(formData || {}),
                    workflowState: 'PENDING_AUDIT_FEE',
                    workflowStateUpdatedAt: at,
                    docApprovedAt: at,
                },
                workflowHistory: [
                    ...(Array.isArray(workflowHistory) ? workflowHistory : []),
                    {
                        timestamp: at,
                        action: 'AUDIT_FEE_PAYMENT_REQUIRED',
                        fromState: 'DOC_APPROVED',
                        toState: 'PENDING_AUDIT_FEE',
                        actorId: 'SYSTEM',
                        actorRole: 'system',
                        decidedBy: actorId || null,
                        decidedByRole: actorRole || null,
                    },
                ],
            },
        });
        // ── F-G4-71 — the งวดที่ 2 document, issued by the system (operator ruling
        //    2026-09-06, option ก) ───────────────────────────────────────────────
        //
        // Opening PENDING_AUDIT_FEE without a quotation opens a debt nobody can pay:
        // the checkout gate answers QUOTATION_NOT_ISSUED and the applicant's payments
        // page reads ฿0. The submit door already issues one, so the ordinary path was
        // covered — this closes the shapes that arrive without having gone through it.
        //
        // AFTER the status write, deliberately: a transition that did not happen must
        // not leave a price behind. Idempotent, so a filing that already carries a
        // quotation gets the same row rather than a second document. And it cannot
        // throw — DOC_APPROVED has committed, so a billing fault is logged and the
        // approval stands, exactly like the branches above it.
        let quotationIssued = false;
        try {
            const issue = issueQuotation
                || require('../../../../services/quotation-issuance-on-submit').issueQuotationOnSubmit;
            const outcome = await issue({
                application: { id: applicationId },
                actorId: 'SYSTEM',
                actorRole: 'system',
            });
            quotationIssued = Boolean(outcome && outcome.issued !== false);
        } catch (quotationErr) {
            const why = quotationErr && quotationErr.message ? quotationErr.message : String(quotationErr);
            if (log && typeof log.error === 'function') {
                log.error(
                    `[workflow-side-effects] audit-fee quotation not issued for ${applicationId} — `
                    + `the applicant cannot pay งวดที่ 2 until it is: ${why}`,
                );
            }
        }

        return { chained: true, error: null, quotationIssued };
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (log && typeof log.warn === 'function') {
            log.warn(`[workflow-side-effects] audit-fee chain failed for ${applicationId}: ${message}`);
        }
        return { chained: false, error: message, quotationIssued: false };
    }
}

module.exports = {
    buildRevisionDeadlineFormData,
    handleRevisionDeadlines,
    sendTransitionNotifications,
    logTransitionAudit,
    applyDocumentApprovalConsequences,
};
