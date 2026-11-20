## Security re-review — fix/no-recovery rounds 3-4 (34e5cef1..b159465f) — 2026-09-26
Verdict (evidence: 10 jest suites + real-Redis harness in the -artifacts dir) — verdict **APPROVE, no veto** (2 MEDIUM to fix or rule on before operator merge)
Artifacts: reports/security/2026-09-26-no-recovery-round34-review-artifacts/ (harness-out.txt, lock-out.txt, jest-out.txt, enrolment-path-probe.txt)

(1) Other-account 2FA doors: **none left.** twoFactor* writers at b159465f = identity-service (own-account mfa.js only), PDPA anonymize/erasure/retention (account-ending),
    migration 20260915 (EMAIL retire). Admin updateData builders (admin/users.js, system/provider.js, admin-user-service) are explicit field lists, so no mass-assignment. force-reset-mfa / disable-2fa are gone (grep: 0 routes).
(2) mfa/setup, tested on a real Redis 7 (throwaway container, removed) with the real router, redis-service and rate-limiter (harness-out.txt):
    no code / wrong code / array code → 401, row intact · right code → pending key TTL 600s, old factor intact · OLD-secret code at verify-setup → 400 ·
    replay after success → 400 · Redis down → 503 on both doors, row unchanged · audit metadata has no secret, code or backup fields.
  - **MEDIUM — the consuming door is unguarded (a "present but does not protect" gap).** A limiter and the current code guard the /setup door that creates the pending slot. The /verify-setup door that uses it
    (mfa.js:178, 195-214) has no limiter (only the global 1000/15min/IP), no attempt counter, and no link to the session that created it.
    D1: 40 wrong guesses → 40x400 and the slot survives. D2 control: /setup → 429 after 5. E1: any session of that user that submits a valid code for the pending secret
    **gets the 10 new backup codes**. Attack: a stolen session keeps spraying verify-setup; when the owner re-enrols, the attacker has 10 minutes at ~3e-6 per guess per IP.
    With the password as well, the backup codes are a second factor. This is still strictly better than before round 4, where /setup replaced the factor with no code.
    Fix: add mfaVerifyLimiter to verify-setup, store req.user.jti in the pending slot and require the same jti, and delete the slot after N failures.
  - LOW: MFA_REENROLLED does not stamp sessionsRevokedAt, so moving to a new device keeps other sessions alive. /disable, password change and logout do not clear the pending slot.
  - Production Redis: /opt/gacp-platform/docker-compose.production.yml declares service `redis` (redis:7-alpine, requirepass, allkeys-lru 96mb) and the backend gets REDIS_URL.
    On this host gacp-redis is up and the demo and staging backends log "Redis connected". The URL is logged with `<credentials>` masked (config/redis.js:40). No production backend container was running at check time.
    Under LRU eviction the pending slot can disappear → 400. That fails closed.
(3) Change-password lockout: to lock the victim this way the attacker needs the victim's session. Anyone can already lock the account at the login door without one, so this adds no new DoS. Audit rows hold {reason, failedAttempts} only.
  - **LOW (new coupling):** password-management.js:60-63 refuses the owner's change **even with the right password** while any lock is active, including a lock set at the
    login door by anyone who knows the identifier (lock-out.txt: LOCKED+right-password → ACCOUNT_LOCKED, 0 writes; control: expired lock → changed). Password change is
    the only self-service door that revokes all sessions, so an attacker holding a stolen session can keep the owner from killing it by re-locking every 15 minutes. The trade-off is the operator's call.
(4) Nothing depended on the old behaviour: no web or mobile caller used verify-setup on an enabled account to regenerate backup codes. The only callers are the security page (setup path) and the login enrolment form.
(5) Nothing legitimate broke: 10 suites, 112/112 pass (mfa-setup-reenrol, second-factor-doors, staff-password-doors, enrolment-loop, locked-out-officer, mfa-roundtrip,
    mfa-verify-guards, mfa-challenge-binding, totp-only, auth-service). Fresh SIGNING_KEY_DIR, repo keys untouched. RED evidence round4/red-backend.txt: 8/9 red before the change.
  - **MEDIUM, pre-existing, outside this diff:** the forced-enrolment form posts to `/identity/mfa/setup|verify-setup` (mfa-enrolment-form.tsx:79,96). The backend mounts only
    `/api/mfa` (routes/api/index.js:88), so those calls return **404** on the demo and staging backends and through the demo frontend proxy (enrolment-path-probe.txt). This is latent only because
    REQUIRE_MFA_FOR_PRIVILEGED=false on demo and staging. If the flag is turned on, no un-enrolled staff member can enrol. The test mfa-enrolment-branch-has-a-screen.test.tsx:62 pins the wrong path, a pin that protects nothing.
  - INFO (the operator's ruling, consequence only): "lost device = หมอพร้อม" is not a recovery path in code. IdP login applies the same 2FA gate (auth-idp.js:312-330), and ThaiD
    resolves HEALTH accounts only. With both admin doors gone, a staff member who loses both the phone and the backup codes has no way back. First enrolment still needs no re-auth,
    so a stolen session on a staff account with no 2FA can enrol the attacker's authenticator.
  - INFO: the web re-enrol card maps every non-success response, including 429 and 503, to "รหัสปัจจุบันไม่ถูกต้อง". Round 4 has no view-pack (Tier C DoD). That is for the auditor.
Secrets: gitleaks over the 3 commits found no leaks. The evidence round3/round4 contains no credential-shaped strings. No `process.env.X ||` credential fallback or Math.random in the diff.
Next: (a) harden verify-setup as above before merge, or have the operator accept it · (b) fix the enrolment path (a one-line change on each side) as its own item · (c) operator rules on the lock-vs-rotate trade-off
