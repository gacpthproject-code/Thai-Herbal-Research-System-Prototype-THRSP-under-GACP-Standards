# เสนอแก้ `CLAUDE.md` §3 — คอลัมน์ Enforcement เขียนสิ่งที่ไม่มีอยู่จริง

> **agent เสนอ · operator เขียน/merge เอง** — `CLAUDE.md` เป็น operator-owned (Law 3.12)
> ตอบคำสั่ง operator 2026-08-06 ข้อ 5 · ตรวจครบทุกแถวไม่ใช่เฉพาะ 3.1 เพราะโรคเดียวกันกระจายมากกว่าหนึ่งข้อ

## หลักที่ใช้ตัดสิน — เป็นของ `CLAUDE.md` เอง

> `CLAUDE.md:3` — *"กฎที่ไม่มี probe/test pin บังคับ = กฎร่าง (`[DRAFT]`) ไม่ถือว่ามีผลจริง"*

ถ้าคอลัมน์ Enforcement เขียนชื่อกลไกที่ไม่มีอยู่ หรือมีแต่ไม่เคยรัน กฎข้อนั้นคือกฎร่างตามนิยามของตัวเอง — และร้ายกว่าการเป็นร่างเฉย ๆ เพราะ**อ่านแล้วเข้าใจว่ามีผลบังคับ**

## ผลตรวจรายแถว (2026-08-06)

| # | Enforcement ที่เขียนไว้ | ของจริง | สถานะ |
|---|---|---|---|
| **3.1** | `branch protection` + ห้ามเรียก merge/deploy command | **`GET branches/main/protection` → 403 "Upgrade to GitHub Pro or make this repository public"** ⇒ repo เป็น private บนแพลนที่ตั้ง branch protection ไม่ได้ · ครึ่งหลัง ("ห้ามเรียก command") เป็นกติกาที่ agent ทำตามเอง ไม่ใช่กลไก | ❌ **ไม่มีกลไก** |
| 3.2 / 3.9 | probe `report-integrity` | ไฟล์มีจริง แต่ registry จัดเป็น `manual-until:2026-09-15` — **ไม่รันใน CI** · และตัว probe เองมีข้อบกพร่องที่เลือกไฟล์ `.md` ใหม่สุดอัตโนมัติ (ผ่านได้ด้วยไฟล์ plan) | ⚠️ **มีแต่ยังไม่รัน** |
| 3.3 | ชั้น 1 `no-secret` · ชั้น 2 TruffleHog | `no-secret.sh` มีจริงและอยู่ในกอง `ci` แล้ว · TruffleHog เป็น job จริงใน `ci.yml` | ✅ **ตรง** (แต่ดู §CI ล่าง) |
| 3.4 | probe `money-write-guard` `[DRAFT]` | **ไม่มีไฟล์ `scripts/probes/money-write-guard.sh`** | ✅ **ซื่อสัตย์อยู่แล้ว** — ติด `[DRAFT]` ไว้ถูกต้อง |
| **3.5** | probe `hardcode-ratchet` — **"ตัวเลขเพิ่ม = CI fail"** | **ไม่มีไฟล์ชื่อ `hardcode-ratchet.sh`** — ตัวนับอยู่ใน `scripts/probes/ratchet.sh` (`count_hardcode` `:13`) ซึ่ง **เพิ่งถูกเสียบเข้า CI ครั้งแรกโดย #813** และ **ยังไม่เคยรันบน runner สำเร็จสักครั้ง** | ⚠️ **ชื่อไม่ตรง + ยังไม่ยืนยัน** |
| **3.6** | probe `sso-registry` | **ไม่มีไฟล์ชื่อนี้** — ของจริงคือ `count_dup_source` ใน `ratchet.sh:33` + probe `holiday-single-source` (ครอบเฉพาะ calendar) | ⚠️ **ชื่อไม่ตรง + ครอบไม่ครบ domain** |
| **3.7** | probe `suite-green` | ไฟล์มีจริง แต่ registry จัดเป็น `manual` **ถาวร** (เหตุผล: ซ้ำกับ job `Test`) ⇒ **probe ตัวนี้ไม่เคยรันใน CI** · ครึ่ง `.skip` ครอบโดย `no-skip` ซึ่งอยู่ในกอง `ci` แต่ **ถือ waiver ถึง 2026-09-15** | ⚠️ **บางส่วน + ถูก waive** |
| 3.8 | `manual — ตรวจใน report review` | ตรงกับความจริง ไม่ได้อ้างกลไก | ✅ **ซื่อสัตย์อยู่แล้ว** |
| 3.10 | `migration review gate` | ไม่มี job/สคริปต์ชื่อนี้ — เป็นขั้นตอนที่คนทำ | ⚠️ **เป็นกติกา ไม่ใช่กลไก** |
| 3.11 | `phase gate ใน check-done` | `check-done.sh` ไม่มีตรรกะ phase — เป็นวินัยของ agent | ⚠️ **เป็นกติกา ไม่ใช่กลไก** |
| **3.12** | `CODEOWNERS + CI path guard` | `.github/CODEOWNERS` **มีจริงและระบุ path ถูกต้อง** — แต่ **CODEOWNERS บังคับได้ก็ต่อเมื่อมี branch protection ซึ่งใช้ไม่ได้ (403)** · และ **ไม่มี CI path guard อยู่จริง** (grep `.github/workflows/` เจอคำว่า CODEOWNERS แค่ในคอมเมนต์) | ❌ **ไม่มีกลไก** |

