## Security review: fix/no-recovery (8d64a877 + f9e66a2a on 9ce3db30), 2026-09-26
Status: PENDING (Tier C, operator merge. Verdict: no veto. The removal is correct. Merge is held on two conditions below.)
Artifacts: reports/security/2026-09-26-no-recovery-review-artifacts/ (probe test, run log, suite summary, gitleaks range)

### (1) Is every reset/recovery path gone? Yes, for the token path.
- Removed: POST /provider/directory/:id/force-password-reset, POST /auth/health/reset-password/:token, resetPasswordWithToken (service + wrapper), resetPasswordWithTokenSchema, passwordResetLimiter + its mount (server.js), the 3 builders, the web button/dialog/token modal, the openapi path. A grep over backend/web/openapi prod code finds no live reset/forgot/force-password/temporaryPassword handler. The residual passwordResetToken refs are erasure/null-out and a response strip only.
- Mobile: apps/mobile-app/lib/generated/api/auth_health/lib/api/authentication_api.dart:190 still has resetPasswordWithHttpInfo. It has no caller outside generated/, and the backend route is gone (it would 404). LOW: stale until regenerated.
- Branch suites: 6 files, 126/126 PASS (auth-service, audit-fixes, no-self-service, reset-routes-behaviour, directory-hardening, session-epoch). admin-user-actions-helpers: 10/10.

### (2) Did anything legitimate break? No.
- POST /auth/health/change-password (old+new) is still mounted (auth-health.js:169), and changePassword is unchanged.
- The "FIRST-TIME set" in health-auth-profile-handlers.js:442-491 is the EMAIL first-time set, not a password set. The file is untouched. ThaiD auto-provision sets a random password in non-production only (thaid-identity-service.js:297).
- Staff creation is untouched: POST /provider/directory, POST /admin/users/provider → createProviderUser (strength enforced), and POST /platform-admin/organizations/:id/users.

### (3) Conflict resolution in notifications-inapp-only.md: correct.
- Main's sentence "token รีเซ็ตออกโดยเจ้าหน้าที่เท่านั้น" was dropped, and a "ไม่มีการกู้บัญชี" bullet was added naming both removed routes. Nothing from main's structure was lost.

### Findings
- HIGH (pre-existing, open) PUT /api/provider/directory/:id writes `password` onto an existing account (provider.js:549-551). This is a "มีแต่ไม่คุ้มครอง" case: the new docs say "Staff cannot reset a password", and USER-MANUAL says "ไม่มีขั้นตอนให้เจ้าหน้าที่ตั้งรหัสผ่านใหม่ให้", yet the door exists and every sweep test is green. Probe results (put-password.probe-run.txt, 13/13):
  - Who can call it: authenticateProvider + resolveDirectoryManager, i.e. system_admin_dtam or system_admin_platform. document_reviewer, field_inspector, dispatcher and health get 403 (A7).
  - Tenant scope: org-scoped, so a cross-org dtam admin gets 404 (A8). Platform admin bypasses the scope and reaches every org (A5).
  - The target need NOT be staff. findMutationTarget has no providerId check, so a farmer in the same org is writable (A4). Control: unlock on the same farmer returns 400 (A4c). Per prisma-auth-service.js:186-205, farmers land in the `default` org, and seeded staff are there too. Not verified on a live DB.
  - No strength policy: "a" is accepted (A3).
  - An admin can change their own password with no old password (A6). This is the only way staff can change a password at all: there is no provider change-password route or UI.
  - Sessions: the target's sessions are invalidated. sessionsRevokedAt is stamped (A1), which the middleware and /refresh enforce. It does not call revokeAllUserTokens.
  - Audit: no dedicated event for a password-only change (A2; control A2c: a role change does emit one). The only trace is the generic auditMiddleware row (routes/api/index.js:113 → audit-middleware.js:45-59: UPDATE/SYSTEM, url, bodyKeys incl. "password"). That is from reading the code, not a run. The removed force-reset emitted PROVIDER_USER_PASSWORD_RESET_FORCED.
  - Classification: this is functionally a staff-issued password reset, and a stronger one than the removed token, because the admin knows the resulting password. Paired with admin/users.js force-reset-mfa (which reaches any same-org user; admin-user-service.js:499, code-read) it lets a dtam admin take over a farmer account.
- MEDIUM (merge blocker for the gate, not a secret) The evidence commit f9e66a2a adds 8 gitleaks `generic-api-key` hits in evidence/no-recovery-2026-09-26/backend-full.txt (lines 66-81). All of them are fanout `dedupeKey` values: the sha256 of test userId|type (notification-fanout-service.js:117-123). The full history on the branch has exactly these 8 and nothing else, so main is clean. Merged as-is, full-gate `secret-scan-deep` / no-secret.sh goes red. Covering them in .gitleaksignore is operator-only (L6). The cheaper fix: the branch is unpushed, so amend f9e66a2a to strip those log lines.
- MEDIUM (pre-existing) PATCH and DELETE /provider/directory/:id share findMutationTarget, so they can also reach non-staff accounts in the same org (code-read, not probed).
- LOW: stale mobile generated resetPassword (above).

### Every door where one account sets another account's password
1. PUT /api/provider/directory/:id: overwrites an EXISTING password. Guards and gaps are listed above.
2. POST /api/provider/directory: creates a new account (dtam/platform admin, strength enforced). Provisioning.
3. POST /api/admin/users/provider: creates a new account (requireAdmin = system_admin_dtam, users.js:43-56, strength enforced). Provisioning.
4. POST /api/platform-admin/organizations/:id/users: creates a new account (PLATFORM_ADMIN_ONLY, min 12 or crypto.randomBytes). Provisioning.
5. /api/e2e: creates users, and is not mounted when NODE_ENV=production (index.js:80).
- Not setters: PDPA anonymize writes 'PDPA_ANONYMIZED' (invalidation), and ThaiD auto-provision uses a random password in non-production. admin/users.js has no existing-password write.

### Recommendation (operator decides)
- Remove `password` from PUT /:id. Answer 400 when it is present, not a silent ignore, and drop the field from the edit dialog. Pin it with a test: PUT with a password gives 400 and no write (fails on today's code); create still hashes (positive control).
- In the same change, add POST /auth/provider/change-password (old+new, reusing changePassword). The ruling keeps "own password change", and without it staff could never rotate a bootstrap password.
- Restrict findMutationTarget to providerId targets.
- Before merge: strip the 8 dedupeKey lines from f9e66a2a.
