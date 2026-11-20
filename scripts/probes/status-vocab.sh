#!/usr/bin/env bash
# status-vocab — every `DONE(probe:<name>)` status claim must name a probe that
# really exists in scripts/probes/probe-registry.txt.
#
# ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
# HARNESS_LOG.md (entry 2026-08-06, qc-evidence batch M4-M7 + ThaID) records a
# status of `DONE(probe:ci-615)` in QUEUE.md — `ci-615` is a CI run number dressed
# up as a probe name; no such probe has ever existed. CLAUDE.md §2 defines exactly
# three status values and `DONE(probe:<name>)` means "that probe passed in this
# session". A claim naming a probe that does not exist cannot have been produced
# by any probe run, so it is fabricated status (Law 3.2) by construction — and
# nothing mechanical caught it. That proposal ((a) in the same log entry) is what
# this file implements: close the whole class, not one bogus name at a time.
#
# ── SCOPE, AND WHY THIS SCOPE ─────────────────────────────────────────────────
# Scanned:      QUEUE.md  +  reports/**/*.md
#   These are where live status claims are written and read as current truth.
# NOT scanned:  HARNESS_LOG.md, AUDIT_LEDGER.md, PROMPT-*.md, scripts/**
#   HARNESS_LOG/AUDIT_LEDGER are append-only incident/finding logs whose job is to
#   quote the offending string verbatim; making the record of a violation into a
#   violation would push agents toward paraphrasing incidents, which is worse than
#   the bug. scripts/** is excluded for the same reason — this probe and its
#   allowlist necessarily contain the incident string.
#
# ── WHY NOT A "LAST 30 DAYS" WINDOW ───────────────────────────────────────────
# A recency window was considered for separating live claims from historical
# narrative. Rejected on two counts:
#   1. The verdict would change with the calendar while no file changed — an
#      unfixed violation would "expire" itself. That is the phantom-guardrail
#      shape this harness keeps rediscovering.
#   2. It needs git history or mtimes. `actions/checkout` is shallow (fetch-depth
#      1) and rewrites every mtime to checkout time — the exact environment trap
#      that already parked `tier-check` out of CI (probe-registry.txt).
# Instead, historical quotation inside a scanned file is handled by a NARROW
# allowlist: scripts/probes/status-vocab-allowlist.txt, one `path::probe-name`
# pair per line. A pair, not a path, so allowlisting an audit report's quotation
# of `ci-615` does not blind this probe to a different bogus name in that same
# file tomorrow. Missing allowlist file = nothing allowlisted.
#
# ── WHAT THIS PROBE DOES NOT CHECK ────────────────────────────────────────────
# That the named probe actually ran, or passed, or that a registry line still has
# a file behind it. Registry-line ↔ probe-file consistency is scripts/ci/probe-gate.js.
# This probe answers exactly one question: is the name real.
#
# Contract: exit 0 PASS · 1 FAIL · 2 BLOCKED (never a vacuous pass — a registry it
# cannot read, or nothing to scan, is BLOCKED, not PASS).
#
# Usage:  bash scripts/probes/status-vocab.sh              # scan the repo
#         bash scripts/probes/status-vocab.sh --selftest   # run fixture cases
#         STATUS_VOCAB_ROOT=<dir> bash scripts/probes/status-vocab.sh
#           ^ scan a synthetic root. Exists so this probe can be exercised against
#             known-dirty and known-clean fixtures instead of only against whatever
#             the repo happens to contain today (same reason probe-gate.js carries
#             PROBE_GATE_ROOT). CI sets neither and gets the real layout.
source "$(dirname "$0")/_lib.sh"

SCAN_ROOT="${STATUS_VOCAB_ROOT:-$ROOT}"
REGISTRY="$SCAN_ROOT/scripts/probes/probe-registry.txt"
ALLOWLIST="$SCAN_ROOT/scripts/probes/status-vocab-allowlist.txt"
# The name must START with an alphanumeric: `DONE(probe:...)` and `DONE(probe:<name>)`
# are prose ABOUT the notation (reports/role-workflow-auditor/2026-08-06-reviewer.md:6
# writes "cannot be marked `DONE(probe:...)`"), not a claim that a probe passed.
# Flagging those would tax explaining the rule. Pinned by --selftest case F.
CLAIM_RE='DONE\(probe:[A-Za-z0-9][A-Za-z0-9_.-]*\)'

# ── metasyntactic names ───────────────────────────────────────────────────────
# The rule above is not enough: a writer explaining the notation reaches for a
# stand-in that DOES start alphanumerically. reports/orchestrator/2026-08-07-ifixai-
# spike/REPORT.md used `DONE(probe:X)` five times meaning "any probe name" and this
# probe read all five as fabricated claims; the only available fix was to rewrite
# prose that was already correct (commit 4be4cd5f). A guardrail that makes people
# edit true sentences to appease it is training them to write around it.
#
# This is a FIXED, SHORT list of stand-ins — not a heuristic like "short names" or
# "all-caps", which would let a real bogus claim through under a plausible-looking
# name. Anything outside the list is still a claim: --selftest case H asserts that
# `DONE(probe:X-615)` — one character away from the placeholder — still fails.
# A registered probe is matched before this list is consulted, so adding a probe
# genuinely named `name` would not be silently ignored.
PLACEHOLDER_RE='^(X|Y|NAME|name|probe-name|probe_name|PROBE_NAME)$'

