const express = require('express');
const { providerRouteHandlers } = require('./route-registry');
const {
    authenticateProvider,
    requireCanonicalPermission,
    requireRole,
    PERMISSIONS,
    logger,
    prisma,
} = require('./handlers/shared');
const { ROLE_GROUPS } = require('../../../shared/canonical-rbac');
const workflowTransitionService = require('../../../services/workflow-transition-service');
const { withVisibility } = require('../../../shared/application-visibility');
const { DECISION_QUEUE_STATES } = require('../../../shared/decision-states');
// Batch 14 (2026-05-16): auditor routes now go through the service layer.
// `applicationService` owns the final-approval queue listing, the
// visibility-scoped detail lookup and the column-only writes that follow a
// buildTransitionUpdate(). Direct prisma.X.find/update calls have been
// retired — only the prisma client handle is needed for downstream callers
// (none here at the moment, but the pattern stays consistent with the rest
// of the provider cluster).
const applicationService = require('../../../services/application-service');
const certificateService = require('../../../services/certificate-service');
const { statusTransitionAuditHook } = require('../../../middleware/audit-logger');
const { writeApplicationStatus } = require('../../../services/application-status-writer');
const { lockApplicationRow } = require('../../../services/checkout/application-row-lock');
const { onsiteEvidenceRefusal } = require('../../../services/audit-decision-error-response');
const { lookup: lookupErrorCode } = require('../../../shared/error-codes');
const { buildDecisionFile } = require('../../../services/certification-decision-file-service');
const certificationDecisions = require('../../../services/certification-decision-service');
const carEvidenceFiles = require('../../../services/car-evidence-files');
const { BASE_UPLOAD_DIR, resolveWithinUploads } = require('../../../services/uploads-root');
const path = require('path');
const fs = require('fs');

const router = express.Router();

router.get('/dashboard', ...providerRouteHandlers.auditorDashboard);
router.post(
    '/applications/:id/inspection-starts',
    ...providerRouteHandlers.auditorInspectionStarts,
);
router.post(
    '/applications/:id/audit-decisions',
    ...providerRouteHandlers.auditorAuditDecisions,
);

