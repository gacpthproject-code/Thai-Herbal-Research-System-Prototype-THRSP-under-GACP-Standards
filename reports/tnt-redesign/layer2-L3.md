## layer2-L3 — the farmer sees the code and can put it on a post — 2026-08-24
Status: PENDING

Did:
- RED first, both suites failing before any source change:
  `src/app/health/planting/[id]/__tests__/overview-plots-plot-code.test.tsx` (5 failed)
  and `src/app/health/planting/[id]/plot-signs/__tests__/plot-sign-sheet.test.tsx`
  (suite failed to run: `Cannot find module '../plot-sign-sheet'`). Output pasted below.
- Plots tab now carries the permanent code, not the per-season one
  (`planting-cycle-detail-tabs-section-a-overview-plots.tsx`): the old "QR รายแปลง"
  column is now "รหัสแปลง" and renders `plotCode` in mono/uppercase Latin on the
  desktop row AND in a bordered block on the mobile card, above the actions and at
  body size — that line is what gets read down a phone when the printed QR stops
  scanning. `data-plot-code` marks it for tests.
- Print affordance: one press per plot ("พิมพ์ป้าย") and one for the whole cycle
  ("พิมพ์ป้ายทุกแปลง"), both to `/health/planting/{cycleId}/plot-signs[?code=…]`.
  Mobile buttons moved from `compact-xs` (24px) to `sm` (36px) for outdoor thumbs.
- New print view `plot-signs/` (page.tsx + client-view.tsx + plot-sign-sheet.tsx):
  one plot per page (`break-after-page last:break-after-auto`), black-on-white via
  `print:` overrides so a viewer in dark mode does not print a page of solid ink,
  QR on a white plate that IS the quiet zone, plot name + farm name above, the code
  in `font-mono text-4xl` beneath. QR is level H, margin 4, encoding the PERMANENT
  URL `/trace/plot-cycle/<plotCode>` — never the per-cycle `qrCode`, which is unique
  per (cycle, plot) and would go dead on the post at the next planting.
- Revocation is surfaced honestly: `qrRevokedAt` renders "ป้ายถูกยกเลิก" (desktop
  badge / mobile sentence), the button becomes "พิมพ์ป้ายใหม่", the href carries the
  plot's OWN code, and the reprinted sign says "พิมพ์ใหม่แทนป้ายเดิม รหัสแปลงเดิม".
  A test pins that the reprint href equals the revoked plot's code.
- No-code state says "ยังไม่มีรหัสแปลง" and offers no print, rather than a blank cell
  and a button that would print a sign with nothing on it.
- QR geometry checked with the repo's own `qrcode` package, not assumed:
  60-char URL -> version 6, 41x41 modules; at the 320px plate that is ~2.07 mm per
  module on A4, well above the ~0.6-1 mm where phone scanning starts to fail.

Blocked / not fixed here (backend, not my lane):
- `GET /planting-cycles/:id/plot-qrs` does not return the permanent fields. The row
  builder at `apps/backend/routes/api/cultivation/planting-cycles-unit-plot-routes.js:244-252`
  emits cyclePlotId/plotId/plotName/qrCode/trackingUrl/cultivationMethod/allocatedAreaSqm/
  plannedPlantCount and nothing else. It needs `plotCode`, `qrIssuedAt`, `qrRevokedAt`
  from `assignment.plot`. Until it does, every screen in this layer renders the honest
  "ยังไม่มีรหัสแปลง" state on real data. Both tests stub the three fields exactly as
  the UI reads them, so the wiring is pinned in advance.
- Consequence: NO live view-pack. The route cannot show a real sign until that field
  lands, and the database holds zero plots. Claiming a green live walk would be
  fabrication. Status stays PENDING for that reason alone; the code and its tests are
  done.

Judgement calls, stated plainly:
- The sign is a route, not a section, against the "no new screen" preference. Printing
  from inside the cycle page would put tabs, modals and the dashboard shell on the
  paper, and a sign needs one plot per page with nothing else on it. It is one route
  for the whole feature, reached in one press, and it reuses the existing global
  `@media print` block (`src/styles/globals.css:503`) rather than adding print CSS.
- The sign route is keyed by cycle id because the cycle is the only endpoint that
  lists plots today. The sign it prints is permanent and cycle-independent; a
  plot-owned route is the right home once a plots endpoint exists.
- `uppercase` + `tracking-wider` appear only on the Latin-only code, never on Thai
  (thai-ui-copy rule). Dates go through `formatThaiDate`.

Next:
1. Backend: add plotCode/qrIssuedAt/qrRevokedAt to the plot-qrs row (one object literal).
2. Then a real walk: create a plot as a farmer, open the plots tab, press พิมพ์ป้าย,
   print to PDF, scan the printed page with a phone. That is the view-pack.
3. Consider showing qrIssuedAt on the tab once the field exists (built for, unused now).

Evidence:
- RED (before): `Cannot find module '../plot-sign-sheet'`; 5 failed in
  overview-plots-plot-code.test.tsx incl. `Expected substring: "ป้ายถูกยกเลิก"` against
  a rendered string containing only the old QR columns.
- GREEN (after): `npx jest src/app/health/planting` -> 12 suites, 59 tests, all passed
  (the 3 pre-existing plots-tab tests included).
- `npx tsc --noEmit` -> zero errors under src/app/health/planting (remaining errors are
  pre-existing, all in e2e-phase0/).
- `npx eslint` on every touched path -> 0 errors, 0 warnings.
