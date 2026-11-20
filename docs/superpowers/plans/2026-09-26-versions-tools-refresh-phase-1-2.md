# ปรับเวอร์ชัน · packages · tools — แผนเฟส 1-2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิด Next.js RCE ที่ค้างอยู่ แล้วทำให้ทุกอย่างที่ agent อ่านแล้วลงมือทำตาม (CLAUDE.md · HARNESS.md · `.claude/`) พูดตรงกับ main — พร้อม probe ที่ทำให้คำที่ถูกยกเลิกกลับมาไม่ได้

**Architecture:** เฟส 1 เป็นสาขา `chore/versions-and-tools-refresh` (มี spec + แผนนี้ + แพตช์ dependency) merge และ deploy แยกเดี่ยว · เฟส 2 เริ่มจาก merge สาขาค่าบริการก้อนเดียว แล้วสร้าง probe `retired-words` ก่อน (RED) ให้มันชี้ไฟล์ที่ต้องกวาด แล้วกวาดจนเขียว

**Tech Stack:** pnpm 8.15 workspaces · Node 20 (เฟสนี้ยังไม่เปลี่ยน) · bash probes (`scripts/probes/_lib.sh`) · Claude Code skills/agents/commands (markdown)

**Spec:** `docs/superpowers/specs/2026-09-26-versions-packages-tools-refresh-design.md`

## Global Constraints

- deploy ทุกชนิด และ merge Tier C = operator เท่านั้น (CLAUDE.md L5) · push main ได้เฉพาะหลังคำว่า "merge" และตรวจด้วย `git ls-remote origin main` เสมอ
- cover ทุกรูป (waiver, manual, baseline ขึ้น) = operator (L6) · แถว `ci` ใหม่ในทะเบียน probe ไม่ใช่ cover
- ห้ามแตะโค้ดเงิน นอกจาก merge ที่ operator อนุมัติ (L3)
- ก่อนรัน jest ทุกครั้ง: ดู mtime `apps/backend/keys/private.pem` ก่อนและหลัง · ลบ `/tmp/gacp-jest-signing-key/*.pem` ที่ค้างจากรอบก่อน (กุญแจชั่วคราว ไม่ใช่กุญแจจริง)
- backend full suite ต้องมี `NODE_OPTIONS=--max-old-space-size=3072`
- เกณฑ์ gate = "ไม่มีความล้มเหลวใหม่" เทียบ attestation `evidence/gate/c4670b31df751fb78329bbc6ae1654a89b9fda9e.json` ซึ่งตกอยู่แล้ว 4 ตัว: `suite-green` `integration-pg` `probe-ci` `integration-no-skip`
- ห้ามพิมพ์ค่า env/secret ออกหน้าจอ
- ท้ายข้อความคอมมิตทุกใบ:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RRHmfYKxvxwbaJYaBnHbhU
  ```

## ข้อเท็จจริงที่วัดแล้ว (2026-09-26) — ใช้ในแผน ไม่ต้องวัดซ้ำก่อนเริ่ม

- superpowers ที่ vendor: `44c9b2d6` · upstream `v6.4.1` = `b92c4fa` · **เราไม่ได้แก้ skill upstream ตัวไหนเลย** ⇒ แทนที่ตรง ๆ ได้ · upstream เปลี่ยน 10: brainstorming executing-plans finishing-a-development-branch requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-superpowers writing-plans writing-skills · คงเดิม 4 · ใหม่ 1: `diagnosing-superpowers`
- merge `origin/feat/one-service-fee-no-split` เข้า `origin/main` (b4d7bc06): ขัดกันไฟล์เดียว `evidence/ratchet-current.txt` (probe เขียนเอง) · สาขานี้ซ้อนอยู่บน `feat/company-logo-on-commercial-documents` จึงพาคอมมิตโลโก้มาด้วย
- CLAUDE.md ที่ไม่ตรงความจริง: L2 อ้าง "CI job TruffleHog" (ไม่มี CI · ของจริงคือ `no-secret` layer2 gitleaks + `.husky/pre-commit` ขั้น redact) · L3 เขียน `settle-webhook-only` `[MANUAL]` (ทะเบียนเป็น `ci` แล้ว) · L4 เขียน "waiver L-006 ถึง 2026-09-15" (ปลดไปแล้ว 2026-09-11) · §5 ชั้น B ยังตั้ง "CI เขียวจริงบน runner" เป็นเกณฑ์หลัก (มติ no-CI 2026-08-14 ย้ำ 2026-09-10) · §8 "execute remittance"

## เปลี่ยนจาก spec หนึ่งข้อ (บันทึกใน spec ด้วยคอมมิตเดียวกับแผนนี้)

spec เขียนให้ `retired-words` สแกน `apps/` `scripts/` `docs/` ด้วย · แผนนี้**จำกัด v1 ไว้ที่พื้นผิวคำสั่ง** (CLAUDE.md HARNESS.md `.claude/skills` `.claude/agents` `.claude/commands`) เพราะ: `apps/` มี eslint `no-legacy-status-vocabulary` อยู่แล้ว · `docs/` มีบันทึกที่ลงวันที่ซึ่งถือคำเก่าได้โดยชอบ (หลักเดียวกับ `no-document-quotes-a-retired-price`: บันทึกเก่าต้องมีป้ายว่าเลิกใช้ ไม่ใช่ถูกเขียนใหม่) — รวมไว้ v1 จะบังคับให้เขียนประวัติใหม่หรือเปิด allowlist (= waiver = operator) · probe ต้อง**พิมพ์เองว่าไม่ได้อ่านอะไร**

---

## เฟส 1

### Task 1: ปิด Next.js RCE

**Files:**
- Modify (ทำแล้วในเครื่อง): `apps/web-app/package.json` (next ^15.5.26 · @playwright/test ^1.63.0) · `apps/backend/package.json` (@playwright/test ^1.63.0) · `pnpm-lock.yaml`
- Create: `docs/superpowers/plans/2026-09-26-versions-tools-refresh-phase-1-2.md` (ไฟล์นี้)
- Modify: `docs/superpowers/specs/2026-09-26-versions-packages-tools-refresh-design.md` (ข้อที่เปลี่ยนตามหัวข้อข้างบน)

**Interfaces:**
- Produces: สาขา `chore/versions-and-tools-refresh` พร้อม merge · attestation ใน `evidence/gate/<sha>.json`

- [ ] **Step 1: ยืนยันว่าช่องโหว่ critical หายจริง**

Run: `pnpm audit --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).metadata.vulnerabilities))'`
Expected: `critical: 0`

