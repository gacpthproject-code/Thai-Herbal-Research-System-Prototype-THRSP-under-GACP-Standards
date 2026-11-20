# เสนอแก้ `CLAUDE.md` + `HARNESS.md` — R-TEST-1 (operator merge เอง, Law 3.12)

**ฉบับที่ 2** — แก้ตามที่ operator สั่ง 3 จุด (2026-08-03): ขยาย pattern detection · allowlist มี expiry ·
จับขาที่ถูกถอดออกจาก CI pattern ด้วย

ที่มา: operator สั่ง 2026-08-03 — "test ที่ self-gate ด้วย env/runtime ทุกตัว ต้องมี guard ยืนยันว่ารันจริง
+ ต้องอยู่ใน CI pattern — เพิ่ม CI check ที่ fail ถ้ามีไฟล์ test ใหม่ที่ self-gate โดยไม่มี guard"

**บทเรียนต้นทาง**: test 2 ตัวที่เขียนไว้พิสูจน์ atomicity ของการออกใบรับรอง และ optimistic lock
**ไม่เคยรันเลยตั้งแต่เขียนมา** — บน CI ไม่ถูก select (ไม่อยู่ใน `--testPathPattern`) ส่วนในเครื่อง
`describe.skip` ตัวเองเพราะไม่มี `DATABASE_URL` จึงรายงานเป็น "skipped" ไม่ใช่ "failed"
⇒ **jest exit 0 ทั้งสองทาง** ไม่มีใครเห็นว่ามันไม่ทำงาน (พิสูจน์แล้วใน PR #735: หลังเพิ่มเข้า pattern
ได้ `passed=5 skipped=0 suites=2` — ครั้งแรกที่รันจริง)

---

## ⚠ ขอบเขตกับ probe เดิม `no-skip` — กันซ้ำซ้อน (Law 3.6)

รีโปมี `scripts/probes/no-skip.sh` อยู่แล้ว ซึ่งจับ `.skip(` / `.only(` / `xit(` / `xdescribe(`
พร้อม allowlist ที่ operator เซ็น (`scripts/probes/no-skip-allowlist.txt`)

**ทำไมมันจับ 5 สวีทนี้ไม่ได้ — พิสูจน์แล้ว**: regex ของมันคือ `\.(skip|only)\(` ซึ่ง**บังคับว่าต้องมี
วงเล็บเปิดตามหลังทันที** แต่รูป self-gate เขียนว่า `const d = HAS_DB ? describe : describe.skip;`
ซึ่งเป็น `describe.skip;` **ไม่มีวงเล็บ** ⇒ หลุดทุกตัว

```
$ printf 'const d = HAS_DB ? describe : describe.skip;\ndescribe.skip("x", ...)\n' > /tmp/t.js
$ grep -nE '\.(skip|only)\(|\bxit\(|\bxdescribe\(' /tmp/t.js
2:describe.skip("x", ...)          ← จับได้เฉพาะบรรทัดที่ 2
                                    ← บรรทัดที่ 1 (รูป ternary) หลุด
```

**การแบ่งเขตที่เสนอ — หนึ่ง domain หนึ่งเจ้าของ**:

| probe | เป็นเจ้าของเรื่อง |
|---|---|
| `no-skip` (เดิม) | **skip marker ตรง ๆ** — `.skip(`, `.only(`, `xit(`, `xdescribe(`, `xtest(` |
| `no-silent-skip` (ใหม่) | **skip เชิงเงื่อนไข/เชิงโครงสร้าง** + **การเป็นสมาชิก CI pattern** |

⇒ probe ใหม่ **ไม่ตรวจซ้ำ** สิ่งที่ `no-skip` ตรวจอยู่แล้ว · ถ้าวันหน้าจะรวมสองตัว ให้รวมเป็นตัวเดียว
ไม่ใช่ให้ทั้งคู่ตรวจเรื่องเดียวกัน

---

## diff ที่เสนอ — `CLAUDE.md` เพิ่มกฎข้อ 3.13 ในตาราง LAWS §3

```diff
 | 3.12 | agent แก้ CLAUDE.md / HARNESS.md / probe files ไม่ได้ — เสนอ diff เท่านั้น | CODEOWNERS + CI path guard |
+| 3.13 | NO SILENT-SKIP TEST — test ที่ถูกทำให้ไม่ทำงานโดยไม่ประกาศ (self-gate ด้วย env/runtime, require ที่ห่อ try/catch, hook ที่ return ก่อน, ถูกถอดออกจาก CI pattern, หรือถูก ignore ใน jest config) ต้อง (ก) อยู่ใน CI test pattern (ข) มี did-it-run guard ที่ fail เมื่อ suite ถูก skip (ค) ถ้ายกเว้นต้องมี allowlist entry ที่มีเหตุผล ผู้อนุมัติ และ **วันทบทวน** | probe `no-silent-skip` (`scripts/ci/check-self-gating-tests.js`) |
```

