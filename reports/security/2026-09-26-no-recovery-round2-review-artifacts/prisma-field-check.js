const { PrismaClient } = require('/home/ubuntu/work/wt-norec/apps/backend/node_modules/@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: process.env.SCRATCH_PG_URL /* throwaway empty postgres:15-alpine container on 127.0.0.1 */ } } });
async function tryIt(label, data) {
  try { await p.user.update({ where: { id: 'x' }, data, select: { id: true } }); console.log(label, 'NO ERROR'); }
  catch (e) { console.log(label, '->', e.constructor.name, '|', String(e.message).split('\n').filter(l => /Unknown argument|Can't reach|does not exist|twoFactor/.test(l)).join(' / ').slice(0, 300)); }
}
(async () => {
  await tryIt('force-reset-mfa payload (admin-user-service.js:509-514)', { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: null, updatedBy: null });
  await tryIt('disable-2fa payload (admin-user-actions-helpers)', { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null, updatedBy: null, updatedAt: new Date() });
  await p.$disconnect().catch(() => {});
})();
