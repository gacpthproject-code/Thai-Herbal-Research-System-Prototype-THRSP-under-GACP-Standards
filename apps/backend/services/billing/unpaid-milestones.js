'use strict';

/**
 * Every application standing at a payment gate, with the milestone it owes and when that
 * milestone falls due (operator order 32, 2026-10-07). Read by the reminder and the closure
 * sweeps, so the two can never disagree about whose clock runs or when it started.
 *
 * The due date: once the applicant opened a checkout, the live invoice's dueDate (the date the
 * paper prints, stamped at mint); before that, recomputed from the clock start on every sweep, so
 * a special holiday added in between moves it. Reminder text and closure then count to the same
 * date the applicant holds.
 *
 * Cross-tenant on purpose: the sweeps run with no tenant and write each row back in its own.
 *
 * @module services/billing/unpaid-milestones
 */

const { prisma } = require('../prisma-database');
const { withoutTenantScope } = require('../tenant-context');
const { milestoneDueDate } = require('../checkout/checkout-schedule-service');
const { isRenewalFiling } = require('../../shared/instalment-service-names');
const { checkoutInvoiceServiceType } = require('../../shared/checkout-status');

/** The gate an application waits at → the milestone it owes there. */
const GATE_MILESTONE = Object.freeze({ PENDING_DOC_FEE: 'M1', PENDING_AUDIT_FEE: 'M2' });

/**
 * @returns {Promise<Array<{ application: object, milestone: 'M1'|'M2', dueDate: Date|null }>>}
 *   dueDate null = the clock start is not on record (logged by the caller, never guessed).
 */
async function listUnpaidMilestones({ db = prisma } = {}) {
    const applications = await withoutTenantScope(() => db.application.findMany({
        where: { status: { in: Object.keys(GATE_MILESTONE) }, isDeleted: false },
        select: {
            id: true,
            applicationNumber: true,
            status: true,
            organizationId: true,
            formData: true,
            workflowHistory: true,
            quotations: {
                where: { isDeleted: false },
                select: { createdAt: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
            },
            invoices: {
                where: { isDeleted: false, paidAt: null, serviceType: { in: Object.values(GATE_MILESTONE).map(checkoutInvoiceServiceType) } },
                select: { serviceType: true, dueDate: true },
                orderBy: { createdAt: 'desc' },
            },
        },
    }));
    return applications.map((application) => {
        const milestone = GATE_MILESTONE[application.status];
        const invoice = application.invoices.find((i) => i.serviceType === checkoutInvoiceServiceType(milestone) && i.dueDate);
        const dueDate = invoice ? new Date(invoice.dueDate) : milestoneDueDate({
            milestone,
            quotationIssuedAt: application.quotations[0]?.createdAt || null,
            formData: application.formData,
            workflowHistory: application.workflowHistory,
            isRenewal: isRenewalFiling(application),
        });
        return { application, milestone, dueDate };
    });
}

module.exports = { GATE_MILESTONE, listUnpaidMilestones };