### หมายเหตุที่ต้องอ่านคู่กัน — CI ทั้งระบบหยุดทำงานอยู่

ตั้งแต่ 2026-08-06 09:06 ทุก workflow run เป็น **`startup_failure`** (34/34 ไม่มีสำเร็จเลย) โดยไฟล์ `.github/` ไม่เปลี่ยน และ GitHub Actions status = Operational
⇒ แถวไหนที่เขียนว่า "CI fail" ตอนนี้**ยังไม่มีผลแม้จะ wire ถูกแล้ว** · เมื่อ Actions กลับมาต้องรันจริงหนึ่งครั้งก่อนจึงถือว่ายืนยัน

---

## diff ที่เสนอ

เสนอ **เพิ่มคำนำหน้าสถานะ** ให้ทุกแถว ใช้คำศัพท์เดียวกับที่ `CLAUDE.md:3` ตั้งไว้อยู่แล้ว:

- `[ACTIVE]` — รันอัตโนมัติ และ**ทำให้ merge ไม่ผ่านได้จริง**
- `[MANUAL]` — มีกลไก แต่ต้องมีคนสั่งรัน
- `[DRAFT]` — **ไม่มีกลไก** เป็นกติกาที่อาศัยวินัยของคนหรือ agent

```diff
@@ CLAUDE.md §3 LAWS @@
-| 3.1 | NO AUTO-MERGE / NO AUTO-DEPLOY | branch protection + ห้ามเรียก merge/deploy command |
+| 3.1 | NO AUTO-MERGE / NO AUTO-DEPLOY | **`[DRAFT]`** — branch protection **ตั้งไม่ได้บนแพลนปัจจุบัน** (private repo → `branches/main/protection` คืน 403 "Upgrade to GitHub Pro or make this repository public") ⇒ ไม่มีอะไรกันการ merge เข้า main เชิงกล · ที่บังคับอยู่จริงคือ **operator เป็นคนกดเอง** + agent ไม่เรียก merge/deploy command · deploy ฝั่ง workflow กันไว้จริง (`deploy-staging.yml` = `workflow_dispatch` only, `promote` = `if:false` — #775) ⇒ **ครึ่ง deploy มีกลไก ครึ่ง merge ไม่มี** · แก้กลับเป็น `[ACTIVE]` เมื่ออัปเกรดแพลนแล้วตั้ง protection ได้ |
-| 3.2 | NO FABRICATED ANYTHING — ... | probe `report-integrity` + spot re-probe โดย check-done |
+| 3.2 | NO FABRICATED ANYTHING — ... | **`[MANUAL]`** probe `report-integrity` (`scripts/probes/report-integrity.sh`) — จัดเป็น `manual-until:2026-09-15` ใน `probe-registry.txt` เพราะยังเลือกไฟล์ `.md` ใหม่สุดอัตโนมัติ (ผ่านได้ด้วยไฟล์ plan) ต้องแก้ให้รับ path ชัดเจนก่อนจึงเสียบ CI ได้ |
-| 3.5 | NO HARDCODE ... | probe `hardcode-ratchet` — **ตัวเลขเพิ่ม = CI fail** |
+| 3.5 | NO HARDCODE ... | **`[ACTIVE — ยังไม่ยืนยันบน runner]`** ตัวนับอยู่ใน `scripts/probes/ratchet.sh` (`count_hardcode:13`) **ไม่ใช่ไฟล์ชื่อ `hardcode-ratchet`** · เสียบเข้า CI ครั้งแรกโดย #813 ผ่าน `scripts/ci/probe-gate.js` ในกอง `enforcement-guardrails` ⇒ ตัวเลขเพิ่ม = CI fail **จะเป็นจริงเมื่อเห็นผลรันเขียวบน runner หนึ่งครั้ง** |
-| 3.6 | SINGLE SOURCE OF TRUTH ... | probe `sso-registry`: นับ source ต่อ domain ต้อง = 1 |
+| 3.6 | SINGLE SOURCE OF TRUTH ... | **`[ACTIVE — ครอบไม่ครบ]`** **ไม่มี probe ชื่อ `sso-registry`** · ของจริง = `count_dup_source` ใน `ratchet.sh:33` (ครอบ domain ตาม `ssot-domains.txt`) + probe `holiday-single-source` ซึ่งครอบเฉพาะปฏิทินวันหยุด ⇒ domain อื่นใน §3.6 (fee table, entity names, role identifiers) พึ่ง `dup-source` counter เท่านั้น |
-| 3.7 | NO SKIPPED TEST / NO ASSERTION REDUCTION ... | probe `suite-green`: test count ≥ baseline, grep `.skip/.only` |
+| 3.7 | NO SKIPPED TEST / NO ASSERTION REDUCTION ... | **`[MANUAL + WAIVED]`** `suite-green` จัดเป็น `manual` **ถาวร** (ซ้ำกับ job `Test`) ⇒ ไม่รันใน CI · ครึ่ง `.skip` ครอบโดย `no-skip` ซึ่งอยู่ในกอง `ci` แต่ **ถือ waiver ที่ operator เซ็นถึง 2026-09-15** (L-006) · ครึ่ง assertion-reduction ครอบโดย `check-green-mask-assertions.js` ซึ่ง `[ACTIVE]` จริง |
-| 3.10 | EXPAND-BEFORE-CONTRACT ... | migration review gate |
+| 3.10 | EXPAND-BEFORE-CONTRACT ... | **`[DRAFT]`** — ไม่มี job หรือสคริปต์ชื่อ "migration review gate" เป็นขั้นตอนที่คนตรวจ |
-| 3.11 | RED-FIRST ... | phase gate ใน check-done |
+| 3.11 | RED-FIRST ... | **`[DRAFT]`** — `check-done.sh` ไม่มีตรรกะ phase เป็นวินัยของ agent + การตรวจของ operator (แนบ output ที่ fail จริง) |
-| 3.12 | agent แก้ CLAUDE.md / HARNESS.md / probe files ไม่ได้ — เสนอ diff เท่านั้น | CODEOWNERS + CI path guard |
+| 3.12 | agent แก้ CLAUDE.md / HARNESS.md / probe files ไม่ได้ — เสนอ diff เท่านั้น | **`[DRAFT]`** — `.github/CODEOWNERS` มีจริงและระบุ path ถูก แต่ **CODEOWNERS review บังคับได้ก็ต่อเมื่อมี branch protection ซึ่งตั้งไม่ได้ (ดู 3.1)** · และ **ไม่มี CI path guard อยู่จริง** — ไม่มี job ไหนตรวจว่า PR แตะไฟล์ operator-owned · สิ่งที่บังคับอยู่ตอนนี้คือ agent ทำตามกฎเอง (ซึ่งวันนี้ทำจริง: ทุก diff ของไฟล์กลุ่มนี้เสนอผ่าน `reports/orchestrator/`) |
```

