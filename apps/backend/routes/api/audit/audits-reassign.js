/**
 * Audit Re-assignment Routes
 * Allows schedulers to reassign audits to different auditors
 */

const { assignedOfficerName } = require('../../../shared/assigned-officer-name');
const express = require('express');
const { safeErrorMessage } = require('../../../shared/api-response');
const router = express.Router();
const { authenticateProvider } = require('../../../middleware/auth-middleware');
const { requireRole } = require('../../../middleware/role-middleware');
// `prisma` is retained ONLY as a transaction handle for tracked-writer,
// which requires the client by contract (same exception called out in
// applications/applications-car.js). All direct prisma.X.find/update
// calls in this file have been replaced with service-layer methods as
// part of the Batch 11 audit-cluster cleanup.
const { prisma } = require('../../../services/prisma-database');
const { sendNotification, NotifyType } = require('../../../services/notification-service');
const { notifyApplicationParties } = require('../../../services/notification/application-parties');
const { CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
const { trackedUpdate } = require('../../../services/tracked-writer');
const {
  auditLogger,
  AuditCategory,
  AuditSeverity,
  ResourceType,
} = require('../../../middleware/audit-logger');
const applicationService = require('../../../services/application-service');
const { assertAssignableStaff } = require('../../../services/assignable-staff-service');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const { recordAssignment } = require('../../../services/assignment-ledger-service');
const logger = require('../../../shared/logger');
const { runSlotBooking, assertSlotAvailable } = require('../../../services/audit-scheduling-service');
const { lookup: lookupErrorCode } = require('../../../shared/error-codes');
const { rebindEvidenceAuditor } = require('../../../services/audit/arm-onsite-evidence');
// A reviewer may not also inspect the same application (operator ruling 2026-10-05).
const { assertInspectorIsNotReviewer, answerSeparation } = require('../../../shared/reviewer-inspector-separation');
// The new inspector's workload cap (order 56(1) 2.1) and the reason for a move during a correction (order 60(a)).
const {
  lockOfficerLoad, assertWithinCapOrStated, assertCorrectionReassignReason, recordStatedReasons, statedReasonsRecord, answerAssignmentRefusal, CORRECTION_STATUSES,
} = require('../../../services/assignment-policy');

// Only scheduler and admin roles may reassign audits
const REASSIGN_ROLES = [CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, CANONICAL_ROLES.DISPATCHER];

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** The application changed after this reassignment read it (security re-review 2026-10-09 N3). */
function stateChanged() {
  const row = lookupErrorCode('APPLICATION_STATE_CHANGED');
  return Object.assign(new Error(row.messageTh), { code: row.code, statusCode: row.httpStatus });
}

// Auditor reassignment is only valid once an auditor has been assigned (the
// auditor-workflow states). Mirrors the reviewer-reassign gate and MUST match
// the states `listReassignableAudits` surfaces (application-provider-query-
// methods.js) — otherwise the POST accepts an app the LIST never offered. The
// reviewer mirror had this gate; the auditor route did not, so an auditor could
// be reassigned on a pre-payment app (e.g. PENDING_DOC_FEE) — provider-E2E
// carpet 2026-07-09, MEDIUM.
const REASSIGNABLE_AUDIT_STATES = new Set([
  'AUDIT_CONFIRMED', 'CAR_PENDING', 'CAR_REVIEWING', 'EXPIRED',
]);

// The list feeds the action, so both are the dispatcher's and the DTAM admin's, inside
// their organization (orders 14 and 17). It used to admit every provider role, finance
// and the certificate approver included.
router.get('/reassignable', authenticateProvider, requireRole(REASSIGN_ROLES), async (req, res) => {
  try {
    const organizationWhere = organizationScope(req.user);
    if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
    const applications = await applicationService.listReassignableAudits(organizationWhere);

    const now = new Date();
    const formatted = applications.map(app => {
      // `typeof null === 'object'` — guard null explicitly or formData.* below NPEs.
      const formData = typeof app.formData === 'object' && app.formData ? app.formData : {};
      const workflowState = String(formData.workflowState || app.status || '').toUpperCase();
      const daysOverdue = app.scheduledDate
        ? Math.floor((now - new Date(app.scheduledDate)) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        id: app.id,
        applicationNumber: app.applicationNumber,
        applicantName: app.applicant ? `${app.applicant.firstName} ${app.applicant.lastName}` : 'ไม่ระบุ',
        plantType: formData.plantName || 'ไม่ระบุ',
        status: workflowState || app.status,
        currentAuditorId: app.auditorId,
        currentAuditor: assignedOfficerName({
          officerId: app.auditorId,
          officer: app.auditor,
          storedName: formData.auditorName,
        }),
        scheduledDate: app.scheduledDate,
        daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
      };
    });

    res.json({ success: true, data: { applications: formatted } });
  } catch (error) {
    logger.error('[Reassignable Audits] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch applications' });
  }
});

