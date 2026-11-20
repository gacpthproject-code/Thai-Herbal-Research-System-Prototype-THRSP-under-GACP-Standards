const { prisma } = require('../../../services/prisma-database');
const phaseBillingService = require('../../../services/phase-billing-service');
const {
  getServiceTypesForPhaseComponent,
  isInvoicePaidStatus,
  isInvoicePaid,
} = phaseBillingService;
// F-G4-51 read side: the ONE checkout invoice per milestone is minted by
// services/checkout/stripe-checkout-service.js. Its serviceType is asked from
// the minter itself, never re-typed here, so reader and writer cannot drift.
const { checkoutInvoiceServiceType } = require('../../../services/checkout/stripe-checkout-service');
// The two payment gates' names come from the checkout lifecycle SSOT.
const { MILESTONES } = require('../../../shared/checkout-status');

/**
 * The holder fragment when the applicant preview passes its holder scope;
 * `{}` for a caller with none (spec 2026-09-30 §3.1).
 */
function holderScoped(holderScope, model) {
  return require('../../../services/holder-access').holderReadWhereIfScoped(holderScope, model);
}

/**
 * The phase-1 invoice rows of the retired per-side pair, for the applicant
 * preview — READ-ONLY, no create/update. The preview GET writes nothing in any
 * state (P-GET, 2026-09-30); its writing twin, ensurePhase1FinancialDocuments,
 * was deleted 2026-10-02 (M5) once it had become a pass-through to this reader.
 * Lookup key: serviceType.
 */
async function readPhase1FinancialDocuments(application, { holderScope = null } = {}) {
  const appId = String(application?.id || '').trim();
  if (!appId) {
    return {
      invoice: null,
      phase1: {
        state: { invoice: null },
        platform: { invoice: null },
      },
    };
  }

  const [stateInvoice, platformInvoice] = await Promise.all([
    prisma.invoice.findFirst({
      where: {
        applicationId: appId,
        serviceType: { in: getServiceTypesForPhaseComponent('PHASE_1', 'STATE') },
        isDeleted: false,
        ...holderScoped(holderScope, 'Invoice'),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.findFirst({
      where: {
        applicationId: appId,
        serviceType: { in: getServiceTypesForPhaseComponent('PHASE_1', 'PLATFORM') },
        isDeleted: false,
        ...holderScoped(holderScope, 'Invoice'),
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    invoice: toInvoiceSummary(stateInvoice),
    phase1: {
      state: { invoice: toInvoiceSummary(stateInvoice) },
      platform: { invoice: toInvoiceSummary(platformInvoice) },
    },
  };
}

function toInvoiceSummary(invoice) {
  if (!invoice) {
    return null;
  }
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    dueDate: invoice.dueDate,
    totalAmount: invoice.totalAmount,
    serviceType: invoice.serviceType,
  };
}

/**
 * F-G4-51 — read-only lens over the checkout rail for the applicant preview.
 *
 * Under F-G4-35 the per-side PHASE_1 invoice pair is retired, so
 * readPhase1FinancialDocuments answers all-null and the preview page's four
 * legacy slots would stay empty forever. What the applicant actually pays is
 * the ONE CERTIFICATION_CHECKOUT_Mx invoice per milestone. This summarises the
 * invoice rows the preview route already loaded: pure, no query, no write.
 *
 * The live invariant is ONE ACTIVE row per (application, serviceType) — the
 * partial unique index uniq_invoice_app_service_active. History is what makes a
 * milestone carry more than one row: a cancelled or expired attempt sits next
 * to the row that was actually paid, and a re-entered checkout mints a fresh
 * order + invoice. So the tie-break covers history, not concurrency: a PAID row
 * always beats an unpaid/cancelled one, and createdAt only decides between rows
 * of equal payment standing.
 */
const CHECKOUT_MILESTONE_BY_PHASE = Object.freeze({
  // The milestone vocabulary is the checkout SSOT's, never re-typed here:
  // shared/checkout-status.js MILESTONES = ['M1', 'M2'] (Wave 1 design v2).
  phase1: MILESTONES[0],
  phase2: MILESTONES[1],
});

function normalizeServiceType(value) {
  return String(value || '').trim().toUpperCase();
}

function createdAtMillis(invoice) {
  const value = invoice?.createdAt;
  if (!value) {
    return 0;
  }
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

/**
 * Which of two rows of the same milestone is the one the applicant lives with?
 * A row whose money moved always wins: a cancelled attempt minted AFTER the
 * paid one (re-entry, then abandonment) must never be able to tell a farmer
 * their settled phase is unpaid. Only between rows of equal payment standing
 * does the newer row win.
 */
function outranksCheckoutRow(candidate, current) {
  const candidatePaid = isInvoicePaidStatus(candidate?.status);
  const currentPaid = isInvoicePaidStatus(current?.status);
  if (candidatePaid !== currentPaid) {
    return candidatePaid;
  }
  return createdAtMillis(candidate) >= createdAtMillis(current);
}

function selectCheckoutInvoiceOfServiceType(invoices, serviceType) {
  const wanted = normalizeServiceType(serviceType);
  let selected = null;
  for (const invoice of invoices) {
    if (normalizeServiceType(invoice?.serviceType) !== wanted) {
      continue;
    }
    if (!selected || outranksCheckoutRow(invoice, selected)) {
      selected = invoice;
    }
  }
  return selected;
}

/**
 * An amount the row does not carry is UNKNOWN, not zero: `Number(x || 0)`
 * printed "฿0" at an applicant for a row whose total was simply absent. A
 * genuine 0 stays 0 — only absence (and an unreadable value) becomes null, and
 * the page then renders no amount row at all.
 */
function toCheckoutAmount(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function toCheckoutSummary(invoice) {
  if (!invoice) {
    return null;
  }
  return {
    invoiceNumber: invoice.invoiceNumber || null,
    status: invoice.status || null,
    isPaid: isInvoicePaid(invoice),
    paidAt: invoice.paidAt || null,
    receiptNumber: invoice.receiptNumber || null,
    receiptIssuedAt: invoice.receiptIssuedAt || null,
    totalAmount: toCheckoutAmount(invoice.totalAmount),
  };
}

function summarizeCheckoutInvoices(invoices) {
  const rows = Array.isArray(invoices) ? invoices : [];
  const summary = {};
  for (const [phase, milestone] of Object.entries(CHECKOUT_MILESTONE_BY_PHASE)) {
    summary[phase] = toCheckoutSummary(
      selectCheckoutInvoiceOfServiceType(rows, checkoutInvoiceServiceType(milestone)),
    );
  }
  return summary;
}

/**
 * Get Preview Data for Application
 * GET /api/applications/:id/preview
 *
 * Returns summary of all data for review before payment
 */

module.exports = {
  readPhase1FinancialDocuments,
  summarizeCheckoutInvoices,
};
