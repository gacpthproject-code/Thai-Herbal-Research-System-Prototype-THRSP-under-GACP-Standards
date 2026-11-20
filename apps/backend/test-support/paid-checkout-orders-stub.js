'use strict';

/**
 * A `checkoutOrder` delegate for prisma stubs handed to the real status writer.
 *
 * The writer refuses every state after a payment milestone unless that milestone is
 * paid (application-status-writer.js, MILESTONES_PAID_BEFORE_STATE). A stub that is
 * not about payment spreads this in so its transitions stand on paid milestones:
 *
 *   const prisma = { application: { ... }, ...paidCheckoutOrders() };
 *
 * @param {string[]} [paid] the milestones with a SETTLED, paid, unrefunded order
 */
function paidCheckoutOrders(paid = ['M1', 'M2']) {
    const matching = (where) => paid.filter((milestone) => (typeof where.milestone === 'string'
        ? where.milestone === milestone
        : where.milestone.in.includes(milestone)));
    return {
        checkoutOrder: {
            // Plain functions, not jest.fn: a suite's resetAllMocks must not erase the payment.
            findMany: async ({ where }) => matching(where)
                .map((milestone) => ({ milestone, invoice: { status: 'PAID', metadata: {} } })),
            // The inspection due date's read (services/assignment-policy.js): these payments carry
            // no payment-terms version, so they set no date.
            findFirst: async ({ where }) => (matching(where).length > 0 ? { settledAt: null, paymentTermsVersion: null } : null),
        },
    };
}

module.exports = { paidCheckoutOrders };
