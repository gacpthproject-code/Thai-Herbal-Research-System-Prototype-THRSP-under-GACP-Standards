# เสนอแก้ `CLAUDE.md` Law 3.3 + `scripts/probes/no-secret.sh` (operator apply เอง — Law 3.12)

operator สั่ง 2026-08-03 ข้อ B: "แก้ Law 3.3 ให้ตรงความจริง (TruffleHog + grep pin) + probe
`no-secret.sh` fail-loud เมื่อ tool ที่อ้างหายไป ห้าม pass เงียบ"

---

## ข้อเท็จจริงที่ตรวจแล้ว

`CLAUDE.md` §3 ข้อ 3.3 เขียนว่า enforcement คือ **"probe `no-secret` (gitleaks + grep pin)"**

**gitleaks ไม่มีอยู่จริงในระบบ CI:**
```
$ grep -rniE "gitleaks" .github/
  (ไม่มีผลลัพธ์)
```
มีแต่ใน `scripts/probes/no-secret.sh` เอง และเป็นเงื่อนไข:
```sh
if command -v gitleaks >/dev/null 2>&1; then
    ... gitleaks detect ...
    pass "0 grep hits; gitleaks clean"
fi
pass "0 grep hits (gitleaks not installed in this environment — grep only)"
```
⇒ **ไม่มี gitleaks = probe ผ่านเงียบ ๆ** และประกาศเองในข้อความ pass ว่าไม่ได้รัน

หลักฐานว่าเดินทางนั้นมาตลอด — `evidence/W2-01-adapter-seam/probe-results.json`:
```json
{"probe":"no-secret","status":"PASS",
 "detail":"PASS: 0 grep hits (gitleaks not installed in this environment — grep only)"}
```

**สิ่งที่รันจริงใน CI คือ TruffleHog** (คนละตัว): `.github/workflows/` job **`Secret Scanning`**
ใช้ `trufflesecurity/trufflehog@main` — เขียวอยู่ทุก PR รวม #738

⇒ Law 3.3 อ้างเครื่องมือผิดตัว และชั้นที่สองที่ผูกกับ probe **ไม่เคยมีอยู่**

---

## diff ที่เสนอ — `CLAUDE.md` §3 แถว 3.3

```diff
-| 3.3 | NO SECRET in code/log/report — รวม redact webhook payload | probe `no-secret` (gitleaks + grep pin) |
+| 3.3 | NO SECRET in code/log/report — รวม redact webhook payload | **ชั้น 1** probe `no-secret` (grep pin — ครอบเฉพาะรูปที่ระบุใน `scripts/probes/hardcode-patterns.txt` + รูป Stripe) · **ชั้น 2** CI job `Secret Scanning` (TruffleHog, `.github/workflows/ci.yml`) — เป็นชั้นที่รันจริงและครอบกว้างกว่า · probe ต้อง **fail-loud** เมื่อเครื่องมือที่อ้างไม่มีในเครื่อง ห้าม pass เงียบ |
```

**หมายเหตุความจริงที่ควรอยู่ในกฎ**: ชั้น 1 (grep) ปัจจุบันจับเฉพาะรูป Stripe
(`sk_/rk_/whsec_/pk_live_`) ⇒ ตาบอดต่อ AWS key, DB password, JWT secret และ key ที่ต่อสตริง
— การขยาย pattern คือ **P4** ที่ operator ให้ priority สูงขึ้นหลังรู้ว่าชั้น 1 คือชั้นเดียวที่ผูกกับ probe

---

## diff ที่เสนอ — `scripts/probes/no-secret.sh` (operator-owned)