router.get(
    '/applications/:id/car-evidence/:fileId',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.AUDIT_SUBMIT),
    requireRole(ROLE_GROUPS.AUDITORS),
    async (req, res) => {
        const notFound = () => res.status(404).json({
            success: false, code: 'CAR_EVIDENCE_FILE_NOT_FOUND', error: lookupErrorCode('CAR_EVIDENCE_FILE_NOT_FOUND').messageTh,
        });
        try {
            const orgId = req.user?.organizationId || req.tenantContext?.organizationId || null;
            if (!orgId) { return notFound(); }
            const application = await prisma.application.findFirst({
                where: { id: String(req.params.id || ''), isDeleted: false, organizationId: orgId, auditorId: req.user.id },
                select: { id: true, formData: true },
            });
            const fileId = String(req.params.fileId || '');
            const sent = Array.isArray(application?.formData?.carDocuments) ? application.formData.carDocuments : [];
            const doc = sent.find((entry) => carEvidenceFiles.fileIdOf(entry) === fileId);
            if (!application || !doc) { return notFound(); }
            const stored = resolveWithinUploads(path.join(BASE_UPLOAD_DIR, 'car', path.basename(String(doc.filename || doc.path || ''))));
            if (!stored || !fs.existsSync(stored)) { return notFound(); }
            await carEvidenceFiles.markCarEvidenceViewed({ prisma, applicationId: application.id, fileId, inspectorId: req.user.id });
            res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
            return res.sendFile(stored);
        } catch (error) {
            logger.error('[provider] auditor/car-evidence failed', { message: error.message });
            return res.status(500).json({ success: false, error: 'เปิดไฟล์หลักฐานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
        }
    },
);

// ── Audit Session (GPS Check-in / Evidence / Notes / Duration) ──────
const {
    handleGPSCheckIn,
    handleSaveEvidence,
    handleSaveSessionNotes,
    handleGetSession,
} = require('./handlers/auditor-session-handler');

router.get('/applications/:id/session', authenticateProvider, handleGetSession);
router.post('/applications/:id/session/checkin', authenticateProvider, requireCanonicalPermission(PERMISSIONS.AUDIT_SUBMIT), handleGPSCheckIn);
router.post('/applications/:id/session/evidence', authenticateProvider, requireCanonicalPermission(PERMISSIONS.AUDIT_SUBMIT), handleSaveEvidence);
router.post('/applications/:id/session/notes', authenticateProvider, requireCanonicalPermission(PERMISSIONS.AUDIT_SUBMIT), handleSaveSessionNotes);

// ── Final Approval (merged from head-auditor) ──────────────────────

// X2-FIX-D M-18 (DR-FA-1): defense-in-depth — tighten the GET queue to
// AUDITORS + ADMIN. DOC_REVIEWER holds APPLICATION_WORKFLOW_TRANSITION
// for its own ASSIGNED_FOR_REVIEW→DOC_APPROVED/REVISION_REQUESTED set,
// so the perm-only gate was admitting DR even though no canonical
// transition from AUDIT_PASSED is available to it. POST already 400s
// at buildTransitionUpdate, but the GET leaked the AUDIT_PASSED list.
// Same gate is intentionally NOT added to the POST endpoints — those
// already fail-closed at the service-layer canRoleTransition check,
// and adding requireRole there would change the response shape (403
// vs the existing 400 "cannot transition"), breaking existing tests.
router.get(
    '/final-approval-queue',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    // F-CERT-SOD 2026-09-10 — คิวนี้เคยเปิดให้ ROLE_GROUPS.AUDITORS คือผู้ตรวจหน้างาน
    // เห็นคำขอที่ตัวเองเพิ่งให้ผ่าน แล้วกดอนุมัติต่อได้ทันที · ตอนนี้เป็นของผู้ตัดสิน
    requireRole(ROLE_GROUPS.CERT_DECIDERS),
    async (req, res) => {
        try {
            // Fail closed: the queue lists only files the caller can open (decision-file is
            // organisation-walled), so a caller with no organisation sees none, not all.
            const orgId = req.user?.organizationId || req.tenantContext?.organizationId || null;
            if (!orgId) {
                return res.status(403).json({ success: false, error: 'บัญชีนี้ไม่ได้สังกัดองค์กร จึงไม่สามารถดูคิวพิจารณาได้' });
            }
            const rows = await applicationService.listFinalApprovalQueue({ organizationId: orgId });
            return res.json({
                success: true,
                data: {
                    total: rows.length,
                    items: rows.map((row) => ({
                        id: row.id,
                        applicationNumber: row.applicationNumber,
                        status: row.status,
                        updatedAt: row.updatedAt,
                        createdAt: row.createdAt,
                        applicantName: `${String(row.applicant?.firstName || '')} ${String(row.applicant?.lastName || '')}`.trim() || '-',
                    })),
                },
            });
        } catch (error) {
            logger.error('[provider] auditor/final-approval-queue failed', { message: error.message });
            return res.status(500).json({ success: false, error: 'Failed to load final approval queue' });
        }
    },
);

// The whole file, READ ONLY, for the certificate approver deciding on a queue row.
// Same gate as the queue above (CERT_DECIDERS — not the inspector, not admin) and the
// same scope: only a file that is IN the decision queue (DECISION_QUEUE_STATES) is served, and only
// within the caller's organisation (the /uploads ACL is the same wall for the documents).
// Read only: the approver reads evidence here; the onsite API's write routes stay closed to
// this role. What it assembles, and why: services/certification-decision-file-service.js.
router.get(
    '/applications/:id/decision-file',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    requireRole(ROLE_GROUPS.CERT_DECIDERS),
    async (req, res) => {
        try {
            const idOrNumber = String(req.params.id || '').trim();
            if (!idOrNumber) {
                return res.status(400).json({ success: false, error: 'ต้องระบุคำขอ' });
            }
            const orgId = req.user?.organizationId || req.tenantContext?.organizationId || null;
            // Fail closed: no organisation = no wall to read behind, so refuse rather than
            // reading AUDIT_PASSED files from every organisation.
            if (!orgId) {
                return res.status(403).json({ success: false, error: 'บัญชีนี้ไม่ได้สังกัดองค์กร จึงไม่สามารถเปิดแฟ้มคำขอได้' });
            }
            // The queue's file, or one an approver already decided: the notice that brought
            // the approver here must keep opening after the decision (read only, decidable false).
            const application = await prisma.application.findFirst({
                where: {
                    OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }],
                    isDeleted: false,
                    organizationId: orgId,
                    AND: [{
                        OR: [
                            { status: { in: [...DECISION_QUEUE_STATES] } },
                            ...Object.values(certificationDecisions.OUTCOMES).map((outcome) => (
                                { formData: { path: ['certificationDecision', 'outcome'], equals: outcome } })),
                        ],
                    }],
                },
                include: {
                    applicant: { select: { firstName: true, lastName: true } },
                    auditor: { select: { firstName: true, lastName: true } },
                    entity: true,
                },
            });
            if (!application) {
                return res.status(404).json({
                    success: false,
                    error: lookupErrorCode('NOT_IN_DECISION_QUEUE').messageTh,
                    code: 'NOT_IN_DECISION_QUEUE',
                });
            }
            const data = await buildDecisionFile({ prisma, application });
            return res.json({ success: true, data });
        } catch (error) {
            logger.error('[provider] auditor/decision-file failed', { message: error.message });
            return res.status(500).json({ success: false, error: 'ไม่สามารถโหลดแฟ้มคำขอได้ กรุณาลองใหม่อีกครั้ง' });
        }
    },
);

