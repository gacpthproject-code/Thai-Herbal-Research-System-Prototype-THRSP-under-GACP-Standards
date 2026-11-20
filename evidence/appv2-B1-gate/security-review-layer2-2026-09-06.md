# Security review, layer 2 — the whole branch (Tier C)

`scripts/probes/tier-check.sh` answers **TIER=C** for this branch, so §5 requires
everything Tier B requires (which includes `security-review`) plus operator merge.
Layer 1 ran on 2026-09-05 over the five B1 commits (`d183f506`). Fifty-four more
commits landed after it. This is layer 2, over all 60.

Scope reviewed — the surfaces where an exploitable defect can actually live, not
the whole diff: every file `tier-check.sh` classed C, plus every route, guard and
projection reachable **without credentials** or **across a tenant boundary**.

| surface | file | verdict |
|---|---|---|
| anonymous scan projection | `services/trace-service/public-farm.js` | **pass** — no internal id, no GPS; address opened by the 2026-09-05 ruling with a recorded return date |
| anonymous lot/batch doors | `routes/api/trace/trace-batch-lot-routes.js` | **pass** — both doors now share the one projection; farm primary key still withheld |
| farm-level lab claim | `services/lab-evidence-service.js` | **pass** — `findFarmLabResultMarkers` selects `{id,isDeleted,uploadedAt}` only, so a farm's other batches leak no file, lab name or report number |
| public COA files | `middleware/uploads-access.js` + `services/storage-service.js` | **pass** — `lab-results/` is public by the same ruling; names are `Date.now()-uuid<ext>` so they cannot be enumerated, the stored extension is derived from the allow-listed mimetype (never from `originalname`), and content is inspected after storage |
| COA upload door | `routes/api/cultivation/harvest-batches.js` | **ONE FINDING — fixed, see below** |
| officer review doors | `routes/api/provider/document-reviews.js` | **pass** — all three carry `authenticateProvider` + `requireCanonicalPermission(APPLICATION_DOC_REVIEW)`; `canonical-rbac.js` grants it to DOCUMENT_REVIEWER and AUDITOR only, never HEALTH |
| farmer revision door | `routes/api/applications/revision-resubmit.js` | **pass** — the filing is loaded `where: { id, healthId: identity.healthId }`, so another applicant's id is a 404, not a 403 that confirms it exists |
| tenancy | `services/tenant-prisma-extension.js` | **pass** — the diff only ADDS `BatchLabResult` to the scoped set, and the door takes `organizationId` from the batch, never from the caller |
| staff visibility | `shared/application-visibility.js` | **pass** — the new `{ reviewerId: userId }` clause widens an auditor's list to work assigned TO them; status stays a sibling AND, and only a scheduler writes `reviewerId` |
| IdP origin resolution | `lib/api/idp-client.ts` | **pass** — env var, else the page's OWN origin, else localhost. Same-origin cannot send credentials anywhere the page is not already served from, and nginx routes `/api/auth/` to the backend directly, so ruling R-B's ban on the Next `[...path]` proxy still holds and `idp_state` stays host-scoped |
| secret material | `config/boot-secret-guard.js` | **pass (L2)** — every reported `detail` is an `err.message` or a fixed string; no branch can print key bytes or the passphrase |

## The finding — fixed in `2404d591`
**A COA upload refused for lack of authorization left its bytes on a public mount.**

multer stores the file before the handler runs. The handler discarded it on both
validation refusals and on neither authorization refusal (401 / 404 / 403), so a
caller aimed at someone else's batch left a file in `lab-results/` — a folder
`classifyUploadsPath` deliberately treats as public — with no row pointing at it.

Not remotely reachable: names are uuid-based and the refusal never returns one. The
reason to fix it is at the other end — **a file no row references is a file the PDPA
retention sweep can never reach, because that sweep walks rows.** A refused COA can
carry personal data.

Introduced by this branch (`3a8259ce`), so it is ours. Three RED tests first, then a
`refuse(status, body)` helper that discards before returning. 21/21 green.

## The same shape elsewhere — flagged, not touched
`routes/api/finance/payment-slips.js:414-422` has it too: disk storage, a role 403
that returns without discarding. **That is a money path, so L3 permits reading and
flagging only** — filed as F-SLIP-01 in BACKLOG-FOUND.md with the proposed diff. It
is milder there: `slips/` is a sensitive folder behind two gates, and reaching the
branch needs a staff login.

`routes/api/audit/onsite.js:655` is **not** an instance — memoryStorage (nothing to
unlink) and `requireRole` runs before multer.