# ── selftest ──────────────────────────────────────────────────────────────────
# Kept in-file so the evidence for this probe is re-runnable by the operator
# rather than living in an agent's scratch directory (Law 3.11).
if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0
    mkroot() {
        mkdir -p "$TMP/$1/scripts/probes" "$TMP/$1/reports/orchestrator"
        printf '# fixture registry\nratchet | ci | - | - | counters\nno-secret | ci | - | - | grep\n' \
            >"$TMP/$1/scripts/probes/probe-registry.txt"
    }
    check() { # $1 label  $2 root  $3 expected-exit  [$4 needle]
        local out code
        CASES=$((CASES + 1))
        out="$(STATUS_VOCAB_ROOT="$2" bash "$0" 2>&1)"; code=$?
        echo "--- selftest $1 → exit $code (expected $3)"; printf '%s\n' "$out"
        [ "$code" = "$3" ] || { echo "*** $1 FAILED: exit $code != $3"; BAD=$((BAD + 1)); }
        if [ -n "${4:-}" ] && ! printf '%s' "$out" | grep -q -- "$4"; then
            echo "*** $1 FAILED: output does not mention '$4'"; BAD=$((BAD + 1))
        fi
        echo
    }
    # A — the real incident string in a QUEUE status cell must FAIL, and must name
    #     the offending file:line so the reader can go fix it.
    mkroot A
    printf '| # | Task | Status |\n|---|---|---|\n| R2 | reopen | **M4 = `DONE(probe:ci-615)` merged #789** |\n' >"$TMP/A/QUEUE.md"
    printf 'Status: DONE(probe:ratchet)\n' >"$TMP/A/reports/orchestrator/r.md"
    check A "$TMP/A" 1 'QUEUE.md:3'
    # B — every name registered ⇒ PASS.
    mkroot B
    printf '| R2 | reopen | `DONE(probe:ratchet)` |\n' >"$TMP/B/QUEUE.md"
    printf -- '- secret hygiene: DONE(probe:no-secret) — 0 hits\n' >"$TMP/B/reports/orchestrator/r.md"
    check B "$TMP/B" 0
    # C — an audit report QUOTING a bogus name, covered by a path::name pair ⇒ PASS.
    mkroot C; mkdir -p "$TMP/C/reports/qc-evidence"
    printf 'Status: DONE(probe:ratchet)\n' >"$TMP/C/QUEUE.md"
    printf 'audit quoted `DONE(probe:ci-615)` as a violation\n' >"$TMP/C/reports/qc-evidence/audit.md"
    printf 'reports/qc-evidence/audit.md::ci-615\n' >"$TMP/C/scripts/probes/status-vocab-allowlist.txt"
    check C "$TMP/C" 0
    # C2 — the allowlist is pair-scoped: a DIFFERENT bogus name in that same
    #      allowlisted file is still caught. This is the assertion that stops the
    #      allowlist from degenerating into a blind spot.
    printf 'and later claimed `DONE(probe:ci-999)` for real\n' >>"$TMP/C/reports/qc-evidence/audit.md"
    check C2 "$TMP/C" 1 'ci-999'
    # F — a report EXPLAINING the notation ("cannot be marked DONE(probe:...)")
    #     is writing about the format, not claiming a result. `...` is not a name.
    mkroot F
    printf 'Status: DONE(probe:ratchet)\n' >"$TMP/F/QUEUE.md"
    printf 'no registered probe certifies this, so it cannot be marked `DONE(probe:...)`\n' >"$TMP/F/reports/orchestrator/r.md"
    check F "$TMP/F" 0
    # G — prose ABOUT the notation that uses a metasyntactic stand-in for the name.
    #     reports/orchestrator/2026-08-07-ifixai-spike/REPORT.md wrote `DONE(probe:X)`
    #     five times meaning "any probe name"; the probe read all five as claims and
    #     the only way out was to rewrite the prose (commit 4be4cd5f). Case F already
    #     covers `...`/`<name>` because those do not start alphanumerically — `X` and
    #     `NAME` do, so they need naming as placeholders. Pinned both ways: case H
    #     asserts a real bogus name is still caught.
    mkroot G
    printf 'Status: DONE(probe:ratchet)\n' >"$TMP/G/QUEUE.md"
    {
        printf 'report-integrity.sh:8 checks only the STRING SHAPE of `DONE(probe:X)`\n'
        printf 'every `DONE(probe:NAME)` must be backed by an artifact\n'
        printf 'a `DONE(probe:name)` with no evidence is fabricated status\n'
        printf 'the notation is `DONE(probe:probe-name)`\n'
    } >"$TMP/G/reports/orchestrator/r.md"
    check G "$TMP/G" 0
    # H — MUTATION guard for G: a name that merely LOOKS made-up is not excused.
    #     Only the fixed metasyntactic set is; anything else is still a claim.
    mkroot H
    printf 'Status: DONE(probe:ratchet)\n' >"$TMP/H/QUEUE.md"
    printf 'M4 = `DONE(probe:X-615)` merged #789\n' >"$TMP/H/reports/orchestrator/r.md"
    check H "$TMP/H" 1 'X-615'
    # D — unreadable registry ⇒ BLOCKED, never PASS.
    mkroot D
    printf 'Status: DONE(probe:ratchet)\n' >"$TMP/D/QUEUE.md"
    rm -f "$TMP/D/scripts/probes/probe-registry.txt"
    check D "$TMP/D" 2
    # E — nothing to scan ⇒ BLOCKED, never PASS.
    mkroot E; rm -rf "$TMP/E/reports"
    check E "$TMP/E" 2
    echo "=================================================="
    [ "$BAD" -eq 0 ] && { echo "status-vocab --selftest: $CASES/$CASES cases PASS"; exit 0; }
    echo "status-vocab --selftest: $BAD assertion(s) FAILED"; exit 1