```diff
 #!/usr/bin/env bash
-# no-secret — live key material in sources = FAIL. gitleaks when available.
+# no-secret — live key material in sources = FAIL.
+#
+# TWO LAYERS, and this probe is only layer 1:
+#   layer 1 = the grep pin below (this file)
+#   layer 2 = CI job `Secret Scanning` (TruffleHog) in .github/workflows/ci.yml
+#
+# FAIL-LOUD CONTRACT (operator 2026-08-03): this probe used to `pass` with the
+# message "gitleaks not installed in this environment — grep only". That is a
+# probe reporting PASS for a check it did not run, which is indistinguishable
+# from a clean result to every reader and to every archived evidence pack. A
+# probe that passes itself when its tool is missing is not a probe.
+# If a declared scanner is unavailable, exit BLOCKED (2) — never PASS.
 source "$(dirname "$0")/_lib.sh"
 ALLOW="$(dirname "$0")/no-secret-allowlist.txt"
 HITS=$(grep -rInE "sk_(test|live)_[A-Za-z0-9]{8,}|rk_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|pk_live_[A-Za-z0-9]{8,}" \
     ... ) || true
 [ -n "$HITS" ] && fail "$(printf '%s' "$HITS" | head -10)"
 
-if command -v gitleaks >/dev/null 2>&1; then
-    (cd "$ROOT" && gitleaks detect --no-banner --redact) >"$EVIDENCE_DIR/gitleaks.log" 2>&1 \
-        || fail "gitleaks found leaks — $EVIDENCE_DIR/gitleaks.log"
-    pass "0 grep hits; gitleaks clean"
-fi
-pass "0 grep hits (gitleaks not installed in this environment — grep only)"
+# Layer 2 is TruffleHog in CI, not gitleaks here. Locally there is no second
+# layer, and the probe must say so rather than implying full coverage.
+if command -v gitleaks >/dev/null 2>&1; then
+    (cd "$ROOT" && gitleaks detect --no-banner --redact) >"$EVIDENCE_DIR/gitleaks.log" 2>&1 \
+        || fail "gitleaks found leaks — $EVIDENCE_DIR/gitleaks.log"
+    pass "layer1 grep: 0 hits · layer2 gitleaks: clean"
+fi
+
+# No local deep scanner. In CI, layer 2 runs as the `Secret Scanning` job, so a
+# CI run is genuinely two-layer; a local run is not.
+if [ -n "${CI:-}" ]; then
+    pass "layer1 grep: 0 hits · layer2 = TruffleHog job (Secret Scanning) in this CI run"
+fi
+blocked "operator:secret-scanner — layer1 grep passed (0 hits) but NO deep scanner is available locally (gitleaks absent). Install gitleaks, or run this probe in CI where the TruffleHog job provides layer 2. Refusing to report PASS for a scan that did not run."
```

### ผลของ diff นี้
- **ในเครื่องที่ไม่มี gitleaks** → `BLOCKED(2)` แทน `PASS` ⇒ evidence pack จะไม่มีคำว่า PASS
  สำหรับการสแกนที่ไม่ได้เกิดขึ้น
- **ใน CI** → `PASS` โดยระบุว่าชั้น 2 คือ TruffleHog job จริง ๆ
- **มี gitleaks ในเครื่อง** → รันจริงแล้ว pass สองชั้น

`_lib.sh` มี `blocked()` (exit 2) อยู่แล้วตาม contract บรรทัด 3 — ไม่ต้องเพิ่มอะไร

---

## ผลข้างเคียงที่ operator ควรรู้ก่อน apply

`scripts/check-done.sh` และ flow ที่รวมผล probe จะเห็น `no-secret` เป็น **BLOCKED** ในเครื่อง
พัฒนาที่ไม่มี gitleaks — **ตั้งใจให้เป็นแบบนั้น** ตาม §2 ของ CLAUDE.md เอง (`BLOCKED(operator:<need>)`
คือสถานะที่ถูกต้องเมื่อรอสิ่งที่ operator ต้องจัดหา) แต่ถ้ามี automation ที่ถือว่า non-zero exit
= พัง ต้องปรับให้แยกแยะ exit 2 ออกจาก exit 1 ก่อน

**ทางเลือกที่เบากว่า** ถ้า operator ไม่อยากให้ local รายงาน BLOCKED: ติดตั้ง gitleaks ใน
devcontainer/setup script แล้วชั้น 2 จะมีจริงทั้งสองที่ — ข้อนี้ operator สั่งว่า "ทำทั้งสองอย่าง"
จึงเสนอทั้ง diff และการติดตั้ง

---

## ที่มาของบทเรียน
ตระกูล **"กลไกป้องกันที่มีอยู่แต่ไม่ได้ป้องกัน"** — เคสที่ 1 ใน 3 ที่พบในสองวัน:
probe ที่ pass ตัวเองเมื่อ tool หาย · test ที่เขียวเพราะไม่เคยรัน · override ที่ pin เวอร์ชันมีช่องโหว่
(ดู `BACKLOG-FOUND.md`)
