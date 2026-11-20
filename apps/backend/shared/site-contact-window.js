'use strict';

/**
 * Until when the applicant may change the person on site (operator order 65(2), 2026-10-09): after
 * filing and before the inspection, on a booked visit only while its date is still ahead, and while
 * a defect found on site is being corrected (CAR_PENDING, CAR_REVIEWING), because the second visit
 * the inspector may ask for is booked from there (orders 27 and 56(2a)) and the evidence door asks
 * for the contact. One rule for the door that writes the change and the payload that tells the
 * application page.
 */

const EDITABLE_BEFORE_THE_VISIT = Object.freeze([
    'SUBMITTED', 'PENDING_DOC_FEE', 'DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW', 'REVISION_REQUESTED',
    'DOC_APPROVED', 'PENDING_AUDIT_FEE', 'AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'CAR_PENDING', 'CAR_REVIEWING',
]);

/** @param {{ status?: string, scheduledDate?: Date|string|null }} application */
function siteContactEditable(application, now = new Date()) {
    const status = String(application?.status || '').toUpperCase();
    if (!EDITABLE_BEFORE_THE_VISIT.includes(status)) { return false; }
    if (status !== 'AUDIT_CONFIRMED' || !application.scheduledDate) { return true; }
    return new Date(application.scheduledDate).getTime() > now.getTime();
}

module.exports = { EDITABLE_BEFORE_THE_VISIT, siteContactEditable };
