# Task 3 + 4 — probe `deploy-drift` และการเสียบเข้า gate · 2026-08-14

**Status:** `BLOCKED(operator:merge-tier-c)` — RED/GREEN ครบบน Windows · เหลือ 1 เคสที่ต้องรันบน Linux

รวมสองงานเป็น commit เดียวเพราะ **แยกไม่ได้**: `probe-gate.js:144` ทำให้ gate แดงทันทีที่มี
`scripts/probes/*.sh` ที่ยังไม่มีแถวในทะเบียน ⇒ commit เฉพาะ Task 3 คือการทิ้ง gate ไว้ในสภาพแดง

| | |
|---|---|
| branch | `feat/runtime-deploy-drift` |
| แผน | `docs/superpowers/plans/2026-08-14-runtime-deploy-drift.md` Task 3, 4 |
| operator อนุมัติ | ค่า `manual-until:2026-08-28` ในช่อง run — 2026-08-14 |

## RED — selftest กับ probe ที่ยังไม่มี

```
=== deploy-drift.sh selftest ===
  FAIL  revision ตรงกับ ref ⇒ PASS
        exit 127 — bash: .../scripts/probes/deploy-drift.sh: No such file or directory
  ... (ทั้ง 11 เคส)
=== ผล: PASS=0 FAIL=11 ===
```

## GREEN — selftest กับ probe ที่เขียนแล้ว

```
=== deploy-drift.sh selftest ===
  PASS  revision ตรงกับ ref ⇒ PASS
  PASS  revision ต่างจาก ref ⇒ FAIL และบอก sha ทั้งสองฝั่ง
  PASS  revision เป็น null ⇒ FAIL พร้อมบอกว่าให้ build ใหม่
  PASS  ยิงไม่ถึง ⇒ FAIL และบอกว่าเป็นเรื่องเครือข่าย
  PASS  คำตอบไม่ใช่ JSON ที่มี revision ⇒ FAIL
  PASS  ไม่มีเป้าหมายให้ตรวจ ⇒ FAIL ไม่ใช่ PASS
  PASS  ไฟล์เป้าหมายหาย ⇒ FAIL
  SKIP  ไม่มี curl ⇒ BLOCKED (exit 2) ไม่ใช่ FAIL
        platform นี้สร้าง PATH sandbox ไม่ได้ (git-bash/MSYS — สำเนา .exe หา msys-2.0.dll ไม่เจอ)
  PASS  ref ที่ resolve ไม่ได้ ⇒ FAIL
  PASS  revision แบบสั้น ตรงด้วย prefix ⇒ PASS
  PASS  revision สั้นเกินกว่าจะระบุ commit ⇒ FAIL

=== ผล: PASS=10 FAIL=0 SKIP=1 ===
GREEN exit=0
```

### เคสที่ SKIP — และทำไมถึงไม่แก้ให้มันผ่าน

เคส "ไม่มี curl ⇒ BLOCKED" ต้องการสภาพแวดล้อมที่ curl ไม่มีอยู่จริง ซึ่งทำได้ทางเดียวคือสร้าง
PATH ที่มีเครื่องมือทุกตัวที่ probe ใช้ **ยกเว้น curl** · บน git-bash ทำไม่ได้ เพราะเครื่องมือเป็น
MSYS executable ที่หา `msys-2.0.dll` ผ่าน PATH ⇒ โฟลเดอร์ที่มีแต่สำเนา `.exe` ไม่ใช่สภาพแวดล้อม
ที่รันได้ และ `bash` เองออกด้วย 127 ก่อนที่ probe จะเริ่มทำงาน

**ทางที่ไม่เลือก และเหตุผล:**
- ปล่อยให้ assertion ล้ม → รายงานความล้มเหลวที่ไม่ได้บอกอะไรเกี่ยวกับ probe
- ผ่อน assertion ให้ยอมรับ exit 127 → **เคสนี้จะผ่านกับ probe ที่ไม่ได้ทำพฤติกรรมนี้เลย** ซึ่งแย่กว่าไม่มีเคส

