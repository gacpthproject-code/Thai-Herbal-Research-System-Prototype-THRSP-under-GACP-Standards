'use strict';
const path = require('path'); const Module = require('module');
const B = '/home/ubuntu/work/wt-norec/apps/backend';
const bcrypt = require(path.join(B, 'node_modules/bcryptjs'));
const row = { id: 'u1', password: bcrypt.hashSync('Right-Pass-123!', 4), loginAttempts: 5, isLocked: true, lockedUntil: new Date(Date.now() + 10 * 60000) };
const writes = [];
const id = require.resolve(path.join(B, 'services/prisma-database'));
const m = new Module(id); m.loaded = true; m.exports = { prisma: { user: {
  findUnique: async () => ({ ...row }), update: async (a) => { writes.push(a.data); Object.assign(row, a.data); return row; } } } };
require.cache[id] = m;
const tr = require.resolve(path.join(B, 'services/token-revocation-service'));
const m2 = new Module(tr); m2.loaded = true; m2.exports = { revokeAllUserTokens: async () => {} }; require.cache[tr] = m2;
const pm = require(path.join(B, 'services/auth/password-management'));
(async () => {
  // Lock set by the LOGIN door (5 wrong sign-ins by anyone). Owner, logged in, tries to rotate with the RIGHT password.
  try { await pm.changePassword('u1', 'Right-Pass-123!', 'New-Strong-Pass-456!'); console.log('LOCKED+right-password: changed=true'); }
  catch (e) { console.log(`LOCKED+right-password: refused code=${e.code} writes=${writes.length}`); }
  // control: lock expired -> right password changes and clears lock
  row.lockedUntil = new Date(Date.now() - 1000);
  try { await pm.changePassword('u1', 'Right-Pass-123!', 'New-Strong-Pass-456!'); console.log(`EXPIRED+right-password: changed=true lockCleared=${row.isLocked === false && row.loginAttempts === 0}`); }
  catch (e) { console.log(`EXPIRED+right-password: refused code=${e.code}`); }
  process.exit(0);
})();
