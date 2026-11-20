# W1 batch B — wizard chrome cleanup (W2-A..F) — 2026-08-22

Branch `fix/design-reproducibility`. Per coordinator instruction mid-session (git-index race
with a concurrent agent), **no commits were made by this agent** — all work sits uncommitted
in the working tree. File list is at the end for the coordinator to commit serially.

## W2-A — one step indicator only

**Verified location**: `apps/web-app/src/app/health/applications/_components/application-step-page.tsx`.
Line numbers had drifted slightly from the audit (header block was 339-358, not 340-377;
mini-bar 357-374; tip-banner render site 376-400) — content matched, only offsets moved.

**Removed**: the numbered-circle badge span, the `chrome.stepCounter` ("ขั้นตอนที่ N จาก 8") text
span, and the entire 8-segment mini progress-bar block (`FLOW_STEPS.map(...)`). Kept the h2
title (`resolveStepTitle`) + one-line description (`stepDescriptions[key]`) — the only chrome
left at this layer.

**Trap handled — edit-mode fallback**: `_steps/layout.tsx` gated the top pill stepper on
`!isPaymentPhase && !isEditMode`. Once application-step-page.tsx's three indicators were
deleted, edit mode (`/health/applications/new?edit=<id>`) would have shown **zero** step
indicators — the pill stepper is the only one left, and it was hidden there. Fixed by
dropping the `!isEditMode` condition; the pill stepper derives purely from the URL's
`activeStep` and needed no edit-mode-specific data. No test previously pinned the old
suppress-in-edit-mode behavior (grepped `apps/web-app/src` — none found), so this is a pure
regression-avoidance change, not a spec change.

**Also removed** (dead after the above): `FLOW_STEPS` import, `flowPosition` /
`displayStepNumber` / `totalMainSteps` locals, `chrome.stepCounter` usage site (dictionary key
kept — see below).

**RED** (`application-step-page-single-indicator.test.tsx`, before fix):
```
Expected substring: not "bg-leaf-soft text-base font-bold text-leaf-700"
Received string: "...<span class="...bg-leaf-soft...">1</span>...ขั้นตอนที่ 1 จาก 8...
  <div class="h-[7px] rounded-full bg-leaf">...1. ยินยอมและประเภทคำขอ...2. ข้อมูลพืชและสายพันธุ์..."
Tests: 3 failed, 3 total (title also appeared twice — h2 + mini-bar label)
```
**GREEN**: `Tests: 3 passed, 3 total` (title now appears exactly once; no circle/counter/bar).

**Edit-mode trap RED** (`layout-pill-stepper-edit-mode.test.tsx`):
```
Expected substring: "ยินยอม"
Received string: "แก้ไขคำขอรับรอง GACPMODE: EDITแบบฟอร์มคำขอออนไลน์พร้อมบันทึกchild"
Tests: 1 failed, 1 passed (edit-mode case failed — pill stepper truly absent)
```
**GREEN**: `Tests: 2 passed, 2 total`.

## W2-B — remove the tip banner + per-step duplicated subtitles

**Tip banner**: `step-tip-banner.tsx` (`ApplicationFlowTipBanner` + `APPLICATION_FLOW_STEP_TIPS`,
lines 1-79) had exactly one importer (`application-step-page.tsx`, grepped repo-wide, and the
barrel `components/application-flow/index.ts` does not re-export it). Removed the render site
(button toggle + `AnimatePresence` + `ApplicationFlowTipBanner`) together with W2-A's edit
above, then **deleted the file** — confirmed dead by RED/GREEN test above (tip-toggle text and
step-1 tip copy both absent post-fix).

**Duplicated subtitle headings — the 5 step files** (each repeats the page header's own
FLOW_STEPS `titleTH`/`description` for that step, immediately above real content):
| file | removed heading | kept |
|---|---|---|
| `plant-selection-step.tsx` (step 2) | "เลือกพืชและรูปแบบคำขอ" + subtitle | selection UI |
| `documents-step.tsx` (step 8) | `sectionHeader`/`sectionSubtitle` | upload-status section |
| `production-info-step.tsx` (step 6) | "การเพาะปลูก" (exact title match) + subtitle | 3-tile stat grid (not named for removal) |
| `quality-control-step.tsx` (step 7) | `qc.headers.main`/`mainSubtitle` (first header only) | harvest/post/gacp sub-headers (distinct content, kept) |
| `farm-info-step.tsx` (step 5) | "ข้อมูลฟาร์มและแปลงปลูก" + subtitle | 3-tile stat grid (not named for removal) |

`general-step.tsx` was checked and has no such duplicate heading — confirmed not one of the 5.

RED/GREEN per file (all pinned with `renderToStaticMarkup`, mocking the store per-file):
- plant-selection: RED showed heading + `<details>` + stat-grid all present → GREEN after fix
  (combined with W2-F below, same commit-group).
