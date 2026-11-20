// The ONLY place process.env is read is config/stripe.js; this module asks
// the accessor, never the environment (ratchet: env-direct).

const { MILESTONES, checkoutInvoiceServiceType } = require('../shared/checkout-status');

const LEGACY_SERVICE_TYPES = Object.freeze({
  PHASE_1_STATE: 'APPLICATION_FEE',
  PHASE_2_STATE: ['AUDIT_FEE', 'PHASE_2_AUDIT', 'PHASE2_AUDIT'],
});

const CANONICAL_SERVICE_TYPES = Object.freeze({
  PHASE_1_STATE_FEE: 'PHASE_1_STATE_FEE',
  PHASE_1_PLATFORM_FEE: 'PHASE_1_PLATFORM_FEE',
  PHASE_2_STATE_FEE: 'PHASE_2_STATE_FEE',
  PHASE_2_PLATFORM_FEE: 'PHASE_2_PLATFORM_FEE',
});

const STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID_PENDING_RECEIPT: 'PAID_PENDING_RECEIPT',
  RECEIPT_ISSUED: 'RECEIPT_ISSUED',
});

function normalizeUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeInvoiceServiceType(serviceType) {
  const normalized = normalizeUpper(serviceType);
  if (!normalized) {
    return null;
  }

  if (normalized === LEGACY_SERVICE_TYPES.PHASE_1_STATE) {
    return CANONICAL_SERVICE_TYPES.PHASE_1_STATE_FEE;
  }

  if (LEGACY_SERVICE_TYPES.PHASE_2_STATE.includes(normalized)) {
    return CANONICAL_SERVICE_TYPES.PHASE_2_STATE_FEE;
  }

  if (Object.values(CANONICAL_SERVICE_TYPES).includes(normalized)) {
    return normalized;
  }

  return normalized;
}

function getCanonicalServiceTypeForComponent(phase, component) {
  const normalizedPhase = normalizeUpper(phase);
  const normalizedComponent = normalizeUpper(component);

  if (normalizedPhase === 'PHASE_1' && normalizedComponent === 'STATE') {
    return CANONICAL_SERVICE_TYPES.PHASE_1_STATE_FEE;
  }
  if (normalizedPhase === 'PHASE_1' && normalizedComponent === 'PLATFORM') {
    return CANONICAL_SERVICE_TYPES.PHASE_1_PLATFORM_FEE;
  }
  if (normalizedPhase === 'PHASE_2' && normalizedComponent === 'STATE') {
    return CANONICAL_SERVICE_TYPES.PHASE_2_STATE_FEE;
  }
  if (normalizedPhase === 'PHASE_2' && normalizedComponent === 'PLATFORM') {
    return CANONICAL_SERVICE_TYPES.PHASE_2_PLATFORM_FEE;
  }
  return null;
}

function getServiceTypesForPhaseComponent(phase, component) {
  const normalizedPhase = normalizeUpper(phase);
  const normalizedComponent = normalizeUpper(component);

  if (normalizedPhase === 'PHASE_1' && normalizedComponent === 'STATE') {
    return [
      CANONICAL_SERVICE_TYPES.PHASE_1_STATE_FEE,
      LEGACY_SERVICE_TYPES.PHASE_1_STATE,
    ];
  }

  if (normalizedPhase === 'PHASE_1' && normalizedComponent === 'PLATFORM') {
    return [CANONICAL_SERVICE_TYPES.PHASE_1_PLATFORM_FEE];
  }

  if (normalizedPhase === 'PHASE_2' && normalizedComponent === 'STATE') {
    return [
      CANONICAL_SERVICE_TYPES.PHASE_2_STATE_FEE,
      ...LEGACY_SERVICE_TYPES.PHASE_2_STATE,
    ];
  }

  if (normalizedPhase === 'PHASE_2' && normalizedComponent === 'PLATFORM') {
    return [CANONICAL_SERVICE_TYPES.PHASE_2_PLATFORM_FEE];
  }

  return [];
}

function describeServiceType(serviceType) {
  const normalized = normalizeInvoiceServiceType(serviceType);
  switch (normalized) {
    case CANONICAL_SERVICE_TYPES.PHASE_1_STATE_FEE:
      return 'Phase 1 state fee';
    case CANONICAL_SERVICE_TYPES.PHASE_1_PLATFORM_FEE:
      return 'Phase 1 platform fee';
    case CANONICAL_SERVICE_TYPES.PHASE_2_STATE_FEE:
      return 'Phase 2 state fee';
    case CANONICAL_SERVICE_TYPES.PHASE_2_PLATFORM_FEE:
      return 'Phase 2 platform fee';
    default:
      return 'Service fee';
  }
}

function isInvoicePaidStatus(status) {
  const normalized = normalizeUpper(status);
  return ['PAID', STATUS.PAID_PENDING_RECEIPT, STATUS.RECEIPT_ISSUED].includes(normalized);
}

function isInvoiceReceiptIssued(invoice) {
  if (!invoice || typeof invoice !== 'object') {
    return false;
  }

  if (normalizeUpper(invoice.status) === STATUS.RECEIPT_ISSUED) {
    return true;
  }

  return !!invoice.receiptIssuedAt || !!invoice.receiptNumber;
}

function selectLatestInvoice(candidates) {
  const list = Array.isArray(candidates) ? [...candidates] : [];
  list.sort((left, right) => {
    const leftTime = new Date(left?.createdAt || left?.updatedAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || right?.updatedAt || 0).getTime();
    return rightTime - leftTime;
  });
  return list[0] || null;
}

