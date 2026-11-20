// Serves the REAL backend payload (routes/api/finance/pricing.js defaultFeesPayload) on /api/pricing/fees.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@127.0.0.1:1/x';
const http = require('http');
const pricing = require('/home/ubuntu/work/wt-feelines/apps/backend/routes/api/finance/pricing.js');
let mode = 'ok';
http.createServer((req, res) => {
  if (req.url === '/__mode/down') { mode = 'down'; res.end('down'); return; }
  if (req.url === '/__mode/ok') { mode = 'ok'; res.end('ok'); return; }
  if (req.url.startsWith('/api/pricing/fees')) {
    if (mode === 'down') { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"success":false,"error":"PRICING_UNAVAILABLE"}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data: pricing.defaultFeesPayload() })); return;
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"success":false}');
}).listen(8788, '127.0.0.1', () => console.log('mock on 8788'));
