# R-HOTFIX-PDPA — PDPA retention sweep must respect legal hold

Branch: `fix/pdpa-retention-legal-hold` (from `origin/main` @ `b9c9e281`)
Date: 2026-08-03

## The defect

`apps/backend/jobs/pdpa-retention-job.js` selected rows on `retainUntil <= now` alone and then
nulled both the identity columns and their hash columns. `grep -n legalHold` on the pre-fix file
returned nothing. A row an operator had frozen would therefore be anonymized on the next 02:30
Asia/Bangkok tick (`apps/backend/jobs/scheduler.js:186`), irreversibly, with no hash left to
correlate it back — destroying exactly the evidence the hold exists to preserve.

The user-initiated erasure paths were already correct and were not touched:
`apps/backend/services/pdpa-service.js:291`, `apps/backend/services/pdpa-erasure-service.js:260,533`
(both throw `PDPA_LEGAL_HOLD`).

## Scope facts, recorded because they contradict the original mandate wording

The mandate spoke of "every model that has this field (application, auth, billing x2,
certification, tenancy)". Verified against the repo:

- This job reads and writes **`prisma.user` only** — `prisma.user.findMany` and
  `prisma.user.update` are its sole Prisma calls.
- Six models declare `legalHold Boolean @default(false)`:
  `Application` (`apps/backend/prisma/schema/application.prisma:163`),
  `User` (`apps/backend/prisma/schema/auth.prisma:162`),
  `Invoice` (`apps/backend/prisma/schema/billing.prisma:113`),
  `PaymentSlip` (`apps/backend/prisma/schema/billing.prisma:512`),
  `Certificate` (`apps/backend/prisma/schema/certification.prisma:117`),
  `Organization` (`apps/backend/prisma/schema/tenancy.prisma:72`).
- Only `User` has a sweep at all. The other five carry the column with **no automated deletion
  path** — they are safe today by accident, not by design.

No sweep was created for those five (explicitly out of scope). Instead the rule was extracted into
`apps/backend/shared/legal-hold-guard.js` so the next sweep anyone writes inherits it, and
`LEGAL_HOLD_MODELS` there is pinned against the Prisma schema by a test that parses
`prisma/schema/*.prisma` — a seventh `legalHold` column cannot appear without that test failing and
forcing someone to ask whether that model's destructive paths honour the hold.

## What changed

1. **`apps/backend/shared/legal-hold-guard.js`** (new) — `legalHoldExclusion()` (where-fragment),
   `legalHoldSelection()` (select-fragment), `isUnderLegalHold(row)` (row predicate),
   `LEGAL_HOLD_MODELS`. Both fragment helpers return a fresh object per call so a caller mutating
   the result cannot disable the guard globally. The module docblock carries the reasoning,
   the two-layer usage recipe, and the fail-closed rule.

2. **`apps/backend/jobs/pdpa-retention-job.js`**
   - Layer 1: `...legalHoldExclusion()` in the `findMany` where-clause; `...legalHoldSelection()`
     in the select so layer 2 has data to read.
   - Layer 2: `if (isUnderLegalHold(user)) { stats.legalHoldSkipped += 1; ...; continue; }` before
     `prisma.user.update`, covering a hold placed between the read and the write.
   - `stats` gained `legalHoldSkipped`.
   - **Removed the `.catch()` fallback** that re-queried on `retainUntil` alone whenever the error
     message mentioned `isAnonymized`. That fallback dropped every other predicate — it would have
     dropped the new legal-hold filter too, making this whole fix inert. The query now fails closed
     and the error propagates to the scheduler's existing try/catch (`apps/backend/jobs/scheduler.js:194`).
   - The `update`-side retry for missing `isAnonymized`/`anonymizedAt` columns is unchanged: it
     omits marker columns, it does not widen what gets destroyed.

3. Tests — see below.

## Operator policy decision, 2026-08-03 — the hold is permanent

> "Legal hold retention: default = a row under hold is never deleted automatically, ever, until a
> person releases the hold themselves."

The implementation already matched this and was not changed to satisfy it; what was added is the
statement of the decision in the code and three tests that pin it:

- `legalHoldExclusion()` is ANDed with the date predicate in the `findMany` where-clause, so no
  `retainUntil` value however ancient can return a held row to the candidate set. It is an
  exclusion, not a date comparison — there is no "skip until X".
