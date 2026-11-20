'use strict';
// Exercises the bumped runtime packages over real sockets. Usage: node runtime-check.cjs <repo-root>
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const assert = require('assert');
const root = path.resolve(process.argv[2]);
const backend = path.join(root, 'apps/backend');
const req = require('module').createRequire(path.join(backend, 'server.js'));
const express = req('express');
const compression = req('compression');
const multer = req('multer');
const sharp = req('sharp');
const axios = req('axios');
const { mountBodyParsers } = req('./middleware/body-parsers');
const { multipartLimits } = req('./shared/multipart-limits');

const app = express();
app.set('trust proxy', 1);
app.use(compression());
mountBodyParsers(app);
const upload = multer({ storage: multer.memoryStorage(), limits: multipartLimits({ fileSize: 1024 * 1024, files: 1, fields: 5 }) });
app.post('/json', (q, r) => r.json({ got: q.body }));
app.get('/big', (q, r) => r.json({ rows: Array.from({ length: 2000 }, (_, i) => ({ i, name: 'แปลงทดสอบ' })) }));
app.get('/ip', (q, r) => r.json({ ip: q.ip }));
app.get('/hop', (q, r) => r.redirect(302, '/ip'));
app.post('/upload', upload.single('photo'), async (q, r, next) => {
  try {
    const out = await sharp(q.file.buffer).resize(64, 64).webp().toBuffer();
    const m = await sharp(out).metadata();
    r.json({ note: q.body.note, inBytes: q.file.size, meta: [m.format, m.width, m.height] });
  } catch (e) { next(e); }
});
app.use((e, q, r, n) => r.status(e.status || 400).json({ err: e.code || e.type || e.message }));

function raw(port, opts, body) {
  return new Promise((ok, no) => {
    const c = http.request({ host: '127.0.0.1', port, ...opts }, (res) => {
      const b = []; res.on('data', (d) => b.push(d)); res.on('end', () => ok({ res, body: Buffer.concat(b) }));
    });
    c.on('error', no); if (body) c.write(body); c.end();
  });
}
function multipart(fields, file) {
  const B = 'gacpboundary';
  const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="photo"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), file, Buffer.from(`\r\n--${B}--\r\n`));
  return { body: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${B}` } };
}

const s = app.listen(0, '127.0.0.1', async () => {
  const port = s.address().port;
  const out = {};
  try {
    const payload = JSON.stringify({ ชื่อ: 'เกษตรกร', n: 1 });
    const j = await raw(port, { method: 'POST', path: '/json', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, payload);
    assert.equal(j.res.statusCode, 200); assert.deepEqual(JSON.parse(j.body).got, { ชื่อ: 'เกษตรกร', n: 1 });
    out.bodyParserJson = j.res.statusCode;

    const bad = await raw(port, { method: 'POST', path: '/json', headers: { 'content-type': 'application/json', 'content-length': 3 } }, '{x}');
    assert.equal(bad.res.statusCode, 400);
    out.bodyParserMalformed = [bad.res.statusCode, JSON.parse(bad.body).err];

    const huge = JSON.stringify({ a: 'x'.repeat(5 * 1024 * 1024) });
    const big = await raw(port, { method: 'POST', path: '/json', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(huge) } }, huge);
    assert.equal(big.res.statusCode, 413);
    out.bodyParserTooLarge = [big.res.statusCode, JSON.parse(big.body).err];

    const z = await raw(port, { method: 'GET', path: '/big', headers: { 'accept-encoding': 'gzip' } });
    assert.equal(z.res.headers['content-encoding'], 'gzip');
    const plain = zlib.gunzipSync(z.body);
    assert.equal(JSON.parse(plain).rows.length, 2000); assert.ok(z.body.length < plain.length / 5);
    const id = await raw(port, { method: 'GET', path: '/big', headers: { 'accept-encoding': 'identity' } });
    assert.equal(id.res.headers['content-encoding'], undefined);
    out.compression = { encoding: 'gzip', identityUncompressed: true, plainBytes: plain.length };

    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#2e7d32' } }).png().toBuffer();
    const m = multipart({ note: 'ภาพแปลง' }, png);
    const u = await raw(port, { method: 'POST', path: '/upload', headers: m.headers }, m.body);
    assert.equal(u.res.statusCode, 200);
    const ub = JSON.parse(u.body);
    assert.equal(ub.note, 'ภาพแปลง'); assert.deepEqual(ub.meta, ['webp', 64, 64]);
    out.multerSharp = ub;

    const tooBig = multipart({ note: 'x' }, Buffer.alloc(2 * 1024 * 1024, 1));
    const t = await raw(port, { method: 'POST', path: '/upload', headers: tooBig.headers }, tooBig.body);
    assert.equal(t.res.statusCode, 400); out.multerFileTooLarge = [t.res.statusCode, JSON.parse(t.body).err];

    const fieldLimit = multipartLimits({ fileSize: 1024, files: 1, fields: 5 }).fieldSize;
    out.multipartFieldSizeLimit = fieldLimit;
    const f = multipart({ note: 'y'.repeat((fieldLimit || 1024 * 1024) + 1) }, png);
    const fr = await raw(port, { method: 'POST', path: '/upload', headers: f.headers }, f.body);
    const frb = JSON.parse(fr.body);
    out.multerFieldOverLimit = [fr.res.statusCode, frb.err || `accepted, note length ${frb.note.length}`];

    const ip = await raw(port, { method: 'GET', path: '/ip', headers: { 'x-forwarded-for': '203.0.113.7' } });
    assert.equal(JSON.parse(ip.body).ip, '203.0.113.7'); out.proxyAddr = JSON.parse(ip.body).ip;

    const hop = await axios.get(`http://127.0.0.1:${port}/hop`);
    assert.equal(hop.status, 200); assert.ok(hop.request.res.responseUrl.endsWith('/ip')); out.followRedirects = 'followed /hop -> /ip';

    console.log(JSON.stringify(out, null, 1)); console.log('RUNTIME-CHECK PASS');
  } catch (e) { console.log(JSON.stringify(out)); console.log('RUNTIME-CHECK FAIL', e.message); process.exitCode = 1; }
  s.close(); s.closeAllConnections();
});
