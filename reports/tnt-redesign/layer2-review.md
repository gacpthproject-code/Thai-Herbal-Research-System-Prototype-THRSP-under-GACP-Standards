# Layer 2 combined review — plot permanent code (L1 + L2 + L3) — 2026-08-24

Status: BLOCKED(operator:decision) — DO NOT SHIP the three together. L1 is shippable alone.
Reviewed: `git --no-pager diff` (794 lines, 4 modified files) + `git --no-pager status --short`
(6 new source/test files under `apps/backend/services/`, `apps/backend/__tests__/unit/`,
`apps/web-app/src/app/health/planting/[id]/plot-signs/`).

## 1. Overlap, lane discipline, laws

| Check | Result |
|---|---|
| Three changes conflict / overlap | **No.** Disjoint file sets. The only shared symbol is `Plot.plotCode`: L1 writes it, L2 reads it, L3 renders it. No two agents touched the same line. |
| Edits outside assignment | **Two, both declared and both minimal.** L1 added 8 lines to `apps/backend/services/prisma-database.js:121-133` (require + `.$extends(plotCodeExtension)`); without them the extension is dead code. L3 added 2 lines to `apps/web-app/src/app/health/planting/[id]/client-view.tsx:339-340` (`cycleId` into `commonTabProps`); `cycleId` already existed at `client-view.tsx:55`. Both accepted. |
| **L3 (money) — money / settlement / ledger** | **CLEAN.** Grep over the combined diff for payment/invoice/receipt/stripe/settle/remit/ledger/checkout/refund/fee/vat/amount/price returns only `cultivationType`, `expectedHarvestDate`, `cultivationMethod`, `payload`. No money path touched. |
| Evidence chain `package -> lot -> harvest -> cycle -> plot -> certificate` | **UNTOUCHED.** The plot code is an entry point only. `resolve-plot-cycle.js:325-336` picks the same `PlantingCyclePlot` row a seasonal QR would have pointed at, then the untouched aggregation at `:495-560` filters `harvestBatch` by `cycleId` and re-filters to `sourceCyclePlotId === assignment.id`, with `lots` nested under batches. No link added, removed or reordered. |
| Debug code / skipped tests / weakened assertions | **None found.** Grep for `.skip`/`.only`/`xit`/`xdescribe`/`it.todo`/`TODO`/`FIXME`/`console.log`/`debugger` over all 11 new+changed files: zero hits. (The four `process.exit(1)` in `prisma-database.js` are pre-existing, outside the diff.) Two *missing* assertions instead — see §4. |
| Pre-existing tree debris (NOT these agents) | `apps/backend/body.html` (a captured Cloudflare error page, dated Aug 23), `probe-gate-before.txt`, `evidence/F-PDF-COLD-START-review.diff`. All present in the session-start status snapshot. Someone should delete `body.html`. |

## 2. THE OPERATOR'S QUESTION: taps from scanning the sign to a recorded activity

**Counted from the code: zero taps exist. The path is not there.**

The sign's QR encodes `/trace/plot-cycle/<plotCode>` (`plot-signs/client-view.tsx:95`). That
route is the **public, read-only** traceability page. Its success branch
(`apps/web-app/src/app/trace/plot-cycle/[qr-code]/client-view.tsx:225-350`) offers exactly one
action — `window.print()` at `:234-241` — plus lot links at `:331`. The only `<Link href="/">`
is inside the *not-found* card at `:202-203`. There is no login link, no "record activity"
button, no link into `/health` at all. Grep confirms `plotCode` appears nowhere in
`apps/web-app` outside the two files L3 wrote: nothing in the recording flow can consume it.

So a farmer who scans the sign lands on a page that cannot record anything, and must abandon
it. The shortest path that actually writes an activity, **phone already logged in**:

