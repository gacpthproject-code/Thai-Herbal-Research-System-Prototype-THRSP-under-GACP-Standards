# R2 M3b — AUDIT REPORT (รอบ 3) — **FAIL → ชน circuit breaker → STOP**

- Head ที่ตรวจ: `b228767b` · commit เป้า `0c6a19df` (fix cycle 2/3)
- ผู้ตรวจ: auditor agent (fresh context) — verdict **FAIL, 2 findings, ทั้งคู่ BLOCKING, ไม่มี CRITICAL**
- Orchestrator adjudication: **AF-1 รับ · AF-2 ไม่รับตามที่เขียน** (เหตุผลด้านล่าง)
- **สถานะ: PR #734 merged เข้า main ไปแล้วก่อน audit รอบนี้จะกลับมา** — finding ที่เหลืออยู่บน main

---

## สรุปคำตัดสินของ orchestrator

| finding | auditor ว่า | orchestrator ตรวจเองแล้วว่า |
|---|---|---|
| **AF-1** — บล็อก `notes.md:256-279` ไม่ใช่ output ดิบ, เหตุผล "แก้ = ปลอม evidence" ที่ `:545` ไม่มีฐาน, claim เท็จยังนั่งที่ `:262` ไม่มี marker | BLOCKING · ประเด็นเดิม (F3) | **ยืนยัน — จริงทุกองค์ประกอบ** (รันสคริปต์ที่ตีพิมพ์เองแล้ว) |
| **AF-2** — §9.3 `notes.md:567-568` ตีกรอบเงื่อนไข dispatch ใหม่ย้อนหลังให้แคบลง | BLOCKING · ประเด็นเดิม | **ไม่รับตามที่เขียน** — implementer quote dispatch ตัวจริง**ถูกต้อง**; auditor เทียบกับ log สรุปของ orchestrator ซึ่งเป็นคนละข้อความ (ดู §AF-2 ล่าง) · แต่เปิดโปงข้อบกพร่องจริงของ **orchestrator เอง** |

**ผลต่อ circuit breaker: AF-1 = ประเด็น F3 รอบที่ 3 ⇒ ครบ 3 cycles ⇒ STOP ตาม `CLAUDE.md` §7
ห้าม dispatch fix cycle 4 — operator ตัดสิน**

---

## AF-1 — รับ (BLOCKING, Law 3.2 + 3.9)

**ที่:** `evidence/R2-special-reopen/M3b/notes.md:262` (claim เท็จที่ยังอยู่) · `:545` (เหตุผลที่ยกมาปกป้อง)
· `:399-412` (สคริปต์ที่ตีพิมพ์)

`notes.md:545` อ้างว่าไม่แก้บล็อกนั้นเพราะ **"มันคือ output ที่รันจริงและการแก้ = ปลอม evidence"**

### orchestrator รันสคริปต์ที่ตีพิมพ์เองแบบ verbatim — ข้ออ้างไม่จริง

```
$ sed -n '399,412p' evidence/R2-special-reopen/M3b/notes.md > parity.js
$ cd apps/backend && node -e "$(cat parity.js)"
normalizeRole(auditor) = auditor
...
hasPermission(auditor, APPLICATION_WORKFLOW_TRANSITION) = true      ← ของจริง
hasPermission(approver, APPLICATION_WORKFLOW_TRANSITION) = true
...
AUDIT_CONFIRMED -> REJECTED : auditor
REQUIRES_COMMENT_TARGETS.has(REJECTED) = true

$ grep -c '^--' parity.out
0                                                                   ← ไม่มี label สักบรรทัด
```

เทียบกับบล็อกที่ `notes.md:256-279`:

| จุดต่าง | ที่เขียนใน notes | สคริปต์ที่ตีพิมพ์ผลิตจริง |
|---|---|---|
| หัวข้อ `-- 1..5 --` (`:256,262,268,274,276`) | **มี 5 บรรทัด** | **0 บรรทัด** — ไม่มี `console.log` ตัวใดพิมพ์ |
| บรรทัด permission (`:269-273`) | `hasPermission(auditor, 'application.workflow.transition')` | `hasPermission(auditor, APPLICATION_WORKFLOW_TRANSITION)` — **ต่างข้อความทั้ง 5 บรรทัด** |

