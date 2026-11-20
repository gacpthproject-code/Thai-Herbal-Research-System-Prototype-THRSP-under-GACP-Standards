# M1 — OFFICIAL_LETTER (D-9) — 2026-08-03

Spec source: `evidence/R2-special-reopen/decisions-final.md` (D-9 + แผน M1) ·
`gap-report.md` ข้อ 3 (สามเส้นลบ) · `final-requirements.md` ข้อ 3.
Branch: `feat/r2-m1-official-letter`

## ทำ (file:line)

1. **SSOT vocab** — `apps/backend/shared/notification-kind.js` (ไฟล์ใหม่):
   `NOTIFICATION_KINDS` + `NOTIFICATION_KIND` frozen (`GENERAL`/`OFFICIAL_LETTER`)
   — idiom เดียวกับ `shared/checkout-status.js`
2. **Schema EXPAND** — `apps/backend/prisma/schema/system.prisma:28` (+ คอมเมนต์ :23-27)
   (`kind String @default("GENERAL")`) + `:40` (`@@index([userId, kind])`)
   — additive เท่านั้น ไม่แตะคอลัมน์เดิม
3. **Migration** — `apps/backend/prisma/migrations/20260803120000_add_notification_kind/migration.sql`:
   header EXPAND-only + rollback comment, `BEGIN;`…`COMMIT;`,
   `ADD COLUMN IF NOT EXISTS`, CHECK constraint mirror vocab (idempotent ผ่าน
   `pg_constraint` เพราะ Postgres ไม่มี `ADD CONSTRAINT IF NOT EXISTS`),
   `CREATE INDEX IF NOT EXISTS`
4. **เส้นลบ 1 — weekly cleanup** — `apps/backend/services/scheduler/job-scheduler.js:10`
   (import) + `:96-107` (`kind: { not: NOTIFICATION_KIND.OFFICIAL_LETTER }`)
5. **เส้นลบ 2 — PDPA erasure** — `apps/backend/services/pdpa-erasure-service.js:96`
   (import), `:45-51` (doc matrix อัปเดต), `:558-562` (`summary.preserved` เพิ่ม
   entry จดหมาย → เข้า audit metadata), `:722-733` (deleteMany ยกเว้น + คอมเมนต์
   อ้างมติ operator 2026-08-03 D-9 → decisions-final.md — ไม่เงียบ)
6. **เส้นลบ 3 — opt-out** — `apps/backend/services/notification-service.js:401-411`
   (คอมเมนต์ประกาศว่าจดหมายไม่ผ่าน gate นี้ — bypass เชิงโครงสร้าง)
7. **Helper M2** — `apps/backend/services/notification-service.js:504-573` (JSDoc) + `:539-572` (function)
   `createOfficialLetter({tx,userId,title,message,metadata,organizationId,type,priority})`
   — เขียนผ่าน tx ของ caller, stamp kind ผ่าน SSOT, ไม่กลืน error, ไม่แตะ
   preferences; export `:657`
8. **Tests** — `apps/backend/__tests__/unit/official-letter.test.js` (14 tests)
   + อัปเดต pin เดิม `__tests__/unit/pdpa-erasure-service.test.js:362-371`
   ให้ตรง where ใหม่ตาม D-9 (ไม่ใช่ assertion reduction — where แข็งขึ้น)

## RED → GREEN

- RED (`red-output.txt`): 10 failed ด้วย assertion จริง / 4 passed
- GREEN (`test-output.txt`): 14/14 + gate regression 4 suites 72/72

### Test ที่เขียวแต่กำเนิด = PIN ไม่ใช่ fix (Law 3.11) — ประกาศ

1. `no backend .js file outside the SSOT file re-spells the official-letter literal`
   — ก่อน implement ไม่มี literal ที่ไหนเลย จึงผ่านแต่กำเนิด (และจับ offender
   จริง 3 ไฟล์ระหว่าง GREEN จน refine ให้อนุญาต namespaced access)
2. `still deletes old read GENERAL notifications` — pin พฤติกรรม cleanup เดิม
3. `still deletes the erased user's other notifications, scoped to that user`
   — pin พฤติกรรม erasure เดิม