- documents-step: RED showed `wizard.documentsStep.sectionHeader` literal key present → GREEN.
- production-info: RED `Tests: 1 failed, 1 passed` (heading present, stat tiles correctly kept)
  → GREEN `2 passed`.
- quality-control: RED `1 failed, 1 passed` (main header present, harvest/post/gacp correctly
  kept) → GREEN `2 passed`.
- farm-info: RED `1 failed, 1 passed` → GREEN `2 passed` (needed mocking `useGACPData`,
  `useAuth`, `api-client` — none of these gate the header render, confirmed via the fix).

## W2-C — documents step: one progress bar

**Verified location**: `documents-step.tsx`. Line numbers drifted (stats grid 213-226 matched
exactly; guidance 229-242 matched; the kept upload-status section is 244-260; file-rules
was 274-281, matched). Deleted: the 3-tile stats grid, the "submission phase guide" card row,
and the static file-rules list. **Kept**: the `SectionHeader` + `Badge` + `ProgressBar` +
remaining-count paragraph — the one clear upload-progress indicator.

**Dictionary keys deleted** (`th-wizard.ts` + `en-wizard.ts`, `documentsStep.*`, grepped
repo-wide first — each had exactly one call site, all inside the deleted JSX):
`sectionHeader`, `sectionSubtitle`, `statsLabels.{mandatory,uploaded,progress,items}`,
`guidance.{title,phaseLabel}`, `fileRules.{title,pdfClear,formats,verify}`.
**Kept**: `uploadStatus.*`, `errorBlock.*`, `errors.*`, `tags.*`, `uploaded.*`, `video.*`,
`uploadHint.*` — all still referenced by the retained sections.
`dictionary-parity.test.ts` (TH/EN key-count parity) still passes after both files were edited
in lockstep.

**RED**: 3 of 4 assertions failed (`sectionHeader`/`statsLabels`/`guidance`/`fileRules` literal
keys all present in output). **GREEN**: `Tests: 4 passed, 4 total`.

Left `SUBMISSION_PHASE_GUIDE`'s export in `documents-step-config.tsx` in place (only its
import in `documents-step.tsx` was removed) — out of this task's explicit scope to prune
config-file exports.

## W2-D — review step dedup

**Verified locations** (all matched audit line numbers before edits): duplicated heading
277-282, stat tiles 284-299, duplicated error block 302-310 (audit said 329-337 — that was the
pre-edit-session number; content matched exactly), redundant `alertProceed` alert 462-466
(matched after intervening edits shifted line numbers; content identical).

**Removed**: the `header.title`/`header.subtitle` heading, the completion%/uploaded/fieldCount
stat-tile grid (and the now-dead `completionPercent` local), the duplicate bare `{error}` div
near the top (kept the one near the submit CTA, which also has a retry button), and the blue
`alertProceed` info alert.

**Accessible-checkbox pattern ported**: `submit-step.tsx:244-250` has `role="checkbox"` +
`aria-checked={...}` on the clickable row `<button>` and `aria-hidden="true"` on the decorative
`<Checkbox>` glyph (submit-step.tsx is dead code — not in `COMPONENT_MAP`, confirmed via
repo-wide grep, so this pattern would vanish with it if not ported). Added the identical
pattern to all three confirmation rows in `review-step.tsx` (401-441 pre-edit).

**RED**: header/stats/alert assertions failed (literal i18n keys present); the checkbox-row
assertion needed a second RED iteration — first attempt counted `role="checkbox"` generically,
which already matched 3 times from the *decorative* `<Checkbox>` primitive's own internal
Radix button (it renders its own `role="checkbox"`/`aria-checked`), making the assertion
vacuously true before the fix. Rewrote it to match the outer row-button's specific serialized
attribute sequence (`type="button" role="checkbox" aria-checked="false" class="cursor-pointer`)
which is genuinely absent pre-fix and present exactly 3× post-fix.
**GREEN**: `Tests: 4 passed, 4 total`.

**Not runtime-tested**: the duplicated-error-block removal (verified by source diff only) —
triggering `error` state requires a full submit-and-fail cycle (mocking `apiClient.post` +
simulating a button click via `act()`), which was judged disproportionate effort for a single
static-JSX deletion with no logic behind it.

## W2-E — consent step back button

**Verified location**: `consent-step.tsx:112-118` (`ApplicationNavigation` call), matched
exactly. Step 1's `onBack` pushed to `/health/applications/new` — itself.

**Fix**: `showBack={false}`, dropped `onBack`/`backLabel` props (dead once `showBack=false`).

**RED**: `not "ย้อนกลับ"` failed (back button rendered). **GREEN**: `Tests: 2 passed, 2 total`.

## W2-F — step 2 (plant-selection) dead weight

