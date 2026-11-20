const {
    prisma,
    authenticateProvider,
    requireRole,
    logger,
    PERMISSIONS,
    normalizeRole,
    PROVIDERRoles,
    requireCanonicalPermission,
    safeInt, safeObject, safeArray, safeDate,
    toInt, obj, arr, dt,
    getApplicantName,
    resolveUserIdFromHealthId,
} = require('./shared');
const {
    CANONICAL_ROLES,
} = require('../../../../shared/canonical-rbac');
const workflowTransitionService = require('../../../../services/workflow-transition-service');
// Batch 14 (2026-05-16): the invoice + application reads previously issued by
// this deps file go through the service layer. The prisma symbol is retained
// only for downstream handlers that need a transaction handle for
// writeApplicationStatus or compute-here legacy paths.
const invoiceService = require('../../../../services/invoice-service');
const applicationService = require('../../../../services/application-service');
// Wave-3 P1-H: read-only SLA overdue/breached count for the scheduler's own
// work-activity queue, surfaced as a dashboard tile.
const workActivityService = require('../../../../services/work-activity-service');
const { getRequestIp } = require('../../../../utils/client-ip');
const {
    computePhaseSettlement,
} = require('../../../../services/phase-billing-service');
const {
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
} = require('../../../../middleware/audit-logger');
const {
    isRetiredInspectionMode,
    isReinspectionRequested,
    isReadyToSchedule,
    isValidHttpUrl,
    resolveAuditSchedule,
    buildSchedulerQueueItem,
} = require('./queue-utils');
const {
    isWorkingDay,
    countWorkingDaysBetween,
} = require('../../../../utils/working-days');

// Re-exported from shared/phase2-schedule-gate rather than defined here: the predicate that
// decides whether a field inspection may be queued has one definition for every booking door.
const { isPhase2PaymentConfirmed } = require('../../../../shared/phase2-schedule-gate');

/**
 * Second-milestone payment state per application, from the same settlement read every dispatcher
 * queue uses (one truth for "paid", order 27 one queue).
 * @returns {Promise<Map<string, { phase2Paid: boolean, receiptIssued: boolean }>>}
 */
async function buildPaymentMap(invoiceServiceRef, applications) {
    const appIds = applications.map((application) => application.id);
    const invoices = appIds.length === 0 ? [] : await invoiceServiceRef.listSettlementsByApplicationIds(appIds);
    const paymentMap = new Map();
    for (const appId of appIds) {
        const settlement = computePhaseSettlement(invoices.filter((invoice) => invoice.applicationId === appId), 'PHASE_2');
        paymentMap.set(appId, { phase2Paid: settlement.phasePaid, receiptIssued: settlement.phaseReceiptIssued });
    }
    return paymentMap;
}

module.exports = {
    buildPaymentMap,
    prisma,
    authenticateProvider,
    requireRole,
    logger,
    PERMISSIONS,
    normalizeRole,
    PROVIDERRoles,
    requireCanonicalPermission,
    safeInt, safeObject, safeArray, safeDate,
    toInt, obj, arr, dt,
    getApplicantName,
    resolveUserIdFromHealthId,
    CANONICAL_ROLES,
    workflowTransitionService,
    invoiceService,
    applicationService,
    workActivityService,
    getRequestIp,
    computePhaseSettlement,
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
    isRetiredInspectionMode,
    isReinspectionRequested,
    isReadyToSchedule,
    isValidHttpUrl,
    resolveAuditSchedule,
    buildSchedulerQueueItem,
    isPhase2PaymentConfirmed,
    isWorkingDay,
    countWorkingDaysBetween,
};