// The web page records that the file rendered for this approver: what lets this approver decide
// it (order 29). Same gate and organisation wall as the GET; only a file in the queue is stamped.
router.post(
    '/applications/:id/decision-file/opened',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    requireRole(ROLE_GROUPS.CERT_DECIDERS),
    async (req, res) => {
        try {
            const orgId = req.user?.organizationId || req.tenantContext?.organizationId || null;
            if (!orgId) {
                return res.status(403).json({ success: false, error: 'บัญชีนี้ไม่ได้สังกัดองค์กร จึงไม่สามารถเปิดแฟ้มคำขอได้' });
            }
            const stamped = await certificationDecisions.markDecisionFileViewed({
                prisma, applicationRef: String(req.params.id || '').trim(), organizationId: orgId, approverId: req.user.id,
            });
            if (!stamped) {
                return res.status(404).json({
                    success: false, error: lookupErrorCode('NOT_IN_DECISION_QUEUE').messageTh, code: 'NOT_IN_DECISION_QUEUE',
                });
            }
            return res.json({ success: true });
        } catch (error) {
            logger.error('[provider] auditor/decision-file opened failed', { message: error.message });
            return res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกการเปิดแฟ้มได้ กรุณาลองใหม่อีกครั้ง' });
        }
    },
);

/** A refusal the decision service threw (coded, with a status) or a fault. */
function sendDecisionError(res, error, fallbackTh) {
    const evidenceRefusal = onsiteEvidenceRefusal(error);
    if (evidenceRefusal) {
        return res.status(evidenceRefusal.status).json(evidenceRefusal.body);
    }
    // buildTransitionUpdate's guards throw plain Errors (wrong role, illegal edge): a state
    // condition, not a fault.
    const isTransitionGuard = /cannot transition|Invalid transition|already in workflow state|Unknown actor role/i.test(String(error?.message || ''));
    const status = Number(error?.status || error?.statusCode) || (isTransitionGuard ? 422 : 500);
    if (status >= 500) {
        logger.error('[provider] certification decision failed', { message: error?.message });
        return res.status(500).json({ success: false, error: fallbackTh });
    }
    const messageTh = error.messageTh || error.message;
    return res.status(status).json({ success: false, code: error.code || (isTransitionGuard ? 'INVALID_TRANSITION' : undefined), error: messageTh, messageTh });
}

