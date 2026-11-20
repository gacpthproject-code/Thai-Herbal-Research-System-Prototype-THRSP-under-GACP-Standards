# bangkok-time port — evidence index (fix/bangkok-time, 2026-09-26)

Port of 465e3ad4 onto main 9ce3db30 plus three fix rounds. Tier C: operator merges; nothing deployed or pushed by the agent.

| file | what it shows |
|---|---|
| red.txt / green.txt / suites.txt | port of 465e3ad4: RED on main sources, GREEN, first full suites |
| r1-red-backend.txt, r1-red-web.txt, r1-green.txt | fix round 1: Bangkok years/months/times everywhere; three zones |
| r2-red.txt, r2-green.txt, r2-guard-mutations.txt | fix round 2: CN/DN number at issue, scheduler "today", guard patterns, require cycle; full suite under LA/UTC/default |
| r3-red.txt, r3-green.txt, r3-guard-mutations.txt | fix round 3: same-draft issue race on real Postgres, fail-closed guard, legacy drafts keep their number, guard blind spots |
| r5-merge-node24.txt | merge of main 03424563 (Node 24): suites, next build, probes, Postgres re-run |
| r4-red.txt, r4-green.txt | fix round 4: cancel is a conditional write — a cancel racing a post or an issue is refused (real Postgres) |
| ../../apps/backend/__tests__/integration/note-issue-concurrency.test.js | real-Postgres proof, runs whenever the run-level guard finds a database |

## Deploy notes for the operator (NOT run by the agent)

The branch adds one migration: `apps/backend/prisma/migrations/20260926120000_note_number_allocated_at_issue`.
It drops NOT NULL on `credit_notes."creditNoteNumber"` and `debit_notes."debitNoteNumber"`. It is expand-only: no table rewrite, no data change, and the unique indexes stay.

1. **Count first, on every database (demo, staging, production), before migrating.**

       SELECT 'credit' AS kind, count(*) FROM credit_notes WHERE status = 'DRAFT' AND "creditNoteNumber" IS NOT NULL
       UNION ALL
       SELECT 'debit', count(*) FROM debit_notes WHERE status = 'DRAFT' AND "debitNoteNumber" IS NOT NULL;

   These are drafts made by pre-branch code, which drew a number at DRAFT. The new code **keeps** that number when the draft is issued, so the series has no gap. Record the counts so a later audit of the series can explain them.
2. **Migrate before the image.** Run `prisma migrate deploy` first, then start the new image. New code writes NULL numbers for drafts, so on an un-migrated database every new draft insert fails with a NOT NULL violation.
3. **No image rollback past this migration while rows without a number exist.** Pre-branch code issues without allocating, because it expected the number from DRAFT. Rolled back, it would issue a ใบลดหนี้/ใบเพิ่มหนี้ with no number. The schema rollback (SET NOT NULL, in the migration's own comment) fails while ANY row has a NULL number. Before rolling back, list them:

       SELECT 'credit' AS kind, id, status FROM credit_notes WHERE "creditNoteNumber" IS NULL
       UNION ALL
       SELECT 'debit', id, status FROM debit_notes WHERE "debitNoteNumber" IS NULL;

   Then deal with each kind:
   - **`status = 'DRAFT'`** — either **issue** it on the NEW image first (it takes the next number of the Bangkok year), or **delete** it (nothing was ever printed; no number is lost).
   - **`status = 'CANCELLED'`** — a draft cancelled without ever being issued. It was never a tax document and never took a number, so it cannot be issued. It blocks SET NOT NULL, so **delete** it: no number is lost, because the series never included it. Do not try to restore a number to it: that would take a number from the series for a document that never existed and leave a gap. Record the ids deleted.
   - **`ISSUED` / `POSTED`** — cannot occur. Issue writes the number in the same transaction as the status. If one appears, stop and investigate; do not roll back.
4. The image build must run `prisma generate`: the client types `creditNoteNumber`/`debitNoteNumber` as `String?`.
5. Not a deploy step, reported for the operator's decision:
   - The first run of the DTAM remittance batch after deploy labels the Bangkok month (re-review 1, check 4).
   - The period guard now **fails closed**. If period-close-service cannot load, every journal post is refused with PERIOD_CHECK_UNAVAILABLE (503). This is the intended behaviour per the controller ruling. The ADMIN `allowClosedPeriod` bypass works only when period-close fails to load. If the guard module itself fails to load, the ADMIN bypass is refused too, because the loader throws before the flag is read.
   - **Known and accepted (bounded):** a pre-branch draft that already holds a number keeps it at issue. If such a draft is issued in a later Bangkok year (after 1 Jan 2570), it prints the later issue date under the earlier year's number. The step-1 count bounds how many can exist. Issue or cancel those drafts before the year turns to avoid it.
   - **Guard-test residuals (no hits in the tree today; heuristic, not a parser):**
     - `invoice.datePaid.toLocaleString(...)`, because the `paid` suffix reads as a number
     - `d[m]()` with a variable method name
     - a wall-clock string held in a variable, as in `new Date(dayStr + wallClock)`
