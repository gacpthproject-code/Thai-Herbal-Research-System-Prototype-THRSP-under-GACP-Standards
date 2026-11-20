'use strict';
// Round-5 security re-review harness. REAL: mfa router, mfa-setup-guard, auth-middleware (authenticateProvider/Any),
// rate-limiter, redis-service, mfa-reenrol-store, token-revocation-service, session-revocation, session-epoch, jwt-security,
// mfaService — against a throwaway Redis 7 container. STUBBED: prisma-database (in-memory user row), identity-service
// (same row), audit-logger (record), tenant/active-entity middleware (pass-through).
// JWT secrets are random per run (generated below), never real keys.
const crypto = require('crypto');
process.env.NODE_ENV = 'development';
process.env.REDIS_URL = 'redis://127.0.0.1:16395';
process.env.PROVIDER_JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.HEALTH_JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_SECRET = process.env.HEALTH_JWT_SECRET;
const path = require('path');
const B = '/home/ubuntu/work/wt-norec/apps/backend';
const Module = require('module');
const r = (p) => require.resolve(path.join(B, p));
function stub(p, exp) { const id = r(p); const m = new Module(id); m.filename = id; m.loaded = true; m.exports = exp; require.cache[id] = m; }

const ROLE = process.argv[2] || 'document_reviewer';
const rows = new Map();
let dbDown = false;
const audit = [];
const pick = (row, sel) => { if (!row) return null; if (!sel) return { ...row }; const o = {}; for (const k of Object.keys(sel)) o[k] = row[k] ?? null; return o; };
const fakePrisma = { user: {
  findUnique: async ({ where, select }) => { if (dbDown) throw new Error('db down (simulated)'); return pick(rows.get(where.id), select); },
  findFirst: async ({ where, select }) => { if (dbDown) throw new Error('db down (simulated)'); return pick(rows.get(where.id), select); },
} };
stub('services/prisma-database', { prisma: fakePrisma });
stub('middleware/tenant-context-middleware', { tenantContextMiddleware: () => (q, s, n) => n() });
stub('middleware/active-entity-middleware', { activeEntityMiddleware: () => (q, s, n) => n() });
stub('services/identity-service', {
  getMfaStatus: async (id) => rows.get(id) ? { twoFactorEnabled: rows.get(id).twoFactorEnabled } : null,
  findMfaSecretForDisable: async (id) => { const x = rows.get(id); return x ? { twoFactorSecret: x.twoFactorSecret, twoFactorEnabled: x.twoFactorEnabled } : null; },
  storePendingTotpSecret: async (id, s) => Object.assign(rows.get(id), { twoFactorSecret: s, twoFactorEnabled: false }),
  findPendingTotpSecret: async (id) => ({ twoFactorSecret: rows.get(id)?.twoFactorSecret }),
  enableMfaWithBackupCodes: async (id, c) => Object.assign(rows.get(id), { twoFactorEnabled: true, twoFactorBackupCodes: c }),
  replaceTotpSecretWithBackupCodes: async (id, s, c, o = {}) => Object.assign(rows.get(id), { twoFactorSecret: s, twoFactorEnabled: true, twoFactorBackupCodes: c, ...(o.sessionsRevokedAt ? { sessionsRevokedAt: o.sessionsRevokedAt } : {}) }),
  disableMfa: async (id) => Object.assign(rows.get(id), { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null }),
  findUserForMfaVerify: async (id) => rows.get(id), updateBackupCodes: async () => {},
});
stub('middleware/audit-logger', { auditLogger: { log: async (e) => { audit.push(e); } }, AuditCategory: { SECURITY: 'SECURITY', AUTHENTICATION: 'AUTHENTICATION' } });