- [ ] **Step 2: tier ของ diff**

Run: `git diff --name-only | bash scripts/probes/tier-check.sh -`
Expected: `TIER=B` (หรือสูงกว่า — ถ้าสูงกว่า ใช้เกณฑ์ของชั้นนั้น)

- [ ] **Step 3: backend full suite**

```bash
ls -l apps/backend/keys/private.pem   # จด mtime
rm -f /tmp/gacp-jest-signing-key/*.pem
cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 npx jest --silent --forceExit 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"
ls -l keys/private.pem                # mtime ต้องเท่าเดิม
```
Expected: `Tests: ... 0 failed` (วัดไว้แล้ว: 837 suites / 10,575 passed)

- [ ] **Step 4: web-app type-check และ build จริง** — Next ขยับ ต้องพิสูจน์ด้วย build ไม่ใช่แค่ tsc

```bash
cd apps/web-app && npx tsc --noEmit -p tsconfig.json; echo "tsc exit=$?"
pnpm --filter web-app run build 2>&1 | tail -15
```
Expected: `tsc exit=0` · build จบด้วย route table ไม่มี error · ถ้า build ล้มเพราะ env ที่ไม่มีในเครื่อง = BLOCKED รายงานตามจริง ห้ามเลี่ยง

- [ ] **Step 5: local-gate เต็ม**

Run: `NODE_OPTIONS=--max-old-space-size=3072 LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh 2>&1 | grep -E "^\[local-gate\] [a-z0-9-]+: "`
Expected: ไม่มีตัวที่ FAIL นอกเหนือจาก `probe-gate` (ตกบน main อยู่แล้วด้วย `deploy-drift` / `main-attestation-audit`)

- [ ] **Step 6: เขียนแผน + แก้ spec แล้วคอมมิตรวมกับแพตช์**

แก้ spec หัวข้อ 2f: เปลี่ยนรายการที่สแกนเป็น "CLAUDE.md HARNESS.md `.claude/skills` `.claude/agents` `.claude/commands` (v1) — `apps/` มี eslint ของตัวเอง · `docs/` ต้องใช้กติกาป้ายเลิกใช้ แยกเป็นงานถัดไป"

