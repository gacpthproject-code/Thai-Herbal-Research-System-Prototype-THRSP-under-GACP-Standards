# เสนอ: เสียบ probe เข้า CI แบบ allowlist มีวันหมดอายุ

> **agent เสนอ · operator เขียน/merge เอง** — `scripts/probes/*` และ `scripts/check-done.sh` เป็น operator-owned (Law 3.12)
> ตอบคำสั่ง operator 2026-08-06 ข้อ 3 · เลือกทาง **(ข) allowlist** เพราะเสียบตรง ๆ วันนี้ main แดงทันที = block ทุกงานรวม demo prep

## ปัญหาที่แก้

`CLAUDE.md:29` (Law 3.5) เขียนว่า "ตัวเลขเพิ่ม = **CI fail**" · `HARNESS.md:60` ย้ำ "**CI fail ทันที**"
ของจริง: **ไม่มี workflow ไหนเรียก `scripts/check-done.sh` หรือไฟล์ใดใน `scripts/probes/` เลย** — grep ทั้ง `.github/` เจอแค่ 2 บรรทัดใน `CODEOWNERS` (บรรทัดระบุความเป็นเจ้าของ) · `scripts/session-check.sh:12-20` ก็ไม่ได้รัน probe แต่พิมพ์ `probe-results.json` ที่ **cache ไว้**

⇒ ตาม meta-rule ของ `CLAUDE.md:3` เอง (*"กฎที่ไม่มี probe/test pin บังคับ = กฎร่าง"*) กฎที่ pin ด้วย probe **ยังเป็นกฎร่างทั้งหมด**

## กับดักที่ข้อเสนอนี้ต้องไม่ตกลงไปเอง

allowlist คือวิธีที่ง่ายที่สุดที่จะสร้างโรคเดิมซ้ำ — "การป้องกันที่มีอยู่แต่ไม่ป้องกัน" กติกาจึงเป็นดังนี้ **ทุกข้อ FAIL ไม่ใช่ warn**:

| สถานการณ์ | ผล |
|---|---|
| waiver **ไม่มีวันหมดอายุ** | **FAIL** |
| waiver **เลยกำหนดแล้ว** | **FAIL** — ไม่ใช่เตือนต่อไปเรื่อย ๆ (เตือนอย่างเดียว = phantom โดยนิยาม) |
| waiver ค้างบน probe ที่ **ผ่านแล้ว** | **FAIL** พร้อมชี้บรรทัดให้ลบ (หนี้จ่ายแล้ว = คืนสิทธิ์ · ratchet ลงทางเดียว) |
| waiver เซ็นโดยใครที่ **ไม่ใช่ operator** | **FAIL** (Law 3.12 — agent เซ็น waiver ให้ตัวเองไม่ได้) |
| มีไฟล์ `scripts/probes/*.sh` แต่ **ไม่มีบรรทัดในทะเบียน** | **FAIL** — ปิดตระกูล "ตัวตรวจไม่ได้เสียบ" แบบทั่วไป ไม่ต้องไล่ทีละตัว |
| ทะเบียนอ้าง probe ที่ **ไม่มีไฟล์** | **FAIL** |
| บรรทัดผิดรูป / ซ้ำ | **FAIL** |
| `probe-results.json` **ไม่ถูกเขียนใหม่ในรอบนี้** | **FAIL** — ไม่ตัดสิน PR ด้วยไฟล์ cache |
| probe ที่สั่งรันแล้ว **ไม่มีผลออกมา** | **FAIL** — ผลที่หายไปนับเป็นตก ไม่ใช่ผ่าน |
| **`manual-until:` ไม่มีวันที่** | **FAIL** |
| **`manual-until:` เลยกำหนด** | **FAIL** — จอดชั่วคราวที่เลยกำหนด = ความคุ้มครองที่ไม่มีใครเซ็นต่อ |
| **`manual` / `manual-until` ที่ไม่ได้เซ็นโดย operator หรือไม่มีเหตุผล** | **FAIL** — การเอา probe ออกจาก CI ก็คือการให้ความคุ้มครองเหมือน waiver |
| ใกล้หมดอายุ ≤ 14 วัน (ทั้ง waiver และ manual-until) | เตือน (ไม่แดง) นับถอยหลังให้เห็น |
| `BLOCKED` / `PENDING` | ไม่ gate — เป็นสถานะซื่อสัตย์ตาม contract ของ `check-done.sh` |

