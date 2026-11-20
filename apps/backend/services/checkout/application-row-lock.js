'use strict';

/**
 * The application row lock that every write deciding whether money may land on an application
 * takes FIRST, inside its transaction (security veto 2026-10-07 V1/V2).
 *
 * Lock order, one for the whole money path: application → checkout order → invoice.
 *   - checkout mint and intent swap (stripe-checkout-service), applicant withdrawal
 *     (application-withdraw), the payment-closure sweep (payment-closure-job): this order.
 *   - settlement (checkout-settlement-service) locks the order first and the application last.
 *     It cannot deadlock with the closers: a settling order has a succeeded intent, and a closer,
 *     holding the application, reads its pending orders WITHOUT a lock and gives up before taking
 *     any order row when one of them carries an intent it has not released at the gateway. Every
 *     intent it did release is cancelled and can never settle, and no new intent can be recorded
 *     while it holds the application. It cannot deadlock with mint or swap either: the order mint
 *     creates does not exist yet, and the intent a swap records has not been handed to anyone, so
 *     nothing can have paid it.
 *   - refund (refund-service) locks a PAID invoice then the application; the closers and checkout
 *     touch only unpaid invoices, so they never wait on the same invoice row.
 *
 * @param {object} tx — a Prisma transaction client
 * @param {string} applicationId
 * @returns {Promise<{status: string}|null>} the committed status, read under the lock; null = gone
 */
async function lockApplicationRow(tx, applicationId) {
    const [row] = await tx.$queryRaw`SELECT status, version FROM applications WHERE id = ${applicationId} FOR UPDATE`;
    return row || null;
}

module.exports = { lockApplicationRow };
