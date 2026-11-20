'use strict';
// Real mfa router + real redis-service + real rate-limiter + real mfaService, against a throwaway Redis.
// Stubbed: identity-service (in-memory row), auth-middleware (header -> user), audit-logger (record).
const path = require('path');
const B = '/home/ubuntu/work/wt-norec/apps/backend';
const Module = require('module');
const r = (p) => require.resolve(path.join(B, p));
function stub(p, exp) { const id = r(p); const m = new Module(id); m.filename = id; m.loaded = true; m.exports = exp; require.cache[id] = m; }

const rows = new Map();
const audit = [];
stub('services/identity-service', {
  getMfaStatus: async (id) => rows.get(id) ? { twoFactorEnabled: rows.get(id).twoFactorEnabled } : null,
  findMfaSecretForDisable: async (id) => { const x = rows.get(id); return x ? { twoFactorSecret: x.twoFactorSecret, twoFactorEnabled: x.twoFactorEnabled } : null; },
  storePendingTotpSecret: async (id, s) => Object.assign(rows.get(id), { twoFactorSecret: s, twoFactorEnabled: false }),
  findPendingTotpSecret: async (id) => ({ twoFactorSecret: rows.get(id)?.twoFactorSecret }),
  enableMfaWithBackupCodes: async (id, c) => Object.assign(rows.get(id), { twoFactorEnabled: true, twoFactorBackupCodes: c }),
  replaceTotpSecretWithBackupCodes: async (id, s, c) => Object.assign(rows.get(id), { twoFactorSecret: s, twoFactorEnabled: true, twoFactorBackupCodes: c }),
  disableMfa: async (id) => Object.assign(rows.get(id), { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null }),
  findUserForMfaVerify: async (id) => rows.get(id), updateBackupCodes: async () => {}, 
});
const fromHeaders = (req, res, next) => { const id = req.headers['x-test-user-id']; if (!id) return res.status(401).json({}); req.user = { id, role: 'document_reviewer', email: id + '@example.test' }; next(); };
stub('middleware/auth-middleware', { authenticateProvider: fromHeaders, authenticateAny: fromHeaders });
stub('middleware/audit-logger', { auditLogger: { log: async (e) => { audit.push(e); } }, AuditCategory: { SECURITY: 'SECURITY', AUTHENTICATION: 'AUTHENTICATION' } });

(async () => {
  const redisService = require(r('services/redis-service'));
  await redisService.connect();
  const cfgRedis = require(r('config/redis'));
  if (cfgRedis.status !== 'ready') { await new Promise(res => cfgRedis.once('ready', res)); }
  const express = require(path.join(B, 'node_modules/express'));
  const request = require(path.join(B, 'node_modules/supertest'));
  const { mfaService } = require(r('middleware/mfa-service'));
  const app = express(); app.use(express.json()); app.use('/api/mfa', require(r('routes/api/identity/mfa')));
  const OLD = mfaService.generateSecret();
  rows.set('u1', { id: 'u1', twoFactorEnabled: true, twoFactorSecret: OLD, twoFactorBackupCodes: ['old'] });
  const as = (t) => t.set('x-test-user-id', 'u1');
  const out = (label, res, extra = '') => console.log(`${label}: ${res.status} ${res.body.code || ''} ${extra}`);
  const intact = () => { const x = rows.get('u1'); return x.twoFactorEnabled && x.twoFactorSecret === OLD && x.twoFactorBackupCodes[0] === 'old'; };

  // A. no code / wrong code -> 401, row intact, no pending
  out('A1 setup no code', await as(request(app).post('/api/mfa/setup').send({})), `intact=${intact()}`);
  out('A2 setup wrong code', await as(request(app).post('/api/mfa/setup').send({ code: '000000' })), `intact=${intact()}`);
  out('A3 setup code as array', await as(request(app).post('/api/mfa/setup').send({ code: ['1','2','3','4','5','6'] })), `intact=${intact()}`);
  out('A4 verify-setup w/o pending', await as(request(app).post('/api/mfa/verify-setup').send({ code: mfaService.generateTOTP ? mfaService.generateTOTP(OLD) : '123456' })), `intact=${intact()}`);
  // B. owner starts re-enrol with the current code
  const cur = mfaService.generateTOTP(OLD);
  const s = await as(request(app).post('/api/mfa/setup').send({ code: cur }));
  const P = s.body.data && s.body.data.secret;
  out('B1 setup right code', s, `pending-issued=${!!P} intact=${intact()}`);
  const ttl = await cfgRedis.ttl('mfa:reenrol:u1');
  console.log(`B2 real redis pending key ttl=${ttl}s`);
  // C. old secret's code cannot finalize the new one
  out('C1 verify-setup with OLD code', await as(request(app).post('/api/mfa/verify-setup').send({ code: mfaService.generateTOTP(OLD) })), `intact=${intact()}`);
  // D. unlimited guessing on verify-setup (a second session of the same user, no code)
  let st = {};
  for (let i = 0; i < 40; i++) { const g = String(100000 + i); if (mfaService.verifyTOTP(P, g)) continue; const x = await as(request(app).post('/api/mfa/verify-setup').send({ code: g })); st[x.status] = (st[x.status] || 0) + 1; }
  console.log(`D1 40 wrong verify-setup guesses from one IP: ${JSON.stringify(st)} pending-still-there=${!!(await cfgRedis.get('mfa:reenrol:u1'))} intact=${intact()}`);
  // control: /setup with a code IS limited after 5 per IP
  let st2 = {};
  for (let i = 0; i < 8; i++) { const x = await as(request(app).post('/api/mfa/setup').send({ code: '000000' })); st2[x.status] = (st2[x.status] || 0) + 1; }
  console.log(`D2 control: 8 wrong /setup codes from one IP: ${JSON.stringify(st2)}`);
  // E. the "lucky guess" from the stolen session: any code of P completes and returns backup codes to that caller
  const v = await as(request(app).post('/api/mfa/verify-setup').send({ code: mfaService.generateTOTP(P) }));
  out('E1 verify-setup with P code', v, `backupCodes-returned=${Array.isArray(v.body.data?.backupCodes) ? v.body.data.backupCodes.length : 0} secret-now-P=${rows.get('u1').twoFactorSecret === P} pending-cleared=${!(await cfgRedis.get('mfa:reenrol:u1'))}`);
  // F. replay after success: pending gone -> 400
  out('F1 replay verify-setup', await as(request(app).post('/api/mfa/verify-setup').send({ code: mfaService.generateTOTP(P) })));
  // G. redis down -> 503, nothing changed
  const before = JSON.stringify(rows.get('u1'));
  await cfgRedis.flushall(); await redisService.client.disconnect(); await new Promise(r2 => setTimeout(r2, 200));
  out('G1 setup redis down (right code)', await as(request(app).post('/api/mfa/setup').set('x-forwarded-for','10.9.9.9').send({ code: mfaService.generateTOTP(P) })), `unchanged=${before === JSON.stringify(rows.get('u1'))}`);
  out('G2 verify-setup redis down', await as(request(app).post('/api/mfa/verify-setup').send({ code: mfaService.generateTOTP(P) })), `unchanged=${before === JSON.stringify(rows.get('u1'))}`);
  console.log('audit actions:', [...new Set(audit.map(a => a.action))].join(','), '| any metadata key named secret/code:', audit.some(a => a.metadata && Object.keys(a.metadata).some(k => /secret|^code$|backup/i.test(k))));
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