**Verified**: `<details className="hidden">` at 347-430 (Tailwind `hidden` = `display:none`,
genuinely never visible), `preparationHighlights` memo at 257-306 (only consumer was inside
the hidden `<details>`), 3-tile stat grid at 328-343 (duplicates state the real selection UI
shows). All three confirmed present exactly as described.

**Fix**: deleted all three, plus the now-dead `selectedPlantLabel` / `selectedServiceLabel` /
`selectedPurposeLabel` / `requiredDocumentCount` locals and the `cn` / `APPLICATION_FLOW_STEPS`
/ `SERVICE_OPTIONS` imports that became unused as a result.

**RED**: 3 of 4 assertions failed (details/preparationHighlights text and stat-grid class both
present). **GREEN**: `Tests: 4 passed, 4 total`.

## Verification run (final)

- `npx tsc --noEmit -p tsconfig.json`: **62 lines**, identical to the stated e2e-phase0
  baseline (0 new lines) — checked after every fix, not just at the end.
- `npx eslint` on all 11 touched source files (single combined invocation): **0 errors, 0
  warnings**.
- `npx jest src/app/health/applications`: **36 suites / 230 tests, all green** — includes
  every fix's new test, the pre-existing wizard suites (store, i18n, dedupe, config,
  submit-step-states, etc.), and the untouched `preview`/`renewal`/`[id]` suites (confirms
  the real Phase 0 submission door was not disturbed).
- `dictionary-parity.test.ts`: TH/EN still in lockstep after the documentsStep key deletions.

## Not-reproduced items

None — all six fixes reproduced at (near-)identical line numbers to the audit; only minor
line-number drift (noted per-fix above), no finding was invalidated.

## Files touched (grouped by fix)

**ALREADY COMMITTED** by this agent before the coordinator's no-more-git-ops instruction —
landed cleanly as `35675495` (an earlier attempt, `b738bcba`, collided with a concurrent
agent's commit and got a spliced message; coordinator is handling that history separately;
no code was lost either way):
- `apps/web-app/src/app/health/applications/new/_steps/steps/consent-step.tsx` (W2-E)
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/consent-step-no-back.test.tsx` (W2-E)
- `apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-step.tsx` (W2-B/W2-F)
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/plant-selection-step-dead-weight.test.tsx` (W2-B/W2-F)

**STILL UNCOMMITTED** (working tree only, per coordinator instruction — grouped for serial commit):

**W2-B/W2-C (documents-step.tsx + dictionaries, one commit)**:
- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step.tsx` (modified)
- `apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts` (modified)
- `apps/web-app/src/lib/i18n/dictionaries/sections/en-wizard.ts` (modified)
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/documents-step-one-progress-indicator.test.tsx` (new)

**W2-D (review-step.tsx)**:
- `apps/web-app/src/app/health/applications/new/_steps/steps/review-step.tsx` (modified)
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/review-step-dedup.test.tsx` (new)

**W2-B (production-info-step.tsx)**:
- `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx` (modified)
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/production-info-step-no-duplicate-header.test.tsx` (new)

**W2-B (quality-control-step.tsx)**:
- `apps/web-app/src/app/health/applications/new/_steps/steps/quality-control-step.tsx` (modified)
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/quality-control-step-no-duplicate-header.test.tsx` (new)

**W2-B (farm-info-step.tsx)**:
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx` (modified)
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/farm-info-step-no-duplicate-header.test.tsx` (new)

**W2-A/W2-B (application-step-page.tsx + layout.tsx edit-mode fallback + tip-banner deletion)**:
- `apps/web-app/src/app/health/applications/_components/application-step-page.tsx` (modified)
- `apps/web-app/src/app/health/applications/new/_steps/layout.tsx` (modified — 1-line edit-mode fallback)
- `apps/web-app/src/components/application-flow/step-tip-banner.tsx` (deleted)
- `apps/web-app/src/app/health/applications/_components/__tests__/application-step-page-single-indicator.test.tsx` (new)
- `apps/web-app/src/app/health/applications/new/_steps/__tests__/layout-pill-stepper-edit-mode.test.tsx` (new)

## Step 1 chrome — before → after

| # | Before | After |
|---|---|---|
| 1 | Top pill/chip stepper (layout.tsx) | Top pill/chip stepper (kept, now also renders in edit mode) |
| 2 | Numbered-circle badge "1" | — removed |
| 3 | "ขั้นตอนที่ 1 จาก 8" counter text | — removed |
| 4 | 8-segment labeled mini progress bar | — removed |
| 5 | Tip banner (hint box repeating the subtitle) + toggle button | — removed |
| 6 | Self-referencing back button (→ itself) | — removed |

**5 progress/hint surfaces → 1** (the pill stepper), **plus** the dead back button removed —
step 1 now shows exactly one "where am I" indicator above the form, and the form starts
right after the title/description.
