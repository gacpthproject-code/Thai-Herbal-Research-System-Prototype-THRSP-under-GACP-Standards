# `check-done.sh` เขียนหลักฐานที่ไม่ใช่ JSON อย่างเงียบ ๆ · 2026-08-14

**Status:** `BLOCKED(operator:merge-tier-c)` — RED/GREEN ครบบน Windows

| | |
|---|---|
| branch | `feat/runtime-deploy-drift` |
| tier | **C** — `scripts/probes/*` = `governance` |
| เจอตอน | ทำแผน deploy-drift Task 4 · `probe-gate` FAIL ทุกครั้งบนเครื่อง dev |

## บั๊กที่ 1 — เครื่องมือหาย แล้วเขียนไฟล์เสียแทนที่จะบอก

`check-done.sh:116` (ก่อนแก้) เข้ารหัส JSON ด้วย `python3` ใน command substitution:

```sh
"detail":$(printf '%s' "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
```

เครื่องนี้ไม่มี `python3` ⇒ substitution คืนสตริงว่าง ⇒ เขียนออกมาเป็น `"detail":}` ทุกแถว

**RED — โค้ดก่อนแก้ รันบนเครื่องนี้:**

```
{"runner":"scripts/check-done.sh","results":[
{"probe":"holiday-single-source","status":"FAIL","detail":}
]}
```

```
ไฟล์: ไม่ใช่ JSON — Unexpected token '}'
```

**GREEN — หลังแก้ รันคำสั่งเดียวกัน:** `ไฟล์: JSON ถูกต้อง`

**ทำไมถึงร้ายแรงกว่าที่เห็น:** หน้าที่ทั้งหมดของ runner ตัวนี้คือผลิตหลักฐานที่เชื่อได้
โหมดล้มเหลว "เขียนของที่ไม่ใช่อย่างที่อ้าง โดยไม่บอกใคร" จึงเป็นโหมดที่แย่ที่สุดที่มันมีได้ ·
และผลลัพธ์ที่ผู้ใช้เห็นคือ `probe-results.json is not valid JSON` ซึ่งอ่านแล้วเหมือน
"ผลตรวจเสีย" ไม่ใช่ "ไม่มีตัวแปลภาษา"

**การแก้ — สองด่าน เพราะจับคนละเรื่อง:**
1. preflight: ไม่มี `node` ⇒ exit 2 พร้อมบอกว่าขาดอะไรและมันใช้ทำอะไร
2. ต่อ probe: encoder รันแล้วคืนค่าว่าง ⇒ exit 2 ก่อนประกอบไฟล์ (จับ shim / ติดตั้งพัง / process ถูกฆ่า)

เลือก `node` เพราะรีโปนี้ต้องการ node อยู่แล้วทุกที่ — `probe-gate.js`, CI ทุกตัว, ตัวแอปเอง

### ชั้นที่สองของบั๊กเดียวกัน

selftest **เคส C** ที่ตรวจว่า "output เป็น JSON ที่ถูกต้อง" ก็ใช้ `python3` ⇒ บนเครื่องที่ไม่มี
มันรายงาน *"probe-results.json is not valid JSON"* ทั้งที่ความจริงคือ *"ไม่มีตัวตรวจ"* —
**การเอาของที่พังไปปนกับเครื่องมือที่หาย** ซึ่งเป็นคลาสเดียวกับที่ `full-gate.sh:1009`
ต้องแก้ให้ gitleaks · แก้เป็น `node` แล้ว

## บั๊กที่ 2 — gate ทำให้ tree ที่มันตรวจสกปรกทุกรอบ

`evidence/probe-results.json` ถูก track อยู่ · ทุกการรันเขียนทับด้วยผลของเครื่องนั้น ⇒ `M` ทุกครั้ง