/**
 * The ONE invoice the checkout rail mints for a phase.
 *
 * The checkout rail names it with shared/checkout-status.js
 * checkoutInvoiceServiceType, M1 = phase 1 and M2 = phase 2. Under W14
 * (2026-08-22) the company is the only issuer and that one invoice is the
 * whole ค่าบริการ.
 */
function checkoutServiceTypeForPhase(phase) {
  return checkoutInvoiceServiceType(normalizeUpper(phase) === 'PHASE_2' ? MILESTONES[1] : MILESTONES[0]);
}

/**
 * Refund states that mean the money is out, or on its way out. Only the
 * provider-cancellation refund (refund-service) writes Invoice.metadata.refund:
 * the whole milestone, which then counts as unpaid. A duplicate-charge refund
 * returns only an excess and lives in metadata.duplicateChargeRefunds, which
 * nothing here reads: that milestone stays paid. invoice.status stays paid
 * either way.
 */
const ACTIVE_REFUND_STATUSES = Object.freeze(['INITIATED', 'BANK_TRANSFER_PENDING', 'COMPLETED']);

/**
 * The refund lives in `metadata`, so a read that did not select it cannot say
 * whether the invoice was refunded. Answering "paid" from such a row is the
 * select gap that let a refunded fee pass, so it throws instead. Rows written by
 * the retired holdInvoice hold metadata as a JSON string; one that does not
 * parse is read as refunded, because unknown money is not paid.
 */
function isInvoiceActivelyRefunded(invoice) {
  if (!invoice || typeof invoice !== 'object') {
    return false;
  }
  if (!('metadata' in invoice)) {
    throw new Error('invoice read without metadata: its refund state is unknown');
  }
  let metadata = invoice.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata || '{}');
    } catch (_e) {
      return true;
    }
  }
  return ACTIVE_REFUND_STATUSES.includes(normalizeUpper(metadata?.refund?.status));
}

/**
 * The one definition of a paid invoice: settled and not actively refunded.
 * A fully refunded milestone is unpaid everywhere (operator 2026-10-06); the
 * applicant pays again through the gateway to continue.
 */
function isInvoicePaid(invoice) {
  return !!invoice && isInvoicePaidStatus(invoice.status) && !isInvoiceActivelyRefunded(invoice);
}

/**
 * Is this phase paid, and is its receipt issued? Both answers come from the
 * phase's one checkout invoice and nothing else, so the waiver reopen, the
 * inspection start, the schedule gate and the dashboards agree.
 */
function computePhaseSettlement(invoices, phase) {
  const source = Array.isArray(invoices) ? invoices : [];
  const serviceType = checkoutServiceTypeForPhase(phase);
  const invoice = selectLatestInvoice(
    source.filter((row) => normalizeUpper(row?.serviceType) === serviceType),
  );
  const phasePaid = isInvoicePaid(invoice);
  return {
    phase: normalizeUpper(phase),
    invoice,
    phasePaid,
    phaseRefunded: isInvoiceActivelyRefunded(invoice),
    phaseReceiptIssued: phasePaid && isInvoiceReceiptIssued(invoice),
  };
}

/**
 * Split (STATE + PLATFORM) invoicing is retired. Permanently, and not by a flag.
 *
 * This used to be `return isStripeCheckoutEnabled()`, which is a single equality
 * test against the STRIPE_CHECKOUT_ENABLED environment variable — so ONE setting
 * decided two unrelated things: whether the payment GATEWAY was available, and
 * which ACCOUNTING MODEL the company used. Leave it unset, which is the default
 * anywhere nobody has said otherwise, and the platform reverted to minting the
 * retired STATE/PLATFORM pair whose STATE half the journal layer then refused to
 * book at all. Cash in the bank, no entry, and the refusal recorded as a skip
 * rather than an error.
 *
 * Whether a gateway is configured is properly an environment decision, and the
 * checkout door still answers 503 without one. How the company recognises its
 * revenue is not. Operator, 2026-09-05: "ผมจะลบแบบที่ไม่ถูกต้องออกทั้งหมดแล้วแทนค่า
 * หรือทำสิ่งที่ถูกต้องเท่านั้น."
 *
 * Kept as a function rather than deleted outright so the call sites that ask it
 * — and the tests that exercise both answers — keep reading naturally while the
 * now-unreachable split branches are removed.
 */
function isPhaseSplitInvoicingRetired() {
  return true;
}

function flattenRequiredInvoices(settlement) {
  const invoice = settlement?.invoice;
  if (!invoice) {
    return [];
  }
  return [{
    component: 'PLATFORM',
    serviceType: invoice.serviceType,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: normalizeUpper(invoice.status),
    isPaid: settlement.phasePaid,
    amount: invoice.totalAmount,
  }];
}

module.exports = {
  LEGACY_SERVICE_TYPES,
  CANONICAL_SERVICE_TYPES,
  STATUS,
  normalizeInvoiceServiceType,
  getCanonicalServiceTypeForComponent,
  getServiceTypesForPhaseComponent,
  describeServiceType,
  isInvoicePaidStatus,
  isInvoiceReceiptIssued,
  isInvoiceActivelyRefunded,
  isInvoicePaid,
  computePhaseSettlement,
  flattenRequiredInvoices,
  isPhaseSplitInvoicingRetired,
};
