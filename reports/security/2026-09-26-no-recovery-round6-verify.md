## Security re-review — fix/no-recovery round 6 verification (90b46a07) — 2026-09-26
Verdict (evidence: real-Redis harness, scratchpad harness-r6.js) — verdict **CLOSED, no veto**. The round-5 LOW (parallel wrong codes
sharing one read-modify-write count, k=5 -> 15 codes checked) is fixed by an atomic Redis INCR+PEXPIRE pipeline claimed
BEFORE the code check. Re-ran on a real throwaway redis:7-alpine (port 28573, removed after) + the real router/limiter,
worktree /home/ubuntu/work/wt-norec @ 90b46a07, Node 20.20.2.

Harness: adapted from reports/security/2026-09-26-no-recovery-round5-review-artifacts/harness.js — same stubs
(in-memory Prisma row, identity-service, audit-logger), same real modules (mfa router, mfa-setup-guard, auth-middleware,
rate-limiter, redis-service, mfa-reenrol-store, jwt-security, mfaService). Each k: fresh re-enrol, k parallel wrong
codes per round from k distinct IPs (same session), rounds continue until the pending entry is gone.

k-table (rounds until entry gone / codes actually checked = plain 400 "Invalid code" / RESTART responses / final state):
| k  | rounds | codes checked | RESTART responses | entry deleted | row intact | attempts key after |
|----|--------|---------------|--------------------|----------------|------------|---------------------|
| 1  | 5      | 4             | 1                  | true           | true       | 0 (cleared)         |
| 5  | 1      | 4             | 1                  | true           | true       | 0 (cleared)          |
| 20 | 1      | 5             | 15                 | true           | true       | 0 (cleared)          |
| 50 | 1      | 5             | 45                 | true           | true       | 0 (cleared)          |

At most 5 codes are ever checked against the pending secret, whatever k is — the INCR claims a slot before
mfaService.verifyTOTP runs, and any claim > 5 gets MFA_REENROL_RESTART without a code check. This closes the round-5
finding (previously k=5 -> 15 checked, k=20 -> 60).

Redis-down: G1 /setup (right code) -> 503 MFA_REENROL_UNAVAILABLE, row unchanged. G2 verify-setup (valid pending code)
-> 503, row unchanged. G3 verify-setup (wrong code) -> 503, row unchanged. Confirmed fail-closed, nothing half-written.

First-attempt correct code: verify-setup with the right new-secret code on the very first try -> 200, success=true,
backup codes returned, secret swapped to the new one, pending entry cleared. Re-enrolment is not broken by the fix.

Ratchet: N/A (read-only verification, no src/ changes). Secrets: none printed; harness uses random per-run JWT secrets
and a throwaway container removed after the run; no key requested or handled.
Next: none — round 6 fix verified on real Redis; round-5 LOW is closed. Tier C / operator merge as already scheduled.
Evidence: this file; harness at /tmp/claude-1000/-home-ubuntu-work-GACP-Certification-Application/f90a55be-547c-4b12-8251-b8809c3ab2e1/scratchpad/harness-r6.js and raw output at .../scratchpad/harness-r6-out.txt (scratchpad, not committed).