| # | Tap | Evidence |
|---|---|---|
| 1 | leave the scanned page, open the app | no link exists on the trace page |
| 2 | nav → รอบปลูก (`/health/planting`) | |
| 3 | tap the cycle row | |
| 4 | tap บันทึกกิจกรรม | `planting-cycle-detail-header-block.tsx:161` |
| 5 | open the "เลือกแปลง" Select | `activities/client-view.tsx:122-128` |
| 6 | pick the plot | needed because `form.plotId` defaults to `cycle.plots[0]` (`use-planting-activities-page.ts:72-77`), not the scanned plot |
| 7 | tap the activity type chip | only if the work is not irrigation — `INITIAL_ACTIVITY_FORM.activityType='IRRIGATION'` (`planting-activities-page-config.ts`), chips at `activities/client-view.tsx:152` |
| 8 | tap บันทึก | `activities/client-view.tsx:295` |

**8 taps, none of which the scan saved.** Add a ThaiD login if the session is cold.

**And the sign prints a claim that this is not true.** `plot-sign-sheet.tsx:92` prints
"สแกนเพื่อบันทึกกิจกรรมของแปลงนี้" onto the paper; `plot-signs/client-view.tsx:130` says
"สแกนเพื่อบันทึกงานได้ทันที". Both are false against the URL the same file encodes at `:95`.

### Which taps can be cut

Taps 1-6 can all be cut, and the backend to do it already exists inside this very diff.
`resolve-plot-cycle.js:302-345` already does `plotCode -> Plot -> the one OPEN cycle`
(`OPEN_CYCLE_STATUSES`, exported at `:683`) — exactly the resolution the recording form needs.
Point the sign's QR at an **authenticated** deep link (`/health/planting/record?plotCode=...`)
that runs that same lookup server-side and lands on the activity form with plot, cycle and
date pre-filled. R15 guarantees one open cycle, so nothing is ambiguous and the farmer still
never picks a season.

Floor after that cut: **2 taps** — activity type, then บันทึก — and **1 tap** when the default
type is the right one. Taps 7 and 8 are the only ones carrying information the phone cannot
know. Nothing in this diff moves toward that; the layer builds the sign and then points it at
a brochure.

## 3. BLOCKING findings

**B1 — The public page tells a dormant, uncertified plot's scanner that the land is GACP
certified and a round is in progress.** L2 turned a 404 into a 200 for a plot with no open
cycle (`resolve-plot-cycle.js:337-341`, `type:'PLOT'`, `cycle:null`). Nothing in the web app
reads `type` (grep: zero hits for `PLOT_CYCLE` or `.type === 'PLOT'` in `apps/web-app/src`), so
the existing page renders it: `cycleStatusLabel` falls back to **'กำลังดำเนินการ'**
(`trace/plot-cycle/[qr-code]/client-view.tsx:212`) and is printed into the page description at
`:231`; the block at `:295-298` unconditionally renders a shield icon and
**"แหล่งปลูกได้รับการรับรอง GACP"**; `formatNumber(null)` renders **"0"** (`:119-121`) for the
redacted plant count. The reasoning for the 200 is sound and the redaction is correct
(`redactPublicPlotPayload` nulls farm name, district, plot name — verified at `:127-159`); the
consumer that would make it honest was never written. A false certification claim on a public
traceability surface is the worst outcome in this diff. Either write the `PLOT` branch on the
page, or keep the 404 until it exists.

**B2 — The sign's promise is false (see §2).** Do not print `plot-sign-sheet.tsx:92` or ship
`plot-signs/client-view.tsx:130` until the scan reaches a recording surface. Paper is not
redeployable.

**B3 — L3 is inert against real data.** `GET /planting-cycles/:id/plot-qrs` emits
`cyclePlotId / plotId / plotName / qrCode / trackingUrl / cultivationMethod /
allocatedAreaSqm / plannedPlantCount` and nothing else
(`apps/backend/routes/api/cultivation/planting-cycles-unit-plot-routes.js:241-252` — read and
confirmed). `plotCode` never reaches the browser, so every screen L3 built renders
"ยังไม่มีรหัสแปลง" and the print route renders its empty state. Three fields on one object
literal.