⇒ ตรวจแล้ว SKIP พร้อมบอกเหตุผล ตามแบบเดียวกับ `gacp-backup.selftest.sh` ที่ทำกับ POSIX mode
· **ต้องรันบน Linux เพื่อปิดเคสนี้** — คำสั่งอยู่ท้ายเอกสาร

## การเสียบเข้า gate — 3 จุด

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `scripts/probes/probe-registry.txt` | `deploy-drift \| manual-until:2026-08-28 \| - \| operator \| ...` |
| `scripts/ci/full-gate-checks.txt` | `check \| deploy-drift \| advisory \| ...` |
| `scripts/ci/full-gate.sh` | `do_deploy_drift()` — map id→function ตาม `full-gate.sh:1101` |
| `scripts/ci/local-gate.sh` | `step deploy-drift` — รันและรายงาน ไม่บล็อก |

**ยืนยันว่า probe-gate รับแถวแล้ว:**

```
probe-gate: NOT run here (signed 'manual'): crawler-clean deploy-drift (until 2026-08-28) ...
```

ก่อนเพิ่มแถว ข้อความคือ:

```
probe-gate: registry problems
  - scripts/probes/deploy-drift.sh exists but has NO registry line
```

## บั๊กที่เจอระหว่างทาง — ไม่ใช่ของใบนี้ ไม่ได้แก้

`scripts/check-done.sh:116` ใช้ `python3` แปลงข้อความเป็น JSON:

```sh
RESULTS+=("{\"probe\":\"$p\",...,\"detail\":$(printf '%s' "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")
```

**เครื่อง Windows นี้ไม่มี python3** ⇒ command substitution คืนค่าว่าง ⇒ เขียนออกมาเป็น
`"detail":}` ทุกแถว ⇒ `evidence/probe-results.json` ไม่ใช่ JSON และ probe-gate FAIL ทุกครั้ง

**สองข้อบกพร่องซ้อนกัน:**
1. เครื่องมือหายแล้ว**เขียน artifact ที่เสียรูปอย่างเงียบ ๆ** แทนที่จะล้มพร้อมบอกว่าขาดอะไร —
   คลาสเดียวกับที่ `full-gate.sh:1009` แก้ไปแล้วสำหรับ gitleaks และที่ `no-secret.sh` ทำถูก
2. `evidence/probe-results.json` **ยังถูก track อยู่ในรีโป** ⇒ การรัน gate ทำให้ working tree
   สกปรกทุกครั้ง ซึ่งขัดกับเจตนาของ commit `1d6f9e0b` ("stop tracking per-run gate logs")

ทั้งสองข้อควรเป็นใบแยก · ใบนี้แค่ `git checkout --` คืนไฟล์ทุกครั้งที่รัน

## สิ่งที่ยังต้องทำ — รันบน Linux

```bash
cd /tmp && rm -rf /tmp/gacp-dd && git clone -q -b feat/runtime-deploy-drift git@github.com:jonmaxmore/GACP-Certification-Application.git /tmp/gacp-dd && cd /tmp/gacp-dd && bash scripts/probes/tests/deploy-drift.selftest.sh; echo "exit=$?"
```

ต้องได้ **`PASS=11 FAIL=0 SKIP=0`** — เคสที่ SKIP บน Windows ต้องผ่านที่นั่น

จากนั้นรัน probe จริงกับระบบที่ deploy อยู่:

```bash
cd /tmp/gacp-dd && bash scripts/probes/deploy-drift.sh; echo "exit=$?"
```

**คาดว่าจะ FAIL** และนั่นถูกต้อง — image ที่ deploy อยู่ตอนนี้ยังไม่มี endpoint ทั้งสองตัว
(Task 1 กับ 2 ยังไม่ merge และยังไม่ build) ⇒ ทุกแถวจะรายงานว่า "คำตอบไม่ใช่ JSON ที่มี revision"
**ถ้ามันขึ้น PASS แปลว่า probe ผิด**
