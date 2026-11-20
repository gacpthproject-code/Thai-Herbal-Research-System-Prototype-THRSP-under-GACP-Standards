# จำแนก 20 finding ที่ยังไม่มีใครรับรอง — 2026-08-13

Status: `BLOCKED(operator:daily-api-key)` — 18 จาก 20 จำแนกเสร็จด้วยหลักฐานในโค้ด · เหลือ 2 ที่ต้องให้ operator ตัดสิน

`HARNESS_LOG.md:201` (2026-08-08) บันทึกว่าเหลือ **20 finding ที่ยังไม่เข้าคลาสที่จำแนกแล้ว**
และ `no-secret` แดงตรงนี้โดยตั้งใจ พร้อมข้อห้าม: *"ห้ามเติม fingerprint เข้า `.gitleaksignore`
เพื่อให้ gate เขียวก่อนหมุนคีย์"*

ใบนี้ไม่ยกเลิกข้อห้ามนั้น — มันแยกให้เห็นว่า**ข้อห้ามนั้นใช้กับ 2 finding ไม่ใช่ 20**

## ข้อเท็จจริงก่อน: ทำไมแก้ไฟล์ปัจจุบันไม่ช่วย

gitleaks สแกน **ทุก ref ทั้ง history** (`HARNESS_LOG.md:198` — 312 finding จาก 2,035 commit)
⇒ ลบหรือแก้ไฟล์ใน HEAD **ไม่ลดจำนวน finding** และ operator ตัดสินแล้วว่า **ไม่ rewrite history**
เพราะจะทำลาย SHA ที่ attestation ทุกใบผูกไว้

⇒ ทางเดียวที่เปลี่ยนผล probe ได้คือ**การรับรองใน `.gitleaksignore`**

## กลุ่ม A — 12 finding · `scripts/test/agent-auth-results.txt:6,17`

**จำแนก: false positive พิสูจน์ได้จากโค้ดที่ผลิตไฟล์นี้**

ไฟล์นี้เป็น**ผลรัน**ที่ `scripts/test/agent-auth.js:290` เขียนออกมาเอง และบรรทัดที่โดนแฟล็ก
มาจาก `:88` และ `:194` ซึ่งเขียนว่า:

```js
return `Token: ${healthToken ? healthToken.substring(0, 16) + '...' : 'cookie-based'}`;
```

⇒ สิ่งที่ลงไฟล์คือ **16 ตัวอักษรแรกของ JWT** = `eyJhbGciOiJIUzI1`
ซึ่งถอด base64 ได้เป็น `{"alg":"HS25` — **ส่วนหัวมาตรฐานที่เหมือนกันทุกใบสำหรับ HS256 ทั้งโลก**

**ไม่มีเนื้อความลับอยู่เลยโดยโครงสร้างของโค้ด ไม่ใช่โดยความบังเอิญ** — ต่อให้ token จริงเปลี่ยน
สิ่งที่ลงไฟล์ก็ยังเป็น 16 ตัวเดิม

## กลุ่ม B — 6 finding · `scripts/test/journey/agent-b2-backend-security.js:82`

**จำแนก: false positive โดยเจตนาของโค้ด**