**B4 — A reprinted sign is dead on arrival, and the copy sends the farmer to a button that
cannot help.** `resolve-plot-cycle.js:309-319` returns 410 for any plot with `qrRevokedAt` set —
keyed on the *plot row*, not on the piece of paper. L3 reprints the same code
(`plot-sign-sheet.tsx:59`; `buildSignHref` at the plots tab `:60-63`), which is the right call
for the chain, but the reprint then scans to "ป้ายรหัสแปลงนี้ถูกยกเลิกแล้ว" forever. Verified
independently: **nothing in the repo ever writes `qrRevokedAt` or `qrIssuedAt`** — grep across
`apps/backend` finds only reads and comments. So the whole revoked branch (backend 410, both UI
branches, the reprint wording) is unreachable today, and becomes a trap the moment anyone sets
the column. Reprint must be an *action* that clears `qrRevokedAt` and stamps `qrIssuedAt`, not
a GET on a print route.

**B5 — CI seeds plots with no code, and the contract migration will break it.**
`apps/backend/prisma/seed-gacp.js:48` builds a bare `new PrismaClient()` with no extensions and
`:523` upserts plots. `package.json:75` and `.github/workflows/ci.yml:718` both run it. Worse
than the one-line fix suggests: the upsert is keyed on a deterministic id, so a re-seed over
existing rows takes the `update` branch, which the extension deliberately does not hook — rows
already seeded stay NULL forever. Needs the extension *and* a backfill pass in the seed.

## 4. Non-blocking, must be logged

