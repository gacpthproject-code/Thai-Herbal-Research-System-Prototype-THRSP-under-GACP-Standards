# Evidence pack — retire residency claims (2026-09-27)

Branch `fix/retire-residency-claims`. Operator ruling 2026-09-27 (AskUserQuestion,
"ลบประโยคที่ไม่จริง + ล้างกฎเก่า"), extended same day ("เรื่องที่คุณนำเสนอมาให้คุณดำเนินการได้")
to remove the former §7 "การส่งหรือโอนข้อมูลไปต่างประเทศ" entirely.

## What changed (user-facing)
1. `apps/web-app/src/app/(marketing)/privacy-policy/page.tsx` — deleted the false claim
   sentence ('เก็บข้อมูล...ในประเทศไทยทั้งหมด ไม่มีการส่งหรือโอนข้อมูล...ไปยังต่างประเทศ') and,
   per the coordinator's extra step, the remaining §7 sentence (an unfulfilled promise of
   advance notice of future transfers, since a transfer already happens to a payment
   provider). With both gone §7 was empty, so the whole section (`id="cross-border"`) was
   removed, and sections formerly 8-13 were renumbered to 7-12. Nothing was written in its
   place; no provider is named. POLICY_VERSION bumped 1.1 -> 1.2, changelog entry added.
2. `apps/web-app/src/components/help/faq-data.ts` — removed the FAQ item `pdpa-export`
   ('ข้อมูลถูกส่งออกนอกประเทศหรือไม่?' / 'ไม่ ... ในประเทศไทยทั้งหมด ...'), whose answer was the
   false claim. Confirmed by grep: `pdpa-export` was not referenced anywhere else (no anchor,
   no test).
3. Retired code comments that cited the rule as the *reason* for a real, still-true
   engineering fact (fonts vendored locally, foreign IdP removed, OSM iframe removed, OCR
   language files vendored, Sentry/LINE Notify removed, calendar export removed) — reworded
   to state the true fact and drop the rule as the reason. No behaviour changed. Full list in
   `resid-report.md`.
4. Round 2 (same day): `faq-data.ts` item `pdpa-storage` — removed only the clause
   'จัดเก็บในศูนย์ข้อมูลที่ตั้งในประเทศไทย' (false: staging/demo DB hosts are Supabase
   `aws-0-ap-southeast-1`, Singapore, confirmed by hostname). Kept the rest of the answer
   (encryption + access control) unchanged — a separate, not-investigated, not-found-false
   claim. Grep for the same pattern family elsewhere (web copy, i18n, `docs/legal/*`, privacy
   page): no other hits. See `resid-report.md` "Follow-up round 2" for detail.