- Nothing in the job writes `retainUntil` or `legalHold`. The sweep has no mechanism to extend a
  retention window or to release a hold, which is what makes the skip permanent rather than a
  deferral.
- The decision and its date are recorded in `apps/backend/shared/legal-hold-guard.js` (module
  docblock, POLICY section, and on `legalHoldExclusion`) and in the job docblock, so a later reader
  cannot mistake the guard for a temporary postponement.

## TDD record

`red-output.txt` holds three RED phases.

**Phase 1** (`__tests__/unit/pdpa-retention-job.test.js`, 4 new tests) — 3 failed / 6 passed:
- `filters legalHold rows out at the query layer and selects the column` — `where.legalHold` was
  `undefined`, expected `false`.
- `never anonymises a legal-hold user whose retainUntil is in the past` — `prisma.user.update` WAS
  called for `user-hold-1` with the full null-out payload. This is the headline bug reproduced.
- `fails closed when the isAnonymized column is missing — no unfiltered fallback re-query` —
  `findMany` called 2 times, expected 1 (the fallback fired).
- `fails closed when the legalHold column is missing` — **passed at birth. This is a PIN, not a
  fix** (CLAUDE.md 3.11). The pre-fix `.catch()` only intercepted messages containing
  `isAnonymized`, so a `legalHold` error already rethrew. Mutation-verified below.

**Phase 2** (`__tests__/unit/legal-hold-guard.test.js`, `__tests__/integration/pdpa-retention-legal-hold.test.js`)
— both suites failed to run: `Cannot find module '../../shared/legal-hold-guard'`.

**Phase 3** (`[R-HOTFIX-PDPA] legal hold is permanent, not a deferral`, 3 tests) — reproduced by
reverting both guard layers to their pre-fix state, then reverted back. 2 failed / 1 passed:
- `skips a held row whose retainUntil elapsed 36 years ago` — `prisma.user.update` WAS called for
  `user-ancient-hold`, expected 0 calls.
- `the query excludes held rows unconditionally, not by shifting the date window` —
  `where.legalHold` was `undefined`, expected `false`.
- `never writes retainUntil or legalHold — the sweep cannot defer or clear a hold` — **passed at
  birth. PIN, not a fix** (CLAUDE.md 3.11). The pre-fix anonymisation payload did not contain those
  columns either; the test exists to stop a future edit from adding them.

## Mutation verification

Replacing the fail-closed query with
`.catch(() => prisma.user.findMany({ where: { retainUntil: { lte: now } } }))` — i.e. reinstating
the deleted fallback — turned **both** fail-closed tests red (`findMany` called 2 times, expected
1), including the one that was green at birth. The mutation was reverted; `grep -n "catch(() =>"`
on the job returns nothing.

Removing only the layer-2 `isUnderLegalHold` block, with layer 1 left in place, turns
`never anonymises a legal-hold user whose retainUntil is in the past` red on its own — that test
mocks `findMany` to hand back a held row, so layer 1 cannot rescue it. The two layers are therefore
pinned independently, not as a pair.

## Integration test — NOT RUN HERE

`apps/backend/__tests__/integration/pdpa-retention-legal-hold.test.js` is **written but has never
been executed against a database in this container.** There is no Postgres available and
`prisma generate` is blocked by the outbound proxy. In this environment the suite reports
`1 skipped` via the repo's standard `const d = HAS_DB ? describe : describe.skip` guard
(`DATABASE_URL` is unset). **No claim is made that it passes.** Its evidence must come from CI.

It seeds its own org + users with a `${Date.now()}-${random}` suffix and deletes them in
`afterEach`/`afterAll`, following `apps/backend/__tests__/integration/optimistic-lock-wf-f7.test.js:28-68`.
Seeding and verification use a raw `new PrismaClient()` so assertions read ground truth rather than
the tenant-scoped / soft-delete-filtered view; the sweep itself runs through its own client exactly
as cron does. Seeded rows use `retainUntil = 1990-01-01`, decades past any plausible window, so the
permanence of the hold is what is under test rather than a marginal date. It asserts a held row
keeps `healthId`, `healthIdHash`, `providerId`, `firstName`, its password, its `legalHold` flag and
its original `retainUntil` after a real sweep; plus a control proving an unheld expired row IS
anonymized by the same run; plus a check that Postgres accepts the guard predicate and excludes the
held row.