```bash
git add apps/web-app/package.json apps/backend/package.json pnpm-lock.yaml \
  docs/superpowers/specs/2026-09-26-versions-packages-tools-refresh-design.md \
  docs/superpowers/plans/2026-09-26-versions-tools-refresh-phase-1-2.md
git commit -m "fix(deps): ปิด Next.js RCE สองรายการ — next 15.5.21 → 15.5.26 · sharp 0.35.4 · playwright จัดคู่ 1.63.0

critical=0 · tsc 0 · build ผ่าน · backend <ตัวเลขจาก Step 3>
playwright: pnpm update next ลาก playwright-core 1.63.0 เข้ามาขณะ @playwright/test อยู่ 1.57.0
⇒ Page สองชนิด tsc แดง · แก้ด้วยการยก @playwright/test ให้คู่กัน ภายใน range ^1.57 เดิม

<attribution lines>"
```

- [ ] **Step 7: attestation**

```bash
export GATE_PG_ADMIN_URL="$(node -e "const u=require('fs').readFileSync('apps/backend/.env','utf8').match(/^DATABASE_URL=\"?([^\"\n]+)/m)[1];const p=new URL(u);p.pathname='/postgres';p.search='';process.stdout.write(p.toString())")"
NODE_OPTIONS=--max-old-space-size=3072 bash scripts/ci/full-gate.sh 2>&1 | sed -n '/^===== full-gate/,$p'
```
Expected: รายการ FAIL เป็นเซตย่อยของ `{suite-green, integration-pg, probe-ci, integration-no-skip}` · คอมมิต `evidence/gate/<sha>.json` เป็นใบแยก

- [ ] **Step 8: ส่งให้ operator** — merge แล้ว deploy **แยกเดี่ยว** staging → demo → gacpth.com · หลัง operator push: `git ls-remote origin main` ต้องเท่ากับ sha ของสาขา

---

## เฟส 2

### Task 2: merge ค่าบริการก้อนเดียว (2a) — รอคำว่า "merge" ของ operator

**Files:**
- Modify: `evidence/ratchet-current.txt` (ไฟล์ที่ขัดกันไฟล์เดียว — สร้างใหม่ด้วย probe ไม่ใช่แก้มือ)

**Interfaces:**
- Produces: main ที่มีค่าบริการก้อนเดียวและโลโก้บริษัท — ฐานของ Task 3-8

- [ ] **Step 1: operator สั่ง "merge"** — ไม่มีคำนี้ ไม่ทำ Task นี้และ Task ที่ตามมา
- [ ] **Step 2: merge ใน worktree แยก**

```bash
git fetch origin
git worktree add ../wt-onefee-merge origin/main && cd ../wt-onefee-merge
git merge --no-ff origin/feat/one-service-fee-no-split
```
Expected: CONFLICT เฉพาะ `evidence/ratchet-current.txt` · ถ้ามีไฟล์อื่น หยุดและรายงาน

- [ ] **Step 3: แก้ความขัดแย้งด้วยการรัน probe**

```bash
git checkout --theirs evidence/ratchet-current.txt
bash scripts/probes/ratchet.sh
git add evidence/ratchet-current.txt
```
Expected: `PASS: no counter above baseline`

- [ ] **Step 4: suite + commit + ส่ง operator push**

```bash
rm -f /tmp/gacp-jest-signing-key/*.pem
(cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 npx jest --silent --forceExit 2>&1 | grep -E "^(FAIL|Tests:)")
git commit --no-edit
```
Expected: 0 failed · operator push แล้วตรวจ `git ls-remote origin main` · สิ่งที่ operator ยังถืออยู่ 3 ข้อ (`evidence/one-service-fee-2026-09-11/INDEX.md`) ไม่อยู่ในแผนนี้

### Task 3: probe `retired-words` (2f) — สร้างก่อนกวาด ให้มันเป็นเทสของงานกวาด

**Files:**
- Create: `scripts/probes/retired-words.sh`
- Create: `scripts/probes/retired-words.txt`

**Interfaces:**
- Consumes: main หลัง Task 2
- Produces: `bash scripts/probes/retired-words.sh` → exit 0 PASS / 1 FAIL (พิมพ์ `ไฟล์:บรรทัด: ข้อความ ← ใช้แทน: …`) / 2 BLOCKED · `--selftest` · env `RETIRED_WORDS_ROOT` `RETIRED_WORDS_FILE` สำหรับ fixture

- [ ] **Step 1: `/audit-system` แบบจำกัดพื้นผิว** — สั่ง `/audit-system` ให้รวบรวมเฉพาะข้อความในพื้นผิวคำสั่งที่ขัดกับมติหลัง 2026-08-15 (memory ที่มี `type: project`) · ใช้ผลเป็นรายการผู้ต้องสงสัยสำหรับไฟล์ข้อมูลใน Step 2 — ไม่ใช่ข้อสรุป