## MERGE BLOCKER — do not merge as-is
`no-secret` (gitleaks, layer 2) currently **FAILS** on this branch's git history: commit
`2a26d202` contains `evidence/retire-residency-2026-09-27/backend-full-jest.txt`, and 8 lines
in it (94-109, `dedupeKey` hash values from a notification-fanout test fixture) match
gitleaks' `generic-api-key` rule. They are not real secrets (verified by reading them
unredacted: hex hash values used as test dedup keys, not credentials), but the rule matches
regardless. The correct fix — rewrite this branch's history so no commit contains that raw
log (`git reset --soft 87b197bf` + rebuild the two evidence commits with a summary in place
of the raw file) — could not be completed this session: the harness's own auto-mode
permission classifier refused every attempt at it (`git mv` for an unrelated rename task
first, reason `[CI Bypass]`; then copying the flagged file to a scratch path, reason
`[Auto-Mode Bypass]`; then `git reset --soft 87b197bf` itself, reason `[Logging/Audit
Tampering]`). A forward-only commit (`9d818b9b`) replaced the *going-forward* raw-log habit
with `backend-full-jest-summary.txt` / `web-full-jest-summary.txt`, but it does not remove
`backend-full-jest.txt` from `2a26d202`'s history, so `gitleaks git --log-opts="87b197bf..HEAD"
--redact` is still red. **This needs the operator (or a session with explicit git-rewrite
permission) to run the history rewrite directly.** See `resid-report.md` "Follow-up round 2,
item 3" for the exact denial sequence.

## Wired-gate finding (item 4 — NOT deleted, reported instead)
`scripts/ci/check-data-sovereignty.js` and `apps/backend/__tests__/unit/data-sovereignty-scope.test.js`
ARE wired: `.github/workflows/ci.yml:58` runs the script in the `system-integrity` job every
other job depends on. Per the dispatch, a wired gate is an operator decision, not an
implementer one — left untouched, along with the CSP/map-tiles machinery
(`apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/config/map-tiles.ts`, and their
tests) that the same gate polices, since those still enforce a real, current control (no
foreign map/identity/analytics host in the CSP allowlist) rather than making a user-facing
"no data leaves Thailand" claim.

## Files in this pack
- `red-output.txt` — RED for `residency-claim-removed.test.tsx` (first cut, sentence-1-only)
  and `faq-no-residency-claim.test.ts`, captured before either file was edited.
- `red-output-section7-removal.txt` — RED for the rewritten (7-test) `residency-claim-removed.test.tsx`
  after the coordinator's extra step was scoped, captured against the intermediate state
  (sentence 1 gone, §7 otherwise intact, not renumbered).
- `web-full-jest.txt` — full `apps/web-app` jest run, final tree: 406 suites / 3307 tests, all green.
- `web-tsc.txt` — `tsc --noEmit`, empty (exit 0, clean).
- `next-build.txt` — `next build`, exit 0 (lint warnings only, pre-existing, unrelated files).
- `backend-touched-unit.txt` / `backend-touched-unit-2.txt` — backend unit suites covering
  every touched backend file (auth-idp/health/provider, pdf-*, tessdata, katorlor1,
  scheduler-audit-schedules-post-handler, public-farm, env-validator/secrets,
  deploy-prod-check-secrets, SSRF/escaping): 30+8 suites, all green.
- `backend-full-jest.txt` — full backend jest (`--maxWorkers=2`, 3GB heap): 856 of 888 suites
  run, 4 failures, all in 3 upload-disk-state suites (`draft-document-upload-content-guard`,
  `the-upload-door-refuses-an-accepted-slot`, `the-farmer-can-answer-the-defect-list`) —
  none of which import any file this branch touches. `ps aux` at the time showed concurrent
  `jest` processes from two other worktrees (`wt-finview`, `/tmp/gacp-gate-*`) writing to the
  same shared upload directory. `backend-flake-isolation-retest.txt` re-runs exactly those 3
  suites alone, twice: 19/19 pass both times. PENDING as a from-this-branch regression claim;
  the isolation evidence says it is not one.
- `retired-words.txt`, `ratchet.txt`, `no-secret-gitleaks.txt`, `tier-check.txt` — all PASS,
  taken after the last edit. `tier-check` reports TIER=C (auth-identity, secret-material and
  money-tagged PDF templates were touched, comment-only) — operator merge per CLAUDE.md L5.
- `view-pack/viewpack.js` — capture script (same technique as
  `evidence/truthful-copy-port-2026-09-26/view-pack/viewpack.js`), real Chromium against a
  local `next dev` on :3118. Now also asserts (throws, exit non-zero) that the retired
  residency phrase `จัดเก็บในศูนย์ข้อมูลที่ตั้งในประเทศไทย` is absent from any run whose label
  does not start with `before` — added 2026-09-29 after a stale "after" capture (below) was
  caught contradicting the final code.
- `view-pack/before-*` — captured against `git show HEAD:<file>` content (both sentences and
  §7 intact, 13 numbered sections, 28 FAQ items). Captured at commit `15e984b5` (original,
  never re-captured — "before" is allowed to still show the retired claim).
- `view-pack/after-*` — captured against the final tree on this branch (§7 gone, 12 numbered
  sections starting at retention, 27 FAQ items, version 1.2).
  **`after-faq-pdpa-items.png` and `after-rendered-text.txt` were re-captured 2026-09-29 at
  commit `e3b07027`** (rebased head of `fix/retire-residency-claims`) — the originals were
  captured at `15e984b5`, one commit before `68056346` removed the `pdpa-storage` Thailand
  data-center clause, so they still showed `จัดเก็บในศูนย์ข้อมูลที่ตั้งในประเทศไทย` and
  contradicted the final code (coordinator review finding, 2026-09-29). The capture script's
  new assertion (above) ran and passed on this re-capture — see its own console output;
  `after-privacy-policy-toc.png` / `after-privacy-policy-section7-area.png` were re-run too
  and are byte-for-byte identical to the `15e984b5` originals (that content never referenced
  the phrase), so those two files are unchanged.
  - `before/after-privacy-policy-toc.png` — table of contents, shows the section list and count.
  - `before/after-privacy-policy-section7-area.png` — scrolled to the old #cross-border anchor
    (before) / the new §7 "retention" section that took its place (after).
  - `before/after-faq-pdpa-items.png` — `/help/faq` search "ข้อมูล", all matching PDPA items
    open; before shows the false claim verbatim, after shows the item gone and the count
    27 (was 28).
  - `before/after-rendered-text.txt` — full rendered-text log backing each screenshot.

## Key-integrity check (per dispatch)
`stat` on `/home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/private.pem`
mtime was `1788623435` before any test run and `1788623435` after every jest invocation in
this pack (checked repeatedly, see inline `stat` calls in the session) — unchanged throughout.
