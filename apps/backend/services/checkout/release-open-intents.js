'use strict';

/**
 * Before an application is closed at a payment gate (applicant withdrawal, payment-abandoned
 * sweep): ask the gateway about every intent of its unpaid orders and cancel the open ones
 * FIRST. Closing first and cancelling after commit let money land on a CANCELLED/EXPIRED
 * application whenever the intent was already succeeded or processing (security review
 * 2026-10-07 M2/M3).
 *
 * Blocks (the caller must not close) when any intent is succeeded / processing /
 * requires_capture, when a cancel is refused, or when the gateway cannot be asked: a late
 * close is recoverable, money on a closed application is not.
 *
 * @module services/checkout/release-open-intents
 */

const { getPaymentAdapter } = require('../payment/payment-adapter');

const MONEY_MOVING = new Set(['succeeded', 'processing', 'requires_capture']);

/**
 * @param {string[]} intentIds
 * @returns {Promise<{ released: true } | { released: false, intentId: string, cause: 'IN_FLIGHT'|'CANCEL_REFUSED'|'GATEWAY_UNAVAILABLE', message?: string }>}
 */
async function releaseOpenIntents(intentIds) {
    const adapter = getPaymentAdapter();
    for (const intentId of new Set(intentIds.filter(Boolean))) {
        let intent;
        try {
            intent = await adapter.getPaymentIntent(intentId);
        } catch (err) {
            return { released: false, intentId, cause: 'GATEWAY_UNAVAILABLE', message: err?.message };
        }
        if (!intent || intent.status === 'canceled') { continue; }
        if (MONEY_MOVING.has(intent.status)) { return { released: false, intentId, cause: 'IN_FLIGHT' }; }
        try {
            await adapter.cancelPaymentIntent(intentId);
        } catch (err) {
            return { released: false, intentId, cause: 'CANCEL_REFUSED', message: err?.message };
        }
    }
    return { released: true };
}

module.exports = { releaseOpenIntents };