- [ ] **Step 2: ไฟล์ข้อมูล** — คำที่ถูกยกเลิก = ข้อมูล ไม่ใช่ literal ในสคริปต์

`scripts/probes/retired-words.txt`:
```
# retired-words — คำที่มติ operator ยกเลิกแล้ว
# รูปแบบ: <regex ERE> | <วันที่มติ> | <อ้างอิง> | <ใช้แทน>
# ห้ามใส่คำกว้างที่ภาษาอังกฤษทั่วไปใช้ (เช่น slip เดี่ยว ๆ — "slip through" ใน skill upstream)
# เจอผลบวกลวง = ทำ regex ให้แคบลง ห้ามเปิด allowlist (allowlist = waiver = operator)
สลิป|payment[- ]slip|slip (upload|queue|review|approve|flow|rail|path)|requireSlipReview | 2026-09-06 | memory slip-and-account-approve-retired | Stripe checkout + settle ด้วย webhook (checkout-settlement-service) ไม่มีคนอนุมัติการจ่าย
\bACCOUNT_(DTAM|PLATFORM)\b|\baccount_(dtam|platform)\b | 2026-09-10 | memory role-vocabulary-three-sides | finance_officer_dtam / finance_officer_platform
Wallet [AB]\b|\bwallet[AB]\b|two-money|ค่าธรรมเนียม 2 ทาง|2 นิติบุคคล | 2026-09-11 | memory one-service-fee-no-split | ค่าบริการก้อนเดียว 5,500 / 27,500 / 33,000 + VAT 7% · ผู้ออกเอกสารรายเดียว (บริษัท 0105568045932)
\bPREMIUM\b|แพคเกจพรีเมี่ยม|subscription tier | 2026-09-11 | memory subscriptions-retired-lot-creation-open | ไม่มีแพ็กเกจ · สร้างล็อตได้ทุกเกษตรกร
cannabis-only|กัญชาเท่านั้น | 2026-09-11 | memory six-herbs-not-cannabis-only | หกสมุนไพร CAN KRA TUR GIN GAL PLA
EMAIL_OTP|email OTP|\bSMTP\b | 2026-08-19 | memory external-services-cleanup-shipped | ในแอปเท่านั้น · ล็อกอิน = ThaiD / หมอพร้อม
TruffleHog|CI job | 2026-09-10 | memory no-ci-by-operator-decision | no-secret (layer2 gitleaks) + .husky/pre-commit · ไม่มี CI ตามมติ
L-006 | 2026-09-11 | probe-registry.txt แถว no-skip | ปลดคำยกเว้นแล้ว
```
**เงื่อนไขก่อนใส่คำฝั่งนำส่งเงิน** (`dtam_remittance`, `remittance batch`): รัน `ls apps/backend/services/checkout/dtam-remittance-service.js` บน main หลัง Task 2 — ถ้าไฟล์ยังอยู่ คำนั้น**ยังมีชีวิต** ห้ามใส่ (การถอดระบบนำส่งเป็นของค้างของ operator ข้อ 2)

- [ ] **Step 3: selftest ก่อนตัวจริง (RED)** — เขียน `scripts/probes/retired-words.sh` ส่วน `--selftest` ก่อน:

