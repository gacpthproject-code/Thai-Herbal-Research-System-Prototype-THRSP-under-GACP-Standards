# gate ที่แยกไม่ออกระหว่าง "เจอปัญหา" กับ "เครื่องมือใช้ไม่ได้" · 2026-08-14

**Status:** `BLOCKED(operator:merge-tier-c)` — 2 ไฟล์พิสูจน์ครบบน Windows · 1 ไฟล์ต้องรันบน Linux

ต่อจาก `evidence/check-done-json-encoder/` ซึ่งแก้ `check-done.sh` · การกวาดต่อพบว่า `python3`
ถูกใช้อีก 5 จุด และมีเพียง `full-gate.sh:760` ที่ตรวจก่อนใช้

| ไฟล์ | ก่อน | ทำอะไร |
|---|---|---|
| `scripts/ci/full-gate.sh:760` | ✅ มี preflight อยู่แล้ว | ไม่แตะ |
| `scripts/probes/crawler-clean.sh` | ❌ | เปลี่ยนเป็น node + แยกสาเหตุ + เพิ่ม `--selftest` 5 เคส |
| `scripts/probes/gate-attestation.sh` | ❌ | ใส่ด่านตรวจตรงจุดใช้ + `--selftest` เคส P |
| `scripts/session-check.sh:165` | ❌ | เปลี่ยนเป็น node + แยกสาเหตุ |
| `scripts/ops/video/make-vo.sh` | ❌ | **ตัดออกจากขอบเขต** — เครื่องมือทำวิดีโอ ไม่ตัดสินการ merge |

## ข้อเท็จจริงที่เปลี่ยนวิธีแก้

`command -v python3` **ไม่พอ** · บนเครื่อง Windows ที่ใช้ทำงานวันนี้:

```
command -v python3   → พบ
python3 -c 'pass'    → exit 9009
```

Windows ติดตั้ง **App Execution Alias** ที่ตอบการค้นหาว่าเป็นไฟล์รันได้ แล้วปฏิเสธที่จะรัน
⇒ **การถามว่า "มีไหม" ได้คำตอบว่ามี ทั้งที่มันไม่ทำงาน** · ด่านตรวจทุกตัวในใบนี้จึง **รันจริง**
(`python3 -c 'pass'` / `node -e 'process.exit(0)'`) ไม่ใช่แค่ค้นหา

## `crawler-clean.sh` — RED/GREEN ที่ชัดที่สุด

โค้ดเก่านับ defect ด้วย python3 แล้วต่อท้ายด้วย `|| echo unreadable` ⇒ **สามสถานการณ์
ยุบเป็นข้อความเดียว**: รายงานที่มี defect จริง · รายงานที่พัง · เครื่องที่ไม่มีตัวแปลภาษา

**RED — รายงานที่สะอาด 100% รันด้วยโค้ดเก่าบนเครื่องนี้:**

```
รายงาน: {"dead":0,"http404":0,"consoleErrors":0}

FAIL: unreadable defects (or unreadable report) in .../crawler-report.json
exit=1
```

**GREEN — ไฟล์เดียวกัน โค้ดใหม่:**

```
PASS: 0 dead/404/console-error in .../crawler-report.json
exit=0
```

**การ crawl ที่ไม่มีปัญหาเลย ถูกรายงานว่าล้ม** เพราะตัวแปลภาษาบนเครื่องพัง — และข้อความ
ที่ได้ชวนให้คนไปไล่อ่านผลการ crawl ที่ไม่มีอะไรผิด

**selftest ใหม่ 5 เคส (probe นี้ไม่เคยมี selftest มาก่อน):**

```
--- A → exit 3   PENDING: no crawler-report.json yet
--- B → exit 0   PASS: 0 dead/404/console-error
--- C → exit 1   FAIL: 7 defects (dead + http404 + consoleErrors)
--- D → exit 1   FAIL: ... could not be parsed as a crawler report — this is about the FILE, not about dead links
--- E → exit 2   BLOCKED: node is missing or not runnable here ...
crawler-clean --selftest: 5/5 cases PASS
```

เคส B มีอยู่เพื่อกันกรณีที่ probe ล้มตลอด ซึ่งจะทำให้เคสอื่นผ่านหมดโดยไม่ได้พิสูจน์อะไร

## `gate-attestation.sh` — ด่านตรวจอยู่ตรงจุดใช้ ไม่ใช่บนสุด

