#!/usr/bin/env bash
# session-check.sh — CLAUDE.md §1 session start protocol.
# Prints REAL state: branch, dirty diff, last probe summary, ratchet counters.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── selftest ──────────────────────────────────────────────────────────────────
# In-file so the operator can re-run the evidence (Law 3.11); same convention as
# scripts/probes/status-vocab.sh --selftest.
#
# What it pins: this script used to `cat` evidence/probe-results.json and
# evidence/ratchet-current.txt with no indication of when they were produced
# (HARNESS_LOG.md:134 recorded a session opening on a picture that was a day old
# and being believed). CLAUDE.md §1 makes this the first thing every session
# reads, so an unlabelled cache here is a fabricated-status generator: the agent
# did see "output in this session", it just was not about this tree.
if [ "${1:-}" = "--selftest" ]; then
    BAD=0; CASES=0
    fail_case() { echo "*** $1 FAILED: $2"; BAD=$((BAD + 1)); }
    mtime() { stat -c %Y "$1" 2>/dev/null || echo missing; }

    RES="$ROOT/evidence/probe-results.json"; RAT="$ROOT/evidence/ratchet-current.txt"
    BEFORE_RES="$(mtime "$RES")"; BEFORE_RAT="$(mtime "$RAT")"
    BEFORE_SUM="$(cat "$RES" "$RAT" 2>/dev/null | cksum)"
    T0=$(date +%s)
    OUT="$(bash "$0" 2>&1)"
    T1=$(date +%s)
    AFTER_RES="$(mtime "$RES")"; AFTER_RAT="$(mtime "$RAT")"
    AFTER_SUM="$(cat "$RES" "$RAT" 2>/dev/null | cksum)"

    CASES=$((CASES + 1))
    echo "--- selftest A: probe summary is labelled with its provenance and freshness"
    if printf '%s' "$OUT" | grep -qE 'รันสดเมื่อ|อายุ'; then
        printf '%s\n' "$OUT" | grep -E 'รันสดเมื่อ|อายุ|CACHED' | sed 's/^/    /'
        echo "ok"
    else
        printf '%s\n' "$OUT" | sed 's/^/    /'
        fail_case A "no freshness label — the summary does not say when it was produced"
    fi
    echo

    CASES=$((CASES + 1))
    echo "--- selftest B: session start does not mutate the tracked evidence files"
    if [ "$BEFORE_RES" != "$AFTER_RES" ] || [ "$BEFORE_RAT" != "$AFTER_RAT" ] || [ "$BEFORE_SUM" != "$AFTER_SUM" ]; then
        echo "    probe-results.json mtime $BEFORE_RES → $AFTER_RES"
        echo "    ratchet-current.txt mtime $BEFORE_RAT → $AFTER_RAT"
        fail_case B "session-check rewrote tracked evidence — that is the dirty-tree friction it must not create"
    else
        echo "ok — both tracked artifacts untouched"
    fi
    echo

    CASES=$((CASES + 1))
    echo "--- selftest C: it finishes fast enough to stay a session-start command"
    echo "    elapsed $((T1 - T0))s"
    if [ $((T1 - T0)) -le 10 ]; then echo "ok"; else fail_case C "took $((T1 - T0))s (budget 10s)"; fi
    echo

    CASES=$((CASES + 1))
    echo "--- selftest D: with a fresh run disabled, the cached fallback states the age and how to refresh"
    OUT2="$(SESSION_CHECK_NO_PROBES=1 bash "$0" 2>&1)"
    if printf '%s' "$OUT2" | grep -q 'อายุ' \
       && printf '%s' "$OUT2" | grep -q 'evidence/probe-results.json' \
       && printf '%s' "$OUT2" | grep -q 'scripts/check-done.sh'; then
        printf '%s\n' "$OUT2" | grep -E 'อายุ|CACHED|check-done' | sed 's/^/    /'
        echo "ok"
    else
        printf '%s\n' "$OUT2" | sed 's/^/    /'
        fail_case D "cached fallback must name the file, its age, and the command to refresh"
    fi
    echo

    CASES=$((CASES + 1))
    echo "--- selftest E: the ratchet block carries a freshness label too"
    if printf '%s' "$OUT" | grep -A1 'ratchet counters' | grep -qE 'รันสดเมื่อ|อายุ'; then
        echo "ok"
    else
        printf '%s\n' "$OUT" | grep -A2 'ratchet counters' | sed 's/^/    /'
        fail_case E "ratchet counters printed with no indication of when they were measured"
    fi
    echo

    echo "=================================================="
    [ "$BAD" -eq 0 ] && { echo "session-check --selftest: $CASES/$CASES cases PASS"; exit 0; }
    echo "session-check --selftest: $BAD assertion(s) FAILED"; exit 1
fi

echo "== git =="
git branch --show-current
git status --short | head -20
git log --oneline -3