```bash
#!/usr/bin/env bash
# retired-words — คำที่มติ operator ยกเลิกแล้ว ต้องไม่ถูก "สอน" อยู่ในพื้นผิวคำสั่ง
#
# พื้นผิวคำสั่ง = ไฟล์ที่ agent อ่านแล้วลงมือทำตาม · คำเก่าในนั้นคือเหตุที่งานสร้างใหม่
# ไหลกลับไปหาของที่ถูกถอด (memory slip-and-account-approve-retired: "กลับมาที่สลิปตลอด
# คาดว่าไปอ่านเจอ") · ตัวตรวจคำเก่าที่มีอยู่ (eslint no-legacy-status-vocabulary) อ่านแค่ apps/
#
# ไม่อ่าน (พิมพ์ทุกครั้ง): apps/ (มี eslint ของตัวเอง) · docs/ (บันทึกลงวันที่ ต้องใช้กติกาป้าย
# เลิกใช้ — งานถัดไป) · scripts/ · evidence/ · reports/
#
# บรรทัดที่บรรยายการยกเลิก ผ่าน — หลักเดียวกับ no-skip: การอธิบายว่าอะไรถูกถอดคือเอกสาร
# ใช้:  bash scripts/probes/retired-words.sh [--selftest]
source "$(dirname "$0")/_lib.sh"
DATA="${RETIRED_WORDS_FILE:-$(cd "$(dirname "$0")" && pwd)/retired-words.txt}"
SCAN_ROOT="${RETIRED_WORDS_ROOT:-$ROOT}"
SURFACE=(CLAUDE.md HARNESS.md .claude/skills .claude/agents .claude/commands)
NARRATION='ถูกถอด|ถอดออก|เลิกใช้|ยกเลิก|ปลดแล้ว|retired|removed|เคยเป็น|เดิมคือ'

scan() {
    local out="" pattern ruled ref instead t r
    while IFS='|' read -r pattern ruled ref instead; do
        pattern="$(printf '%s' "$pattern" | sed 's/^ *//; s/ *$//')"
        case "$pattern" in ''|\#*) continue ;; esac
        for t in "${SURFACE[@]}"; do
            [ -e "$SCAN_ROOT/$t" ] || continue
            r="$(grep -rnIE "$pattern" "$SCAN_ROOT/$t" 2>/dev/null | grep -vE "$NARRATION" || true)"
            [ -n "$r" ] && out+="$(printf '%s\n' "$r" | sed "s|^$SCAN_ROOT/||; s|\$|  ← ใช้แทน:$instead|")"$'\n'
        done
    done < "$DATA"
    printf '%s' "$out"
}

if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0
    # ไม่ใช้ \b กับคำไทย — grep ตัดสินขอบคำของอักษรไทยไม่แน่นอนตาม locale
    printf 'ห้ามคำ | 2026-01-01 | test | คำใหม่\n' > "$TMP/words.txt"
    mk() { mkdir -p "$1/.claude/skills/x"; printf '%s\n' "$2" > "$1/.claude/skills/x/SKILL.md"; }
    check() { # $1 ป้าย $2 root $3 exit ที่คาด $4 คำที่ต้องเห็น $5 ไฟล์ข้อมูล
        local out code; CASES=$((CASES+1))
        out="$(RETIRED_WORDS_ROOT="$2" RETIRED_WORDS_FILE="${5:-$TMP/words.txt}" bash "$0" 2>&1)"; code=$?
        if [ "$code" != "$3" ] || { [ -n "$4" ] && ! printf '%s' "$out" | grep -q "$4"; }; then
            echo "  ✗ $1 — คาด exit $3 ได้ $code"; printf '%s\n' "$out" | sed 's/^/      /'; BAD=1; return; fi
        echo "  ✓ $1"
    }
    A="$TMP/a"; mk "$A" "ใช้คำใหม่ทุกที่";                          check "ไม่มีคำเก่า = PASS" "$A" 0 "PASS"
    B="$TMP/b"; mk "$B" "ให้ใช้ ห้ามคำ ในขั้นนี้";                   check "คำเก่าที่ยังสอนอยู่ = FAIL" "$B" 1 "SKILL.md"
    C="$TMP/c"; mk "$C" "ห้ามคำ ถูกถอดเมื่อ 2026-01-01";             check "บรรทัดที่บรรยายการยกเลิก = PASS" "$C" 0 "PASS"
    D="$TMP/d"; mk "$D" "อะไรก็ได้";                                  check "ไม่มีไฟล์ข้อมูล = BLOCKED" "$D" 2 "BLOCKED" "$TMP/nope.txt"
    E="$TMP/e"; mk "$E" "อะไรก็ได้"; : > "$TMP/empty.txt";            check "ไฟล์ข้อมูลว่าง = FAIL (ตรวจศูนย์คำ = ไม่ได้ตรวจ)" "$E" 1 "ไม่มีคำ" "$TMP/empty.txt"
    echo "selftest: $CASES เคส"; [ "$BAD" = 0 ] || exit 1
    echo "PASS: selftest ครบทั้งสองทิศ"; exit 0
fi

[ -f "$DATA" ] || blocked "ไม่มีไฟล์ข้อมูล $DATA"
grep -vqE '^\s*(#|$)' "$DATA" || fail "ไม่มีคำในไฟล์ข้อมูล — probe ที่ตรวจศูนย์คำไม่ได้ตรวจอะไรเลย"
echo "ไม่อ่าน: apps/ docs/ scripts/ evidence/ reports/ — ดูหัวไฟล์"
HITS="$(scan)"
[ -n "$HITS" ] && fail "คำที่ถูกยกเลิกยังถูกสอนอยู่ $(printf '%s' "$HITS" | grep -c .) บรรทัด:
$HITS"
pass "พื้นผิวคำสั่งไม่มีคำที่ถูกยกเลิก ($(grep -cvE '^\s*(#|$)' "$DATA") คำ · ${#SURFACE[@]} พื้นผิว)"
```

