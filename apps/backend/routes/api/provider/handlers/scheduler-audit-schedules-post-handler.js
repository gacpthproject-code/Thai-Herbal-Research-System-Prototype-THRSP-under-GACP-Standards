const {
    authenticateProvider,
    logger,
    PERMISSIONS,
    requireCanonicalPermission,
    toInt,
    obj,
    arr,
    dt,
    prisma,
    CANONICAL_ROLES,
    workflowTransitionService,
    getRequestIp,
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
    isRetiredInspectionMode,
    isReinspectionRequested,
    isValidHttpUrl,
    resolveAuditSchedule,
    getApplicantName,
    isPhase2PaymentConfirmed,
    isWorkingDay,
} = require('./scheduler-handler-deps');
const { buildWorkflowEvent } = require('../../../../shared/workflow-event-builder');
const { writeApplicationStatus } = require('../../../../services/application-status-writer');
// One Thai builder for the farmer's and the inspector's notice, shared with the queue door
// (audit-scheduling-service.assignAuditor) so the two cannot word it differently again.
const { notifyAuditScheduled } = require('../../../../services/audit/audit-schedule-notices');
// One place decides whether a confirmed audit arms the evidence chain — the other
// scheduling door calls the same function, so the rule cannot drift between them.
const { armOnsiteEvidence, rebindEvidenceAuditor } = require('../../../../services/audit/arm-onsite-evidence');
// The per-inspector-per-day cap and the overlap rule live in the queue door's service. The
// calendar used to check overlap only, so the cap held on one door and not the other.
const schedulingService = require('../../../../services/audit-scheduling-service');
const schedulingInternals = schedulingService._internals;
const { lookup: lookupErrorCode } = require('../../../../shared/error-codes');
// A reviewer may not also inspect the same application (operator ruling 2026-10-05).
const { assertInspectorIsNotReviewer, answerSeparation } = require('../../../../shared/reviewer-inspector-separation');
// Batch 10 — Prisma bypass cleanup. Scheduler-side application/user reads
// route through application-service + provider-user-service so the projection
// and the ACTIVE/non-deleted filters live at the service boundary. `prisma`
// stays as the transaction handle for writeApplicationStatus only.
const applicationService = require('../../../../services/application-service');
const { assertAssignableStaff } = require('../../../../services/assignable-staff-service');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');
// Closing-review NEW-2 (2026-05-15): mask the raw 13-digit identifier before
// writing it into the hash-chained audit row (PDPA Section 27).
const { maskThaiId } = require('../../../../utils/field-encryption');
// A moved visit moves the field inspector's task clock (the dispatcher-defaults memo).
const { moveVisitClock } = require('../../../../services/work-activity-service');
// The inspector's workload cap and the inspection due date (order 56(1) 1.3, 2.1).
const {
    assertWithinCapOrStated, inspectionDueFor, assertVisitInTimeOrStated, recordStatedReasons, statedReasonsRecord, answerAssignmentRefusal,
} = require('../../../../services/assignment-policy');

/** Online inspection is removed (order 27); a caller still asking for it is told so, nothing is written. */
function answerRetiredInspectionMode(res) {
    return res.status(400).json({
        success: false,
        code: 'ONLINE_INSPECTION_RETIRED',
        error: lookupErrorCode('ONLINE_INSPECTION_RETIRED').messageTh,
    });
}

/**
 * Answer a coded refusal of the booking with its own status (the slot: AUDITOR_BUSY /
 * AUDITOR_OVER_CAP / AUDITOR_SLOT_CONFLICT; the status writer: REINSPECTION_NOT_REQUESTED,
 * APPLICATION_STATE_CHANGED, ...); a write that lost to a concurrent one reads as
 * APPLICATION_STATE_CHANGED. True when it answered.
 */
function answerRefusal(res, error) {
    const lostRace = error && error.code === 'CONCURRENCY_CONFLICT';
    const row = lookupErrorCode(lostRace ? 'APPLICATION_STATE_CHANGED' : error && error.code);
    const status = lostRace ? row && row.httpStatus : error && error.statusCode;
    if (!row || !(status >= 400 && status < 500)) { return false; }
    res.status(status).json({
        success: false,
        code: row.code,
        error: row.messageTh,
        messageTh: row.messageTh,
        data: error.data,
    });
    return true;
}