router.post('/:id/reassign', authenticateProvider, requireRole(REASSIGN_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    const { newAuditorId, reasonCode, reasonText, overCap: overCapStatement } = req.body || {};

    if (!newAuditorId) {
      return res.status(400).json({
        success: false,
        error: 'newAuditorId is required',
      });
    }

    // The application inside the caller's organization, and the new inspector inside
    // the application's (order 17): an unknown organization is refused.
    const organizationWhere = organizationScope(req.user);
    if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
    const application = await applicationService.findAuditApplication({
      where: { id, ...organizationWhere },
      include: {
        applicant: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    // State gate (mirrors scheduler-reviewer-reassign-handler): only reassign an
    // auditor while the app is actually in an auditor-workflow state.
    if (!REASSIGNABLE_AUDIT_STATES.has(application.status)) {
      return res.status(409).json({
        success: false,
        error: `Application is in ${application.status}, expected one of: ${[...REASSIGNABLE_AUDIT_STATES].join(', ')}`,
      });
    }

    // While the applicant corrects an on-site defect, the reason comes from the fixed list (order
    // 60(a)); in the other states it is the dispatcher's own words, as before.
    const correctionReason = assertCorrectionReassignReason({ status: application.status, reasonCode, reasonText });
    // A listed reason reads as its label; OTHER's label is the dispatcher's own words.
    const reason = correctionReason ? correctionReason.label : String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, error: 'reason is required' });
    }

    // The new inspector must be a field inspector: the decision doors accept only the
    // assigned field inspector, so anyone else would dead-end the audit.
    let newAuditor;
    try {
      newAuditor = await assertAssignableStaff({
        userId: newAuditorId, roles: [CANONICAL_ROLES.FIELD_INSPECTOR], organizationId: application.organizationId,
      });
    } catch (staffError) {
      if (staffError.code !== 'STAFF_NOT_ASSIGNABLE') { throw staffError; }
      return res.status(staffError.statusCode).json({ success: false, code: staffError.code, error: staffError.messageTh });
    }

    try {
      assertInspectorIsNotReviewer({ reviewerId: application.reviewerId, auditorId: newAuditorId });
    } catch (sodError) {
      if (answerSeparation(res, sodError)) { return undefined; }
      throw sodError;
    }

    const oldAuditorId = application.auditorId;

    // Wave A Phase 47 (G3 consumer #1) — route the auditor reassignment
    // through tracked-writer.trackedUpdate so the auditorId change is
    // recorded in the audit log via a canonical writer instead of an
    // ad-hoc emission. trackedFields=['auditorId'] scopes the audit
    // entry to the meaningful change; the formData update piggybacks
    // in the same atomic Prisma update without participating in
    // change tracking.
    // One transaction: Application.auditorId AND the live AuditChecklist row move together.
    // Writing only the application left the new inspector locked out of the field app
    // (403 AUDIT_AUDITOR_MISMATCH: onsite.js and audit-onsite-service compare the checklist row).
    // Same Serializable slot rule as the booking doors: the new inspector must be free on the
    // visit date, the one read under the lock below (security re-review 2026-10-09 L6). An
    // application with no visit date yet, or whose visit is already made, has nothing to check.
    await runSlotBooking(prisma, { auditorId: newAuditorId, scheduledAt: null }, async (tx) => {
      // The new inspector's workload first, then the application row: the order every assigning door
      // takes them in (security re-review 2026-10-09 L-B).
      await lockOfficerLoad(tx, newAuditorId);
      // The row as committed, locked, and still the one this reassignment was decided on (N3): an
      // inspector's request for a second visit or another dispatcher's booking that landed after the
      // read above refuses this one instead of being written over.
      const [stored] = await tx.$queryRaw`SELECT status, version, "auditorId", "scheduledDate", "formData" FROM applications WHERE id = ${application.id} FOR UPDATE`;
      if (!stored || stored.status !== application.status || stored.version !== application.version || stored.auditorId !== oldAuditorId) {
        throw stateChanged();
      }
      const storedFormData = asObject(stored.formData);
      // Only a visit still ahead is booked for the new inspector; a visit already made (the
      // corrective-action loop, order 60(a)) is not booked again on its past day.
      const visitAhead = stored.scheduledDate && new Date(stored.scheduledDate).getTime() > Date.now();
      if (visitAhead) {
        await assertSlotAvailable(tx, {
          auditorId: newAuditorId,
          scheduledAt: new Date(stored.scheduledDate),
          excludeApplicationId: application.id,
          durationMinutes: storedFormData.auditSchedule?.estimatedDuration || 120,
        });
      }
      // A visit still ahead counts against the new inspector's cap (order 56(1) 2.1).
      const overCap = await assertWithinCapOrStated(tx, {
        role: CANONICAL_ROLES.FIELD_INSPECTOR, officerId: newAuditorId, excludeApplicationId: application.id,
        visitAt: stored.scheduledDate ? new Date(stored.scheduledDate) : null, overCap: overCapStatement,
      });
      await trackedUpdate({
        prisma: tx,
        model: 'application',
        where: { id: application.id },
        data: {
          auditorId: newAuditorId,
          version: { increment: 1 },
          formData: {
            ...storedFormData,
            auditorName: `${newAuditor.firstName} ${newAuditor.lastName}`,
            _reassignmentHistory: [
              ...(storedFormData._reassignmentHistory || []),
              {
                from: oldAuditorId,
                to: newAuditorId,
                reason,
                ...(correctionReason ? { reasonCode: correctionReason.code, reasonText: correctionReason.text, side: correctionReason.side } : {}),
                statedReasons: statedReasonsRecord({ overCap }),
                reassignedBy: req.user?.id,
                reassignedAt: new Date().toISOString(),
              },
            ],
          },
        },
        trackedFields: ['auditorId'],
        beforeState: { auditorId: oldAuditorId },
        actorId: req.user?.id || null,
        actorRole: req.user?.canonicalRole || req.user?.role || null,
        reason: `AUDITOR_REASSIGNED: ${reason || ''}`.trim(),
        // In the reassignment's own transaction (security re-review 2026-10-09 I4): a reassignment
        // that rolls back leaves no audit row saying it happened.
        onAudit: async ({ recordId, changes, actorId, actorRole, reason: auditReason }) => {
          for (const c of changes) {
            await auditLogger.logWithin({
              category: AuditCategory.APPLICATION,
              severity: AuditSeverity.HIGH,
              action: `application.${c.field}.changed`,
              resourceType: ResourceType.APPLICATION,
              resourceId: recordId,
              actorId,
              actorRole,
              organizationId: application.organizationId,
              metadata: {
                field: c.field,
                before: c.before,
                after: c.after,
                reason: auditReason,
              },
            }, tx);
          }
        },
      });
      await rebindEvidenceAuditor(tx, {
        applicationId: application.id,
        auditorId: newAuditorId,
        actorId: req.user?.id || null,
      });
      await recordStatedReasons(tx, {
        actor: req.user, application, officerId: newAuditorId, role: CANONICAL_ROLES.FIELD_INSPECTOR, overCap,
        correctionReassign: CORRECTION_STATUSES.has(application.status)
          ? { reason: correctionReason, fromOfficerId: oldAuditorId, status: application.status }
          : null,
      });
    });

    await sendNotification(newAuditorId, NotifyType.AUDIT_ASSIGNED, {
      applicationNumber: application.applicationNumber,
      applicationId: application.id,
      applicantName: `${application.applicant.firstName} ${application.applicant.lastName}`,
    });

    if (oldAuditorId) {
      await sendNotification(oldAuditorId, NotifyType.AUDIT_REASSIGNED, {
        applicationNumber: application.applicationNumber,
        reason,
      });
    }

    await notifyApplicationParties(application.id, {
      type: NotifyType.AUDITOR_CHANGED,
      data: {
        applicationNumber: application.applicationNumber,
        newAuditorName: `${newAuditor.firstName} ${newAuditor.lastName}`,
      },
    });

    // Work-distribution ledger (best-effort; never blocks the reassignment):
    // records who moved the audit off `oldAuditorId` onto the new assignee.
    await recordAssignment({
      prisma,
      entityType: 'APPLICATION',
      entityId: application.id,
      action: 'REASSIGN',
      assigneeUserId: newAuditorId,
      assignedByUserId: req.user?.id || null,
      // The WORK role, not the assignee's personal role: this route always
      // reassigns AUDITOR work (it sets application.auditorId), even when the
      // target happens to hold document_reviewer. Logging the work role keeps
      // the fairness `?role=auditor` filter accurate + matches every other emit
      // site (which hardcodes/derives the work role).
      role: 'auditor',
      previousAssigneeUserId: oldAuditorId || null,
      // source = the channel (this scheduler/admin reassign route), NOT the actor
      // role — the actor is already captured in assignedByUserId. 'ADMIN_BATCH' is
      // reserved for the admin bulk-actions endpoint. Mirrors the reviewer-reassign
      // handler so both reassign routes label their channel consistently.
      source: 'SCHEDULER',
      reason,
      organizationId: application.organizationId,
    });

    logger.info(`[Reassign] Application ${application.applicationNumber} reassigned to ${newAuditor.firstName} ${newAuditor.lastName}`);

    res.json({
      success: true,
      message: 'Audit reassigned successfully',
      data: {
        applicationId: application.id,
        newAuditor: {
          id: newAuditor.id,
          name: `${newAuditor.firstName} ${newAuditor.lastName}`,
        },
      },
    });
  } catch (error) {
    if (answerAssignmentRefusal(res, error)) { return undefined; }
    if (error && error.statusCode === 409 && error.code) {
      const row = lookupErrorCode(error.code);
      return res.status(409).json({ success: false, code: error.code, error: error.message, messageTh: row ? row.messageTh : undefined, data: error.data });
    }
    logger.error('[Reassign] Error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

module.exports = router;
