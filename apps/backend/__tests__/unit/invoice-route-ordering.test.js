'use strict';

/**
 * L7 regression — the literal finance routes of the invoice-payment-handlers
 * sub-router (today: /invoices/export) were UNREACHABLE when the single-segment
 * param route `GET /:invoiceId` was registered BEFORE the sub-router mount: a
 * request to /export matched `/:invoiceId` (invoiceId='export') → getById('export')
 * → 404 "Invoice not found". The fix moves the sub-router mount above
 * `/:invoiceId`. This test pins reachability + that the genuine `/:invoiceId`
 * route still works (no shadow regression the other way).
 *
 * /revenue-summary used to be the pinned literal route; it was retired with the
 * wallet A/B split (order 29), so /export now carries the pin.
 *
 * Auth is mocked to attach req.user; canonical-rbac stays REAL so the
 * inline requirePermission(INVOICE_VIEW_ALL) gate is exercised, not stubbed.
 */
jest.mock('../../middleware/auth-middleware', () => {
  const attach = (req, _res, next) => {
    req.user = {
      id: 'user-1',
      role: req.headers['x-test-role'] || 'finance_officer_platform',
      canonicalRole: req.headers['x-test-canonical-role'] || 'finance_officer_platform',
      organizationId: req.headers['x-test-org'] === 'none' ? null : 'org-1',
      providerId: 'provider-1',
    };
    return next();
  };
  return { authenticateProvider: attach, authenticateHealth: attach, authenticateAny: attach };
});

const mockExportCSV = jest.fn();
jest.mock('../../services/financial-export-service', () => ({
  exportCSV: (...args) => mockExportCSV(...args),
}));

const express = require('express');
const request = require('supertest');
const invoiceService = require('../../services/invoice-service');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/invoices', require('../../routes/api/finance/invoices'));
  return app;
}

describe('finance/invoices route ordering (L7)', () => {
  beforeEach(() => {
    jest.spyOn(invoiceService, 'getById').mockResolvedValue(null);
    mockExportCSV.mockReset();
    mockExportCSV.mockResolvedValue({ buffer: Buffer.from('a,b\n'), filename: 'r.csv', contentType: 'text/csv' });
  });
  afterEach(() => jest.restoreAllMocks());

  it('GET /invoices/export reaches the export handler, not /:invoiceId', async () => {
    const res = await request(buildApp()).get('/invoices/export?type=monthly&month=9&year=2026');
    expect(res.status).toBe(200);
    expect(mockExportCSV).toHaveBeenCalledWith('monthly', 9, 2026, { organizationId: 'org-1' });
    expect(invoiceService.getById.mock.calls.map(([id]) => id)).not.toContain('export');
  });

  it('GET /invoices/export refuses a caller with no organization — 400 NO_ORGANIZATION (order 17)', async () => {
    const res = await request(buildApp()).get('/invoices/export').set('x-test-org', 'none');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'NO_ORGANIZATION' });
    expect(mockExportCSV).not.toHaveBeenCalled();
  });

  it('GET /invoices/:invoiceId still routes to the param handler (no reverse shadow)', async () => {
    const res = await request(buildApp()).get('/invoices/real-invoice-uuid');
    expect(invoiceService.getById).toHaveBeenCalledWith('real-invoice-uuid', { viewer: expect.any(Object) });
    expect(res.status).toBe(404); // getById mocked → null → "Invoice not found"
  });
});