Run: `bash scripts/probes/retired-words.sh --selftest`
Expected: `selftest: 5 เคส` · `PASS: selftest ครบทั้งสองทิศ` — ถ้าเคสไหน ✗ แก้สคริปต์จนผ่านทั้ง 5

- [ ] **Step 4: รันกับต้นไม้จริง (RED ที่ตั้งใจ)**

Run: `bash scripts/probes/retired-words.sh > /tmp/claude-1000/-home-ubuntu-work-GACP-Certification-Application/f90a55be-547c-4b12-8251-b8809c3ab2e1/scratchpad/retired-red.txt; echo "exit=$?"`
Expected: `exit=1` · รายการ `ไฟล์:บรรทัด` ครอบไฟล์อย่างน้อย: `.claude/skills/gacp-payment-invariants/SKILL.md` `.claude/skills/gacp-workflow-rules/SKILL.md` `.claude/skills/thai-ui-copy/SKILL.md` `.claude/agents/role-workflow-auditor.md` `.claude/commands/audit-role.md` CLAUDE.md · ถ้า hit ใดเป็นผลบวกลวง → ทำ regex ในไฟล์ข้อมูลให้แคบลง แล้วรัน Step 3 ซ้ำ

- [ ] **Step 5: commit (probe ยังไม่ลงทะเบียน — ลงใน Task 7 ตอนมันเขียว)**

```bash
git add scripts/probes/retired-words.sh scripts/probes/retired-words.txt
git commit -m "probe(retired-words): คำที่มติยกเลิกต้องไม่ถูกสอนในพื้นผิวคำสั่ง — selftest 5 เคส · RED <N> บรรทัดบนต้นไม้จริง

<attribution lines>"
```

### Task 4: superpowers `44c9b2d6` → `v6.4.1` (2b)

**Files:**
- Modify: `.claude/skills/{brainstorming,executing-plans,finishing-a-development-branch,requesting-code-review,subagent-driven-development,systematic-debugging,test-driven-development,using-superpowers,writing-plans,writing-skills}/` (ทั้งโฟลเดอร์)
- Create: `.claude/skills/diagnosing-superpowers/`
- Modify: `.claude/skills/SUPERPOWERS-ATTRIBUTION.md`

- [ ] **Step 1: ดึง upstream ที่แท็ก**

```bash
S=/tmp/claude-1000/-home-ubuntu-work-GACP-Certification-Application/f90a55be-547c-4b12-8251-b8809c3ab2e1/scratchpad
rm -rf $S/sp && git clone -q https://github.com/obra/superpowers.git $S/sp && git -C $S/sp checkout -q v6.4.1
git -C $S/sp rev-parse HEAD      # ต้องขึ้นต้นด้วย b92c4fa
```

- [ ] **Step 2: ยืนยันอีกครั้งว่าเราไม่ได้แก้เอง (ข้อเท็จจริงอาจเปลี่ยนตั้งแต่วันที่วัด)**

```bash
mkdir -p $S/base && git -C $S/sp archive 44c9b2d6 skills | tar -x -C $S/base
for d in $S/base/skills/*/; do n=$(basename $d); diff -rq "$d" ".claude/skills/$n" >/dev/null || echo "แก้เอง: $n"; done
```
Expected: ไม่มีบรรทัด "แก้เอง" · ถ้ามี หยุด — skill นั้นต้องรวมสามทาง ห้ามทับ

- [ ] **Step 3: แทนที่ + เพิ่มตัวใหม่**

```bash
for n in brainstorming executing-plans finishing-a-development-branch requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-superpowers writing-plans writing-skills diagnosing-superpowers; do
  rm -rf ".claude/skills/$n" && cp -r "$S/sp/skills/$n" ".claude/skills/$n"
done
for n in $(ls $S/sp/skills); do diff -rq "$S/sp/skills/$n" ".claude/skills/$n" >/dev/null || echo "ยังต่าง: $n"; done
```
Expected: ไม่มีบรรทัด "ยังต่าง"

- [ ] **Step 4: ATTRIBUTION** — แก้บรรทัด `- Vendored at commit: 44c9b2d6e889982ac18c27d05a19fefe335194e1 (2026-08-07)` เป็น `- Vendored at commit: <sha เต็มจาก Step 1> (v6.4.1, 2026-09-19 · อัปเดต 2026-09-26)` · ข้อความ license คงเดิม

- [ ] **Step 5: probe ต้องไม่แดงเพิ่มจาก skill upstream**