### ช่อง `run` มี 3 ค่า (operator สั่งเพิ่ม `manual-until` 2026-08-06)

| ค่า | ความหมาย | หมดอายุ |
|---|---|---|
| `ci` | รันใน CI ทุก PR | — |
| `manual` | ไม่รันใน CI **ถาวร** — เหตุผลยืนพื้นที่ไม่เปลี่ยน (ต้องแตะ DB จริง, ซ้ำกับ job อื่น) | ไม่ต้องมี |
| `manual-until:YYYY-MM-DD` | ไม่รันใน CI **ชั่วคราว** | **บังคับ · เลยกำหนด = FAIL** |

**ทำไมต้องมีค่าที่สาม**: ถ้ามีแค่ `manual` แถวที่ตั้งใจจอด "ชั่วคราว" จะจอดตลอดกาล — เป็น phantom ตัวเดิมที่ย้ายจากคอลัมน์ waiver ไปคอลัมน์ run เท่านั้น
ปัจจุบันมีแถวเดียวที่ใช้ค่านี้: **`report-integrity` → `manual-until:2026-09-15`** (ต้องแก้ให้รับ path ชัดเจนก่อน ไม่งั้นวางไฟล์ plan ก็ผ่าน) · ส่วน `suite-green` / `money-equation` / `drain-complete` / `stripe-keys-ready` / `crawler-clean` / `evidence-complete` เป็น `manual` ถาวรโดยมีเหตุผลจริง จึงไม่ต้องมีวัน

## ไฟล์ที่เสนอ

| ไฟล์ | ปลายทาง | หมายเหตุ |
|---|---|---|
| `probe-registry.txt` | `scripts/probes/probe-registry.txt` | ทะเบียนเดียว (SSOT, Law 3.6) — ทุก probe ต้องมีบรรทัดเดียวพอดี ระบุ `ci` หรือ `manual` พร้อมเหตุผล |
| `probe-gate.js` | `scripts/ci/probe-gate.js` | ตัว gate — รัน probe ที่ mark `ci` แล้วตัดสินตามตารางด้านบน |

**waiver ที่ตั้งไว้ 2 รายการ หมดอายุ `2026-09-15`** (≈40 วัน — ครอบ demo แล้วเหลือเวลาเผาหนี้):
- `no-skip` → L-006 (10 conditional skip ผูก env E2E)
- `holiday-single-source` → L-001 (2 calendar sources, ยุบใน Wave 3 §4.1)

> operator แก้วันได้ตามใจ — แต่ **ต้องมีวัน** ระบบไม่ยอมให้เว้น

## ผลข้างเคียงที่ทะเบียนจับได้ทันทีที่เขียน

`tier-check` **มีไฟล์อยู่แต่ไม่เคยอยู่ใน `DEFAULT` ของ `check-done.sh`** ⇒ ไม่เคยถูกเรียกโดยอัตโนมัติเลย · ทะเบียนบังคับให้ต้องตัดสินใจกับมัน จึงถูกดึงเข้ากอง `ci` ในข้อเสนอนี้

## หลักฐานการทดสอบ (Law 3.11 — RED จริงก่อนเคลม)

รันจริง 2026-08-06 ด้วย `PROBE_GATE_ROOT` / `PROBE_REGISTRY` override (ไม่แตะ `scripts/probes/`):