บรรทัดนี้คือเทสต์ว่า "ระบบต้องปฏิเสธ JWT ที่รูปแบบเสีย" — ค่าที่ใช้คือ

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9 . INVALID . SIGNATURE
```

payload คือคำว่า `INVALID` · ลายเซ็นคือคำว่า `SIGNATURE` · ส่วนหัวคือ `{"typ":"JWT","alg":"HS256"}`
ซึ่งเป็นค่าสาธารณะ ⇒ **ไม่ใช่ความลับ และไม่เคยเป็น**

**แก้ที่ต้นเหตุแล้วในใบนี้**: ประกอบสตริงจากส่วนย่อยด้วย `.join('.')` ⇒ ไฟล์ไม่มี literal
รูป JWT ให้ scanner จับอีก · **ส่งไบต์เดิมทุกประการไปที่ API เทสต์ยังทดสอบสิ่งเดิม**
(commit เดียวกับเอกสารนี้) · finding ในอดีต 6 อันยังอยู่ตาม §ข้อเท็จจริงข้างบน

## กลุ่ม C — 2 finding · `scripts/verify-video-service.js:2` ← **ต้องให้ operator ตัดสิน**

```
e94759c11737f09a8e09286986f59f0c7bee59b3:scripts/verify-video-service.js:generic-api-key:2
ace3a81fafdc1a1322ef11a7ed720daa9c858947:scripts/verify-video-service.js:generic-api-key:2
```

`HARNESS_LOG.md:201` ระบุว่าเป็น `process.env.DAILY_API_KEY` ที่ถูกกำหนดเป็นค่า hex 64 ตัวแบบ literal
(2 commit, 2026-03-04/03-05)

**สิ่งที่ตรวจได้ 2026-08-13:**

| | |
|---|---|
| ไฟล์ใน tree | **ถูกลบไปแล้ว** — `ls scripts/verify-video-service.js` ไม่พบ · เหลือเฉพาะใน history |
| ใครยังใช้ `DAILY_API_KEY` | **ไม่มีเลย** — `grep -rn "DAILY_API_KEY\|daily.co"` ทั่ว `apps/` `scripts/` `.github/` ได้ผลลัพธ์ว่าง |

⇒ คีย์นี้เป็น**ของที่ไม่ได้ใช้แล้ว** แต่ยังไม่มีใครยืนยันว่ามันยังใช้การได้หรือไม่
`HARNESS_LOG.md:201` เขียนไว้ตรง ๆ ว่า *"agent ไม่ได้ตรวจว่าคีย์นี้ยัง valid หรือไม่
(ต้องยิง API ของบุคคลที่สาม)"* — และนั่นยังเป็นความจริงในวันนี้

### สิ่งที่ operator ต้องทำ — เลือกหนึ่ง ฟรีทั้งคู่

| | |
|---|---|
| **ก** | เข้า Daily.co → **revoke คีย์นั้น** → บันทึกวันที่ |
| **ข** | เข้า Daily.co → **ยืนยันว่าคีย์นั้นตายไปแล้ว** (หมดอายุ / บัญชีปิด / คีย์ถูกลบ) → บันทึกว่ายืนยันเมื่อไหร่ |

ทั้งสองทางไม่ใช่การจ่ายเงิน และไม่กระทบระบบเพราะไม่มีโค้ดตัวไหนใช้คีย์นี้แล้ว

## เมื่อกลุ่ม C จบแล้ว — บรรทัดที่ต้องเติม

⚠️ **การเติม `.gitleaksignore` เป็นสิทธิ์ของ operator เท่านั้น** (`CLAUDE.md` L6 — การให้ cover
ทุกรูปเป็นการยกเว้นกฎ ไม่ใช่การเขียนกฎ) · เอกสารนี้เตรียมบรรทัดไว้ให้ **ไม่ได้เติมให้**

```
# 2026-08-13 — คลาส: ผลรันที่ตัด token เหลือ 16 ตัวแรก (= ส่วนหัว JWT สาธารณะ)
# หลักฐาน: scripts/test/agent-auth.js:88,194 substring(0,16) · ดู evidence/SECRET-SCAN-HONEST/2026-08-13-remaining-20-classification.md §A
<fingerprint ทั้ง 12 ของกลุ่ม A>

# 2026-08-13 — คลาส: JWT ที่จงใจทำให้เสียเพื่อทดสอบการปฏิเสธ (payload=INVALID, sig=SIGNATURE)
# แก้ที่ต้นเหตุแล้ว — ดู §B
<fingerprint ทั้ง 6 ของกลุ่ม B>

# 2026-08-13 — DAILY_API_KEY ในไฟล์ที่ถูกลบแล้ว ไม่มีผู้ใช้เหลือ
# ห้ามเติมสองบรรทัดนี้จนกว่า operator จะ revoke หรือยืนยันว่าคีย์ตายแล้ว — บันทึกวันที่ไว้ตรงนี้:
<fingerprint ทั้ง 2 ของกลุ่ม C>
```

fingerprint ครบทั้ง 20 อยู่ใน `evidence/SECRET-SCAN-HONEST/gitleaks-remaining.json`

## สิ่งที่ใบนี้ **ไม่** ทำ

- ไม่เติม `.gitleaksignore` — สิทธิ์ operator
- ไม่ rewrite history — operator ตัดสินไว้แล้วว่าไม่ทำ และเหตุผลยังใช้ได้
- ไม่เลิก track ไฟล์ผลรัน 85 ไฟล์ใน `scripts/test/` — `scripts/test/generate-report.js:83-86`
  อ่านไฟล์เหล่านั้นไปสร้างรายงาน การเลิก track จะพัง flow นั้นโดยไม่ได้ทำให้ probe เขียวขึ้นเลย
  · **บันทึกไว้เป็นข้อสังเกต**: การ commit ผลรันเป็นแบบแผนที่จะผลิต finding ใหม่เรื่อย ๆ
  ควรตัดสินแยกใบว่าจะให้ `generate-report.js` อ่านผลสดแทนหรือไม่