/** The application changed after this booking read it (security review 2026-10-09 F4). */
function stateChanged() {
    const row = lookupErrorCode('APPLICATION_STATE_CHANGED');
    return Object.assign(new Error(row.messageTh), { code: row.code, statusCode: row.httpStatus });
}

const schedulerAuditSchedulesPost = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_SCHEDULE),
    async (req, res) => {
        try {
            const applicationIdInput = String(req.body?.applicationId || '').trim();
            const auditorId = String(req.body?.auditorId || '').trim();
            const scheduledDate = dt(req.body?.scheduledDate);
            // Every inspection is on site (order 27): there is no mode to choose any more.
            const inspectionMode = 'ONSITE';
            const mapLink = req.body?.mapLink || null;
            const location = req.body?.location || null;
            const notes = req.body?.notes || null;
            const estimatedDuration = toInt(req.body?.estimatedDuration, 120, 15, 600);

            if (isRetiredInspectionMode(req.body?.inspectionMode || req.body?.auditMode) || req.body?.meetingLink || req.body?.meetingUrl) {
                return answerRetiredInspectionMode(res);
            }
            if (!applicationIdInput || !auditorId || !scheduledDate) {
                return res.status(400).json({ success: false, error: 'applicationId, auditorId, scheduledDate are required' });
            }
            if (scheduledDate.getTime() <= Date.now()) {
                return res.status(400).json({ success: false, error: 'scheduledDate must be in the future' });
            }
            if (!isWorkingDay(scheduledDate)) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot schedule on weekends or Thai public holidays (ไม่สามารถนัดหมายในวันหยุดราชการหรือวันเสาร์-อาทิตย์ได้)',
                });
            }
            if (!mapLink && !location) {
                return res.status(400).json({ success: false, error: 'mapLink or location is required for ONSITE mode' });
            }
            if (mapLink && !isValidHttpUrl(mapLink)) {
                return res.status(400).json({ success: false, error: 'mapLink must be a valid URL' });
            }

            // Inside the caller's organization (order 17): another organization's
            // filing answers exactly like one that does not exist.
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const app = await applicationService.findFirstWithWhere({
                where: {
                    OR: [{ id: applicationIdInput }, { applicationNumber: applicationIdInput }],
                    isDeleted: false,
                    ...organizationWhere,
                },
                select: {
                    id: true,
                    applicationNumber: true,
                    healthId: true,
                    status: true,
                    auditorId: true,
                    reviewerId: true,
                    scheduledDate: true,
                    formData: true,
                    workflowHistory: true,
                    version: true,
                    // Needed by armOnsiteEvidence below: AuditChecklist.organizationId is
                    // required, and this projection did not carry it.
                    organizationId: true,
                },
            });
            if (!app) { return res.status(404).json({ success: false, error: 'Application not found' }); }

            // One door books a first visit (AUDIT_FEE_PAID), moves one already booked
            // (AUDIT_CONFIRMED), and books the second visit the field inspector asked for after
            // reviewing the corrective evidence of a major finding (CAR_REVIEWING, order 27).
            const currentState = workflowTransitionService.resolveStateFromApplication(app);
            const isReinspection = currentState === 'CAR_REVIEWING' && isReinspectionRequested(app);
            if (currentState !== 'AUDIT_FEE_PAID' && currentState !== 'AUDIT_CONFIRMED' && !isReinspection) {
                return res.status(400).json({
                    success: false,
                    code: currentState === 'CAR_REVIEWING' ? 'REINSPECTION_NOT_REQUESTED' : undefined,
                    error: currentState === 'CAR_REVIEWING'
                        ? lookupErrorCode('REINSPECTION_NOT_REQUESTED').messageTh
                        : `Application must be in AUDIT_FEE_PAID (to schedule) or AUDIT_CONFIRMED (to reschedule) (current: ${currentState})`,
                });
            }
            const isReschedule = currentState === 'AUDIT_CONFIRMED';
            // The second visit is the same inspector's (order 29: the inspector who found the
            // defect judges its correction); swapping the inspector is the reassign page's job.
            if (isReinspection && auditorId !== app.auditorId) {
                return res.status(409).json({
                    success: false,
                    code: 'REINSPECTION_SAME_INSPECTOR',
                    error: lookupErrorCode('REINSPECTION_SAME_INSPECTOR').messageTh,
                });
            }

            const paymentConfirmed = await isPhase2PaymentConfirmed(app);
            if (!paymentConfirmed) {
                return res.status(400).json({
                    success: false,
                    error: 'Phase 2 payment must be confirmed before scheduling',
                });
            }

            // The inspector: an active field inspector of the application's own organization.
            let auditor;
            try {
                auditor = await assertAssignableStaff({
                    userId: auditorId, roles: [CANONICAL_ROLES.FIELD_INSPECTOR], organizationId: app.organizationId,
                });
            } catch (staffError) {
                if (staffError.code !== 'STAFF_NOT_ASSIGNABLE') { throw staffError; }
                return res.status(staffError.statusCode).json({ success: false, code: staffError.code, error: staffError.messageTh });
            }
            try {
                assertInspectorIsNotReviewer({ reviewerId: app.reviewerId, auditorId });
            } catch (sodError) {
                if (answerSeparation(res, sodError)) { return undefined; }
                throw sodError;
            }

            // After the date the company must inspect by, the booking goes ahead only with the
            // dispatcher's stated reason (order 56(1) 1.3); the inspector's workload cap is checked in
            // the booking's transaction below (2.1).
            let lateVisit;
            try {
                lateVisit = assertVisitInTimeOrStated({
                    inspectBy: await inspectionDueFor(prisma, app.id), visitAt: scheduledDate, lateVisit: req.body?.lateVisit,
                });
            } catch (policyError) {
                if (answerAssignmentRefusal(res, policyError)) { return undefined; }
                throw policyError;
            }

            // Same daily cap and overlap rule as the queue door (visits per inspector per Bangkok day).
            try {
                await schedulingInternals._assertSlotAvailable(prisma, {
                    auditorId,
                    scheduledAt: scheduledDate,
                    excludeApplicationId: app.id,
                    durationMinutes: estimatedDuration,
                });
            } catch (slotError) {
                if (answerRefusal(res, slotError)) { return undefined; }
                throw slotError;
            }

            const ts = new Date().toISOString();
            const previousSchedule = resolveAuditSchedule(app);
            let scheduleAction = (isReschedule || previousSchedule.scheduledDate) ? 'AUDIT_RESCHEDULED' : 'AUDIT_SCHEDULED';
            if (isReinspection) { scheduleAction = 'REINSPECTION_SCHEDULED'; }

            const auditScheduleFields = {
                scheduledDate: scheduledDate.toISOString(),
                auditorId,
                // The queue door stores the inspector's name beside the id; this door did not,
                // so a reader without the user join (the farmer's detail page fallback) had none.
                auditorName: getApplicantName(auditor) || null,
                mapLink: mapLink || null,
                location: location || null,
                notes,
                estimatedDuration,
                scheduledBy: req.user.id,
                scheduledAt: ts,
                ...(isReschedule ? { rescheduledAt: ts, rescheduledBy: req.user.id } : {}),
            };
            const scheduleEvent = buildWorkflowEvent({
                action: scheduleAction,
                fromState: currentState,
                toState: 'AUDIT_CONFIRMED',
                actorId: req.user.id,
                actorRole: req.user.canonicalRole || req.user.role || null,
                metadata: {
                    auditorId,
                    mapLink: mapLink || null,
                    location: location || null,
                    previousScheduledDate: previousSchedule.scheduledDateISO,
                    previousAuditorId: app.auditorId || null,
                },
            });
            /** The booking laid over the formData as committed, so a concurrent record is kept. */
            const scheduledFormDataOver = (stored, statedReasons) => ({
                ...stored,
                workflowState: 'AUDIT_CONFIRMED',
                workflowStateUpdatedAt: ts,
                auditSchedule: { ...obj(stored.auditSchedule), ...auditScheduleFields, statedReasons },
                ...(isReinspection
                    ? { reinspection: { ...obj(stored.reinspection), status: 'BOOKED', scheduledAt: ts, scheduledBy: req.user.id, visitDate: scheduledDate.toISOString() } }
                    : {}),
            });
            /**
             * The row as committed, locked, and still the one this booking was made on (security review
             * 2026-10-09 F4): an inspector's decision or another dispatcher's booking that landed after
             * the read above refuses this one instead of being written over.
             */
            const lockedAsRead = async (tx, statedReasons) => {
                const [stored] = await tx.$queryRaw`SELECT status, version, "formData", "workflowHistory" FROM applications WHERE id = ${app.id} FOR UPDATE`;
                if (!stored || stored.status !== app.status || stored.version !== app.version) { throw stateChanged(); }
                return { formData: scheduledFormDataOver(obj(stored.formData), statedReasons), workflowHistory: [...arr(stored.workflowHistory), scheduleEvent] };
            };

            // Availability check + write in ONE Serializable transaction (bounded retry of serialization
            // failures, shared with the queue door): the probe above is only a fast-fail, two dispatchers
            // racing for the last slot are decided here.
            const slot = {
                auditorId,
                scheduledAt: scheduledDate,
                excludeApplicationId: app.id,
                durationMinutes: estimatedDuration,
            };
            let evidence;
            try {
                evidence = await schedulingService.runSlotBooking(prisma, slot, async (tx) => {
                    // Past the inspector's workload cap the booking goes ahead only with the
                    // dispatcher's confirmation and reason (order 56(1) 2.1).
                    const overCap = await assertWithinCapOrStated(tx, {
                        role: CANONICAL_ROLES.FIELD_INSPECTOR, officerId: auditorId, excludeApplicationId: app.id,
                        visitAt: scheduledDate, overCap: req.body?.overCap,
                    });
                    const booked = await lockedAsRead(tx, statedReasonsRecord({ overCap, lateVisit }));
                    if (isReschedule) {
                        // AUDIT_CONFIRMED -> AUDIT_CONFIRMED is not an edge the status writer
                        // allows, and nothing about the status changes: the date (and maybe the
                        // inspector) does. The row, the evidence row and the inspector's name on it
                        // move in ONE transaction so the application never says "inspector B" while
                        // the evidence row still says "inspector A" (B would be locked out of the
                        // field app with AUDIT_AUDITOR_MISMATCH).
                        await tx.application.update({
                            where: { id: app.id },
                            data: { auditorId, scheduledDate, updatedBy: req.user.id, version: { increment: 1 }, ...booked },
                        });
                        await moveVisitClock({ prisma: tx, applicationId: app.id, visitAt: scheduledDate });
                    } else {
                        await writeApplicationStatus({
                            prisma: tx,
                            applicationId: app.id,
                            fromStatus: app.status,
                            toStatus: 'AUDIT_CONFIRMED',
                            actorId: req.user.id,
                            actorRole: req.user.canonicalRole || req.user.role || null,
                            reason: scheduleAction,
                            expectedVersion: app.version,
                            additionalData: { auditorId, scheduledDate, updatedBy: req.user.id, ...booked },
                        });
                    }
                    // Arm the evidence chain: the onsite evidence gate counts photos and checklist
                    // items keyed to an AuditChecklist row, so a booking without it could be carried
                    // out in full and still never issue a certificate. Shared with the
                    // /api/audit/scheduling/assign door rather than duplicated.
                    const armed = await armOnsiteEvidence(tx, {
                        applicationId: app.id,
                        auditorId,
                        organizationId: app.organizationId,
                        createdBy: req.user.id,
                        inspectionMode,
                    });
                    if (isReschedule) {
                        await rebindEvidenceAuditor(tx, { applicationId: app.id, auditorId, actorId: req.user.id });
                    }
                    await recordStatedReasons(tx, {
                        actor: req.user, application: app, officerId: auditorId, role: CANONICAL_ROLES.FIELD_INSPECTOR,
                        overCap, lateVisit, visitAt: scheduledDate,
                    });
                    return armed;
                });
            } catch (bookingError) {
                if (answerAssignmentRefusal(res, bookingError) || answerRefusal(res, bookingError)) { return undefined; }
                throw bookingError;
            }

            // The booking as written. No formData: the calendar reads only the evidence answer below,
            // and the filing carries national IDs that leave the server masked or not at all (order 10).
            const updated = await applicationService.getById(app.id, {
                select: {
                    id: true,
                    applicationNumber: true,
                    status: true,
                    auditorId: true,
                    scheduledDate: true,
                },
            });

            // Farmer and inspector, same Thai text and Bangkok date as the queue door.
            await notifyAuditScheduled({
                auditorId,
                applicationId: app.id,
                applicationNumber: app.applicationNumber,
                scheduledAt: scheduledDate,
                auditorName: getApplicantName(auditor),
                location,
                mapLink,
                rescheduled: scheduleAction === 'AUDIT_RESCHEDULED',
                reinspection: isReinspection,
                previousScheduledAt: previousSchedule.scheduledDate,
            });

            try {
                await auditLogger.log({
                    category: AuditCategory.APPLICATION,
                    action: scheduleAction,
                    severity: scheduleAction === 'AUDIT_RESCHEDULED' ? AuditSeverity.WARNING : AuditSeverity.INFO,
                    actorId: req.user.id || 'SYSTEM',
                    actorRole: req.user.canonicalRole || req.user.role || 'UNKNOWN',
                    actorType: 'PROVIDER',
                    resourceType: ResourceType.APPLICATION,
                    resourceId: app.id,
                    ipAddress: getRequestIp(req),
                    userAgent: req.get('user-agent'),
                    metadata: {
                        applicationNumber: app.applicationNumber,
                        scheduledDate: scheduledDate.toISOString(),
                        mapLink: mapLink || null,
                        location: location || null,
                        estimatedDuration,
                        auditorId,
                        auditorName: getApplicantName(auditor),
                        previousScheduledDate: previousSchedule.scheduledDateISO,
                        previousAuditorId: app.auditorId || null,
                        actorIdentity: maskThaiId(req.user.providerId) || maskThaiId(req.user.healthId) || null,
                    },
                });
            } catch (auditError) {
                logger.warn('[provider] schedule audit log failed:', { message: auditError.message, applicationId: app.id });
            }

            // A third-party calendar export used to run here (removed 2026-07-25
            // PDPA audit). It sent the applicant's name, the farm name,
            // the farm's map link/address, both parties' e-mail addresses and the
            // inspection date out of the country, and asked the vendor to e-mail the
            // citizen and the DTAM officer directly. It has been removed for good.
            //
            // Nothing is lost: the schedule itself is the `formData.auditSchedule`
            // record written to Postgres by writeApplicationStatus() above, the
            // hash-chained audit row is written above, and both parties are told
            // in-app (createNotification above) with e-mail/SMS fan-out handled by
            // the notification service. No third party is involved in inspection
            // scheduling — please do not re-add one. If calendar interop is ever
            // requested, attach a locally generated .ics to the existing
            // notification e-mail instead.

            return res.status(201).json({
                success: true,
                data: {
                    ...updated,
                    workflowState: 'AUDIT_CONFIRMED',
                    evidenceArmed: evidence.armed,
                    canLeadToCertificate: evidence.canLeadToCertificate,
                    evidenceNote: evidence.reason,
                    mapLink: mapLink || null,
                    location: location || null,
                    estimatedDuration,
                    // Retained as constant nulls so the response shape is unchanged
                    // for existing clients — they only ever saw nulls here, because
                    // the export was never configured in any environment.
                    calendarEventId: null,
                    calendarHtmlLink: null,
                },
                message: scheduleAction === 'AUDIT_RESCHEDULED'
                    ? 'Audit rescheduled successfully'
                    : 'Audit scheduled successfully',
            });
        } catch (error) {
            logger.error('[provider] create audit schedule failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to schedule audit',
            });
        }
    },
];

module.exports = {
    schedulerAuditSchedulesPost,
};