## diff ที่เสนอ — `CLAUDE.md` §4 DEFINITION OF DONE เพิ่มข้อ 6

```diff
 4. Evidence pack ครบ (HARNESS.md §5)
 5. Report ตาม format §5 ล่างนี้
+6. **ไม่มี test ที่ "เขียวเพราะไม่ได้รัน"** — ถ้างานเพิ่ม/แก้ test ที่ self-gate ต้องแนบหลักฐาน
+   ว่ามันรันจริง (จำนวน passed > 0 และ skipped = 0 **จากผล CI ไม่ใช่จากเครื่อง**)
+   และถ้างานถอดไฟล์ test ออกจาก CI pattern ต้องมี allowlist entry หรือไฟล์นั้นถูกลบจริง
```

## diff ที่เสนอ — `HARNESS.md` §4 probe registry เพิ่ม probe ใหม่

```diff
+### probe `no-silent-skip`
+สคริปต์: `scripts/ci/check-self-gating-tests.js` — รันในงาน `system-integrity` ของ `ci.yml`
+**ไม่ทับ `no-skip`**: skip marker ตรง ๆ (`.skip(` / `.only(` / `xit(` / `xdescribe(`) เป็นของ
+`no-skip` เจ้าเดียว — probe นี้จับเฉพาะรูปที่ `no-skip` มองไม่เห็น (regex ของมันบังคับวงเล็บเปิด)
+
+**ทรงที่จับ (5 ทรง) — คนเขียน test ต้องรู้ล่วงหน้า**
+
+| # | ทรง | ตัวอย่าง | ความแม่น |
+|---|---|---|---|
+| S1 | ternary self-gate | `const d = X ? describe : describe.skip;` · `(COND ? describe : describe.skip)(...)` · เช่นเดียวกับ `it`/`test` | แม่น (syntactic) |
+| S2 | try/catch require ที่ทำให้ suite หายเมื่อ import พัง | `try { h = require('./helpers/x'); AVAIL = true } catch { AVAIL = false }` ที่ scope บนสุด แล้วเอา `AVAIL` ไปคุม describe | แม่น (syntactic) |
+| S3 | hook ที่ return ก่อนโดยมีเงื่อนไข | `beforeAll(() => { if (!X) return; ... })` / `beforeEach` เช่นกัน | **heuristic — มี false positive ได้** ดู "การจัดการ false positive" ล่าง |
+| S4 | `testPathIgnorePatterns` ใน jest config | เพิ่ม entry นอก baseline `['/node_modules/','/.next/','/dist/','/build/']` | แม่น |
+| S5 | **ถูกถอดออกจาก `--testPathPattern`** ของงาน `test` ใน `ci.yml` | ลบชื่อ suite ออกจาก pattern | แม่น (git diff) |
+
+**fail เมื่อ** ไฟล์เข้าทรงใดทรงหนึ่ง **และ** (ไม่อยู่ใน `--testPathPattern` **หรือ** ไม่มี did-it-run
+guard) **และ** ไม่มี allowlist entry ที่ยังไม่หมดอายุ
+
+**S5 ตรวจอย่างไร** — อ่าน pattern จาก `ci.yml` สองฝั่งแล้ว diff:
+ฝั่งฐาน = `git show $(git merge-base HEAD origin/main):.github/workflows/ci.yml` (บน PR)
+หรือ commit ก่อนหน้า (บน push เข้า main) · **entry ที่หายไป = fail** เว้นแต่
+(ก) มี allowlist entry หรือ (ข) ไฟล์ test นั้น**ถูกลบออกจากรีโปจริง** (การลบ dead code ที่ถูกต้อง)
+⇒ กันทั้งขาไป (เพิ่ม test ที่ไม่มีวันรัน) และ **ขามา (ถอด test ที่เคยรันออกเงียบ ๆ)**
+
+**allowlist** `scripts/ci/self-gating-allowlist.json` — ทุก entry ต้องมีครบ 4 field
+`file` · `reason` · `approvedBy` · **`reviewBy`** (วันที่ ISO)
+**probe fail เมื่อเลย `reviewBy` แล้วยังไม่มีการทบทวน** — entry หมดอายุ = ต้องต่ออายุโดยมนุษย์
+พร้อมเหตุผลใหม่ ไม่ใช่ปล่อยยาว ⇒ ข้อยกเว้นไม่กลายเป็นถาวรโดยไม่มีใครดู
+
+**การจัดการ false positive ของ S3**: รายงานเป็น fail พร้อมชี้บรรทัด — ถ้าเป็น false positive จริง
+ให้ใส่ allowlist พร้อมเหตุผลว่าทำไม hook นั้นไม่ได้ทำให้ test ไม่ทดสอบ **ห้ามผ่อน regex เพื่อให้เงียบ**
+(นั่นคือการลดทอน assertion ตาม Law 3.7)
+
+**ทำไมไม่พอถ้าดูแค่ exit code**: jest คืน 0 เมื่อ suite skip ตัวเอง และคืน 0 เมื่อไม่มีไฟล์ไหน
+match pattern เลย ⇒ "เขียว" ไม่ได้แปลว่า "รันแล้วผ่าน"
```

---

## สถานะ self-gating suite ทั้ง 5 ตัวในรีโป (ตรวจ 2026-08-03)

| suite | ทรง | gate | สถานะหลังงานชุดนี้ |
|---|---|---|---|
| `cert-issuance-atomicity-be-t1` | S1 | `Boolean(DATABASE_URL)` `:15` | **แก้แล้ว** — เข้า CI pattern + did-it-run guard (#735, `passed=5 skipped=0`) |
| `optimistic-lock-wf-f7` | S1 | `Boolean(DATABASE_URL)` `:18` | **แก้แล้ว** — เดียวกัน (#735) |
| `pdf-ssrf-interception` | S1 | `resolveChromium()` `:21-29` | **จะแก้** — เพิ่ม browser install + `PUPPETEER_EXECUTABLE_PATH` (operator อนุมัติ) |
| `smoke-all-endpoints` | S1 | `SMOKE_ENABLED === "true"` `:15` | **ยกเว้น** — allowlist + `reviewBy` (operator อนุมัติ) |
| `cross-system-audit-to-cert-flow` | **S2** | `HELPER_AVAILABLE` `:86-91` | **ลบทิ้ง** — dead code, helper ไม่เคยถูก commit (operator ตัดสิน) |

**S2 คือทรงของ `cross-system-audit-to-cert-flow`** — pattern ฉบับแรกจับไม่ได้ operator สั่งให้ครอบ
เพิ่ม ⇒ ฉบับนี้ครอบแล้ว **ถึงจะลบไฟล์นั้นทิ้งแล้ว probe ก็ยังต้องจับทรงนี้ได้** เพื่อกันของใหม่ที่มาแบบเดียวกัน

### allowlist entry ของ `smoke-all-endpoints` (ข้อความจริงที่จะใส่ในไฟล์)

```json
{
  "file": "apps/backend/__tests__/smoke-all-endpoints.test.js",
  "reason": "deploy-target check ไม่ใช่ build-time test — ยิง HTTP จริงไปที่ API_BASE_URL ซึ่งต้องมีเซิร์ฟเวอร์รันอยู่ ไม่มี job ใดใน ci.yml ที่ boot backend ขึ้นมา การบังคับให้รันบน CI = ต้อง boot แอปทั้งตัวในงาน unit test ซึ่งเกินขอบเขต",
  "approvedBy": "operator",
  "approvedAt": "2026-08-03",
  "reviewBy": "2027-02-03"
}
```

**ผูกกับ backlog**: งาน **post-deploy smoke** (ชี้ `smoke-all-endpoints` ไป staging หลัง deploy)
ต้องเสร็จก่อน `reviewBy` **2027-02-03** ไม่งั้น probe จะ fail และบังคับให้ทบทวน —
นี่คือกลไกที่ทำให้ข้อยกเว้นไม่ถูกลืม

---

## หมายเหตุตาม §3 ของ CLAUDE.md เอง
กฎที่ไม่มี probe = `[DRAFT]` ⇒ **3.13 จะเป็นกฎจริงก็ต่อเมื่อ `scripts/ci/check-self-gating-tests.js`
ถูก merge และต่อเข้า `ci.yml` แล้วเท่านั้น** — orchestrator ทำสคริปต์ + allowlist + การต่อเข้า CI ได้
(ไม่ใช่ไฟล์ operator-owned) แต่ **แก้ `CLAUDE.md`/`HARNESS.md` เองไม่ได้** จึงส่ง diff นี้มา

**ลำดับที่เสนอ**: script + allowlist + wiring เข้า `ci.yml` merge ก่อน → operator apply diff นี้ →
กฎ 3.13 พ้นสถานะ `[DRAFT]`
