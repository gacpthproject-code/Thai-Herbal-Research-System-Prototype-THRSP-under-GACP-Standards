// View-check mock backend for fix/fees-from-server round 1. Test data only.
const http = require('http');
let invoices = 'with'; // 'with' | 'none'
const fees = { applicationFee: 6000, inspectionFee: 30000, renewalFee: 40000, renewalTotalPerScope: 42800, renewalChargeCount: 1, currency: 'THB', vatRate: 0.07, phase1TotalPerScope: 6420, phase2TotalPerScope: 32100, lastUpdated: '2026-10-03', validUntil: '2026-12-31' };
const cert = { id: 'cert-1', certificateNumber: 'GACP-TH-2569-VIEW01', applicationId: 'app-orig', siteName: 'ฟาร์มทดสอบมุมมอง', plantType: 'cannabis', expiryDate: '2026-12-31', status: 'ACTIVE' };
const quotation = { id: 'qt-77', applicationId: 'renewal-app-77', issuerType: 'PLATFORM', quotationNumber: 'QT-PRD-2569-000077', subtotal: '66000.00', vat: '4620.00', totalAmount: '70620.00', status: 'SENT', validUntil: '2026-10-14', installments: [{ phase: 'RENEWAL', amount: 70620, phaseTotal: 70620 }] };
const invoice = { id: 'inv-77', invoiceNumber: 'INV-PRD-2569-000777', applicationId: 'renewal-app-77', serviceType: 'CERTIFICATION_CHECKOUT_M1', totalAmount: '70620.00', status: 'pending', createdAt: '2026-10-01T03:00:00.000Z' };
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  const u = req.url.replace(/^\/api/, '');
  console.log(new Date().toISOString(), req.method, req.url, 'invoices=' + invoices);
  if (u === '/__invoices/none') { invoices = 'none'; return send(res, 200, { ok: true }); }
  if (u === '/__invoices/with') { invoices = 'with'; return send(res, 200, { ok: true }); }
  if (u.startsWith('/pricing/fees')) return send(res, 200, { success: true, data: fees });
  if (u.startsWith('/system-config/public')) return send(res, 200, { success: true, data: {} });
  if (u.startsWith('/certificates/cert-1')) return send(res, 200, { success: true, data: cert });
  if (u.startsWith('/applications/renewals') && req.method === 'POST') return send(res, 201, { success: true, data: { applicationId: 'renewal-app-77' } });
  if (u.startsWith('/applications/renewal-app-77/quotations')) return send(res, 200, { success: true, data: { dtam: null, platform: quotation } });
  if (u.startsWith('/invoices/my')) return send(res, 200, { success: true, data: invoices === 'with' ? [invoice] : [] });
  send(res, 404, { success: false, error: 'NOT_FOUND' });
}).listen(8787, '127.0.0.1', () => console.log('mock on 8787'));
