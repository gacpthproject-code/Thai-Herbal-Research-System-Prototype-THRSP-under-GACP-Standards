'use strict';

const { check, WALK_ROLES } = require('../lib/context');

const STAFF_ROLES = WALK_ROLES.filter((r) => r !== 'applicant');

const { PERMISSIONS, hasPermission } = require('../../../apps/backend/shared/canonical-rbac');

const CANONICAL_ROLE = { applicant: 'health', dispatcher: 'dispatcher', reviewer: 'document_reviewer', inspector: 'field_inspector', approver: 'certificate_approver', finplat: 'finance_officer_platform' };
const RIGHTS = [
    { door: '/api/invoices', allowed: (role) => role !== 'anon' && hasPermission(CANONICAL_ROLE[role], PERMISSIONS.INVOICE_VIEW_ALL) },
    { door: '/api/admin/users', allowed: () => false },
];

module.exports = {
    id: 'accounts',
    title: 'บัญชีและสิทธิ์: เข้าระบบ · 2FA เจ้าหน้าที่ · สิทธิ์ตามบทบาท · ไม่รั่วข้ามองค์กร',
    async run(ctx) {
        const checks = [];
        checks.push(await check('credentials', 'รหัสผ่านทุกบัญชีเดินตรวจตรง hash และไม่ถูกล็อก (ตรวจก่อนล็อกอิน)', async () => {
            if (!Object.keys(ctx.accounts).length) { return ctx.passIfAccounts(WALK_ROLES, ''); }
            const cc = await ctx.checkPasswordsBeforeLogin();
            const bad = Object.values(cc).filter((r) => !r.found || !r.passwordMatches || r.locked || !r.active)
                .map((r) => `${r.role}:${!r.found ? 'ไม่พบ' : !r.passwordMatches ? 'รหัสไม่ตรง' : r.locked ? 'ล็อก' : 'ถือ session ไม่ได้'}`);
            return bad.length ? ctx.fail(bad.join(' ')) : ctx.passIfAccounts(WALK_ROLES, `${Object.keys(cc).length} บัญชีตรงทั้งหมด`);
        }));
        checks.push(await check('login-applicant', 'ผู้ยื่นเข้าระบบผ่านหน้า /auth/health/login', async () => {
            const s = await ctx.signIn('applicant');
            return s.ok ? ctx.pass(`ลงที่ ${s.landing ?? '(ใช้ session เดิม)'}`) : ctx.fail(s.reason);
        }));
        checks.push(await check('staff-2fa', 'เจ้าหน้าที่ทุกบทบาทของเส้นทางถูกถาม 2FA และผ่านด้วยรหัส TOTP', async () => {
            const res = [];
            for (const role of STAFF_ROLES.filter((r) => ctx.accounts[r])) {
                const s = await ctx.signIn(role);
                res.push([role, s.ok && s.mfaChallenged !== false, s.ok ? `${s.mfaChallenged ? '2FA' : 'ไม่ถูกถาม 2FA'}→${s.landing}` : s.reason]);
            }
            const bad = res.filter(([, ok]) => !ok);
            const detail = res.map(([r, , d]) => `${r} ${d}`).join(' · ');
            return bad.length ? ctx.fail(detail) : ctx.passIfAccounts(STAFF_ROLES, detail);
        }));
        checks.push(await check('role-rights', 'ประตูที่จำกัดบทบาทตอบตามตาราง canonical-rbac', async () => {
            if (!Object.keys(ctx.accounts).length) { return ctx.passIfAccounts(WALK_ROLES, ''); }
            const d = await ctx.driver();
            const wrong = []; const seen = [];
            for (const { door, allowed } of RIGHTS) {
                for (const role of ['anon', ...WALK_ROLES.filter((r) => d.signedIn.has(r))]) {
                    const r = await d.api(role, 'GET', door);
                    const ok = allowed(role) ? r.status === 200 : [401, 403].includes(r.status);
                    seen.push(`${door} ${role}=${r.status}`);
                    if (!ok) { wrong.push(`${door} ${role}=${r.status} (คาด ${allowed(role) ? '200' : '401/403'})`); }
                }
            }
            return wrong.length ? ctx.fail(wrong.join(' · ')) : ctx.passIfAccounts(WALK_ROLES, seen.join(' · '));
        }));
        checks.push(await check('cross-org', 'ผู้ยื่นเปิดคำขอของผู้ถือรายอื่นไม่ได้', async () => {
            if (!(await ctx.signIn('applicant')).ok) { return ctx.fail('ผู้ยื่นล็อกอินไม่ได้'); }
            const d = await ctx.driver();
            const mine = await d.api('applicant', 'GET', '/api/applications/my');
            const list = mine.body?.data?.applications || mine.body?.data || [];
            const own = Array.isArray(list) ? list[0] : null;
            if (!own?.id) { return ctx.notYet(`ผู้ยื่นยังไม่มีคำขอให้ใช้เป็นจุดอ้างอิง (GET /api/applications/my ${mine.status})`); }
            const other = await ctx.inContainer('other-org-application', { applicationId: own.id });
            if (!other.found) { return ctx.notYet('บนเครื่องนี้ไม่มีคำขอของผู้ถือรายอื่นให้ลอง'); }
            const r = await d.api('applicant', 'GET', `/api/applications/${other.id}`);
            const refused = [403, 404].includes(r.status) && !String(r.text).includes(other.number);
            const scope = other.sameOrganization ? 'องค์กรเดียวกัน ผู้ถือต่างกัน' : 'ต่างองค์กร';
            return refused ? ctx.pass(`ตอบ ${r.status} ไม่มีเลขคำขอในคำตอบ (${scope})`) : ctx.fail(`ตอบ ${r.status} คาด 403/404 ที่ไม่มีเลขคำขอ (${scope})`);
        }));
        return checks;
    },
};
