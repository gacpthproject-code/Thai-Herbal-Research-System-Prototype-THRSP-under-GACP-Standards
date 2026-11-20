/**
 * A bank transfer was recorded and the filing never moved.
 *
 * Walked on a real Postgres, 2026-09-05: quotation accepted, payment terms
 * consented, `POST /payments/checkout` minted ONE invoice for 5,885, the applicant
 * uploaded a slip, finance approved it with the amount verified. The slip went
 * APPROVED, the invoice went `paid` — and the application stayed at
 * PHASE_1_SLIP_UNDER_REVIEW instead of advancing to DOC_FEE_PAID.
 *
 * payment-slip-service.js:1449 advances only when `settlement.phasePaid`, and
 * `computePhaseSettlement` decides that by bucketing invoices into STATE and
 * PLATFORM by `serviceType`:
 *
 *     phasePaid = stateInvoice
 *         ? (platformInvoice ? statePaid && platformPaid
 *                            : (hasLegacyStateOnly ? statePaid : false))
 *         : false
 *
 * The checkout rail mints `CERTIFICATION_CHECKOUT_M1`
 * (stripe-checkout-service.js:88) — a type in NEITHER bucket. So both sides are
 * null, the outer ternary falls to `false`, and a fully-paid phase reads unpaid.
 * Every time, for every bank transfer, not as a race.
 *
 * The split pair belongs to the two-money-flow model W14 retired on 2026-08-22 —
 * the comment at payment-slip-service.js:1405 says so in as many words. Under W14
 * one invoice IS the whole ค่าบริการ, so it settles the phase alone.
 *
 * Since 2026-10-06 (staging walk D8) the pair is not read at all: no code mints
 * it and no live database holds one, and reading it for the receipt while the
 * checkout invoice answered the payment left a settled M2 "not receipted".
 */
'use strict';

const { computePhaseSettlement } = require('../../services/phase-billing-service');

const inv = (serviceType, status, over = {}) => ({
    serviceType, status, metadata: null, createdAt: '2026-09-05T00:00:00.000Z', ...over,
});

describe('the checkout rail settles a phase with the one invoice it mints', () => {
    test('a paid CERTIFICATION_CHECKOUT_M1 settles PHASE_1 on its own', () => {
        const s = computePhaseSettlement([inv('CERTIFICATION_CHECKOUT_M1', 'paid')], 'PHASE_1');
        expect(s.phasePaid).toBe(true);
    });

    test('an unpaid one does NOT settle it', () => {
        const s = computePhaseSettlement([inv('CERTIFICATION_CHECKOUT_M1', 'pending')], 'PHASE_1');
        expect(s.phasePaid).toBe(false);
    });

    test('M2 settles PHASE_2, and does not settle PHASE_1', () => {
        const rows = [inv('CERTIFICATION_CHECKOUT_M2', 'paid')];
        expect(computePhaseSettlement(rows, 'PHASE_2').phasePaid).toBe(true);
        // Paying the audit fee must not mark the document fee collected.
        expect(computePhaseSettlement(rows, 'PHASE_1').phasePaid).toBe(false);
    });

    test('M1 does not settle PHASE_2 either', () => {
        const rows = [inv('CERTIFICATION_CHECKOUT_M1', 'paid')];
        expect(computePhaseSettlement(rows, 'PHASE_2').phasePaid).toBe(false);
    });
});

describe('nothing else settles a phase', () => {
    test('no invoices at all is not settled', () => {
        expect(computePhaseSettlement([], 'PHASE_1').phasePaid).toBe(false);
        expect(computePhaseSettlement(null, 'PHASE_1').phasePaid).toBe(false);
    });

    test('a paid retired STATE+PLATFORM pair does not settle the phase', () => {
        // The split pair is retired (W14) and no live database holds one, so it
        // is not read: only the checkout rail's invoice answers.
        const s = computePhaseSettlement(
            [inv('PHASE_1_STATE_FEE', 'paid'), inv('PHASE_1_PLATFORM_FEE', 'paid')],
            'PHASE_1',
        );
        expect(s.phasePaid).toBe(false);
    });
});