`HARNESS_LOG.md:190` (2026-08-07) บันทึกอาการนี้ไว้แล้วและแก้ไปหนึ่งชั้น — ทำให้ path
ข้างในเป็น repo-relative · **จำเป็นแต่ไม่พอ**: เนื้อไฟล์คือรายการคำตัดสินของ probe ซึ่ง
ต่างกันตามเครื่องโดยชอบธรรม (`no-secret` BLOCKED เมื่อไม่มี gitleaks · `suite-green` ต้องมีฐานข้อมูล)
⇒ **ไม่มีเวอร์ชันไหนที่ถูกต้องทุกเครื่อง** และสำเนาที่ commit ไว้คือคำกล่าวอ้างเรื่องผล probe
ที่อาจไม่ตรงกับ commit ที่มันวางอยู่ข้าง ๆ · `ci.yml:355` บันทึกไว้เองว่า `session-check.sh`
เคยพิมพ์สำเนาที่ค้างแบบนั้นแทนการรันใหม่

**การแก้:** `git rm --cached` + `.gitignore` · **ไม่ได้ทำให้มันเลิกเป็นหลักฐาน** — HARNESS.md §5
วาง `probe-results.json` ไว้ใน `evidence/<work-item>/` อยู่แล้ว ซึ่งเป็นสำเนาของรอบที่ pack นั้น
รับรอง (ชี้ `PROBE_OUT_DIR` ไปที่ pack) · ที่ตัดทิ้งคือสำเนาลอย ๆ ที่ path ตายตัวซึ่งไม่มีใคร
อ่านข้ามรอบ · มีแบบอย่างอยู่แล้วที่ `.gitignore:193` — `evidence/gate/logs/` ถูกเลิก track
ด้วยเหตุผลเดียวกันเมื่อ 2026-08-08

**ผลจริงหลังแก้:**

```
=== รัน probe-gate เต็ม ๆ แล้วดูว่า tree สกปรกไหม ===
probe-gate exit=1
  ✗ gate-attestation: FAIL and no operator waiver — this is the gate doing its job
  ✗ main-attestation-audit: FAIL and no operator waiver — this is the gate doing its job

=== ไฟล์ที่เปลี่ยนหลังรัน ===
(ว่าง)
```

probe-gate ยังแดงอยู่ แต่**แดงด้วยเหตุผลจริงที่มันควรแดง** ไม่ใช่เพราะอ่านไฟล์ตัวเองไม่ออก

## selftest — 4 เคสเดิม + 2 เคสใหม่

```
--- selftest A: written JSON contains no absolute checkout path              ok
--- selftest B: paths are still THERE, just relative                         ok
--- selftest C: output is valid JSON                                         ok
--- selftest D: console summary does not print the absolute checkout path    ok
--- selftest E: an encoder that returns nothing must ABORT                   ok
--- selftest F: the default output path is not tracked by git                ok
check-done --selftest: 6/6 cases PASS
```

**RED ของทั้งสองเคสใหม่ พิสูจน์แล้วก่อนแก้:**

| เคส | RED |
|---|---|
| E | โค้ดก่อนแก้เขียน `"detail":}` ออกมาจริง — ผลรันอยู่ข้างบน |
| F | `*** F FAILED: evidence/probe-results.json is tracked ...` (รันก่อน `git rm --cached`) |

เคส E จำลองด้วย stub `node` ที่ไม่พิมพ์อะไรเลย ซึ่งวางเครื่องมือไว้ในสภาพเดียวกับที่
python3-หาย ทำไว้ — และต่างจาก PATH sandbox ตรงที่มัน **เติม** เข้า PATH ไม่ใช่จำกัด
จึงทำงานได้ทุก platform รวมทั้ง git-bash

## สิ่งที่ยังไม่ได้ทำ

- ไม่ได้ไล่หา `python3` ที่อื่นในรีโป — ใบนี้แก้เฉพาะ `check-done.sh` ที่เป็นต้นเหตุของอาการที่เจอ
  **มีโอกาสที่สคริปต์อื่นพึ่ง python3 แบบเดียวกัน** ควรกวาดแยกใบ
- ไม่ได้แตะ `session-check.sh` ที่ `ci.yml:355` บอกว่าเคยพิมพ์สำเนาที่ค้าง