- **The layer's central decision has zero test coverage.** `plot-sign-sheet.test.tsx:21`
  imports only `PlotSignSheet`; no test anywhere imports `plot-signs/client-view.tsx`, the file
  that decides the QR encodes `plotCode` and not the per-cycle `qrCode`. Swapping line 95 to
  `row.qrCode` leaves all 9 L3 tests green (L3's verifier ran that mutation). The claim exists
  only in a comment.
- **Two surviving mutants in L2** (found by its verifier, both confirmed by reading the test
  file): dropping `isDeleted:false` at `resolve-plot-cycle.js:325` breaks nothing; and
  `trace-resolves-plot-code.test.js:262-269` ("falls through to the legacy cascade") asserts
  only a 404, so it would pass against an implementation that early-returns 404 instead of
  falling through.
- **`window.location.origin` is baked onto permanent paper.** `plot-signs/client-view.tsx:95`
  wraps the path in `toAbsoluteUrl`. A sign printed from a preview host or `localhost` carries
  that host outdoors for a season. The backend already uses the configured builder for this
  exact URL (`qrcodeService.generatePublicTraceUrl` at `resolve-plot-cycle.js:191`, `:361`).
- **Dead-end copy.** `plot-signs/client-view.tsx:164` says "กดสร้าง/รีเฟรช QR ก่อน"; that button
  mints per-cycle `TraceQrSecurity` rows, never a `plotCode` (only `plot-code-extension.js` on
  Plot create does). Fails thai-ui-copy's "name the cause and the *next action*" — the named
  action cannot work.
- **No sign for land that has never been planted.** The route is
  `/health/planting/<cycleId>/plot-signs` and filters to that cycle's assignments, so the
  operator's own sequence (register land → nail up the sign → start a cycle) is impossible.
  `GET /farms/:farmId/plots` (`routes/api/cultivation/plots.js:93` →
  `planting-service.js:673-686`, `include` with no `select`) already returns every Plot scalar
  today, so a plot-owned route needed no backend change.
- **Revocation is not total.** `plotCode` is published unredacted on the legacy path
  (`resolve-plot-cycle.js:580-586`), and that path never loads or checks `qrRevokedAt`
  (`ASSIGNMENT_INCLUDE` at `:58`). Anyone holding a seasonal UUID is handed the permanent code,
  revoked or not.
- **R15 is a query filter, not a constraint.** No partial unique index for "one open cycle" in
  `prisma/migrations`; `orderBy createdAt desc` (`:329`) is the untested tiebreak.
- **Nested writes bypass the extension.** `farm.create({ data: { plots: { create: [...] } } })`
  mints nothing — documented at `plot-code-extension.js:47-50`, no such caller today. Build the
  probe before the contract migration turns this into a production 500, not after.
- **`hasCode()` guarantees non-null, not valid.** `plot-code-extension.js:65-67` null-checks
  only; `plotCode: ''` sails through and is a legal entry in the partial unique index. No caller
  passes `plotCode` today. Guarding with `isValidPlotCode` closes it.

## 5. Skills

**thai-ui-copy — PASS on typography, one substantive failure.** No em dashes in Thai; no ๆ;
Thai/Latin spacing correct ("ของ GACP", "กดสร้าง/รีเฟรช QR ก่อน", "QR รหัสแปลง"); dates via
`formatThaiDate` (`plot-sign-sheet.tsx:59`), no inline `toLocaleDateString`. Register is
consistent — no คุณ/ท่าน mixing (neither appears). `uppercase tracking-wider` at
`plot-sign-sheet.tsx:87` and in `PlotCodeText` on the plots tab sit on **Latin-only** plot
codes, which the skill explicitly permits. The load-failure copy at
`plot-signs/client-view.tsx:67` correctly states an indeterminate cause plus a retry. The
failures are the *claims*, not the glyphs: B2 (the sign promises recording) and the dead-end
action at `:164`.

**gacp-design-tokens — PASS with one note.** No `emerald-*`/`zinc-*`/`slate-*`, no `!important`,
no `outline:none`, no hardcoded radii (`rounded-lg` throughout); neutrals are
`text-foreground` / `text-muted-foreground` / `bg-muted` / `bg-card`; all interactive elements
are primitives (`Button`, `Badge`, `Spinner`, `Icons`). Note: `plot-sign-sheet.tsx:65` uses bare
`bg-white` with a comment but **no `dark:` override** — the skill requires both. Here it is
substantively right (the plate is the QR's quiet zone and must stay white in any theme; the QR
PNG bakes `light:'#ffffff'` anyway), so this is a comment-wording fix, not a repaint. The
`print:` absolutes at `:52,55,82,93` are correctly justified — token colors would print a page
of solid ink from dark mode. Global print CSS backs it (`globals.css:503-542`: chrome hidden,
`@page A4/12mm`, `body{color:#000;background:#fff}`). Mobile actions were correctly raised from
`compact-xs` to `sm` for outdoor thumbs.

## 6. Symptom patches vs cause fixes

L1 is a **cause fix** and the best work in the layer: it rejected three call-site patches for
the one seam where every write converges, and the property it enforces ("a Plot row cannot
exist without a code") is the right property. Its two gaps (seed client, nested writes) are
documented in its own source, not hidden.

L2's *reasoning* is cause-level (a dormant plot is a real state, not an error) but the
**delivery is half a fix**: it introduced a new response type and left the only consumer
unwritten, converting a truthful 404 into a false 200. That is worse than the symptom it
replaced.

L3 is the symptom-shaped one. Told the plot-qrs endpoint lacks `plotCode`, it built the entire
UI against a field that never arrives and shipped an empty state as the live behaviour — while
`GET /farms/:farmId/plots` already returns that field today. And it printed a promise
("สแกนเพื่อบันทึกกิจกรรม") onto paper that the URL it encodes cannot keep. The
reprint-keeps-the-same-code decision is correct and well argued; the mechanism it needs
(something that writes `qrRevokedAt` / `qrIssuedAt`) does not exist.

## 7. Recommendation

- **L1 — ship alone**, after wiring `seed-gacp.js` and adding the backfill pass (B5).
- **L2 — hold** until the `type:'PLOT'` branch exists on the public page (B1). The backend
  change is otherwise sound and interception-safe.
- **L3 — hold.** Needs B3 (three fields on the plot-qrs row), B2/B4 (the sign's promise and the
  reprint action), and a test on `plot-signs/client-view.tsx:95`.
- **Before any of it: decide the scan target.** If the sign is going to say "scan to record",
  the QR must point at the authenticated deep link, not the public trace page. That decision
  changes L2's resolver, L3's QR payload and the printed copy at once — deciding it after paper
  is nailed to posts costs a reprint of every sign in the country.

Evidence: this file. Every finding carries a `file:line` opened in this session; no test was run
by the reviewer (three verifier passes already re-ran and mutation-tested them) and no `git`
command beyond `diff` and `status --short` was issued.