Run: `bash scripts/probes/retired-words.sh | grep -c "\.claude/skills/\(brainstorming\|executing-plans\|finishing\|requesting\|subagent\|systematic\|test-driven\|using-superpowers\|writing-plans\|writing-skills\|diagnosing\)"`
Expected: `0` · ถ้าไม่ใช่ 0 = regex กว้างเกิน → แคบลงในไฟล์ข้อมูล (ห้ามแก้ skill upstream)

- [ ] **Step 6: commit**

```bash
git add .claude/skills
git commit -m "chore(skills): superpowers 44c9b2d6 → v6.4.1 + diagnosing-superpowers — แทนที่ตรง เพราะไม่มี skill ที่เราแก้เอง (ตรวจด้วย diff กับฐาน)

<attribution lines>"
```

### Task 5: skill ของโปรเจกต์ตามมติ ก.ย. (2c)

**Files:** Modify ตาม hit ของ probe ใน `.claude/skills/{gacp-payment-invariants,gacp-workflow-rules,thai-ui-copy,gacp-debug,thai-business-days,gacp-standards-requirements,gacp-view-in-the-loop}/SKILL.md`

ตารางแทนที่ (ต้นทางของทุกบรรทัด = คอลัมน์ "อ้างอิง" ในไฟล์ข้อมูล):

| เจอ | เขียนเป็น |
|---|---|
| สลิป / slip upload / slip review | "จ่ายผ่าน Stripe checkout · สถานะ SETTLED มาจาก webhook เท่านั้น · ไม่มีคนอนุมัติการจ่าย" |
| ACCOUNT_DTAM / account_dtam | `finance_officer_dtam` |
| ACCOUNT_PLATFORM / account_platform | `finance_officer_platform` |
| ค่าธรรมเนียม 2 ทาง / Wallet A,B / 2 นิติบุคคล | "ค่าบริการก้อนเดียว 5,500 (งวด 1) / 27,500 (งวด 2) / 33,000 (ต่ออายุ) ต่อรูปแบบการปลูก + VAT 7% · ผู้ออกเอกสารรายเดียวคือบริษัท (0105568045932) · ฝ่ายการเงินทั้งสองฝั่งเห็นตัวเลขชุดเดียวกัน" |
| PREMIUM / แพคเกจพรีเมี่ยม | "ไม่มีแพ็กเกจ · สร้างล็อตได้ทุกเกษตรกร" |
| cannabis-only | "หกสมุนไพร: CAN KRA TUR GIN GAL PLA" |
| TruffleHog / CI job | "probe `no-secret` + `.husky/pre-commit` · ไม่มี CI ตามมติ operator" |

description ใน frontmatter ของ `gacp-payment-invariants` ต้องแก้ด้วย — คือบรรทัดที่ Claude Code โหลดทุกเซสชัน

- [ ] **Step 1:** Run `bash scripts/probes/retired-words.sh | grep "^\.claude/skills/"` — จดรายการ
- [ ] **Step 2:** แก้ทีละไฟล์ตามตาราง · ข้อที่ไม่เข้าตาราง (เช่นลำดับสถานะใน workflow-rules) เปิด `apps/backend/shared/` ตัวจริงแล้วเขียนตามโค้ด ไม่ใช่ตามความจำ
- [ ] **Step 3:** Run probe ซ้ำ — Expected: ไม่มีบรรทัดที่ขึ้นต้นด้วย `.claude/skills/`
- [ ] **Step 4:** commit ต่อไฟล์หรือรวม · ข้อความอ้างมติที่ทำให้แก้

### Task 6: agent + command (2d)

**Files:** Modify ตาม hit ใน `.claude/agents/*.md` `.claude/commands/*.md` — อย่างน้อย `role-workflow-auditor.md` `qa-e2e.md` `audit-role.md` `sweep-legacy.md` `recon-daily.md` `accounting-reconciler.md` `payment-policy.md`

- [ ] **Step 1: ถาม operator ก่อนแตะสองตัวที่งานเปลี่ยนทั้งตัว** (ใช้ AskUserQuestion):
  - `accounting-reconciler` + `/recon-daily` — กระทบยอดสามทาง adapter ↔ checkout_orders ↔ dtam_remittance_batches · ถ้าระบบนำส่งยังอยู่บน main: คงไว้ · ถ้าถูกถอด: เปลี่ยนเป็นสองทาง (Stripe ↔ checkout_orders) หรือลบ
  - `payment-policy` — หน้าที่เดิมคือแปลระเบียบจ่ายเงินสองทาง
