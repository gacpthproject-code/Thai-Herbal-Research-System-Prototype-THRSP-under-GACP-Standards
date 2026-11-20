'use strict';

/**
 * F-PREVIEW-REVISION-WRITE — direct no-write proof (fix round 2, Item 4a,
 * 2026-08-18).
 *
 * `preview-previewable-states.test.js` proves the ROUTE skips writes in
 * REVISION_REQUESTED/CAR_PENDING by mocking the whole `preview-financial-utils`
 * module — so `readPhase1FinancialDocuments`'s own "read-only" property never
 * ran against the real function; it rested on source reading. This file
 * imports the REAL `readPhase1FinancialDocuments` against a fake prisma and
 * spies on every invoice/application method, so a future edit that
 * sneaks a write into this function fails a test even if the route-level
 * mock hides it.
 */

const mockPrisma = {
  invoice: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  application: {
    update: jest.fn(),
  },
};

jest.mock('../../services/prisma-database', () => ({ prisma: mockPrisma }));

jest.mock('../../services/phase-billing-service', () => ({
  getServiceTypesForPhaseComponent: (_phase, component) => [`PHASE_1_${component}_FEE`],
  getCanonicalServiceTypeForComponent: (_phase, component) => `PHASE_1_${component}_FEE`,
  isInvoicePaidStatus: () => false,
}));

const { readPhase1FinancialDocuments } = require('../../routes/api/preview/preview-financial-utils');

describe('readPhase1FinancialDocuments — direct no-write proof (fix round 2, Item 4a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls ONLY find* methods — never invoice.update/create, application.update', async () => {
    mockPrisma.invoice.findFirst
      .mockResolvedValueOnce({
        id: 'inv-state', invoiceNumber: 'INV-1', status: 'pending',
        dueDate: null, totalAmount: 5000, serviceType: 'PHASE_1_STATE_FEE',
      })
      .mockResolvedValueOnce({
        id: 'inv-plat', invoiceNumber: 'INV-2', status: 'pending',
        dueDate: null, totalAmount: 535, serviceType: 'PHASE_1_PLATFORM_FEE',
      });

    const result = await readPhase1FinancialDocuments({ id: 'app-1', healthId: '1100100100012' });

    expect(mockPrisma.invoice.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    expect(mockPrisma.application.update).not.toHaveBeenCalled();

    expect(result.phase1.state.invoice).toMatchObject({ id: 'inv-state' });
    expect(result.phase1.platform.invoice).toMatchObject({ id: 'inv-plat' });
  });

  it('returns nulls (not a crash) when nothing exists yet — still zero writes', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);

    const result = await readPhase1FinancialDocuments({ id: 'app-2', healthId: '1100100100013' });

    expect(result.phase1.state.invoice).toBeNull();
    expect(result.phase1.platform.invoice).toBeNull();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    expect(mockPrisma.application.update).not.toHaveBeenCalled();
  });

  it('an appId-less application short-circuits to an all-null shape with zero prisma calls at all', async () => {
    const result = await readPhase1FinancialDocuments({ id: '' });

    expect(result).toEqual({
      invoice: null,
      phase1: {
        state: { invoice: null },
        platform: { invoice: null },
      },
    });
    expect(mockPrisma.invoice.findFirst).not.toHaveBeenCalled();
  });

  it('the writing twin ensurePhase1FinancialDocuments is gone (M5, 2026-10-02) — only the reader is exported', () => {
    const utils = require('../../routes/api/preview/preview-financial-utils');
    expect(utils.ensurePhase1FinancialDocuments).toBeUndefined();
    expect(typeof utils.readPhase1FinancialDocuments).toBe('function');
  });
});