(async () => {
  const redisService = require(r('services/redis-service'));
  await redisService.connect();
  const cfgRedis = require(r('config/redis'));
  if (cfgRedis.status !== 'ready') { await new Promise(res => cfgRedis.once('ready', res)); }
  console.log('redis target:', process.env.REDIS_URL, 'status', cfgRedis.status);
  const express = require(path.join(B, 'node_modules/express'));
  const cookieParser = require(path.join(B, 'node_modules/cookie-parser'));
  const request = require(path.join(B, 'node_modules/supertest'));
  const { mfaService } = require(r('middleware/mfa-service'));
  const jwtConfig = require(r('config/jwt-security'));
  const store = require(r('services/auth/mfa-reenrol-store'));
  const { revokeSessionFromRequest } = require(r('utils/session-revocation'));
  const tokenRev = require(r('services/token-revocation-service'));
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.use('/api/mfa', require(r('routes/api/identity/mfa')));

  const OLD = mfaService.generateSecret();
  rows.set('u1', { id: 'u1', uuid: 'uu-1', email: 'u1@example.test', role: ROLE, status: 'ACTIVE', isDeleted: false,
    providerId: 'P-TEST', twoFactorEnabled: true, twoFactorSecret: OLD, twoFactorBackupCodes: ['old'], sessionsRevokedAt: null });
  // login-shaped provider tokens (payload shape of auth-provider.js:224 / mfa.js /verify)
  const loginPayload = { id: 'u1', uuid: 'uu-1', email: 'u1@example.test', role: ROLE, canonicalRole: ROLE, authType: 'PROVIDER_ID', userType: 'PROVIDER_ID', organizationId: 'org-1' };
  const TA = jwtConfig.generateToken({ ...loginPayload }, 'provider');
  const TB = jwtConfig.generateToken({ ...loginPayload }, 'provider');
  const dA = jwtConfig.verifyToken(TA, 'provider'); const dB = jwtConfig.verifyToken(TB, 'provider');
  console.log(`tokens: A.jti!=B.jti ${dA.jti !== dB.jti} role=${ROLE}`);
  let ipn = 0; const ip = () => { ipn++; return `198.18.${Math.floor(ipn / 250)}.${ipn % 250 + 1}`; }; // 198.18/15: not in the private/trusted-proxy ranges
  const as = (t, tok, fixedIp) => t.set('Cookie', `provider_token=${tok}`).set('x-forwarded-for', fixedIp || ip());
  const out = (label, res, extra = '') => console.log(`${label}: ${res.status} ${res.body.code || ''} ${extra}`);
  const pend = async () => { const v = await cfgRedis.get('mfa:reenrol:u1'); return v ? JSON.parse(v) : null; };
  const intact = () => { const x = rows.get('u1'); return x.twoFactorEnabled && x.twoFactorSecret === OLD && x.twoFactorBackupCodes[0] === 'old'; };
  const wrongFor = (sec, i) => { let g; do { g = String(100000 + ((i * 7919 + Math.floor(Math.random() * 1e5)) % 900000)); } while (mfaService.verifyTOTP(sec, g)); return g; };

  // ── S. session A starts the re-enrol
  const s1 = await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
  const P1 = s1.body.data && s1.body.data.secret;
  const e1 = await pend();
  out('S1 A /setup right code', s1, `pending=${!!P1} entry.session==A.jti ${e1 && e1.session === dA.jti} failures=${e1 && e1.failures} ttl=${await cfgRedis.ttl('mfa:reenrol:u1')}`);

  // ── X. different session B of the same user: refused even with a VALID pending code
  const x1 = await as(request(app).post('/api/mfa/verify-setup'), TB).send({ code: mfaService.generateTOTP(P1) });
  out('X1 B verify-setup VALID pending code', x1, `backupCodes=${Array.isArray(x1.body.data?.backupCodes)} intact=${intact()} pending=${!!(await pend())}`);
  let sx = {};
  for (let i = 0; i < 40; i++) { const x = await as(request(app).post('/api/mfa/verify-setup'), TB).send({ code: wrongFor(P1, i) }); const k = `${x.status}${x.body.code ? ':' + x.body.code : ''}`; sx[k] = (sx[k] || 0) + 1; }
  console.log(`X2 B 40 wrong guesses, fresh IP each: ${JSON.stringify(sx)} failures-after=${(await pend())?.failures} intact=${intact()}`);

  // ── D. the round-3/4 repro: 40 wrong guesses from the SAME session A, one IP
  let sd = []; const IPD = '203.0.113.7';
  for (let i = 0; i < 40; i++) { const x = await as(request(app).post('/api/mfa/verify-setup'), TA, IPD).send({ code: wrongFor(P1, i) }); sd.push(`${x.status}${x.body.code ? ':' + x.body.code : ''}`); }
  const agg = sd.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
  console.log(`D1 A 40 wrong guesses one IP: seq[0..6]=${sd.slice(0, 7).join(',')} totals=${JSON.stringify(agg)} pending-after=${!!(await pend())} intact=${intact()}`);
  const d2 = await as(request(app).post('/api/mfa/verify-setup'), TA).send({ code: mfaService.generateTOTP(P1) });
  out('D2 A then VALID P1 code (fresh IP)', d2, `backupCodes=${Array.isArray(d2.body.data?.backupCodes)} intact=${intact()}`);
  // D3: same session, IP rotation, sequential: 5-wrong delete must still stop it
  const s2 = await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
  const P2 = s2.body.data && s2.body.data.secret;
  let sd3 = [];
  for (let i = 0; i < 12; i++) { const x = await as(request(app).post('/api/mfa/verify-setup'), TA).send({ code: wrongFor(P2, i) }); sd3.push(`${x.status}${x.body.code ? ':' + x.body.code : ''}`); }
  console.log(`D3 A 12 wrong sequential, fresh IP each: ${sd3.join(',')} pending-after=${!!(await pend())}`);

  // ── R. race: parallel wrong codes from distinct IPs (same session A)
  for (const k of [5, 20, 50]) {
    const s3 = await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
    const P3 = s3.body.data && s3.body.data.secret;
    let accepted = 0, rounds = 0; const seen = {};
    while (await pend() && rounds < 20) {
      rounds++;
      const rs = await Promise.all(Array.from({ length: k }, (_, i) => as(request(app).post('/api/mfa/verify-setup'), TA).send({ code: wrongFor(P3, i) })));
      for (const x of rs) { const key = `${x.status}${x.body.code ? ':' + x.body.code : ''}`; seen[key] = (seen[key] || 0) + 1; if (x.status === 400 && x.body.code !== 'MFA_REENROL_NOT_FOUND') accepted++; }
    }
    console.log(`R k=${k} parallel/round: rounds-until-entry-gone=${rounds} wrong-codes-actually-checked=${seen['400'] || 0}+${seen['400:MFA_REENROL_RESTART'] || 0}restart totals=${JSON.stringify(seen)}`);
  }
  // R2: resurrection after an explicit clear (clear races a failure write)
  {
    const s4 = await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
    const P4 = s4.body.data && s4.body.data.secret;
    let resurrected = 0;
    for (let t = 0; t < 30; t++) {
      if (!(await pend())) { await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) }); }
      await cfgRedis.set('mfa:reenrol:u1', JSON.stringify({ ...(await pend()), failures: 0 }), 'EX', 500);
      const reqs = Array.from({ length: 3 }, (_, i) => as(request(app).post('/api/mfa/verify-setup'), TA).send({ code: wrongFor(P4, i) }).then(() => null));
      const clr = new Promise(res => setTimeout(res, 3)).then(() => store.clear('u1', 'harness-race'));
      await Promise.all([...reqs, clr]);
      if (await pend()) resurrected++;
    }
    console.log(`R2 30 trials: clear() racing 3 in-flight wrong codes -> entry present AFTER clear in ${resurrected}/30`);
  }

  // ── C. clears: /disable, revoke-all, logout
  {
    await cfgRedis.flushall();
    await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
    const before = !!(await pend());
    await tokenRev.revokeAllUserTokens('u1');
    console.log(`C1 revokeAllUserTokens: pending before=${before} after=${!!(await pend())}`);
    await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
    const b2 = !!(await pend());
    await revokeSessionFromRequest({ cookies: { provider_token: TB }, headers: {}, body: {} }, 'provider');
    console.log(`C2 logout of session B (a different session): pending before=${b2} after=${!!(await pend())}`);
    await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
    const b3 = !!(await pend());
    // /disable with current code from A (TB is now blocklisted by C2's logout)
    const dz = await as(request(app).delete('/api/mfa/disable'), TA).send({ code: mfaService.generateTOTP(OLD) });
    out('C3 /disable', dz, `pending before=${b3} after=${!!(await pend())}`);
    Object.assign(rows.get('u1'), { twoFactorEnabled: true, twoFactorSecret: OLD, twoFactorBackupCodes: ['old'] });
  }

  // ── T. success + fresh cookie
  {
    await cfgRedis.flushall(); // limiter buckets too
    const TC = jwtConfig.generateToken({ ...loginPayload }, 'provider'); // session C (another device, still valid)
    await new Promise(res => setTimeout(res, 1100)); // make sure TA/TC iat < next stamp
    const st0 = await as(request(app).get('/api/mfa/status'), TA);
    out('T0 A /status before', st0);
    const s5 = await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(OLD) });
    const P5 = s5.body.data.secret;
    const v = await as(request(app).post('/api/mfa/verify-setup'), TA).send({ code: mfaService.generateTOTP(P5) });
    const setCookie = (v.headers['set-cookie'] || []).find(c => c.startsWith('provider_token='));
    const fresh = setCookie && decodeURIComponent(setCookie.split(';')[0].slice('provider_token='.length));
    const dF = fresh && jwtConfig.verifyToken(fresh, 'provider');
    const dAold = jwtConfig.verifyToken(TA, 'provider');
    const strip = (d) => { const { iat, exp, jti, ...rest } = d; return rest; };
    const row = rows.get('u1');
    out('T1 A verify-setup VALID', v, `backupCodes=${v.body.data?.backupCodes?.length} secret-now-P5=${row.twoFactorSecret === P5} sessionsRevokedAt=${row.sessionsRevokedAt && row.sessionsRevokedAt.toISOString()} pending-cleared=${!(await pend())}`);
    console.log(`T2 fresh cookie: present=${!!fresh} body.token==cookie ${v.body.data?.token === fresh} flags=${setCookie && setCookie.split(';').slice(1).map(s => s.trim()).join('|')}`);
    console.log(`T3 claims equal (minus iat/exp/jti): ${JSON.stringify(strip(dF)) === JSON.stringify(strip(dAold))} fresh=${JSON.stringify(Object.keys(dF).sort())} old=${JSON.stringify(Object.keys(dAold).sort())}`);
    console.log(`T4 fresh.iat*1000==stamp ${dF.iat * 1000 === row.sessionsRevokedAt.getTime()} fresh.jti!=old.jti ${dF.jti !== dAold.jti} fresh.exp-iat=${dF.exp - dF.iat}s old.exp-iat=${dAold.exp - dAold.iat}s`);
    out('T5 OLD token A (cookie) /status', await as(request(app).get('/api/mfa/status'), TA));
    out('T6 OLD token A (Bearer, no cookie) /status', await request(app).get('/api/mfa/status').set('Authorization', `Bearer ${TA}`).set('x-forwarded-for', ip()));
    out('T7 other session C /status', await as(request(app).get('/api/mfa/status'), TC));
    out('T8 fresh token /status', await as(request(app).get('/api/mfa/status'), fresh));
    out('T9 OLD token A -> /setup (privileged door)', await as(request(app).post('/api/mfa/setup'), TA).send({ code: mfaService.generateTOTP(P5) }));
    dbDown = true;
    out('T10 OLD token A /status while DB lookup fails', await as(request(app).get('/api/mfa/status'), TA));
    dbDown = false;
    const blk = await cfgRedis.get(`auth:blocklist:${dAold.jti}`) || await cfgRedis.keys(`*${dAold.jti}*`);
    console.log(`T11 old jti in any redis key: ${JSON.stringify(blk)}`);
  }

  // ── G. Redis down
  {
    await cfgRedis.flushall();
    Object.assign(rows.get('u1'), { twoFactorEnabled: true, twoFactorSecret: OLD, twoFactorBackupCodes: ['old'], sessionsRevokedAt: null });
    const TD = jwtConfig.generateToken({ ...loginPayload }, 'provider');
    const s6 = await as(request(app).post('/api/mfa/setup'), TD).send({ code: mfaService.generateTOTP(OLD) });
    const P6 = s6.body.data.secret;
    // mid-flow: read succeeds, failure-count write fails
    const orig = redisService.setStrict;
    redisService.setStrict = async () => { throw new redisService.RedisUnavailableError('simulated write failure'); };
    const g0 = await as(request(app).post('/api/mfa/verify-setup'), TD).send({ code: wrongFor(P6, 1) });
    redisService.setStrict = orig;
    out('G0 wrong code, count-write fails', g0, `intact=${intact()} failures-now=${(await pend())?.failures}`);
    const before = JSON.stringify(rows.get('u1'));
    await redisService.client.disconnect(); await new Promise(r2 => setTimeout(r2, 300));
    out('G1 /setup Redis down (right code)', await as(request(app).post('/api/mfa/setup'), TD).send({ code: mfaService.generateTOTP(OLD) }), `row-unchanged=${before === JSON.stringify(rows.get('u1'))}`);
    out('G2 verify-setup Redis down (valid P6 code)', await as(request(app).post('/api/mfa/verify-setup'), TD).send({ code: mfaService.generateTOTP(P6) }), `row-unchanged=${before === JSON.stringify(rows.get('u1'))}`);
    out('G3 verify-setup Redis down (wrong code)', await as(request(app).post('/api/mfa/verify-setup'), TD).send({ code: wrongFor(P6, 2) }), `row-unchanged=${before === JSON.stringify(rows.get('u1'))}`);
    let gl = {};
    for (let i = 0; i < 8; i++) { const x = await as(request(app).post('/api/mfa/verify-setup'), TD, '203.0.113.9').send({ code: wrongFor(P6, i) }); gl[x.status] = (gl[x.status] || 0) + 1; }
    console.log(`G4 Redis down, 8 from one IP (limiter memory fallback): ${JSON.stringify(gl)}`);
  }
  console.log('audit actions:', [...new Set(audit.map(a => a.action))].join(','), '| metadata key named secret/code/backup/token:', audit.some(a => a.metadata && Object.keys(a.metadata).some(k => /secret|^code$|backup|token/i.test(k))));
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