// อนุมัติ — จากในแฟ้มเท่านั้น (คำสั่ง 29): ต้องเปิดแฟ้มก่อน ต้องมีเหตุผล จบที่ CERTIFIED
// การทำงานจริงทั้งหมดอยู่ใน services/certification-decision-service.js
router.post(
    '/applications/:id/final-approvals',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    requireRole(ROLE_GROUPS.CERT_DECIDERS),
    async (req, res) => {
        try {
            const data = await certificationDecisions.approveCertification({
                applicationRef: String(req.params.id || '').trim(),
                actor: req.user,
                reason: req.body?.reason,
            });
            return res.json({ success: true, data });
        } catch (error) {
            return sendDecisionError(res, error, 'ระบบไม่สามารถบันทึกการอนุมัติได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
        }
    },
);

// ไม่ให้การรับรอง — เหตุจากรายการตายตัว (shared/certification-decision-reasons.js)
router.post(
    '/applications/:id/certification-refusals',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    requireRole(ROLE_GROUPS.CERT_DECIDERS),
    async (req, res) => {
        try {
            const data = await certificationDecisions.refuseCertification({
                applicationRef: String(req.params.id || '').trim(),
                actor: req.user,
                reasonCode: req.body?.reasonCode,
                reasonText: req.body?.reasonText,
                consideration: req.body?.consideration,
                note: req.body?.note,
            });
            return res.json({ success: true, data });
        } catch (error) {
            return sendDecisionError(res, error, 'ระบบไม่สามารถบันทึกการไม่ให้การรับรองได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
        }
    },
);

// ส่งกลับให้ผู้ยื่นแก้ไขข้อบกพร่อง — แฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน (คำสั่ง 56(2)) · ข้อที่ยังต้องแก้เลือกจากที่ผู้ตรวจบันทึก
router.post(
    '/applications/:id/certification-corrections',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    requireRole(ROLE_GROUPS.CERT_DECIDERS),
    async (req, res) => {
        try {
            const data = await certificationDecisions.requestCertificationCorrection({
                applicationRef: String(req.params.id || '').trim(),
                actor: req.user,
                findingIndexes: req.body?.findingIndexes,
                note: req.body?.note,
            });
            return res.json({ success: true, data });
        } catch (error) {
            return sendDecisionError(res, error, 'ระบบไม่สามารถบันทึกการส่งกลับให้แก้ไขได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
        }
    },
);

// ส่งกลับให้ผู้ตรวจทบทวน — การตัดสินของผู้อนุมัติ (CERT_DECIDERS) เท่านั้น · ผู้ตรวจที่ย้อนผลของตัวเอง
// ใช้ประตูเปลี่ยนสถานะของผู้ตรวจ และไม่บันทึกเป็น certificationDecision
router.post(
    '/applications/:id/reject-to-auditor',
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    requireRole(ROLE_GROUPS.CERT_DECIDERS),
    async (req, res) => {
        try {
            const idOrNumber = String(req.params.id || '').trim();
            if (!idOrNumber) {
                return res.status(400).json({ success: false, error: 'Application id is required' });
            }

            const comment = String(req.body?.comment || '').trim();
            if (!comment) {
                return res.status(400).json({ success: false, error: 'Rejection reason (comment) is required' });
            }

            // Wave A Phase 29: gate auditor reject-to-auditor by visibility.
            const application = await applicationService.findApplicationForFinalApproval({
                where: withVisibility(
                    { OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }], isDeleted: false },
                    req.user,
                ),
            });
            if (!application) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }
            if (application.status !== 'AUDIT_PASSED') {
                return res.status(422).json({ success: false, error: `Cannot reject — status is "${application.status}", expected "AUDIT_PASSED"` });
            }

            const transition = workflowTransitionService.buildTransitionUpdate({
                application,
                toState: 'CAR_REVIEWING',
                actorId: req.user.id,
                actorRole: req.user.canonicalRole || req.user.role,
                comment,
                reasonCode: 'AUDITOR_REJECTED',
            });

            // Sending an AUDIT_PASSED file back to CAR review also voids any
            // certificate the file holds (normally none: issuance waits for the
            // approver's decision, but a renewal that already held one keeps none live
            // across a reversal). The status revert and the void commit atomically.
            const { status: toStatus, ...transitionExtras } = transition.updateData;
            const updated = await prisma.$transaction(async (tx) => {
                // A refusal or an approval committed since the read above wins: decide on the
                // status read under the row lock (lock order application → order → invoice).
                const locked = await lockApplicationRow(tx, application.id);
                if (locked?.status !== application.status) {
                    throw Object.assign(new Error(lookupErrorCode('APPLICATION_STATE_CHANGED').messageTh), {
                        code: 'APPLICATION_STATE_CHANGED', status: 409,
                    });
                }
                const written = await writeApplicationStatus({
                    prisma: tx,
                    applicationId: application.id,
                    fromStatus: application.status,
                    toStatus,
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role,
                    reason: 'AUDITOR_REJECTED',
                    additionalData: {
                        ...transitionExtras,
                        formData: {
                            ...transitionExtras.formData,
                            certificationDecision: certificationDecisions.decisionRecord(certificationDecisions.OUTCOMES.RETURNED, req.user, { comment }),
                        },
                    },
                    onAudit: statusTransitionAuditHook({ tx, metadata: { reasonCode: 'AUDITOR_REJECTED' } }),
                });
                const row = {
                    id: written.id, applicationNumber: written.applicationNumber,
                    status: written.status, updatedAt: written.updatedAt,
                };
                await certificateService.revokeCertificateForApplication(application.id, {
                    revokedBy: req.user.id,
                    reason: `Audit pass reversed by auditor: ${comment}`,
                    prisma: tx,
                });
                return row;
            });

            await certificationDecisions.markApproverNoticesRead(application.id);
            await certificationDecisions.tellInspectorOfReturn({
                applicationId: application.id, applicationNumber: application.applicationNumber,
                inspectorId: application.auditorId, reason: comment, returnedAt: updated.updatedAt,
            });
            logger.info(`[auditor] Application ${application.applicationNumber} rejected`, { applicationId: application.id, actorId: req.user.id });
            return res.json({ success: true, data: updated });
        } catch (error) {
            // C2-03 (audit 2026-06-10): buildTransitionUpdate guard rejections are
            // client/state conditions (bad edge / role / missing comment), not server
            // faults — surface them as 422 INVALID_TRANSITION, matching the sibling
            // handler at line ~152. Only genuine faults stay 500.
            const msg = error?.message || '';
            const isTransitionGuard = /cannot transition|Invalid transition|already in workflow state|Only admin can force|Unknown actor role|Invalid workflow state|requires a comment|REQUIRES_COMMENT/i.test(msg);
            logger.error('[provider] auditor reject-to-auditor failed', { message: msg });
            const status = Number(error.status || error.statusCode) || (isTransitionGuard ? 422 : 500);
            return res.status(status).json({
                success: false,
                error: isTransitionGuard || status < 500 ? msg : 'Failed to reject',
                code: error.code || (isTransitionGuard ? 'INVALID_TRANSITION' : undefined),
            });
        }
    },
);

module.exports = router;