probe นี้ตัดสินว่า commit ผ่าน full-gate หรือยัง · การ adjudicate เอกสาร attestation
เขียนด้วย python3 ยาวประมาณ 60 บรรทัด ⇒ **ไม่เขียนใหม่เป็น node** เพราะความเสี่ยงที่พฤติกรรม
เปลี่ยนสูงกว่าประโยชน์ · ใส่ด่านตรวจแทน

**ตำแหน่งสำคัญ:** วางไว้ก่อน §3 ไม่ใช่บนสุด — ทุกอย่างก่อนหน้านั้น (มี attestation ไหม ·
ครอบ SHA ไหน · มีไฟล์อะไรเปลี่ยนหลังจากนั้น) ตอบได้โดยไม่ใช้ python3 · การ block ตั้งแต่ต้น
จะทิ้ง finding ที่ probe ยังทำได้บนเครื่องที่ไม่มีตัวแปลภาษา · เวอร์ชันแรกของการแก้นี้วางผิดที่
และแก้แล้ว

**RED แยกได้สะอาด:**

| | assertion ที่ล้ม |
|---|---|
| ก่อนเพิ่มเคส P | 16 |
| หลังเพิ่มเคส P | 17 |
| ส่วนต่าง | **1 — คือเคส P พอดี** |

**⚠️ GREEN ของ probe นี้ยังพิสูจน์บน Windows ไม่ได้** — `write_att` ซึ่งเป็นตัวสร้าง fixture
ของ selftest ก็ใช้ python3 ⇒ บนเครื่องที่ python3 พัง มันสร้าง attestation ไม่ได้ และ probe
จะล้มที่ "ไม่มี attestation" ก่อนถึง §3 · 16 assertion ที่ล้มเป็น baseline ก็มาจากเหตุเดียวกัน

⇒ **ต้องรันบน Linux** — คำสั่งอยู่ท้ายเอกสาร

## `session-check.sh`

เดิมพิมพ์ `(อ่าน ... ไม่ได้ — ไฟล์เสีย?)` เมื่อ python3 คืนค่าไม่เป็นศูนย์ **ไม่ว่าสาเหตุใด**
⇒ เครื่องที่ไม่มีตัวแปลภาษา ถูกรายงานว่าไฟล์ผลรันเสีย · แยกสองสาเหตุออกจากกันแล้ว
และเปลี่ยนเป็น node

ไม่ใช่ probe ไม่ตัดสินการ merge จึงไม่เพิ่ม selftest — ยืนยันด้วยการรันจริง:

```
ratchet                PASS
holiday-single-source  PASS
```

## ต้องรันบน Linux เพื่อปิดส่วนที่เหลือ

```bash
cd /tmp && rm -rf /tmp/gacp-py && git clone -q -b feat/runtime-deploy-drift git@github.com:jonmaxmore/GACP-Certification-Application.git /tmp/gacp-py && cd /tmp/gacp-py && bash scripts/probes/gate-attestation.sh --selftest 2>&1 | tail -3; echo "exit=$?"
```

ต้องได้ **`gate-attestation --selftest: <N>/<N> cases PASS`** โดย N รวมเคส P ด้วย

```bash
cd /tmp/gacp-py && bash scripts/probes/crawler-clean.sh --selftest 2>&1 | tail -2 && bash scripts/check-done.sh --selftest 2>&1 | tail -2 && bash scripts/probes/tests/deploy-drift.selftest.sh 2>&1 | tail -2
```

ทั้งสามต้องผ่านเต็ม — `deploy-drift` ต้องได้ `SKIP=0` ที่นั่น (บน Windows ได้ `SKIP=1`)

## สิ่งที่ยังไม่ได้ทำ

- `full-gate.sh:971,979,1006` ใช้ `python3 ... || echo 0` เป็น fallback ⇒ ถ้า preflight ที่
  `:760` ถูกถอดออกเมื่อไหร่ ตัวเลข "0 test ผ่าน" จะกลายเป็นค่าปกติ · วันนี้ปลอดภัยเพราะ
  preflight ยังอยู่ **แต่ความปลอดภัยพึ่งพาบรรทัดที่อยู่คนละที่ 200 บรรทัด** ควรมี selftest ผูกไว้
- `session-check.sh` ยังอ่าน `evidence/probe-results.json` ที่ commit ไว้ได้ ถ้ารันสดไม่สำเร็จ —
  `ci.yml:355` บันทึกว่าเคยพิมพ์สำเนาที่ค้างแทนการรันใหม่ · ตอนนี้ไฟล์ถูก gitignore แล้ว
  ความเสี่ยงลดลงแต่ตรรกะ fallback ยังอยู่
