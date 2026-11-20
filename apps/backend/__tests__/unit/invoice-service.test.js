jest.mock('../../services/prisma-database', () => {
  // getById() resolves via prisma.invoice.findFirst (the org-scoped IDOR-safe
  // lookup); some older tests set up the snapshot via .findUnique. Share ONE
  // mock fn behind both names so either setup style feeds getById.
  const invoiceFindMock = jest.fn();
  const invoiceMock = {
    update: jest.fn(),
    updateMany: jest.fn(),
    findUnique: invoiceFindMock,
    findFirst: invoiceFindMock,
    count: jest.fn(),
    findMany: jest.fn(),
  };
  return {
    prisma: {
      invoice: invoiceMock,
      auditLog: {
        findMany: jest.fn(),
      },
      // $transaction executes the callback with the same prisma mock as `tx`
      $transaction: jest.fn(async (fn) => {
        const tx = { invoice: invoiceMock };
        return fn(tx);
      }),
    },
  };
});

// `mock-promptpay-service` and the legacy `pdf-service` were both
// siblings of earlier payment / PDF prototypes that have since been
// removed. invoice-service.js no longer requires either of them
// (the new path is `services/pdf/invoice-template-service.js` via
// `invoiceTemplateService.generateInvoicePdf` etc.). Their stale
// jest.mock entries used to point at deleted modules and made this
// whole test suite fail to load — they have been cleaned out.

jest.mock('../../services/notification-service', () => ({
  sendNotification: jest.fn().mockResolvedValue(null),
  NotifyType: {
    SUCCESS: 'SUCCESS',
  },
}));

const { prisma } = require('../../services/prisma-database');
const invoiceService = require('../../services/invoice-service');

describe('invoice-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns mapped webhook exceptions for accounting queue', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        action: 'WEBHOOK_UNMATCHED',
        severity: 'WARNING',
        createdAt: new Date('2026-02-07T00:00:00.000Z'),
        errorMessage: null,
        metadata: JSON.stringify({
          invoiceId: 'INV-404',
          transactionId: 'TXN-404',
          message: 'Transaction not found',
          payloadHash: 'abc123',
        }),
      },
    ]);

    const result = await invoiceService.listReceiptExceptions(10, {
      viewer: { id: 'u-1', canonicalRole: 'finance_officer_platform', organizationId: 'org-1' },
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.organizationId).toBe('org-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      action: 'WEBHOOK_UNMATCHED',
      invoiceId: 'INV-404',
      transactionId: 'TXN-404',
      payloadRef: 'abc123',
    }));
  });

  it('refuses a viewer with no organization before reading the audit log (order 17)', async () => {
    await expect(invoiceService.listReceiptExceptions(10, {
      viewer: { id: 'u-1', canonicalRole: 'finance_officer_platform', organizationId: null },
    })).rejects.toMatchObject({ code: 'FORBIDDEN_TENANT', statusCode: 403 });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});


// B1 (2026-08-23) — every invoice download/view returned 500 for 22 days
// because getById() selected `Entity.entityType`, a column that does not
// exist on the Entity model (`prisma/schema/entity.prisma:33` calls it
// `type`). Prisma rejects the whole query with
//   Unknown field `entityType` for select statement on model `Entity`
// which takes down GET /api/invoices/:id and GET /api/invoices/:id/pdf
// (both call getById first).
//
// The prisma mock in this file cannot reproduce that rejection — a jest mock
// accepts any shape. So this guard validates the select the production code
// ACTUALLY sends against the generated Prisma schema (DMMF), which is the
// same source of truth the real client validates against. No DB required.
describe('invoice-service getById — selects only fields that exist in the schema', () => {
  const { Prisma } = require('@prisma/client');

  function fieldNames(modelName) {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
    if (!model) { throw new Error(`Model ${modelName} not found in Prisma DMMF`); }
    return model.fields.map((f) => f.name);
  }

  // getById = the billing view (application via `select`, S1 2026-09-27);
  // getForDocument = the PDF path (application via `include`). Both carry the
  // same narrow Entity select, so both are guarded here.
  it.each([
    ['getById', (a) => a?.include?.application?.select?.entity?.select],
    ['getForDocument', (a) => a?.include?.application?.include?.entity?.select],
  ])('Entity select in %s() contains no unknown field', async (fn, pick) => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await invoiceService[fn]('inv-select-guard', {
      viewer: { canonicalRole: 'finance_officer_dtam', organizationId: 'org-1' },
    });

    expect(prisma.invoice.findFirst).toHaveBeenCalled();
    const args = prisma.invoice.findFirst.mock.calls[prisma.invoice.findFirst.mock.calls.length - 1][0];
    const entitySelect = pick(args);
    expect(entitySelect).toBeTruthy();

    const known = fieldNames('Entity');
    const unknown = Object.keys(entitySelect).filter((k) => !known.includes(k));
    expect(unknown).toEqual([]);
  });

  it('additionally carries the tax-id columns the PDF payer block prints — never thaiCitizenId (2026-09-27)', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await invoiceService.getForDocument('inv-select-guard-2');

    const args = prisma.invoice.findFirst.mock.calls[prisma.invoice.findFirst.mock.calls.length - 1][0];
    const entitySelect = args.include.application.include.entity.select;
    // getForDocument (this INTERNAL-ONLY, never-returned-to-a-route function)
    // is now WIDER than the four route-facing call sites (invoice-service.js
    // getById / listPendingReceipts / generateReceiptPdf / listReceiptExceptions
    // — see the `%s()` table above): it also carries `juristicId` +
    // `communityRegNo`, decrypted transparently by the PDPA prisma
    // extension's generic read-time walker, because the invoice/receipt/
    // tax-invoice PDF payer block prints one of them
    // (utils/applicant-resolver.js:36/38) and used to always render
    // "Tax ID -" without them (invoice-tax-id fix round, 2026-09-27; staging
    // evidence INV-CO-CAFF6646-M1).
    //
    // `thaiCitizenId` is DELIBERATELY EXCLUDED — operator ruling 2026-09-27:
    // an INDIVIDUAL payer's national ID is never printed, in full or in
    // part. Fix round 1 of this select briefly added it and leaked the full
    // 13-digit national ID onto the invoice/receipt PDF's PAYER_ID for an
    // individual payer; caught before merge. This assertion is the pin that
    // keeps it out.
    expect(entitySelect).toEqual({
      id: true, type: true, displayName: true, juristicId: true, communityRegNo: true, payload: true,
    });
    expect(entitySelect.thaiCitizenId).toBeUndefined();
  });
});