`.github/workflows/ci.yml` was **not touched** (would conflict with PR #735).

## Gates

See `gates.txt` for raw output.

## Pre-existing failures outside this diff

- `apps/backend/__tests__/unit/dataset-export-service.test.js:81` — `Prisma.dmmf` unavailable.
  Known baseline red, untouched.
- `bash scripts/probes/no-skip.sh` fails on pre-existing `test.skip(...)` calls in
  `apps/web-app/e2e/farmer-services-carpet.spec.ts:141` and
  `apps/web-app/e2e/e2e-golden-scenario.spec.ts:90,117,123,162`. None of the files in this diff
  appear in that output — the `describe.skip` reference used by the integration test is a value,
  not a `.skip(` call, which is why the repo's existing integration tests use that form.

---

# ขั้น 2 — EXPAND `isAnonymized` + `anonymizedAt` (2026-08-03)

## ปัญหา

`jobs/pdpa-retention-job.js` filter และเขียนสองคอลัมน์ที่ไม่มีอยู่จริงมาตั้งแต่ Sprint 6
mock ใน unit suite รับ field ชื่ออะไรก็ได้ suite จึงเขียวมาตลอด และเพิ่งพังตอน
`__tests__/integration/pdpa-retention-legal-hold.test.js` ไปเจอ Postgres จริง

## สิ่งที่ทำ

1. `prisma/schema/auth.prisma:164-182` — `isAnonymized Boolean @default(false)` + `anonymizedAt DateTime?`
   บน model `User` **ตัวเดียว** ไม่แตะ model อื่น
2. `prisma/migrations/20260803130000_add_user_anonymization_markers/migration.sql` — EXPAND ล้วน
   `ADD COLUMN IF NOT EXISTS` สองบรรทัดใน BEGIN/COMMIT · rollback อยู่ในคอมเมนต์ · ไม่ backfill
   timestamp `20260803130000` ตรวจแล้วไม่ชนของเดิม (ตัวล่าสุดก่อนหน้าคือ `20260803122000_add_correction_rounds`)
3. `jobs/pdpa-retention-job.js` — ลบ `.catch()` retry ที่ถอด marker ทิ้ง (เดิม `:194-223`)
4. `jobs/pdpa-retention-job.js:120-126` — เปลี่ยน `OR: [{isAnonymized:false},{isAnonymized:null}]`
   เป็น `isAnonymized: false` (ดูหัวข้อ "สิ่งที่ spec ไม่ครอบ" ด้านล่าง)

## เรื่อง index — ตัดสินว่า **ไม่ใส่**

query ที่ต้องพิจารณา (`jobs/pdpa-retention-job.js:113-138`):

```sql
WHERE "retainUntil" <= now() AND "legalHold" = false AND "isAnonymized" = false
ORDER BY "id" ASC LIMIT 200      -- keyset pagination บน id
```

**1. selectivity ของ `isAnonymized` แย่ที่สุดเท่าที่เป็นไปได้ ไม่ใช่ดีที่สุด**
คอลัมน์มีสองค่า และหลัง migration ทุกแถวเป็น `false` (ไม่ backfill และ production ยังไม่เคยมีแถวถูกกวาด
— `production-query-2026-08-03.md` ยืนยัน `legalHold = 0 แถว` และ `at_risk = 0` ทั้ง 6 ตาราง)
⇒ `isAnonymized = false` match ~100% ของตาราง · b-tree ธรรมดาบนคอลัมน์แบบนี้ planner จะไม่เลือกใช้
เพราะ seq scan ถูกกว่า ⇒ ได้ write amplification บนตารางที่ร้อนที่สุดของแพลตฟอร์มฟรี ๆ
ทุก login เขียน `lastLoginAt`/`loginAttempts` = ต้องดูแล index เพิ่มโดยไม่มีใครอ่าน
ต่อให้เวลาผ่านไปหลายปีสัดส่วนก็ไม่ดีขึ้น เพราะผู้ใช้ที่ยังไม่หมดอายุ (ส่วนใหญ่ของตาราง) เป็น `false` ตลอดไป

**2. predicate ที่ selective จริงคือ `retainUntil` ไม่ใช่ flag**
default คือ `now() + 5 years` (`auth.prisma:161`) ⇒ บนตารางอายุน้อยแทบไม่มีแถวไหนเข้าเงื่อนไขเลย
ถ้าจะ index ให้ตรงจุด ต้อง index `retainUntil` ไม่ใช่ boolean

**3. รูปที่ถูกคือ partial index ไม่ใช่ index ธรรมดา — และมันลงในไฟล์นี้ไม่ได้**

```sql
CREATE INDEX CONCURRENTLY "users_retention_candidates_idx"
  ON "users"("retainUntil") WHERE "legalHold" = false AND "isAnonymized" = false;
```

รูปนี้ดีเพราะ index เก็บเฉพาะแถวที่เป็น candidate จริง และแถวจะ**หลุดออกจาก index เอง**เมื่อถูก anonymize
(index หดลงเรื่อย ๆ แทนที่จะโต) · `now()` ใส่ใน index predicate ไม่ได้เพราะไม่ immutable
จึงต้องอยู่เป็น range scan บน `retainUntil`

แต่ **`CREATE INDEX CONCURRENTLY` รันใน transaction block ไม่ได้** ส่วน `CREATE INDEX` ธรรมดาจับ
`SHARE` lock บน `users` = บล็อก write ของทั้งแพลตฟอร์มตลอดเวลาที่สร้าง
spec ของงานนี้บังคับ BEGIN/COMMIT ⇒ ใส่ในไฟล์นี้ = ต้องเลือกอย่างใดอย่างหนึ่งระหว่าง
"ผิด spec" กับ "write outage ตอน deploy" · ทั้งสองอย่างไม่คุ้มกับ cron ที่รันวันละครั้งตอน 02:30

**4. ไม่มีหลักฐานว่ามีปัญหา performance**
ไม่มี `EXPLAIN` ไม่มีจำนวนแถวจริง ไม่มี `pg_stat_statements` จากคอนเทนเนอร์นี้ (ไม่มี Postgres)
งานนี้เป็นงานความถูกต้อง (สคีมาไม่ตรงกับโค้ด) ไม่ใช่งาน performance
index ที่เดาเอาโดยไม่มี plan จริงแย่กว่าไม่มี index — ถ้าวันหน้า cron โผล่ใน `pg_stat_statements`
ค่อยทำเป็น migration แยกด้วยรูปในข้อ 3 (เหตุผลนี้เขียนไว้ในหัว migration.sql ด้วยแล้ว)

## หลักฐาน

- `red-output-expand.txt` — RED สองรอบ
  - รอบ 1: 4 test แดง (ก่อนแก้อะไรเลย)
  - รอบ 2: หลังเติม field ลงสคีมาแต่ยังไม่แก้ WHERE — test "passes no null predicate to a column
    the schema declares NOT NULL" แดง = ตัวที่ขับให้ต้องแก้ `OR` เป็น `isAnonymized: false`
- `test-output.txt` (ต่อท้าย) — GREEN 17/17 ของ `__tests__/unit/pdpa-retention-job.test.js`
- `gates-expand.txt` — gate ทั้ง 5 + รายการที่รันไม่ได้ในคอนเทนเนอร์นี้

## test ที่เขียวแต่กำเนิด (pin ไม่ใช่ fix — Law 3.11)

- `every column in the SELECT clause is declared on model User` — select ใช้แค่ `id`/`healthId`/
  `providerId`/`retainUntil`/`legalHold` ซึ่งมีครบอยู่แล้ว เขียนไว้กันของใหม่หลุดเข้ามา

## ที่ยังไม่ได้รันจริง — ห้ามอ่านว่าผ่าน

`__tests__/integration/pdpa-retention-legal-hold.test.js` ทั้งไฟล์ (รวม 2 test ใหม่)
**ยังไม่เคยรัน** คอนเทนเนอร์นี้ไม่มี Postgres และ `npx prisma generate` / `npx prisma validate`
ถูก proxy บล็อก (403 จาก `binaries.prisma.sh`) ⇒ ไฟล์ self-skip ผ่าน `HAS_DB` (`:30`)
หลักฐานว่าผ่านต้องมาจาก CI ของ PR #737 เท่านั้น

## แก้การอ้างอิงของหัวข้อ index (Law 3.9) — หลัง `858991bf`

ในหัวข้อ "เรื่อง index" ข้อ 1 ด้านบน ผมเขียนว่า "production ยังไม่เคยมีแถวถูกกวาด" แล้วอ้าง
`production-query-2026-08-03.md` เป็นแหล่ง · **แหล่งนั้นไม่ได้วัดเรื่องนี้** มันรายงานแค่
`legalHold = 0 แถว` และ `at_risk = 0` ซึ่งไม่ได้แปลว่าไม่มีแถวถูก anonymize
(แถวที่ไม่เคยติด hold ก็ถูกกวาดได้) ⇒ ตอนเขียนเป็นการ**อนุมาน**ที่นำเสนอเหมือนเป็นตัวเลขที่วัดมา

แหล่งที่วัดเรื่องนี้ตรง ๆ คือ `retrospective-impact-2026-08-03.md` (commit `858991bf`
ของ orchestrator ไม่ใช่ของผม):
- `anonymized_total = 0` (`:25`) — นับจาก `password = 'PDPA_ANONYMIZED'` ซึ่งเป็น proxy ที่ถูกต้อง
  เพราะช่วงนั้น `isAnonymized` ยังไม่มีอยู่จริงให้นับ
- `expired_now = 0` (`:23`) — ไม่มีแถวไหนเข้าเงื่อนไข `retainUntil <= now()` เลย

⇒ ข้อสรุปเรื่อง index **ไม่เปลี่ยน** แต่แข็งขึ้น: ไม่ใช่แค่ "ทุกแถวเป็น `false`" แต่
`expired_now = 0` แปลว่า predicate ที่ selective จริง (`retainUntil`) กรองทิ้งทั้งตารางอยู่แล้ว
ตั้งแต่ก่อนถึง flag ด้วยซ้ำ — ยิ่งไม่มีเหตุผลให้ index คอลัมน์ boolean
(เหตุผลข้อ 2 ด้านบนที่ว่า default `now() + 5 years` ทำให้แทบไม่มีแถวเข้าเงื่อนไข ตอนนี้มีตัวเลขจริงยืนยันแล้ว)

**ไม่กระทบบั๊กที่แก้ในงานนี้** — คอลัมน์ที่ไม่มีอยู่จริงยังไม่มีอยู่จริง และ sweep ที่เป็น no-op
ก็ยัง throw ทันทีที่ `expired_now` กลายเป็น > 0 ตัวเลขชุดนี้บอกแค่ว่าเจอ**ก่อน**เงื่อนไขทำงานจริง

---

## ขั้นต่อ (2026-08-04) — ลบ fallback ตัวสุดท้ายที่กลบ error บนเส้น self-service erasure

branch `fix/remove-dead-erasure-fallback` (ตัดจาก `origin/main` @ `00445dba`) ·
operator ตัดสิน 2026-08-03 ข้อ 4 · ปิด backlog entry ที่ implementer รอบ #737 ฝากไว้เอง
(`BACKLOG-FOUND.md` — "fallback ที่ถอด marker แบบเดียวกับที่เพิ่งลบ ยังเหลืออยู่อีกที่หนึ่ง")

#737 ลบ retry ที่ถอด marker ออกจาก cron (`jobs/pdpa-retention-job.js`) แล้ว แต่รูปแบบเดียวกัน
ยังเหลือบนเส้นที่**ผู้ใช้กดลบบัญชีตัวเอง** — `controllers/auth-controller/auth-session-security-handlers.js:694-707`
(เลขบรรทัดก่อนแก้) จับ error ที่ข้อความมีคำว่า `isAnonymized`/`anonymizedAt` แล้ว `delete`
สองคีย์นั้นทิ้ง แล้ว `prisma.user.update` ซ้ำรอบสอง

อันตรายเหมือนกันทุกประการ: รอบสองทำ null-out ที่**ย้อนกลับไม่ได้**จนจบ (ทั้ง plaintext และ hash
ของทุก identifier) แล้ว**ทิ้ง marker** ⇒ ข้อมูลหายจริงแต่ไม่มีหลักฐานว่าลบเมื่อไหร่ ·
`anonymizedAt` คือหลักฐาน PDPA ที่ต้องตอบผู้ตรวจ ไม่ใช่แค่ flag กัน idempotency

ตอนนี้คอลัมน์**มีจริงแล้ว** (migration `20260803130000_add_user_anonymization_markers`,
`isAnonymized` NOT NULL default false) ⇒ fallback เป็นทั้ง dead code และตัวกลบ error พร้อมกัน

### ทำอะไร
- `controllers/auth-controller/auth-session-security-handlers.js:694-700` — ลบ try/catch ทั้งบล็อก
  เหลือ `await prisma.user.update({ where: { id: userId }, data: anonymizationData });` ตรง ๆ
  คอมเมนต์ที่แทนอธิบายว่า update เป็น atomic: ถ้าล้ม = **ยังไม่ได้ anonymize อะไรเลย**
  ไม่ใช่สภาพครึ่ง ๆ ที่ต้องกู้ด้วยการเขียนรอบสอง
- `controllers/auth-controller/auth-session-security-handlers.js:687-693` — คอมเมนต์เดิมที่
  `:689` เขียนว่า "may not exist on older schemas; retried below" ล้าสมัยตั้งแต่ #737 merge
  แทนด้วยการชี้ migration `20260803130000_add_user_anonymization_markers` ตรง ๆ + ระบุว่า
  `anonymizedAt` เป็นหลักฐาน PDPA ว่าลบ**เมื่อไหร่** ห้ามถอดทิ้งเพื่อให้ write ที่ล้มผ่าน
- `__tests__/unit/delete-me-erasure.test.js:147` — **แทน** test ที่ pin fallback
  (`falls back to update WITHOUT isAnonymized/anonymizedAt when schema lacks those columns`)
  ด้วยตัวที่ pin พฤติกรรมใหม่ ไม่ได้ลบทิ้งเฉย ๆ (Law 3.7) — จำนวน test ในไฟล์ 6 → 6
  เทสต์อื่นทั้ง 5 ตัวไม่ถูกแตะ

### เทสต์ใหม่ pin อะไรบ้าง
`never retries without isAnonymized/anonymizedAt — a marker failure surfaces, it is not routed around`
1. `mockUpdate` ถูกเรียก **ครั้งเดียว** — ไม่มีรอบสองที่ถอด marker
2. payload ของครั้งเดียวนั้นมี `isAnonymized === true` และ `anonymizedAt instanceof Date`
3. error ไม่ถูกกลืน — ทะลุถึง catch ของ `deleteMe` เอง ⇒ 500 `DELETE_ME_FAILED` (ไม่ใช่ 200)
4. ของท้ายน้ำไม่รัน: ไม่ blocklist JTI / ไม่ revoke session / ไม่ clear cookie
   เพราะบัญชี**ยังไม่ถูกลบ** จะเตะผู้ใช้ออกแล้วบอกว่าสำเร็จไม่ได้

### RED จริง (Law 3.11)
รันบนโค้ดเดิมก่อนแก้ implementation ⇒ `evidence/R-HOTFIX-PDPA/red-output-erasure.txt`
```
✕ never retries without isAnonymized/anonymizedAt — a marker failure surfaces, it is not routed around
    Expected number of calls: 1
    Received number of calls: 2
```
ไม่ใช่ pin ที่เขียวแต่กำเนิด — retry เกิดขึ้นจริงตามที่คาด

### mutation-verify
เอา fallback กลับเข้าไป → เทสต์ใหม่แดงด้วยข้อความเดิม (`Received number of calls: 2`) →
คืนสภาพ → ยืนยันด้วย `sha256sum -c` (`OK`) และ `diff` กับสำเนา green (ว่าง)
**ไม่ได้ใช้ `git status` ว่างเป็นเกณฑ์**

### caller มี error handling อะไรรออยู่ (ตรวจแล้วก่อนลบ)
`deleteMe` ห่อทั้งตัวด้วย try/catch ของตัวเองอยู่แล้ว (`:613` เปิด, `:739-746` catch) —
log ผ่าน `logger.error` แล้วตอบ 500 `DELETE_ME_FAILED` ข้อความ 'ไม่สามารถลบบัญชีได้ กรุณาลองใหม่'
⇒ **ไม่ได้เพิ่ม error handling ใหม่** และ error ไม่ได้หลุดถึงผู้ใช้แบบดิบ · ผู้ใช้เห็นข้อความไทย
ที่บอกให้ลองใหม่ ซึ่งตรงกับความจริง (update เป็น atomic — ล้ม = บัญชียังอยู่ครบ ลองใหม่ได้จริง)
พฤติกรรมที่แย่กว่าคือของเดิม: ตอบ 200 "ลบบัญชีเรียบร้อย" ทั้งที่แถวไม่มี `anonymizedAt`

### Gate — ข้อ 1 ไม่ตรง baseline ของ dispatch (รายงานตามจริง Law 3.8)
`npx jest` เต็มในคอนเทนเนอร์นี้ให้ **6813 passed / 36 failed / 35 suites failed**
ไม่ใช่ 7142 passed / 1 failed ตามที่ dispatch ระบุ · วัด A/B บนเครื่องเดียวกัน รันทีละอัน:
stash diff ออก (= `origin/main` เปล่า) ได้ตัวเลข**เท่ากันเป๊ะ** และ `diff` รายชื่อ suite ที่ fail
ทั้งสองรอบ = **ไม่ต่างกันเลย (35 == 35)** ⇒ delta ของ diff นี้บน full suite = **0**

เหตุ: `jest.config.cjs:29` map `^uuid$` → `<rootDir>/node_modules/uuid/dist/index.js`
แต่ `package.json:54` ประกาศ `^9.0.1` ขณะที่ที่ติดตั้งจริงคือ **uuid 11.1.1** ซึ่งย้ายไป
`dist/cjs/` + `dist/esm/` ไม่มี `dist/index.js` ⇒ 35 suite ตายตั้งแต่ load ด้วย
`Configuration error: Could not locate module uuid` (โผล่ 88 ครั้งใน log)
node_modules drift จาก range ที่ประกาศ — **ไม่แก้ในงานนี้** (นอก scope + reproduce ได้บน
origin/main เปล่า) ลง `BACKLOG-FOUND.md` แล้ว

gate อื่นครบ: ratchet **43/59/169/4 ไม่ขยับ** · eslint exit 0 · thai-copy-style OK · banned-terms OK
รายละเอียดดิบทั้งหมด: `evidence/R-HOTFIX-PDPA/gates-erasure.txt`

---

## แก้ข้อเท็จจริง — `deleteMe` ไม่ได้ต่อกับ route ใดเลย (orchestrator, 2026-08-04, หลัง audit)

auditor รอบ fresh-context ตีกลับ (REJECT) ด้วยเหตุผลเดียว: **คำบรรยายผลงานผิด ไม่ใช่โค้ดผิด**
ผมตรวจซ้ำเองทุกข้อแล้วยืนยันว่า auditor ถูก — บันทึกไว้ตรงนี้แทนการแก้ย้อนข้อความเดิม

### หลักฐาน
- `apps/backend/controllers/auth-controller/auth-session-security-handlers.js:612` นิยาม `deleteMe`
  และ `apps/backend/controllers/auth-controller.js:108` ผูกเข้ากับ `AuthController.prototype`
- ไฟล์เดียวที่ `require` controller ตัวนี้คือ `apps/backend/routes/api/auth/auth-health.js:10`
  และ route ที่ผูกกับ `AuthController` มี **11 บรรทัด** — `:60 :113 :116 :130 :134 :149 :176 :177 :178 :179 :180`
  **ไม่มีบรรทัดใดเรียก `deleteMe`** (`grep -rn "AuthController\." apps/backend/routes/`)
- `grep -rn "deleteMe" apps/ scripts/` เจอเฉพาะ: ตัว handler เอง, log line ในตัวมันเอง,
  `__tests__/unit/delete-me-erasure.test.js`, `__tests__/unit/closing-review-fixes.test.js:47`
  และ `scripts/ci/check-closing-patterns.js:56` (กติกา grep แบบ static) — **ไม่มี route**

### เส้นที่ผู้ใช้กดลบบัญชีจริงคือคนละเส้น
`apps/backend/routes/api/auth/auth-health.js:220`
```
router.delete('/me/delete', authenticateHealth, ...) → pdpaService.softDeleteUser
```
`apps/backend/services/pdpa-service.js:262` เขียนเฉพาะ `isDeleted` `deletedAt` `deletedBy`
`deleteReason` `retainUntil` `sessionsRevokedAt` (`:320-334`) — **ไม่ null PII และไม่เขียน
`isAnonymized`/`anonymizedAt` เลย** การ anonymize เกิดทีหลังโดย nightly sweep
(`jobs/pdpa-retention-job.js`) เมื่อ `retainUntil` ผ่านไปแล้ว

### แปลว่า
1. พฤติกรรมอันตรายที่ commit `c33192ff` อ้างว่าปิด (null PII สำเร็จ + ไม่มี marker + ตอบ 200)
   **เกิดในโปรดักชันไม่ได้อยู่แล้ว** เพราะโค้ดนั้นไม่มีใครเรียก
   ⇒ ดิฟนี้คือ **dead-code cleanup + test pin** ไม่ใช่ hotfix ที่ปิดช่องที่วิ่งอยู่
2. ข้อความที่ต้องอ่านใหม่โดยหักลบข้อนี้:
   - subject ของ `c33192ff`: "…บนเส้น self-service erasure" → ที่ถูกคือ "บน handler `deleteMe`
     ซึ่งยังไม่ถูก wire เข้ากับ route ใด"
   - บล็อกก่อนหน้าในไฟล์นี้: "รูปแบบเดียวกันยังเหลือบนเส้นที่ผู้ใช้กดลบบัญชีตัวเอง" → ผิดด้วยเหตุเดียวกัน
   - หัวข้อ "caller มี error handling อะไรรออยู่" → **ไม่มี caller** สิ่งที่ตรวจไปคือ catch
     ของ `deleteMe` เอง (`:736-743`) ซึ่งยังถูกต้องในฐานะโครงสร้างภายในของ handler
3. ต้นเหตุคือ dispatch ของ orchestrator เอง ที่ยกระดับคำว่า "dead fallback" ในคำสั่ง operator
   ขึ้นเป็น "เส้น self-service erasure" โดยไม่ได้ยืนยัน route ก่อน — ไม่ใช่ความผิด implementer
   (บทเรียนเดิมซ้ำรอบสอง: อ้าง path/เส้นทางจากความจำแทนการ `grep` ยืนยัน)

### ส่วนที่ audit ยืนยันว่าถูก (ไม่ต้องแก้)
- ไม่มี error ดิบหลุดถึง response หรือ log — catch ที่ `:736-743` ตอบ literal คงที่
  500 `DELETE_ME_FAILED` ผ่าน `shared/api-response.js:100-126`
- คำเคลม atomicity ถูก: ระหว่าง `try {` `:613` ถึง `prisma.user.update` `:704` มีแต่ read
  (`findUnique` `:633`, `bcrypt.compare` `:652`) side effect ทั้งหมดอยู่หลัง `:704`
- ไม่มี fallback รูปเดียวกัน (catch → `message.includes(<column>)` → retry แบบถอด field)
  หลงเหลือที่อื่น — auditor ไล่ `jobs/`, `services/pdpa-*.js`, `controllers/`, และ regex multiline
  ทั้ง `apps/` แล้วได้ 0 hit
- test ตัวใหม่ pin ของจริง (mutation โดย auditor เอง → แดงด้วย `Received number of calls: 2`)
  assertion 5 → 9 จำนวน test 6 → 6

### ช่องว่างจริงที่โผล่จากการตรวจนี้ (ยังไม่ทำ รอ operator ตัดสิน)
`deleteMe` เป็น dead code ทั้งก้อน (~130 บรรทัด) ที่ implement การ anonymize ทันที
ซึ่งถูกแทนที่ด้วยดีไซน์ soft-delete-แล้ว-sweep-ทีหลัง ทางเลือก: (ก) ลบทั้ง handler + test
ในงานแยก (ข) wire เข้า route ถ้ายังต้องการ immediate erasure (ค) ปล่อยไว้พร้อมหมายเหตุ
— **ห้ามเลือกเองเพราะกระทบนโยบาย PDPA ว่าคำขอลบต้องมีผลทันทีหรือรอ retention**
