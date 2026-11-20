'use strict';

/**
 * Real payment rows for a real-Postgres fixture: for each milestone, a paid invoice
 * and the SETTLED checkout order that carries it, the shape the webhook leaves.
 *
 * The status writer refuses every state after a milestone that is not paid
 * (application-status-writer.js, MILESTONES_PAID_BEFORE_STATE), so a fixture that
 * seats an application past a payment has to seat the payment too.
 *
 * Rows are tagged by `applicationId`; a suite that wipes invoices and checkout
 * orders by application id removes them.
 *
 * @param {import('@prisma/client').PrismaClient} raw
 * @param {{ id: string, healthId: string, organizationId: string }} application
 * @param {string[]} [milestones]
 */
async function settleMilestones(raw, application, milestones = ['M1', 'M2']) {
    for (const milestone of milestones) {
        const tag = `${application.id.slice(0, 8)}-${milestone}-${Math.random().toString(36).slice(2, 8)}`;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-FX-${tag}`, applicationId: application.id, healthId: application.healthId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(),
                organizationId: application.organizationId, metadata: {},
            },
        });
        await raw.checkoutOrder.create({
            data: {
                applicationId: application.id, milestone, platformFeeNet: 0, platformFeeVat: 0,
                platformFeeGross: 0, totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(),
                invoiceId: invoice.id, organizationId: application.organizationId,
            },
        });
    }
}

module.exports = { settleMilestones };
