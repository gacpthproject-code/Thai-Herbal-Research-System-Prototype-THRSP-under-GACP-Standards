const {
  computePhaseSettlement,
  flattenRequiredInvoices,
  isInvoicePaid,
} = require('../../services/phase-billing-service');

const inv = (serviceType, status, over = {}) => ({
  id: `inv-${serviceType}`, invoiceNumber: `INV-${serviceType}`, serviceType, status, metadata: null,
  createdAt: new Date('2026-10-06T00:00:00.000Z'), ...over,
});

describe('phase-billing-service reads the checkout rail\'s one invoice', () => {
  // Staging walk 2026-10-06 D8: a settled M2 read "paid, receipt not issued",
  // so inspection-starts refused and the inspector dashboards showed no receipt.
  it('a settled M2 carrying its receipt number is paid AND receipted', () => {
    const settlement = computePhaseSettlement(
      [inv('CERTIFICATION_CHECKOUT_M2', 'paid', { receiptNumber: 'TAX-PRD-2026-000004', receiptIssuedAt: new Date() })],
      'PHASE_2',
    );
    expect(settlement.phasePaid).toBe(true);
    expect(settlement.phaseReceiptIssued).toBe(true);
  });

  it('paid without receipt evidence is not receipted', () => {
    const settlement = computePhaseSettlement([inv('CERTIFICATION_CHECKOUT_M2', 'paid')], 'PHASE_2');
    expect(settlement.phasePaid).toBe(true);
    expect(settlement.phaseReceiptIssued).toBe(false);
  });

  it('an unpaid invoice is neither paid nor receipted', () => {
    const settlement = computePhaseSettlement([inv('CERTIFICATION_CHECKOUT_M2', 'pending')], 'PHASE_2');
    expect(settlement.phasePaid).toBe(false);
    expect(settlement.phaseReceiptIssued).toBe(false);
  });

  it('the M1 receipt does not receipt phase 2', () => {
    const rows = [inv('CERTIFICATION_CHECKOUT_M1', 'paid', { receiptNumber: 'TAX-1' })];
    expect(computePhaseSettlement(rows, 'PHASE_2').phaseReceiptIssued).toBe(false);
    expect(computePhaseSettlement(rows, 'PHASE_1').phaseReceiptIssued).toBe(true);
  });

  it('retired split rows are not read at all', () => {
    const rows = [
      inv('PHASE_2_STATE_FEE', 'RECEIPT_ISSUED', { receiptNumber: 'R-STATE' }),
      inv('PHASE_2_PLATFORM_FEE', 'RECEIPT_ISSUED', { receiptNumber: 'R-PLATFORM' }),
      inv('AUDIT_FEE', 'PAID', { receiptNumber: 'R-LEGACY' }),
    ];
    const settlement = computePhaseSettlement(rows, 'PHASE_2');
    expect(settlement.phasePaid).toBe(false);
    expect(settlement.phaseReceiptIssued).toBe(false);
    expect(settlement.invoice).toBeNull();
  });

  it('flattenRequiredInvoices lists the one invoice, or nothing', () => {
    const settlement = computePhaseSettlement(
      [inv('CERTIFICATION_CHECKOUT_M1', 'paid', { totalAmount: 5885 })],
      'PHASE_1',
    );
    expect(flattenRequiredInvoices(settlement)).toEqual([{
      component: 'PLATFORM',
      serviceType: 'CERTIFICATION_CHECKOUT_M1',
      invoiceId: 'inv-CERTIFICATION_CHECKOUT_M1',
      invoiceNumber: 'INV-CERTIFICATION_CHECKOUT_M1',
      status: 'PAID',
      isPaid: true,
      amount: 5885,
    }]);
    expect(flattenRequiredInvoices(computePhaseSettlement([], 'PHASE_1'))).toEqual([]);
  });
});

describe('a fully refunded milestone is unpaid everywhere (operator 2026-10-06)', () => {
  const receipted = (metadata) => [inv('CERTIFICATION_CHECKOUT_M2', 'paid', { receiptNumber: 'TAX-1', metadata })];

  it.each(['INITIATED', 'BANK_TRANSFER_PENDING', 'COMPLETED'])('a %s refund makes the phase unpaid and unreceipted', (status) => {
    expect(computePhaseSettlement(receipted({ refund: { status } }), 'PHASE_2'))
      .toMatchObject({ phasePaid: false, phaseRefunded: true, phaseReceiptIssued: false });
  });

  it('duplicate-charge refunds return only an excess and leave the milestone paid (order 22)', () => {
    const duplicates = { duplicateChargeRefunds: [{ kind: 'DUPLICATE', amount: 29425, creditNoteId: 'cn-1' }] };
    expect(computePhaseSettlement(receipted(duplicates), 'PHASE_2'))
      .toMatchObject({ phasePaid: true, phaseRefunded: false, phaseReceiptIssued: true });
  });

  it('a cancelled refund leaves the payment standing', () => {
    expect(computePhaseSettlement(receipted({ refund: { status: 'CANCELLED' } }), 'PHASE_2'))
      .toMatchObject({ phasePaid: true, phaseRefunded: false, phaseReceiptIssued: true });
  });

  it('metadata stored as a JSON string is still read', () => {
    expect(isInvoicePaid(receipted(JSON.stringify({ refund: { status: 'COMPLETED' } }))[0])).toBe(false);
    expect(isInvoicePaid(receipted(JSON.stringify({ wht: true }))[0])).toBe(true);
  });

  it('metadata that does not parse is not paid', () => {
    expect(isInvoicePaid(receipted('{not json')[0])).toBe(false);
  });

  it('an invoice read without metadata cannot answer, so it throws instead of saying paid', () => {
    const unselected = { ...receipted(null)[0] };
    delete unselected.metadata;
    expect(() => isInvoicePaid(unselected)).toThrow('invoice read without metadata');
  });
});
