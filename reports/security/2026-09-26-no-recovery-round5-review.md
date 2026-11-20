## Security re-review — fix/no-recovery round 5 (b159465f..3e3d5c3b) — 2026-09-26
Verdict (evidence: real-Redis harness in the -artifacts dir) — verdict **APPROVE, no veto** (1 LOW to fix or accept before operator merge)
Artifacts: reports/security/2026-09-26-no-recovery-round5-review-artifacts/ (harness.js, harness-out.txt, enrolment-path-probe.txt)
Harness: real mfa router, mfa-setup-guard, auth-middleware, rate-limiter, redis-service, mfa-reenrol-store, token-revocation, session-revocation
and session-epoch, run against a throwaway redis:7-alpine (removed after). The user row and Prisma are in memory. JWT secrets are random per run. Worktree untouched (HEAD 3e3d5c3b, clean).

(1) MEDIUM verify-setup unguarded: **CLOSED.**
  - X1: session B with a VALID pending code → 403 MFA_REENROL_SESSION_MISMATCH, no backup codes, row intact. X2: 40 more from B → 40x403, failures=0.
  - D1 (the round-3/4 repro, same session, one IP): 400x4, then 400 RESTART, then 429x35. The entry is gone and the row is intact. D2: the right new-secret code afterwards → 400.
  - D3 (one session, new IP for every guess, sequential): the 5th guess gives RESTART and the entry is deleted.
(2) Pending entry cleared on revoke-all (C1), logout (C2) and /disable (C3): **CLOSED.** Password change: code read only, password-management.js:111.
    Note: logging out ANY session of the user kills a re-enrol that another session started. This fails closed.
(3) Re-enrol revokes other sessions: **CLOSED.**
  - T1: the stamp is written in the same write as the new secret.
  - T3: the fresh cookie carries the same claims as a login token apart from iat/exp/jti, with the same flags as login (HttpOnly, Lax, 8h).
  - T4: iat*1000 equals the stamp, and the jti is new.
  - T5/T6: the OLD token of the same session is refused at once, as cookie or as Bearer. T7: another session is refused. T8: the fresh token → 200.
  - The old jti is NOT blocklisted (T11). The epoch alone evicts it.
(4) MEDIUM enrolment form path: **CLOSED.** The form uses providerApiPaths (/api/mfa/*). apiClient leaves /api paths as they are. Live demo and staging: /api/identity/mfa/verify-setup → 404,
    /api/mfa/verify-setup → 401 (door exists). The pin now derives the path from server.js + index.js + mfa.js, and red-web.txt:666 shows it red on the old form.
(5) Redis down: **fails closed, nothing half-written.** G1 /setup, G2 valid code and G3 wrong code → 503, row unchanged. G0: if the read works and the count write fails → 503, row intact.
    Two side effects: that guess is not counted, and it gets no audit row. An attacker cannot trigger this case. G4: the limiter's in-memory fallback still limits.
NEW / residual:
  - **LOW — "parallel wrong codes share a count" is NOT bounded by 5. The real bound is about 3 x the number of IPs the attacker uses.**
    Measured (R): k parallel guesses per round, each from a distinct IP, all from the same session. The entry lasted 3 rounds.
    k=5 → 15 codes checked, k=20 → 60, k=50 → 150. The report's "the per-IP limiter and the session binding bound it" holds only per IP.
    Preconditions are narrow: the attacker holds the exact token of the session doing the re-enrol, and acts inside the owner's 10-minute window.
    Payoff: at about 3e-6 per guess, 1,000 IPs give about 1% of taking the new factor + backup codes. Well below round 4, which had no cap.
    Fix (small): count with an atomic Redis INCR on its own key, with the same TTL. The report says redis-service does not expose INCR, but raw INCR is already used in
    rate-limiter.js:131-132 and redisService.client is used by token-revocation-service.
    A write-after-delete could resurrect the entry (read-modify-write). This was not seen in 30 trials (R2). The impact is capped, because the entry keeps its original expiry and its session binding.
  - LOW (pre-existing, not this diff): the epoch check is skipped when the DB identity lookup fails, for non-privileged provider roles. T10 with certificate_approver:
    the revoked OLD token → 200, while privileged roles → 401 IDENTITY_UNVERIFIED. This affects re-enrol eviction the same way as password change and admin revoke.
    Blocklisting req.user.jti on success would cover the current session's old token.
  - INFO: the fresh token copies role/org from the JWT, not from the updated row. There is a millisecond TOCTOU window if an admin changes the role mid-request, because the re-enrol stamp overwrites the admin's stamp.
    Fix: mint from the row returned by replaceTotpSecretWithBackupCodes.
  - INFO: verify-setup (first enrolment included) now shares 5 per IP per 15 minutes, counted before auth. Staff enrolling behind one office NAT will hit 429 from the 6th attempt. /verify already behaves the same way.
Secrets: gitleaks over 3e3d5c3b found no leaks. The evidence has no JWT, key, otpauth or credential-URL strings. The diff has no `process.env.X ||` credential fallback and no Math.random outside tests.
    Audit metadata carries no secret, code, backup or token keys.
Next: (a) atomic failure counter, or operator accepts the LOW · (b) optional: blocklist the caller's old jti on success · (c) Tier C → operator merge
