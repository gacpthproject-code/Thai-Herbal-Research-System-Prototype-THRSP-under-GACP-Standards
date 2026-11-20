'use strict';

/**
 * Checkout-order lifecycle SSOT — Wave 1 of the single lump-sum checkout
 * engine (docs/payment-refactor/step2-data-model-design.md v2, approved).
 *
 * The canonical 7-step workflow has exactly two payment gates (Milestone 1 at
 * submission, Milestone 2 after document approval). Each gate is a
 * CheckoutOrder whose ONLY path to SETTLED is the cryptographically verified
 * Stripe `payment_intent.succeeded` webhook — no human role holds that
 * transition. This module is the vocabulary those rules are written against;
 * the matching Postgres CHECK constraints (migration 20260802150000) make the
 * database refuse anything this module refuses.
 *
 * Same discipline as workflow-transition-service: frozen String vocabulary,
 * total transition table, boot-time assertion. Executive decision R1 chose
 * String + CHECK over a Prisma enum so the state-machine enforcement
 * machinery (boot assertions, AST ratchet) keeps one pattern.
 */

const CHECKOUT_STATUSES = Object.freeze([
    'PENDING_PAYMENT',
    'SETTLED',
    'EXPIRED',
    'CANCELLED',
]);

/** The two payment gates of the canonical 7-step workflow. */
const MILESTONES = Object.freeze(['M1', 'M2']);

/**
 * The Invoice.serviceType this rail mints for a milestone — the ONE place the
 * value is built.
 *
 * Milestone-dimensioned so M1 and M2 are distinct rows under the partial
 * unique index uniq_invoice_app_service_active (applicationId, serviceType),
 * and deliberately free of 'STATE_FEE' (resolveIssuerType would flip to DTAM
 * and skip the revenue entry).
 *
 * Readers (e.g. the applicant preview's summarizeCheckoutInvoices) ask this
 * function instead of typing the string again, so a reader can never drift
 * from the minter.
 */
function checkoutInvoiceServiceType(milestone) {
    return `CERTIFICATION_CHECKOUT_${milestone}`;
}

/**
 * milestone → the workflow state its settlement unlocks. Only the verified
 * webhook (checkout-settlement-service, actor SYSTEM) moves an application into
 * these states; application-status-writer refuses any other actor unless a
 * SETTLED order for that milestone already exists. No person marks a payment paid.
 */
const SETTLED_TARGET_STATE = Object.freeze({
    M1: 'DOC_FEE_PAID',
    M2: 'AUDIT_FEE_PAID',
});

/**
 * Application states from which each milestone may be paid. M1 covers the
 * submission window; M2 opens only when the documents have passed. Mirrors
 * the canonical dictionary; the slip-era states stay listed so an in-flight
 * application that switches rails mid-window can still pay (drain window).
 *
 * F-G4-64 — DRAFT is GONE from M1. A quotation is issued on the way OUT of
 * DRAFT (routes/api/applications/applications.js submit doors), so a DRAFT
 * application has no price of record to accept and, with the checkout's acceptance gate
 * (stripe-checkout-service) fail-closed, every DRAFT checkout would refuse anyway. Removing it
 * turns an unexplained quotation refusal into the accurate one
 * (CHECKOUT_MILESTONE_NOT_PAYABLE: this milestone is not payable yet).
 *
 * The settlement moves the status only from these states too: a payment that lands
 * after the application moved on (or was cancelled) is recorded, never a status move.
 */
const PAYABLE_STATES = Object.freeze({
    M1: Object.freeze(['SUBMITTED', 'PENDING_DOC_FEE']),
    M2: Object.freeze(['DOC_APPROVED', 'PENDING_AUDIT_FEE']),
});

const MILESTONE_OF_PAID_STATE = Object.freeze(Object.fromEntries(
    Object.entries(SETTLED_TARGET_STATE).map(([milestone, state]) => [state, milestone]),
));

/**
 * from → allowed targets.
 *
 *   PENDING_PAYMENT → SETTLED    the verified webhook, and nothing else
 *   PENDING_PAYMENT → EXPIRED    the Payment Intent expired unpaid
 *   PENDING_PAYMENT → CANCELLED  applicant/system abandoned the checkout
 *   EXPIRED → PENDING_PAYMENT    re-entry mints a fresh intent on the order
 *   SETTLED → (nothing)          money moved; terminal
 *   CANCELLED → (nothing)        a new attempt is a NEW order
 */
const ALLOWED_CHECKOUT_TRANSITIONS = Object.freeze({
    PENDING_PAYMENT: Object.freeze(['SETTLED', 'EXPIRED', 'CANCELLED']),
    EXPIRED: Object.freeze(['PENDING_PAYMENT']),
    SETTLED: Object.freeze([]),
    CANCELLED: Object.freeze([]),
});

function canTransitionCheckout(from, to) {
    const targets = ALLOWED_CHECKOUT_TRANSITIONS[from];
    return Array.isArray(targets) && targets.includes(to);
}

/**
 * Boot-time totality: every status has a transition row, every row's targets
 * are statuses. Runs at require() so a vocabulary edit that forgets a row is
 * a boot failure, not a silent dead state.
 */
function assertCheckoutVocabularyIsTotal() {
    const missing = CHECKOUT_STATUSES.filter(
        (s) => !Object.prototype.hasOwnProperty.call(ALLOWED_CHECKOUT_TRANSITIONS, s),
    );
    const unknownRows = Object.keys(ALLOWED_CHECKOUT_TRANSITIONS)
        .filter((s) => !CHECKOUT_STATUSES.includes(s));
    const unknownTargets = Object.entries(ALLOWED_CHECKOUT_TRANSITIONS)
        .flatMap(([from, targets]) => targets
            .filter((t) => !CHECKOUT_STATUSES.includes(t))
            .map((t) => `${from} -> ${t}`));

    const problems = [
        ...missing.map((s) => `status ${s} has no transition row`),
        ...unknownRows.map((s) => `transition row ${s} is not a checkout status`),
        ...unknownTargets.map((e) => `transition target ${e} is not a checkout status`),
    ];
    if (problems.length > 0) {
        throw new Error(`[checkout-status] vocabulary is not total:\n  - ${problems.join('\n  - ')}`);
    }
}

assertCheckoutVocabularyIsTotal();

module.exports = {
    CHECKOUT_STATUSES,
    MILESTONES,
    checkoutInvoiceServiceType,
    SETTLED_TARGET_STATE,
    PAYABLE_STATES,
    MILESTONE_OF_PAID_STATE,
    ALLOWED_CHECKOUT_TRANSITIONS,
    canTransitionCheckout,
    assertCheckoutVocabularyIsTotal,
};
