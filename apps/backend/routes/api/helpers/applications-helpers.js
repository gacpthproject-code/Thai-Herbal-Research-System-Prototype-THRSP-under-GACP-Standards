const { normalizeHealthDashboardStage } = require('../../../shared/health-dashboard-stage');
const { isRenewalFiling } = require('../../../shared/instalment-service-names');
const { readFilingSite } = require('../../../services/application-service/application-farm-materialization');
const { correctionDaysLeftOf } = require('../../../services/correction-windows');

function mapHealthApplication(app, { now = new Date() } = {}) {
    const certificateCount = Array.isArray(app?.certificates) ? app.certificates.length : 0;
    const hasCertificate = certificateCount > 0;
    const dashboardStage = normalizeHealthDashboardStage({
        status: app?.status,
        phase1Status: app?.phase1Status,
        phase2Status: app?.phase2Status,
        workflowState: app?.formData?.workflowState || null,
        formData: app?.formData,
        hasCertificate,
        certificateCount,
    }, { hasCertificate, certificateCount });
    const daysLeft = correctionDaysLeftOf(app.status, app.formData, now);

    return {
        id: app.id,
        applicationNumber: app.applicationNumber,
        // The holder the filing is in the name of; the lists name it and filter by it.
        entityId: app.entityId ?? null,
        // The filer; a draft's creator may delete it (holder-access.resolveHolderOwnerOrCreator).
        submitterId: app.submitterId ?? null,
        plantName: app.plantName || (app.formData?.plantName),
        farmName: readFilingSite(app.formData).farmName || null,
        serviceType: app.serviceType,
        status: app.status,
        workflowState: app.formData?.workflowState || null,
        phase1Status: app.phase1Status || null,
        phase2Status: app.phase2Status || null,
        // `estimatedFee` was sent here: a stored column no screen read, and for a renewal
        // not its price (round 4, operator 2026-10-03). Removed rather than kept wrong.
        createdAt: app.createdAt,
        submittedAt: app.formData?.submittedAt || null,
        dashboardStage,
        hasCertificate,
        // fix/fee-line-descriptions round 3: a renewal shares PENDING_AUDIT_FEE with a new
        // filing's second instalment; the list names the charge from this, not the status.
        isRenewal: isRenewalFiling(app),
        revisionDueAt: app.formData?.revisionDueAt || null,
        revisionWorkingDaysLeft: daysLeft.workingDaysLeft,
        carDueAt: app.formData?.carDueAt || app.formData?.car_due_at || null,
        carCalendarDaysLeft: daysLeft.calendarDaysLeft,
    };
}

/**
 * One item of GET /applications/my. It used to add `fees: { phase1, phase2 }` priced as
 * a new filing for EVERY application — a renewal was sent the phase-2 figure. No web or
 * mobile screen reads it (round 4 grep), so it is not sent; the amount a screen shows
 * comes from the application's invoice / quotation / the detail payload.
 */
function mapMyApplication(app) {
    return {
        ...mapHealthApplication(app),
        scheduledDate: app.scheduledDate,
        // Every inspection is on site (order 27): the place, never a meeting link.
        audit: { location: app.formData?.auditLocation },
    };
}

function getHealthScopeOptions(user) {
    const healthId = String(user?.healthId || '').trim();
    if (healthId) {
        return { healthId, strictHealthId: true };
    }
    return { strictHealthId: true };
}

function getActorIdentity(user) {
    const providerId = String(user?.providerId || '').trim();
    if (providerId) {
        return providerId;
    }

    const healthId = String(user?.healthId || '').trim();
    if (healthId) {
        return healthId;
    }

    return String(user?.id || '').trim() || null;
}

module.exports = {
    mapHealthApplication,
    mapMyApplication,
    getHealthScopeOptions,
    getActorIdentity,
};
