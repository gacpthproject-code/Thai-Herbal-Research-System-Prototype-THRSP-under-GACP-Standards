#!/usr/bin/env bash
# report-integrity — the report under judgement must use the 3-value status
# vocabulary, carry references on Did/Found bullets, and its Ratchet line must
# match the probe's real numbers (CLAUDE.md §2, §5; Law 3.2/3.9).
#
# ── TARGET SELECTION (L-031) ──────────────────────────────────────────────────
# This probe used to judge whichever .md under reports/orchestrator/ was newest by
# mtime. HARNESS_LOG.md (2026-08-06 qc-evidence entry) records the consequence: it
# PASSed on `reports/orchestrator/W2-01-plan.md` — a PLAN file — while the reports
# it was believed to be certifying were never opened. A green verdict on an
# unrelated file is worse than no verdict, so target selection is now explicit and
# always printed:
#   1. argv[1]                       — explicit, exit 1 if that file is missing/empty
#   2. $REPORT_INTEGRITY_TARGET      — explicit; needed because scripts/check-done.sh
#                                      and scripts/ci/probe-gate.js invoke probes with
#                                      NO arguments, so argv alone left the explicit
#                                      mode unreachable from the runner that CI uses
#   3. รายงานทุกไฟล์ที่ diff กับ main แตะ — โหมดปริยายตั้งแต่ 2026-09-11
#                                      (operator: "ทำให้ถูกต้อง ไม่มีการยกเว้น")
#
# โหมดปริยายเดิมคือ "ไฟล์ใหม่สุดใน reports/orchestrator/" ซึ่งเป็นเหตุผลที่แถวนี้ถูกจอด
# เป็น manual มาหลายเดือน: ไม่มี convention เดียวที่ใช้ได้ทุก PR เพราะ path ของรายงาน
# เป็น "ต่อ work item" (CLAUDE.md §6) ไม่ใช่ path คงที่
#
# convention ที่ใช้แทน — **ตัดสินรายงานทุกไฟล์ที่การเปลี่ยนแปลงนี้แตะ** · นิยามชัด
# มีเสมอ ไม่ต้องเลือกไฟล์ และตรงกับกติกา "หนึ่งรายงานต่อหนึ่ง work item" พอดี
# การเปลี่ยนที่ไม่ได้แตะรายงานเลย = PENDING (ไม่มีอะไรให้ตัดสิน) ไม่ใช่ FAIL
# An explicitly named target that does not exist is a FAIL, not PENDING: someone
# asked for a specific file to be judged and it was not there. PENDING is reserved
# for "no report has been written yet", which only the default mode can observe.
#
# REPORT_INTEGRITY_ROOT overrides the repo root for the default-mode glob so this
# probe can be exercised against fixtures (same rationale as PROBE_GATE_ROOT in
# scripts/ci/probe-gate.js). CI sets it nowhere and gets the real layout.
#
# Contract: exit 0 PASS · 1 FAIL · 3 PENDING (nothing to judge, default mode only).
source "$(dirname "$0")/_lib.sh"

SCAN_ROOT="${REPORT_INTEGRITY_ROOT:-$ROOT}"
EXPLICIT="${1:-${REPORT_INTEGRITY_TARGET:-}}"
TARGETS=()
if [ -n "$EXPLICIT" ]; then
    MODE="explicit"
    [ -f "$EXPLICIT" ] || fail "target not found: $EXPLICIT (a named target that does not exist is a broken claim, not an absent one)"
    [ -s "$EXPLICIT" ] || fail "target is empty: $EXPLICIT"
    TARGETS=("$EXPLICIT")
else
    MODE="changed-vs-main"
    BASE="$(git -C "$SCAN_ROOT" merge-base HEAD origin/main 2>/dev/null \
        || git -C "$SCAN_ROOT" merge-base HEAD main 2>/dev/null || true)"
    if [ -z "$BASE" ]; then
        blocked "no main to diff against — cannot tell which reports this change touches (pass \$1 or REPORT_INTEGRITY_TARGET to judge a file directly)"
    fi
    while IFS= read -r rel; do
        [ -n "$rel" ] || continue
        [ -f "$SCAN_ROOT/$rel" ] || continue      # ไฟล์ที่ถูกลบ ไม่มีอะไรให้ตัดสิน
        [ -s "$SCAN_ROOT/$rel" ] || continue
        TARGETS+=("$SCAN_ROOT/$rel")
    done < <(git -C "$SCAN_ROOT" diff --name-only "$BASE" -- 'reports/**/*.md' 'reports/*.md' 2>/dev/null || true)
    [ ${#TARGETS[@]} -eq 0 ] && pending "การเปลี่ยนแปลงนี้ไม่ได้แตะรายงานใดเลย — ไม่มีอะไรให้ตัดสิน"
fi
echo "report-integrity: mode=$MODE targets=${#TARGETS[@]}"

for REPORT in "${TARGETS[@]}"; do
    echo "report-integrity: judging $REPORT"
    BAD_STATUS=$(grep -E '^Status:' "$REPORT" | grep -vE 'DONE\(probe:[a-z0-9-]+\)|PENDING|BLOCKED\(operator:[^)]+\)' || true)
    [ -n "$BAD_STATUS" ] && fail "invalid status value in $REPORT: $BAD_STATUS"
    # Every Did/Found bullet must carry a reference (file:line, path, test name, PR/run URL).
    NOREF=$(awk '/^Did:|^Found:/{on=1;next} /^[A-Z][a-z]+:/{on=0} on && /^[[:space:]]*-/ && !/([a-zA-Z0-9_./-]+\.(js|ts|md|sh|json|yml|prisma|txt)(:[0-9]+)?)|https?:\/\/|evidence\/|reports\//' "$REPORT" || true)
    [ -n "$NOREF" ] && fail "unreferenced claim(s) in $REPORT: $(printf '%s' "$NOREF" | head -3)"
    # Ratchet line must match the real current counts.
    if grep -qE '^Ratchet:' "$REPORT"; then
        CUR="$EVIDENCE_DIR/ratchet-current.txt"
        [ -s "$CUR" ] || bash "$(dirname "$0")/ratchet.sh" >/dev/null 2>&1
        for name in hardcode todo dup-source; do
            claimed=$(grep -E '^Ratchet:' "$REPORT" | grep -oE "$name [0-9]+→[0-9]+" | grep -oE '[0-9]+$' | head -1)
            actual=$(grep -E "^$name:" "$CUR" | grep -oE '[0-9]+' | head -1)
            [ -n "$claimed" ] && [ -n "$actual" ] && [ "$claimed" != "$actual" ] \
                && fail "Ratchet line claims $name=$claimed but probe measured $actual"
        done
    fi
done
pass "[$MODE] ${#TARGETS[@]} report(s) — status vocabulary + references + ratchet numbers consistent"