fi

# ── inputs ────────────────────────────────────────────────────────────────────
[ -s "$REGISTRY" ] && [ -r "$REGISTRY" ] \
    || blocked "probe registry not readable at ${REGISTRY#$SCAN_ROOT/} — cannot tell a real probe name from a made-up one, so this is BLOCKED, not PASS"

REG_NAMES="$(awk -F'|' '/^[[:space:]]*#/ {next} NF > 1 {gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); if ($1 != "") print $1}' "$REGISTRY")"
[ -n "$REG_NAMES" ] || blocked "parsed 0 probe names out of ${REGISTRY#$SCAN_ROOT/} — an empty registry would make every claim look bogus; refusing to judge"

TARGETS=()
[ -f "$SCAN_ROOT/QUEUE.md" ] && TARGETS+=("$SCAN_ROOT/QUEUE.md")
[ -d "$SCAN_ROOT/reports" ] && TARGETS+=("$SCAN_ROOT/reports")
[ "${#TARGETS[@]}" -gt 0 ] \
    || blocked "neither QUEUE.md nor reports/ exists under $SCAN_ROOT — a probe with nothing to scan reports BLOCKED, not PASS"

# ── scan ──────────────────────────────────────────────────────────────────────
allowlisted() { # $1 = "<relpath>::<name>"
    [ -f "$ALLOWLIST" ] || return 1
    awk -v pair="$1" '/^[[:space:]]*#/ {next} {gsub(/[[:space:]]/, ""); if ($0 == pair) f = 1} END {exit !f}' "$ALLOWLIST"
}

HITS="$(grep -rnoE "$CLAIM_RE" "${TARGETS[@]}" --include='*.md' 2>/dev/null || true)"
CLAIMS=0; ALLOWED=0; BOGUS=0; PROSE=0; DETAIL=""
while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    file="${hit%%:*}"; rest="${hit#*:}"; line="${rest%%:*}"; match="${rest#*:}"
    name="${match#DONE(probe:}"; name="${name%)}"
    rel="${file#"$SCAN_ROOT"/}"
    # A registered name is a claim and is judged as one, placeholder list or not.
    printf '%s\n' "$REG_NAMES" | grep -qxF "$name" && { CLAIMS=$((CLAIMS + 1)); continue; }
    if printf '%s' "$name" | grep -qE "$PLACEHOLDER_RE"; then
        PROSE=$((PROSE + 1))
        DETAIL="${DETAIL}  · $rel:$line: DONE(probe:$name) — metasyntactic stand-in, read as prose about the notation, not as a status claim"$'\n'
        continue
    fi
    CLAIMS=$((CLAIMS + 1))
    if allowlisted "$rel::$name"; then
        ALLOWED=$((ALLOWED + 1))
        DETAIL="${DETAIL}  · $rel:$line: DONE(probe:$name) — allowlisted quotation (status-vocab-allowlist.txt)"$'\n'
        continue
    fi
    BOGUS=$((BOGUS + 1))
    DETAIL="${DETAIL}  ✗ $rel:$line: DONE(probe:$name) — '$name' has no line in scripts/probes/probe-registry.txt"$'\n'
done <<<"$HITS"

[ -n "$DETAIL" ] && printf '%s' "$DETAIL"
if [ "$BOGUS" -gt 0 ]; then
    echo "  → fix the claim (cite the real probe, or a CI run URL, or say PENDING/BLOCKED per CLAUDE.md §2)."
    echo "  → if the line is quoting a past violation on purpose, add '<path>::<name>' to scripts/probes/status-vocab-allowlist.txt."
    fail "$BOGUS status claim(s) name a probe that does not exist (of $CLAIMS scanned in QUEUE.md + reports/**/*.md)"
fi
pass "$CLAIMS DONE(probe:...) claim(s) in QUEUE.md + reports/**/*.md all name registered probes ($ALLOWED allowlisted quotation(s), $PROSE metasyntactic mention(s) read as prose)"
