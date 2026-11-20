const http = require('http');
let mode = 'ok';
const data = { applicationFee: 6000, inspectionFee: 30000, renewalFee: 40000, renewalTotalPerScope: 42800, renewalChargeCount: 1, currency: 'THB', vatRate: 0.07, phase1TotalPerScope: 6420, phase2TotalPerScope: 32100, lastUpdated: '2026-10-03', validUntil: '2026-12-31' };
http.createServer((req, res) => {
  console.log(new Date().toISOString(), req.method, req.url, 'mode=' + mode);
  if (req.url === '/__mode/down') { mode = 'down'; res.end('down'); return; }
  if (req.url === '/__mode/ok') { mode = 'ok'; res.end('ok'); return; }
  if (req.url.startsWith('/api/pricing/fees')) {
    if (mode === 'down') { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'PRICING_UNAVAILABLE' })); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data })); return;
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"success":false}');
}).listen(8787, '127.0.0.1', () => console.log('mock on 8787'));