⇒ บล็อก `:256-279` **เป็น transcript ที่พิมพ์แต่ง ไม่ใช่ output ดิบ** ดังนั้น:

1. เหตุผล "แก้ = ปลอม evidence" (`:545`) **ไม่มีฐาน** — การใส่ marker ในบล็อกนี้ไม่ได้แก้ output ของโปรแกรม
2. ข้อความที่ `:544` ("เป็น label ที่ผมพิมพ์เองในสคริปต์") **ขัดกับตัวสคริปต์เอง** — label ไม่ได้อยู่ในสคริปต์
   ที่ตีพิมพ์; ถ้าจะอ้างว่าสคริปต์ที่รันจริงคนละตัวกับที่ตีพิมพ์ ก็จะทำให้ `:252` ("สคริปต์เดียวกันทำซ้ำได้")
   เป็นเท็จแทน
3. claim เท็จของ F3 (`buildTransitionUpdate -> assertTransition -> canRoleTransition`) **ยังนั่งอยู่ที่ `:262`
   โดยไม่มี marker ในที่** ทั้งที่กลไก marker มีอยู่และ implementer ใช้จริงแล้ว 2 จุดในดิฟรอบเดียวกัน
   (`:294`, `:302`) — ต้นทุนเป็นศูนย์
4. เกณฑ์ "ชัดพอสำหรับคนอ่านบล็อกนั้นไหม" **ไม่ผ่าน**: ข้อความเท็จอยู่ `:262`, marker แรก `:294`
   (ห่าง 32 บรรทัด และพูดถึง "ข้อ 4" ไม่ใช่ label), การเปิดเผยจริง `:542-546` (ห่าง 280 บรรทัด
   ใต้หัวข้อ "หมายเหตุเพิ่ม")

auditor เสริม (orchestrator ไม่ได้ตรวจซ้ำ แต่สอดคล้อง): บล็อก evidence อื่นใน §9.1 **verbatim ตรงทุกไบต์**
(grep 28 บรรทัด `:447-474` diff ว่าง · exports 15 ตัว `:436-440` ตรงหมด) ⇒ implementer แนบ output ดิบได้
เมื่อต้องการ ยิ่งตอกว่าบล็อก `:256-279` ถูกแต่ง

---

## AF-2 — ไม่รับตามที่เขียน (แต่เปิดโปงข้อบกพร่องของ orchestrator)

auditor อ้างว่า §9.3 (`notes.md:567-568`) quote เงื่อนไข dispatch แบบแคบกว่าของจริง โดยเทียบกับ
`evidence/R2-special-reopen/orchestration-log.md:38` ซึ่งเขียนกว้างว่า
*"ไม่มี capability หาย เพราะ edge เดียวที่เข้า REJECTED ทำได้ครบที่ canonical"*

**แต่ dispatch ตัวจริงที่ orchestrator ส่งให้ implementer เขียนไว้ว่า:**

> ### เงื่อนไขบังคับก่อนเดินแนวหลัก — พิสูจน์ capability parity ด้วยตัวเอง
> ต้องพิสูจน์ (แนบคำสั่ง + output ใน notes) ว่า **ทั้ง `auditor` และ `approver` ยังทำ
> `AUDIT_CONFIRMED → REJECTED` ได้ผ่าน canonical surface** — `POST /provider/applications/:id/workflow-transitions`
> … และเส้นนั้น mint จดหมายจริง

§9.3 quote ว่า *"ทั้ง `auditor` และ `approver` ยังทำ `AUDIT_CONFIRMED → REJECTED` ได้ผ่าน canonical
และเส้นนั้น mint จดหมายจริง"* — **ตรงกับ dispatch ตัวจริง** ⇒ implementer **ไม่ได้**ตีกรอบย้อนหลัง

สาเหตุที่ auditor สรุปผิด: **dispatch prompt อยู่ใน transcript ของ agent ไม่ได้อยู่ในรีโป** auditor
จึงเทียบกับ log สรุปของ orchestrator ซึ่งเป็นสิ่งเดียวที่มองเห็นได้

### แต่สิ่งนี้คือข้อบกพร่องของ orchestrator เอง (Law 3.9)

