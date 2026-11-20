const {
    authenticateProvider,
    logger,
    PERMISSIONS,
    requireCanonicalPermission,
    obj,
    arr,
    // `prisma` is retained as the transaction handle threaded into
    // `writeApplicationStatus` — same exception pattern as
    // `applications/applications-car.js` (batch 9).
    prisma,
    applicationService,
    workflowTransitionService,
    getRevisionDueAt,
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
    getRequestIp,
} = require('./workflow-handler-deps');
const adminApplicationService = require('../../../../services/admin-application-service');
const { writeApplicationStatus } = require('../../../../services/application-status-writer');
// Closing-review NEW-2 (2026-05-15): mask the raw 13-digit identifier before
// writing it into the hash-chained audit row (PDPA Section 27).
const { maskThaiId } = require('../../../../utils/field-encryption');
const { CANONICAL_ROLES, normalizeRole } = require('../../../../shared/canonical-rbac');
const { lookup: lookupErrorCode } = require('../../../../shared/error-codes');
const { organizationScope, withVisibility, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');

/**
 * The DTAM admin only. requireRole would also let the platform admin through, and the dispatcher's
 * read scope does not reach a file waiting on the applicant (security re-review 2026-10-09 I-A).
 */
function onlyTheDtamAdmin(req, res, next) {
    if (normalizeRole(req.user?.canonicalRole || req.user?.role) === CANONICAL_ROLES.SYSTEM_ADMIN_DTAM) { return next(); }
    const row = lookupErrorCode('FORBIDDEN');
    return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh });
}

/**
 * Expire an overdue document revision by hand: the DTAM admin, inside its organization, on the
 * server's clock (security re-review 2026-10-09 L7, I-A). The hourly sweep
 * (jobs/correction-deadline-sweep.js) cancels an overdue revision on its own (order 28); this door is
 * for the admin when the sweep did not run.
 */
const applicationsRevisionExpirations = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    onlyTheDtamAdmin,
    async (req, res) => {
        try {
            const idOrNumber = String(req.params.id || '').trim();
            if (!idOrNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Application id is required',
                });
            }

            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const application = await applicationService.findApplicationByIdOrNumberWorkflowSlice(idOrNumber, {
                where: withVisibility(organizationWhere || {}, req.user),
            });

            if (!application) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }

            const currentState = workflowTransitionService.resolveStateFromApplication(application);
            if (currentState !== 'REVISION_REQUESTED') {
                return res.status(400).json({
                    success: false,
                    error: `Application is not in REVISION_REQUESTED state (current: ${currentState})`,
                });
            }

            const dueAt = getRevisionDueAt(application.formData);
            if (!dueAt) {
                return res.status(400).json({
                    success: false,
                    error: 'Revision due date is not set',
                });
            }

            const now = new Date();

            if (now <= dueAt) {
                return res.status(400).json({
                    success: false,
                    error: 'Revision deadline is not overdue yet',
                    data: { revisionDueAt: dueAt.toISOString() },
                });
            }

            const ts = now.toISOString();
            const currentFormData = obj(application.formData);
            await writeApplicationStatus({
                prisma,
                applicationId: application.id,
                fromStatus: application.status,
                toStatus: 'EXPIRED',
                actorId: req.user.id,
                actorRole: req.user.canonicalRole || req.user.role || null,
                reason: 'REVISION_DEADLINE_EXPIRED',
                // The filing below is the one read above: a resubmission committed since refuses this.
                expectedVersion: application.version,
                additionalData: {
                    updatedBy: req.user.id,
                    formData: {
                        ...currentFormData,
                        workflowState: 'EXPIRED',
                        workflowStateUpdatedAt: ts,
                        canceledExpiredAt: ts,
                        cancelReason: 'REVISION_OVERDUE',
                    },
                    workflowHistory: [
                        ...arr(application.workflowHistory),
                        {
                            timestamp: ts,
                            action: 'REVISION_DEADLINE_EXPIRED',
                            fromState: 'REVISION_REQUESTED',
                            toState: 'EXPIRED',
                            actorId: req.user.id,
                            actorRole: req.user.canonicalRole || req.user.role || null,
                        },
                    ],
                },
            });
            // Re-fetch with select shape (canonical writer doesn't expose select option).
            const updated = await applicationService.getApplicationExpirationSlice(application.id);

            await adminApplicationService.bulkUpdateRevisionDeadlineStatus({
                applicationId: application.id,
                fromStatuses: ['PENDING', 'EXTENDED'],
                data: { status: 'FAILED', updatedBy: req.user.id },
            });

            try {
                await auditLogger.log({
                    category: AuditCategory.APPLICATION,
                    action: 'REVISION_DEADLINE_EXPIRED',
                    severity: AuditSeverity.WARNING,
                    actorId: req.user.id || 'SYSTEM',
                    actorRole: req.user.canonicalRole || req.user.role || 'UNKNOWN',
                    actorType: 'PROVIDER',
                    resourceType: ResourceType.APPLICATION,
                    resourceId: application.id,
                    ipAddress: getRequestIp(req),
                    userAgent: req.get('user-agent'),
                    metadata: {
                        applicationNumber: application.applicationNumber,
                        previousWorkflowState: currentState,
                        nextWorkflowState: 'EXPIRED',
                        previousStatus: application.status,
                        nextStatus: 'EXPIRED',
                        expiredReason: 'REVISION_OVERDUE',
                        actorIdentity: maskThaiId(req.user.providerId) || maskThaiId(req.user.healthId) || null,
                    },
                });
            } catch (auditError) {
                logger.warn('[provider] expire-overdue-revision audit failed', {
                    message: auditError.message,
                    applicationId: application.id,
                });
            }

            return res.json({
                success: true,
                data: { id: updated.id, applicationNumber: updated.applicationNumber, status: updated.status },
                message: 'Application marked as EXPIRED due to overdue revision',
            });
        } catch (error) {
            logger.error('[provider] expire-overdue-revision failed', { message: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to expire overdue revision',
            });
        }
    },
];

module.exports = {
    applicationsRevisionExpirations,
};