- [ ] **Step 2:** แก้ตัวที่เหลือตามตาราง Task 5
- [ ] **Step 3:** Run probe — Expected: ไม่มีบรรทัดที่ขึ้นต้นด้วย `.claude/agents/` หรือ `.claude/commands/`
- [ ] **Step 4:** commit

### Task 7: CLAUDE.md + HARNESS.md (2e) + ลงทะเบียน probe — Tier C governance

**Files:** Modify `CLAUDE.md:39,40,41,42,52,79` · `HARNESS.md` (ตาม hit) · `HARNESS_LOG.md` (ต่อท้าย) · `scripts/probes/probe-registry.txt` (แถวใหม่)

ข้อความแทนที่ใน CLAUDE.md (แก้เฉพาะวลี คงโครงตาราง):

- L2 คอลัมน์ enforcement: `· CI job TruffleHog` → `· layer2 gitleaks ใน no-secret · .husky/pre-commit ขั้น redact โทเคนในไฟล์หลักฐาน`
- L3 คอลัมน์ enforcement: `` `settle-webhook-only`, `money-equation` `[MANUAL]` `` → `` `settle-webhook-only` `[ACTIVE]` · `money-equation` `[MANUAL]` ``
- L4 คอลัมน์ enforcement: `` `no-skip` `[ACTIVE]` (waiver L-006 ถึง 2026-09-15) `` → `` `no-skip` `[ACTIVE]` ``
- L5: `CI ล่ม = ห้าม merge โค้ด (fallback ใน §5)` → `ไม่มี CI ตามมติ operator (2026-08-14 · ย้ำ 2026-09-10) — เกณฑ์คือ §5`
- §5 ชั้น B: `CI เขียวจริงบน runner (full suite + ratchet ไม่เพิ่ม) + ... · fallback ช่วง Actions ล็อก (operator 2026-08-06): LOCAL_GATE_FULL=1 local-gate.sh + review 2 ชั้น` → `` `LOCAL_GATE_FULL=1 local-gate.sh` + full-gate attestation เทียบ baseline ("ไม่มีความล้มเหลวใหม่") + `engineering:review` + `security-review` ``
- §8: `ต้องแตะเงินจริง / refund / execute remittance` → ถ้าระบบนำส่งถูกถอดบน main แล้ว: `ต้องแตะเงินจริง / refund` · ถ้ายังอยู่: คงเดิม
- เพิ่มแถว `retired-words` `[ACTIVE]` ในคอลัมน์ enforcement ของ L1

- [ ] **Step 1:** แก้ CLAUDE.md ตามรายการ · แก้ HARNESS.md ตาม hit ของ probe (ตาราง Task 5)
- [ ] **Step 2:** Run `bash scripts/probes/retired-words.sh` — Expected: `PASS: พื้นผิวคำสั่งไม่มีคำที่ถูกยกเลิก`
- [ ] **Step 3: ลงทะเบียน** — ต่อท้าย `scripts/probes/probe-registry.txt`:
```
retired-words          | ci     | -                 | -        | คำที่มติ operator ยกเลิกต้องไม่ถูกสอนในพื้นผิวคำสั่ง (CLAUDE.md HARNESS.md .claude/) · ข้อมูลอยู่ที่ retired-words.txt · ไม่อ่าน apps/ (eslint no-legacy-status-vocabulary) และ docs/ (บันทึกลงวันที่ — งานถัดไป) · --selftest 5 เคสครบสองทิศ
```
Run: `node scripts/ci/probe-gate.js 2>&1 | grep retired-words` — Expected: `PASS`
- [ ] **Step 4:** ต่อท้าย HARNESS_LOG.md: วันที่ · คำสั่ง operator ("อัพเดตข้อมูลใน claude.md, skill, harness ให้อัพเดตล่าสุด" 2026-09-26) · บรรทัดที่เปลี่ยน · probe ใหม่
- [ ] **Step 5:** commit — Tier C · operator merge

### Task 8: ปิดเฟส 2

- [ ] **Step 1:** `/code-review` บน diff ทั้งเฟส · แก้ที่เจอจริง
- [ ] **Step 2:** local-gate เต็ม + full-gate attestation (คำสั่งเดียวกับ Task 1 Step 5, 7) · เกณฑ์เดิม
- [ ] **Step 3:** รายงานตาม CLAUDE.md §6 (≤ 40 บรรทัด) · ส่ง operator merge
- [ ] **Step 4:** เขียนแผนเฟส 3-4 (Node 24 · jest 30 · `deps-health`) — ขั้นแรกของแผนนั้นคือพิสูจน์ Prisma 5.22 บน Node 24