และเสนอเพิ่มบรรทัดใต้หัวตาราง §3:

```diff
+> **อ่านคอลัมน์ Enforcement ตามคำนำหน้า**: `[ACTIVE]` = รันอัตโนมัติและทำให้ merge ไม่ผ่านได้จริง ·
+> `[MANUAL]` = มีกลไกแต่ต้องมีคนสั่งรัน · `[DRAFT]` = **ไม่มีกลไก** อาศัยวินัยของคน/agent เท่านั้น
+> ตรวจครั้งล่าสุด 2026-08-06 — ดู `reports/orchestrator/2026-08-06-law-enforcement/`
```

## สิ่งที่จะทำให้แถวเหล่านี้กลับเป็น `[ACTIVE]` ได้

| แถว | ต้องทำอะไร |
|---|---|
| 3.1 / 3.12 | อัปเกรดเป็น GitHub Pro **หรือ** เปิด repo เป็น public ⇒ ตั้ง branch protection + required reviews + CODEOWNERS ได้ · นี่คือรายการเดียวที่ปลดสองแถวพร้อมกัน |
| 3.12 (ทางเลือกไม่ต้องอัปเกรด) | เขียน CI job ที่ fail เมื่อ PR แตะ `CLAUDE.md`/`HARNESS.md`/`scripts/probes/` โดยผู้เขียนไม่ใช่ operator — ทำได้เลยไม่ต้องพึ่งแพลน (แต่ยังกัน force-push ไม่ได้) |
| 3.2 | แก้ `report-integrity.sh` ให้รับ path ชัดเจน แล้วเปลี่ยน registry เป็น `ci` |
| 3.5 / 3.6 | เปลี่ยนชื่อใน `CLAUDE.md` ให้ตรงไฟล์จริง (`ratchet`) หรือแยกไฟล์ probe ตามชื่อที่ประกาศ · ขยาย `ssot-domains.txt` ให้ครบ domain ที่ §3.6 ระบุ |
| 3.7 | เผาหนี้ L-006 (10 conditional skip) ก่อน 2026-09-15 แล้วลบ waiver |
| ทุกแถวที่เขียนว่า CI | **Actions ต้องกลับมาทำงานก่อน** — ตอนนี้ 34/34 run เป็น `startup_failure` |

> ห้ามแก้แถวไหนเป็น `[ACTIVE]` ก่อนเห็นผลรันจริงบน runner — นั่นคือวิธีที่ตารางนี้กลายเป็นเท็จตั้งแต่แรก