`orchestration-log.md:38` **paraphrase คำสั่งของตัวเองให้กว้างกว่าคำสั่งจริง** และ log คือ artifact เดียว
ที่ตรวจสอบย้อนหลังได้ ⇒ ผู้ตรวจอิสระอ่านแล้วได้ข้อสรุปผิด **นี่คือปัญหาคลาสเดียวกับที่กำลังตรวจอยู่**
บันทึกลง `BACKLOG-FOUND.md` แล้ว · **กติกาใหม่: log ต้อง quote เงื่อนไขบังคับแบบ verbatim ห้าม paraphrase**

### ส่วนที่ยังมีน้ำหนักใน AF-2
คำถามเชิงเนื้อหาที่ auditor ตั้ง — "proof ที่มีขา admin ผิด ยังผ่านบาร์หรือไม่ และใครเป็นคนตัดสิน" —
**เป็นของ operator จริง** ไม่ใช่ของ implementer; และ §9.2 แถว 3 ก็ยอมรับเองว่า admin
"เปลี่ยนรูปและเข้มขึ้น" (ต้อง `force:true` + reasonCode + comment) = capability ที่เปลี่ยนไปจริง

---

## แกนที่ auditor พิสูจน์ว่าผ่าน (orchestrator ไม่ได้ตรวจซ้ำทั้งหมด — ระบุที่มา)

- **append-only**: `git diff 5e591a85..0c6a19df | grep -c '^-[^-]'` = **0** · `:291-292` md5 `1838671a…`
  ตรงกันทั้ง 3 head (orchestrator ตรวจเองแล้วด้วย)
- **§9.1 ถูกทั้ง 3 ชั้น**: `assertTransition` ไม่ถูก export · grep 28 บรรทัดไม่มีบรรทัดใดเรียกเป็นฟังก์ชัน ·
  `assertTransitionAllowed()` เป็น private ที่ `application-status-writer.js:202` · `:266-268` พูดตรงข้ามจริง ·
  `buildTransitionUpdate` เรียก `canTransition` แบบ 2 args ที่ `:330` ⇒ สาขา `opts.actorRole` ไม่ทำงาน
  (orchestrator ตรวจเองแล้วทั้งหมด)
- **§9.2 ครบ 3 จริง** — auditor หาข้อที่ 4 แล้วไม่เจอ; ผู้สมัครที่ทดสอบแล้วตกไป: WorkActivity ค้าง
  (ไม่ค้าง — `application-status-writer.js:786-799` cancel อัตโนมัติเมื่อเข้า `TERMINAL_STATUSES`),
  mandatory comment หาย (ไม่หาย — `:346` throw ทุกเคส), edge อื่นเข้า REJECTED (ไม่มี)
- **C1-C3 correction ถูกทุกข้อ** · **C4 sweep อิสระ 37/37 call site + 17 citation ของ §9.4 + อีก 12 ตัว
  ที่ §9.4 ไม่ได้แตะ → ถูกทุกบรรทัด** ⇒ ไม่มี claim แบบ F3 ตัวอื่นใน §8.2/§8.3
- **merge M3 ไม่ทำอะไรหาย**: `git diff --name-status 0c6a19df 743d4048` = **ว่าง** · ancestor ครบทุก commit
  ⇒ ไม่มี force-push
- **gates บน HEAD**: jest **7122 passed / 1 failed** (`dataset-export-service.test.js:81` นอกดิฟ) ·
  ratchet **43/59/169/4** · thai-copy exit 0 · banned-terms exit 0 · eslint exit 0

---

## สิ่งที่ operator ต้องตัดสิน

1. **จะให้แก้ `notes.md:262` + `:545` ต่อไหม** — เป็น evidence-only, ไม่กระทบพฤติกรรมระบบ,
   แต่ merged เข้า main แล้ว · orchestrator STOP ตามกฎ ไม่ dispatch เอง
2. **admin delta** — ยอมรับได้ไหมว่า admin ต้องใช้ `force:true` + reasonCode + comment
   เพื่อ REJECT (ลงเป็น `WORKFLOW_FORCE_TRANSITION`) แทนเส้นธรรมดาเดิม · ถ้าไม่ยอมรับ
   ต้องแก้ที่ `ROLE_TRANSITIONS` **ไม่ใช่เปิด work-inbox กลับ**
3. **โค้ดของ M3b เองไม่มี finding ค้าง** — ทั้ง 3 รอบไม่มีใครหาข้อบกพร่องเชิงพฤติกรรมได้
   หลัง fix cycle 1