4. `negative control: all-off prefs suppress the normal in-app row`
   — pin พฤติกรรม opt-out เดิม (คู่เทียบของ letter bypass)

## Design decisions ที่ spec ไม่ระบุ (ตัดสินเอง + เหตุผล)

1. **`type` ใน createOfficialLetter**: `Notification.type` เป็น NOT NULL ไม่มี
   default ใน schema แต่ signature ตาม spec ไม่มี type → เพิ่ม optional param
   default `NotifyType.INFO`; M2 ส่ง type จริงของจดหมายได้
2. **Helper ไม่ยิง email/SMS**: "email/SMS ตาม channel เดิม best-effort" ตีความว่า
   ช่องทางเดิมคงเดิม — side channel ห้ามยิงใน tx ที่ยัง uncommitted
   (จดหมายอาจ rollback) จึงเป็นงานของ caller (M2) หลัง commit
3. **CHECK constraint ใน migration**: idiom "String + CHECK" ตาม
   `20260802150000_wave1_checkout_engine_expand` (R1) — DB ปฏิเสธค่าที่ vocab ปฏิเสธ
4. **Index เลือก `[userId, kind]`**: รองรับ read surface "จดหมายของ user" ใน M2+;
   เงื่อนไข `kind != OFFICIAL_LETTER` ใน delete path ใช้ index เดิมได้อยู่แล้ว
5. **`summary.preserved` เพิ่ม entry จดหมาย**: การยกเว้น PDPA ต้องไม่เงียบ —
   entry นี้ไหลเข้า audit metadata (`pdpa-erasure-service.js:757` — audit metadata `preserved`) ให้ audit
   trail เห็นการยกเว้นทุกครั้งที่ execute
6. **Grep pin อนุญาต `NOTIFICATION_KIND.OFFICIAL_LETTER`**: spec ข้อ 4 อนุญาต
   "จุด import" — pin ห้ามเฉพาะการ re-spell (quoted literal / bare) นอกไฟล์ SSOT

## ไม่ทำ (นอก scope M1)

- ไม่ผูก caller ใหม่ให้ createOfficialLetter (surface ออกจดหมาย = M2)
- ไม่แตะ waiver code / decision surfaces / RevisionDeadline / cron / reminder job
- ไม่แตะพฤติกรรม kind อื่น (มี pin คุ้มครอง 3 จุด)
- ไม่รัน `prisma generate` — client เดิมยังไม่รู้จัก `kind`; จุดเขียน kind จุดเดียว
  คือ createOfficialLetter ซึ่งยังไม่มี caller ใน M1 → ไม่มี runtime path ชน
  stale client; deploy pipeline ต้อง generate หลัง migrate ตามปกติ

## Verify ซ้ำ

```
cd apps/backend
npx jest __tests__/unit/official-letter.test.js __tests__/unit/payment-reminder-job.test.js \
        __tests__/unit/checkout-schedule-service.test.js __tests__/unit/pdpa-erasure-service.test.js
bash ../../scripts/probes/ratchet.sh
npx eslint shared/notification-kind.js services/notification-service.js \
        services/pdpa-erasure-service.js services/scheduler/job-scheduler.js \
        __tests__/unit/official-letter.test.js __tests__/unit/pdpa-erasure-service.test.js
node ../../scripts/ci/check-banned-terms.js
```

## ข้อจำกัด env (รายงานตามจริง — Law 3.8)

- `npx prisma validate` รันไม่ได้: proxy 403 ที่ `binaries.prisma.sh`
  (engine checksum fetch) — PSL pin ผ่าน regex ใน test แทน
- Full backend suite ไม่ได้รันทั้งก้อนใน session นี้ — รันตาม gate ที่ dispatch
  ระบุ + ทุก test file ที่ require โมดูลที่แตะ (45 ไฟล์: 44 passed,
  1 skipped = conditional เดิม `HELPER_AVAILABLE ? describe : describe.skip`
  `__tests__/integration/cross-system-audit-to-cert-flow.test.js:326` มีก่อนงานนี้)
