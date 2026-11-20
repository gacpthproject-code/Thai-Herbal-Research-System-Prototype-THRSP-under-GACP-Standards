# W8 — Personal workspace team management — 2026-08-22

Branch `feat/personal-workspace-team`, worktree `C:/Users/charo/Documents/GitHub/gacp-wt-team`,
base `main` @ 9e38a74a. No commit made — diff left in the worktree.

## What was already TRUE (not rebuilt)

- Backend capability model is complete: `apps/backend/services/entity-service.js`
  `CAPABILITIES` (74-105), `DEFAULT_PERMISSIONS_BY_ROLE` (172-209),
  `assertCapability` (217-234). `GET /api/entities/:id/my-permissions`
  (`apps/backend/routes/api/entities/index.js:321-354`) returns
  `{ role, personal, effective }`; `personal = role OWNER && entity.type ===
  'INDIVIDUAL'` (line 342-343).
- `apps/web-app/src/lib/services/use-entity-permissions.ts` already gates FE
  buttons on the real `effective` array from that endpoint (fail-open policy,
  SWR cache, eviction-on-403) — this is the mechanism item 4 verifies, not
  something I built.
- `apps/web-app/src/lib/navigation/nav-config.ts`'s `workspaces` tile was
  already renamed off bare "ทีมงาน" to `ผู้ยื่นคำขอ / ทีมงาน` by a prior fix
  (commit 432c84be, U1, pinned by `nav-config.test.ts:114-129`) — I left this
  alone; it already surfaces the team-management purpose from the nav side.
- PDPA masking of a co-member's national ID on the members list
  (`maskHealthIdCard`) was already fixed (BUG C) and is untouched.
- Backend invite/member/transfer-ownership authorization logic — untouched,
  as instructed.

## What I changed

1. **Planting → team affordance** (item 1's remaining gap — nav-level
   findability existed, but nothing inside the planting flow pointed to it).
   `apps/web-app/src/app/health/planting/client-view.tsx`: added a
   secondary-tier link card (below the header, above the filter tabs) →
   `/health/workspaces`, copy: "มีคนช่วยดูแลแปลง? เชิญให้บันทึกการปลูก/เก็บเกี่ยวแทนคุณได้ที่นี่".
   Not a nav tile — N7's primary-tile count (6) is untouched.
2. **Personal-workspace copy** — new pure module
   `apps/web-app/src/app/health/workspaces/[slug]/members/personal-workspace-copy.ts`:
   `isPersonalEntity(type)` (`type === 'INDIVIDUAL'`), `eyebrowFor`/
   `descriptionFor` (swap "Workspace" org-copy for farm copy), and
   `ROLE_CAPABILITY_SUMMARY_TH` — wired into `page.tsx`: SummaryHeader now
   calls `eyebrowFor(personal)`/`descriptionFor(personal, ...)`, and the
   invite form shows the selected role's one-liner live.
3. **Invite identifier** — default changed from `healthId` to `phone`;
   `healthId` (national ID) option **removed entirely** from the UI (see
   finding below), `email` kept as the one secondary option.
4. **Capability-story test** — new describe block in
   `use-entity-permissions.test.ts` proving a MANAGER on a PERSONAL
   (INDIVIDUAL) entity reaches all planting/harvest capabilities and is
   denied `SUBMIT_APPLICATION`/`VIEW_FINANCIAL`/`INVITE_MEMBER`/`EDIT_FARM`,
   asserted via `computeHas`/`resolveFetchOutcome` against a capability
   array mirrored from the backend (not hardcoded UI strings). All green,
   no production-code change needed — the mechanism already worked.

## Role → capability table (entity-service.js:172-209)

| Role | Has | Lacks |
|---|---|---|
| ADMIN (187-197) | SUBMIT_APPLICATION, PRINT_QR, EDIT_FARM, INVITE_MEMBER, REVOKE_MEMBER, VIEW_FINANCIAL, EDIT_ENTITY_PROFILE, all farm-ops | TRANSFER_OWNERSHIP, DELETE_ENTITY, APPROVE_APPLICATION |
| MANAGER (204-207) | PRINT_QR + MANAGER_FARM_OPERATIONS (155-161): CYCLE_CREATE, UNIT_MANAGE, ACTIVITY_×7, HARVEST_RECORD, QR_GENERATE, RECORDS_MANAGE, REPORT_SUBMIT | SUBMIT_APPLICATION (excluded via NOT_A_ROLE_DEFAULT:149), VIEW_FINANCIAL, INVITE_MEMBER/REVOKE_MEMBER, FARM_CREATE/EDIT_FARM |
| VIEWER (208) | (nothing — default permissions `[]`) | every write capability (read-only) |

## Identifier finding (backend check, no logic changed)

`findInviteeByIdentifier` (entity-service.js:1868-1906): **all three**
channels are live and functional — `healthId` (via
`findUserByHealthIdSecurely`), `email`, and `phone` (a prior C2-class bug —
`phoneNumber` vs `phone` column — is already fixed; comment at line 1893-1894
confirms). None is dead code.

Given the 2026-08-17 org-model ruling ("phone/short-code, NOT
national-ID/name/long-numeric"), I removed `healthId` from the UI entirely
(not just as default) — email isn't on that blacklist and the backend
supports it, so it stays as the one secondary option. **Backend gap**:
"short-code" invite (mentioned in the ruling) does not exist as a channel in
`findInviteeByIdentifier` at all — only healthId/email/phone. Not built here
(scope says frontend + one check only); flagging for follow-up.

## RED → GREEN

- `personal-workspace-copy.test.ts`: RED 3 failed / 7 passed (page.tsx not
  wired yet) → GREEN 10/10 after wiring `page.tsx`.
- `invite-identifier-phone-default.test.ts`: RED 4 failed / 1 passed → GREEN
  5/5 after changing default + removing the healthId option.
- `planting-team-affordance.test.tsx`: RED 3 failed / 3 total (no link
  existed) → GREEN 3/3 after adding the affordance.
- `use-entity-permissions.test.ts` new "W8" block: 4/4 green immediately
  (verification test, no production-code change to that file).

## Verification run (this session)

- `nav` + `workspaces` + `planting` + `use-entity-permissions` suites:
  **10 suites / 96 tests, all PASS**.
- `npx tsc --noEmit -p tsconfig.json`: 62 lines of output, all pre-existing
  `e2e-phase0/*.spec.ts` errors (baseline) — zero lines reference any file
  touched here.
- `eslint` on all 7 changed/new files: exit 0, zero output.

## Files touched

Modified: `apps/web-app/src/app/health/planting/client-view.tsx`,
`apps/web-app/src/app/health/workspaces/[slug]/members/page.tsx`,
`apps/web-app/src/lib/services/__tests__/use-entity-permissions.test.ts`

New: `apps/web-app/src/app/health/workspaces/[slug]/members/personal-workspace-copy.ts`,
`.../__tests__/personal-workspace-copy.test.ts`,
`.../__tests__/invite-identifier-phone-default.test.ts`,
`apps/web-app/src/app/health/planting/__tests__/planting-team-affordance.test.tsx`
