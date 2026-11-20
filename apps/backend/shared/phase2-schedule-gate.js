'use strict';

/**
 * Round-2 (field-inspection fee) payment predicate for on-site audit scheduling.
 *
 * Business rule: a field inspection may not be queued until the applicant's
 * round-2 fee is paid through the gateway and its receipt is issued. The state
 * AUDIT_FEE_PAID is written by the webhook settlement; the settlement read is
 * the second, independent layer, and it is the one that sees a refund or a
 * hold (operator 2026-10-06: a fully refunded milestone is unpaid everywhere).
 *
 * One definition, shared by every door that books a visit (the calendar and the
 * scheduling queue), so a refunded milestone is unpaid on all of them alike.
 */

const invoiceService = require('../services/invoice-service');
const { computePhaseSettlement } = require('../services/phase-billing-service');

async function isPhase2PaymentConfirmed(application) {
    if (!application?.id) {
        return false;
    }

    const invoices = await invoiceService.listSettlementsForApplication(application.id);
    return computePhaseSettlement(invoices, 'PHASE_2').phaseReceiptIssued;
}

module.exports = {
    isPhase2PaymentConfirmed,
};
