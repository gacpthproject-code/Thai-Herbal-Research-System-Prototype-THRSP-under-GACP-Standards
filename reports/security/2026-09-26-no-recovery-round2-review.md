## Security re-review — fix/no-recovery round 2 (staff password doors) — 2026-09-26
Range e54eeaa9..34e5cef1 (worktree /home/ubuntu/work/wt-norec) · Tier C (auth) · read-only · prior: 2026-09-26-no-recovery-review.md
Verdict: **APPROVE round 2 — no veto.** The ruled door is shut; the new door is own-account only. One pre-existing MFA-reset door is for the operator to decide (below).

Did (run in this session, artifacts in 2026-09-26-no-recovery-round2-review-artifacts/):
- jest staff-password-doors + provider-directory-hardening, fresh SIGNING_KEY_DIR in scratchpad: 2 suites, 92/92 pass (jest-round2.out).
- Limiter brute-force repro using the real `changePasswordLimiter` block text lifted from server.js + real client-ip (limiter-bruteforce.js/.out).
- Prisma validation of both MFA-reset payloads against a throwaway empty postgres:15 container (prisma-field-check.js/.out).
- gitleaks over e54eeaa9..34e5cef1: no leaks. Pattern grep of the diff (sk_/whsec_/JWT/PEM/DB URL/HMAC_KEY): 0.

(1) Can one account still set another's password? No path found.
- Every `password` write in runtime code, by grep: create-only (provider-user-service.js:137, platform-admin/organizations.js:399+433, both dup-guarded by unique hash), own change (password-management.js:50-59), e2e harness (create, non-prod). The directory PUT no longer hashes anything (provider.js PUT hunk).
- PUT/PATCH destructure an explicit field list: `passwordHash`, `newPassword`, `Password`, `pass`, nested `data.password` are never read or written. `password` of any non-empty type (string, object, array, 0, false) is refused (400) before the target lookup (rejectPasswordWrite, provider.js:120-135, :396-399, :548-551). A form body behaves the same.
- admin/users.js has no password write (the create handler goes through createProviderUser, the rest write role/status/MFA only). organizations.js PATCH /:id writes the organization row, not users.

(2) POST /auth/provider/change-password (auth-provider.js:490)
- authenticateProvider (provider JWT secret, provider role, epoch, inactive checks). req.user.id only. zod strips a body `userId` (test "a userId in the body is ignored").
- Same function as the health door: bcrypt.compare → validatePasswordStrength (the same policy as passwordField) → one update that sets the hash and sessionsRevokedAt, then revokeAllUserTokens (password-management.js:31-70).
- The current session is revoked too: the stamp is ceil(now)+1 s and every older iat is refused (session-epoch.js). The web card calls logout and goes to /auth/provider/login, so what the user sees matches the server.
- Audit: logAuth PASSWORD_CHANGE / PROVIDER / SUCCESS / ip / ua. No password material. Failed attempts are not audited; that is the same on the health door.
- Limiter repro: 10×400 then 429. After the cap the correct password also gets 429. The CHANGE-PASSWORD casing, /api/v1 and the health door share the same per-IP count. A second IP with the same session gets another 10. Successful changes are not counted.

(3) The directory is staff only
- findMutationTarget requires `providerId not null`, the caller's org (except PLATFORM_ADMIN), and isStaffAccount (not role health). A farmer, a health role with a providerId, or a staff member of another org gets 404 (tests pass).
- unlock and disable-2fa still use loadProviderTarget (providerId + org, no role check). A providerId row with role health cannot be produced through toRoleValue or the admin role-change door, so the gap is theoretical.

(4) Nothing legitimate broke: staff creation keeps its password (strength policy in createProviderUser). The health change-password route is unchanged apart from the shared limiter. An officer edit without a password passes (test "control: PATCH a staff member… still works"; "empty password string is no password").

(5) Was officer edit already broken on main? **Confirmed from the code** (I did not press it against a live backend). At e54eeaa9, page.tsx:196 sets `providerId: ''` in edit mode and :229 PUTs the raw formData. JSON.stringify keeps "". rejectProviderIdEdit compares '' with the target's 13-digit ID, so every UI edit of an officer failed with 400 PROVIDER_ID_EDIT_FORBIDDEN and wrote nothing.

Findings
- MEDIUM, pre-existing, outside the diff (operator decision): two admin "clear someone else's 2FA" doors exist:
  a) POST /api/admin/users/:id/force-reset-mfa (admin/users.js:598; admin-user-service.js:485-520). Caller: SYSTEM_ADMIN_DTAM only. Target: any non-deleted user in the caller's org, any role (farmers and other admins), not self. Needs a reason of 10+ characters. It would clear twoFactorEnabled/Secret, but it also writes `twoFactorRecoveryCodes`, which is not a User column, so Prisma refuses the whole write: **the door is dead and always answers 400** (PrismaClientValidationError, prisma-field-check.out). Its unit test mocks updateAdminUser and stays green. The audit row USER_FORCE_MFA_RESET is written only after success, so it is never written. The raw Prisma message is returned to the client. The admin UI calls it (ForceMfaResetModal on app/admin/users).
  b) POST /api/provider/directory/:id/disable-2fa (provider.js:815) — **this one works** (payload valid, prisma-field-check.out). It is shown on /provider/management. Caller: SYSTEM_ADMIN_DTAM (same org) or PLATFORM_ADMIN (any org). Target: any account with a providerId, own account included. No reason is required, and sessions are not revoked. It writes the audit row PROVIDER_USER_2FA_DISABLED (national ID masked by the audit logger).
  Both are staff-issued second-factor recovery. The password stays required.
- LOW: the change-password limiter is keyed by IP only (the limiter runs before auth). Unlike login (5 failures lock the account), a stolen session can guess the old password 10 times per 15 min per IP with no account lockout and no audit of failures. Suggest counting failures per account (req.user.id) or reusing the login lockout counter.
- INFO: the limiter pin in staff-password-doors.test.js:360-375 only reads server.js text. My limiter-bruteforce.out is the behavioural proof. The test's `not` matcher treats undefined ≠ null, so the in-memory DB does not model `providerId: {not: null}`; the isStaffAccount check catches it anyway.