# ── freshness ─────────────────────────────────────────────────────────────────
# This block used to `cat` two tracked files with no timestamp. CLAUDE.md §1 makes
# this the first output of every session, so an unlabelled cache is read as "state
# of this tree" when it may be a day old (HARNESS_LOG.md:134).
#
# Chosen fix: RE-RUN the `ci` probes, into a TEMP dir. Measured cost of that set on
# this checkout is well under a second (they are pure grep — see the registry's own
# reason column), so the ~10s session-start budget is not at risk. Writing to a temp
# dir rather than evidence/ is the point, not an implementation detail: probe-results.json
# and ratchet-current.txt are tracked, so a session-start command that rewrote them
# would dirty the tree it had just printed `git status` for — the exact friction being
# removed here. Pinned by --selftest cases B and C.
#
# The cached path still exists (SESSION_CHECK_NO_PROBES=1, no readable registry, a
# probe run that produces nothing, or a timeout) and it now states the file, its age,
# and the command to refresh, instead of presenting stale data as current.
human_age() { # $1 = seconds
    local s="$1"
    if   [ "$s" -lt 3600 ];  then echo "$((s / 60)) นาที"
    elif [ "$s" -lt 86400 ]; then echo "$((s / 3600)) ชม. $(((s % 3600) / 60)) นาที"
    else                          echo "$((s / 86400)) วัน $(((s % 86400) / 3600)) ชม."
    fi
}
age_line() { # $1 = file, $2 = repo-relative label
    local mt
    mt="$(stat -c %Y "$1" 2>/dev/null || true)"
    if [ -z "$mt" ]; then
        echo "⚠️  CACHED — $2 · อายุ: ไม่ทราบ (stat ใช้ไม่ได้บนเครื่องนี้)"
    else
        echo "⚠️  CACHED — $2 · อายุ $(human_age $(( $(date +%s) - mt ))) (mtime $(date -u -d "@$mt" +'%Y-%m-%d %H:%M:%S') UTC)"
    fi
    echo "    ภาพนี้อาจไม่ตรงกับ tree ปัจจุบัน — รัน \`bash scripts/check-done.sh\` เพื่อดูสด"
}

FRESH_DIR=""; FRESH_SECS=0; FRESH_SET=""
if [ "${SESSION_CHECK_NO_PROBES:-0}" != "1" ]; then
    REGISTRY="$ROOT/scripts/probes/probe-registry.txt"
    if [ -r "$REGISTRY" ]; then
        FRESH_SET="$(awk -F'|' '/^[[:space:]]*#/ {next} NF > 1 {
            gsub(/^[ \t]+|[ \t]+$/, "", $1); gsub(/^[ \t]+|[ \t]+$/, "", $2);
            if ($2 == "ci" && $1 != "") print $1 }' "$REGISTRY" | tr '\n' ' ')"
    fi
    if [ -n "$FRESH_SET" ]; then
        PROBE_TMP="$(mktemp -d)"
        trap 'rm -rf "$PROBE_TMP"' EXIT
        T0=$(date +%s)
        if command -v timeout >/dev/null 2>&1; then
            PROBE_OUT_DIR="$PROBE_TMP" timeout "${SESSION_CHECK_PROBE_TIMEOUT:-20}" \
                bash "$ROOT/scripts/check-done.sh" $FRESH_SET >/dev/null 2>&1 || true
        else
            PROBE_OUT_DIR="$PROBE_TMP" bash "$ROOT/scripts/check-done.sh" $FRESH_SET >/dev/null 2>&1 || true
        fi
        FRESH_SECS=$(( $(date +%s) - T0 ))
        [ -s "$PROBE_TMP/probe-results.json" ] && FRESH_DIR="$PROBE_TMP"
    fi
fi

echo
echo "== probe summary =="
if [ -n "$FRESH_DIR" ]; then
    echo "รันสดเมื่อ $(date -u +'%Y-%m-%d %H:%M:%S') UTC (${FRESH_SECS}s) — probe กอง \`ci\` ในทะเบียน: $FRESH_SET"
    echo "    ผลเขียนลง temp dir ไม่แตะ evidence/ ในรีโป · ชุดเต็ม (รวม manual): bash scripts/check-done.sh"
    SUMMARY_SRC="$FRESH_DIR/probe-results.json"
elif [ -s "$ROOT/evidence/probe-results.json" ]; then
    age_line "$ROOT/evidence/probe-results.json" "evidence/probe-results.json"
    SUMMARY_SRC="$ROOT/evidence/probe-results.json"
else
    echo "(ยังไม่มี evidence/probe-results.json และรันสดไม่สำเร็จ — รัน bash scripts/check-done.sh)"
    SUMMARY_SRC=""
fi
if [ -n "$SUMMARY_SRC" ]; then
    # node, not python3, and the two failure causes are told apart. The previous
    # version printed "ไฟล์เสีย?" for any non-zero exit, so a machine without a
    # working interpreter was reported as a corrupt results file — and on the
    # Windows checkout used 2026-08-14 that was exactly the situation: Windows
    # ships a python3 App Execution Alias that resolves as an executable and then
    # exits 9009 without running. Same class as check-done.sh's encoder and
    # crawler-clean.sh's counter, fixed the same day.
    if ! node -e 'process.exit(0)' >/dev/null 2>&1; then
        echo "(สรุปผล probe ไม่ได้ — เครื่องนี้ไม่มี node ที่รันได้ · ไม่ใช่ไฟล์เสีย · ตรวจด้วย: node -e 'process.exit(0)')"
    elif ! node -e '
        const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        for (const p of r.results) console.log(p.probe.padEnd(22) + " " + p.status);
    ' "$SUMMARY_SRC" 2>/dev/null; then
        echo "(อ่าน $SUMMARY_SRC ไม่ได้ — ไฟล์เสียจริง รัน bash scripts/check-done.sh ใหม่)"
    fi
fi
echo
echo "== ratchet counters =="
if [ -n "$FRESH_DIR" ] && [ -s "$FRESH_DIR/ratchet-current.txt" ]; then
    echo "รันสดเมื่อ $(date -u +'%Y-%m-%d %H:%M:%S') UTC — วัดจาก tree ปัจจุบัน (รวม diff ที่ยังไม่ commit)"
    cat "$FRESH_DIR/ratchet-current.txt"
elif [ -s "$ROOT/evidence/ratchet-current.txt" ]; then
    age_line "$ROOT/evidence/ratchet-current.txt" "evidence/ratchet-current.txt"
    cat "$ROOT/evidence/ratchet-current.txt"
else
    echo "(ยังไม่ได้วัด — รัน bash scripts/probes/ratchet.sh)"
fi