| # | สถานการณ์ | คาดหวัง | ผลจริง |
|---|---|---|---|
| 1 | สภาพจริงวันนี้ (2 FAIL, waived, ยังไม่หมดอายุ) | PASS | `exit 0` — "8 CI probe(s) adjudicated, 3 note(s)" |
| 2 | waiver หมดอายุ `2026-07-01` | FAIL | `exit 1` — "waiver EXPIRED 36 day(s) ago (registry:17)" |
| 3 | waiver ค้างบน `ratchet` ที่ PASS | FAIL | `exit 1` — "PASSES but still carries a waiver at registry:19 … delete that line" |
| 4 | ลบบรรทัด `tier-check` ออกจากทะเบียน | FAIL | `exit 1` — "exists but has NO registry line" |
| 5 | `waived` ไม่มีวันที่ | FAIL | `exit 1` — "an expiry date is mandatory" |
| 6 | waiver เซ็นโดย `agent` | FAIL | `exit 1` — "a waiver must be signed by 'operator' (Law 3.12)" |
| 7 | เหลือ 6 วันก่อนหมดอายุ | PASS + เตือน | `exit 0` — "expires in 6 day(s) — after that this gate goes red" |
| 8 | `manual-until` ยังไม่ถึงกำหนด | PASS + note | `exit 0` — "parked out of CI until 2026-09-15 (40 day(s) left)" |
| 9 | `manual-until:2026-07-01` (เลยกำหนด) | FAIL | `exit 1` — "which passed 36 day(s) ago (registry:42) … re-sign a new date" |
| 10 | `manual-until` ไม่มีวันที่ | FAIL | `exit 1` — "'manual-until' requires a date — write 'manual-until:YYYY-MM-DD'" |
| 11 | `manual` ถาวรเซ็นโดย `agent` | FAIL | `exit 1` — "keeping 'suite-green' out of CI must be signed by 'operator' (Law 3.12)" |
| 12 | `manual-until` เหลือ 6 วัน | PASS + เตือน | `exit 0` — "temporary 'manual' parking expires in 6 day(s) — after that this gate goes red" |

**บั๊กที่การทดสอบจับได้ และแก้แล้ว**: รอบแรก gate อ่าน `evidence/probe-results.json` โดยไม่รู้จัก `PROBE_OUT_DIR` ⇒ ตัดสินด้วย**ไฟล์เก่า** — โรคเดียวกับ `session-check.sh` เป๊ะ · แก้สองชั้น: (1) เคารพ `PROBE_OUT_DIR` เหมือน `check-done.sh` (2) เทียบ mtime ก่อน/หลัง — ถ้าไฟล์ไม่ถูกเขียนใหม่ = FAIL

## diff `.github/workflows/ci.yml`

เสียบเข้า job `enforcement-guardrails` (`:316`) ซึ่งอยู่ใน `needs:` ของ gate สุดท้ายแล้ว (`:884`) จึงบล็อกได้จริง

```diff
@@ .github/workflows/ci.yml — job enforcement-guardrails @@
       - name: Enforcement guardrails
         run: node scripts/ci/check-enforcement-guardrails.js
+
+      - name: Probe gate (HARNESS.md §4 registry)
+        # Wires the probe registry into CI for the first time. Waivers live in
+        # scripts/probes/probe-registry.txt and MUST carry an expiry date; an
+        # expired waiver fails this step rather than warning forever.
+        run: node scripts/ci/probe-gate.js
```

## ขอบเขตที่ **ไม่** ครอบ (ต้องพูดพร้อมกันเสมอ)

- probe ที่ mark `manual` **ไม่ได้รันที่นี่** — gate เขียวไม่ได้แปลว่ามันผ่าน · แต่ละตัวมีเหตุผลเป็นลายลักษณ์อักษรในทะเบียน เพื่อให้ "ไม่อยู่ใน CI" เป็น**การตัดสินใจที่เซ็นแล้ว** ไม่ใช่การลืม
- `suite-green` ไม่รันซ้ำเพราะ job `Test` รัน suite เต็มอยู่แล้ว — ถ้า job นั้นอ่อนลง gate นี้ไม่รู้
- `report-integrity` ยังเสียบไม่ได้จนกว่าจะแก้ให้รับ path ชัดเจน (ตอนนี้เลือกไฟล์ `.md` ใหม่สุดอัตโนมัติ → ผ่านได้ด้วยไฟล์ plan)
- gate นี้ตรวจ **repo** ไม่ได้ตรวจ **host** — backup cron, RLS ที่รันจริง, cert บนเครื่อง ยังต้องตรวจฝั่ง server
