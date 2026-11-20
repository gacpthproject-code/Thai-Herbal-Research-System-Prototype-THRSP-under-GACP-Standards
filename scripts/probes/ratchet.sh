#!/usr/bin/env bash
# ratchet — one-way debt burn-down (HARNESS.md §4.2).
# Recounts every counter and compares against the baselines in AUDIT_LEDGER.md:
#   count > baseline  → FAIL (new debt is forbidden)
#   count < baseline  → PASS + prints the lower number (operator ratchets baseline DOWN)
# Missing baseline (bootstrap) → prints counts and PASSES with a BOOTSTRAP note;
# the numbers printed here are what the operator seeds AUDIT_LEDGER.md with.
# dead-route: [DRAFT] — no mechanical counter yet (needs route↔test↔UI matrix).
source "$(dirname "$0")/_lib.sh"

BIZ_DIRS=("$BACKEND/services" "$BACKEND/routes" "$BACKEND/jobs" "$BACKEND/middleware")

count_hardcode() {
    local total=0 n
    while IFS= read -r pat; do
        case "$pat" in ''|'#'*) continue;; esac
        n=$(grep -rE "$pat" "${BIZ_DIRS[@]}" --include='*.js' 2>/dev/null | wc -l)
        total=$((total + n))
    done < "$(dirname "$0")/hardcode-patterns.txt"
    echo "$total"
}

# LC_ALL=C: \b and grep's binary-file test follow the locale, and one tree must count
# the same under any LANG (case N). s? lets TODOs, FIXMEs and HACKs count (cases P, Q).
TODO_RE='\b((TODO|FIXME|HACK)s?|XXX)\b'
count_todo() { # [$1 backend-dir]
    local backend="${1:-$BACKEND}" dirs=() d
    for d in "${BIZ_DIRS[@]}"; do dirs+=("$backend/${d#"$BACKEND"/}"); done
    LC_ALL=C grep -rEn "$TODO_RE" "${dirs[@]}" "$backend/shared" "$backend/config" \
        --include='*.js' 2>/dev/null | wc -l
}

count_env_direct() {
    grep -rEn 'process\.env\.[A-Z_]+' "$BACKEND/services" "$BACKEND/routes" "$BACKEND/jobs" "$BACKEND/middleware" \
        --include='*.js' 2>/dev/null | wc -l
}

# A file is a SOURCE for a domain only when the domain pattern hits a line that is
# not comment-only. Rationale (BACKLOG-FOUND.md:88): naming an identifier in a
# comment used to make the file count as a duplicate source, so writing "the second
# calendar was deleted on purpose, do not bring it back" pushed this counter 4→5
# with zero code duplication present, and correcting a guard's documented scope at a
# reviewer's request flipped holiday-single-source PASS→FAIL
# (evidence/l001/ratchet-comment-token-regression-result-fail.txt). A counter that
# rises when you document accurately pays agents to delete the documentation. This
# filter is generic — it fixes every domain in ssot-domains.txt at once, including
# the bare-token ones (entity-legal-name), rather than one pattern at a time.
# It only ever REMOVES comment-only evidence; a domain whose pattern hits real code
# is counted exactly as before (pinned by --selftest cases B/D).
count_dup_source() { # [$1 backend-dir] [$2 domains-file]
    # Sum over domains of (defining files - 1); 0 = every domain has ONE source.
    local backend="${1:-$BACKEND}" domains="${2:-$(dirname "$0")/ssot-domains.txt}"
    local excess=0 files kept n domain pat f
    while IFS='|' read -r domain pat; do
        case "$domain" in ''|'#'*) continue;; esac
        files=$(grep -rlE "$pat" "$backend" --include='*.js' \
            --exclude-dir=node_modules --exclude-dir=__tests__ 2>/dev/null || true)
        kept=""
        while IFS= read -r f; do
            [ -z "$f" ] && continue
            # Keep the file only if at least one MATCHING line is not comment-only.
            # A trailing comment on a code line still counts (case E) — the test is
            # on the line, not on the token.
            # (the blank-line alternative below is what makes "grep found nothing"
            #  resolve to "not a source" instead of "a source")
            printf '%s\n' "$(grep -E "$pat" "$f" 2>/dev/null)" \
                | grep -qvE '^[[:space:]]*(//|\*|/\*)|^[[:space:]]*$' || continue
            kept="$kept$f"$'\n'
        done <<<"$files"
        n=$(printf '%s' "$kept" | grep -c . || true)
        # ${kept%$'\n'} drops the accumulator's trailing newline so the rendered line
        # is byte-identical to the previous implementation for an unchanged tree —
        # this string lands in the tracked evidence/probe-results.json.
        [ "$n" -gt 1 ] && { excess=$((excess + n - 1)); echo "  dup [$domain] $n sources: $(printf '%s' "${kept%$'\n'}" | sed "s#^$backend/#apps/backend/#" | tr '\n' ' ')" >&2; }
    done < "$domains"
    echo "$excess"
}

# ── selftest ──────────────────────────────────────────────────────────────────
# In-file so the operator can re-run the evidence (Law 3.11); same convention as
# scripts/probes/status-vocab.sh --selftest. Exercises count_dup_source against
# synthetic backends using the REAL ssot-domains.txt patterns, so a pattern edit
# that reopens the comment hole fails here.
if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0
    DOMAINS="$(dirname "$0")/ssot-domains.txt"
    check() { # $1 label  $2 backend-dir  $3 expected-excess
        local got
        CASES=$((CASES + 1))
        got="$(count_dup_source "$2" "$DOMAINS" 2>/dev/null)"
        echo "--- selftest $1 → dup-source excess $got (expected $3)"
        count_dup_source "$2" "$DOMAINS" 2>&1 >/dev/null | sed 's/^/    /'
        [ "$got" = "$3" ] || { echo "*** $1 FAILED: excess $got != $3"; BAD=$((BAD + 1)); }
        echo
    }
    calendar_at() { mkdir -p "$(dirname "$1")"; printf 'const RECURRING_HOLIDAYS = [\n  "01-01",\n];\nmodule.exports = { RECURRING_HOLIDAYS };\n' >"$1"; }
    legal_at()    { mkdir -p "$(dirname "$1")"; printf 'const PLATFORM_LEGAL_NAME_TH = "กรมการแพทย์แผนไทยฯ";\nmodule.exports = { PLATFORM_LEGAL_NAME_TH };\n' >"$1"; }

    # A — one calendar + one file whose ONLY reference is a comment ⇒ 0 excess.
    #     This is the L-001 regression, reproduced.
    calendar_at "$TMP/A/utils/working-days.js"
    mkdir -p "$TMP/A/routes"
    printf '// RECURRING_HOLIDAYS and EXTRA_HOLIDAYS_BY_YEAR live in utils/working-days.js.\n// Do not add a second PUBLIC_HOLIDAYS table here.\nmodule.exports = {};\n' \
        >"$TMP/A/routes/deps.js"
    check A "$TMP/A" 0

    # B — MUTATION: two REAL calendars ⇒ 1 excess. Without this, case A could be
    #     "fixed" by making the counter blind.
    calendar_at "$TMP/B/utils/working-days.js"
    calendar_at "$TMP/B/services/legacy-holidays.js"
    check B "$TMP/B" 1

    # C — same regression on a BARE-token domain (entity-legal-name), which is why
    #     the filter is generic instead of a per-domain regex tweak.
    legal_at "$TMP/C/config/platform.js"
    mkdir -p "$TMP/C/services"
    printf '/*\n * PLATFORM_LEGAL_NAME_TH is defined in config/platform.js — import it, never retype it.\n */\nmodule.exports = {};\n' \
        >"$TMP/C/services/invoice-pdf.js"
    check C "$TMP/C" 0

    # D — MUTATION on the same bare-token domain: two real declarations ⇒ 1 excess.
    legal_at "$TMP/D/config/platform.js"
    legal_at "$TMP/D/services/invoice-pdf.js"
    check D "$TMP/D" 1

    # E — a trailing comment on a LIVE code line is not a comment-only line; the
    #     file still counts. Pins that the filter is line-shaped, not token-shaped.
    calendar_at "$TMP/E/utils/working-days.js"
    mkdir -p "$TMP/E/services"
    printf 'const RECURRING_HOLIDAYS = ["01-01"]; // duplicated on purpose to prove detection\nmodule.exports = { RECURRING_HOLIDAYS };\n' \
        >"$TMP/E/services/dup.js"
    check E "$TMP/E" 1

    # Marker cases carry a mask line, so a substring counter scores 2 and a blind one 0.
    todo_check() { # $1 label  $2 backend-dir  $3 expected  $4 LC_ALL for the call (optional)
        local got
        CASES=$((CASES + 1))
        got="$(LC_ALL="${4:-}" count_todo "$2")"
        echo "--- selftest $1 → todo count $got (expected $3)"
        [ "$got" = "$3" ] || { echo "*** $1 FAILED: todo count $got != $3"; BAD=$((BAD + 1)); }
        echo
    }
    todo_case() { # $1 label  $2 expected  stdin: services/probe.js
        mkdir -p "$TMP/$1/services"; cat >"$TMP/$1/services/probe.js"
        todo_check "$1" "$TMP/$1" "$2"
    }

    # F. The order-10 national-ID mask, in a comment and in code, is not debt.
    todo_case F 0 <<'EOF'
// maskThaiId → 1-XXXX-XXXX-X-0716
const MASK = 'X-XXXX-XXXX-X-1234';
EOF

    # G, H, I. Each debt word is counted once, next to a mask that is not.
    todo_case G 1 <<'EOF'
// TODO: wire the vault client
const MASK = '1-XXXX-XXXX-X-0716';
EOF
    todo_case H 1 <<'EOF'
// FIXME handle the empty cart
const MASK = '1-XXXX-XXXX-X-0716';
EOF
    todo_case I 1 <<'EOF'
// HACK: temporary until the gateway ships
const MASK = '1-XXXX-XXXX-X-0716';
EOF

    # J. A standalone XXX is debt.
    todo_case J 1 <<'EOF'
// XXX: revisit once the registry is seeded
const MASK = '1-XXXX-XXXX-X-0716';
EOF

    # K, L. A word that merely contains a marker, or an XXX touching a letter, digit or
    #       underscore, is not debt.
    todo_case K 0 <<'EOF'
const TODOS = [];
EOF
    todo_case L 0 <<'EOF'
const PLACEHOLDER = 'XXXX';
const SLOTS = [XXX_ID, XXX1];
EOF

    # M. Other shapes that are not debt: CAR-XXXX, an XXXXX group, 0XXXXXXXXX, a TODO_* sentinel.
    todo_case M 0 <<'EOF'
const CAR = 'CAR-XXXX';
// positions 6-10 → XXXXX.
// Accepts 0XXXXXXXXX, +66XXXXXXXXX
// appends TODO_* sentinels for new codes
EOF

    # N. Under a UTF-8 caller locale, a marker written against Thai text and a file with an
    #    invalid UTF-8 byte (grep would skip it as binary) still count: count_todo pins LC_ALL=C.
    UTF8="$(locale -a 2>/dev/null | grep -i -m1 -E 'utf-?8' || true)"
    if [ -n "$UTF8" ]; then
        mkdir -p "$TMP/N/services"
        printf "// TODOแก้ภายหลัง\nconst MASK = '1-XXXX-XXXX-X-0716';\n" >"$TMP/N/services/thai.js"
        printf '// TODO \xff bad byte\n' >"$TMP/N/services/bad-byte.js"
        todo_check N "$TMP/N" 2 "$UTF8"
    else
        echo "--- selftest N → SKIPPED: no UTF-8 locale installed here, so it cannot show the LC_ALL=C pin matters"; echo
    fi

    # O. Every counted directory is scanned, below its top level too; each matching line counts
    #    (two in one file); a quoted 'TODO' used as data counts (HARNESS.md section 4.2).
    for d in services routes jobs middleware shared config; do
        mkdir -p "$TMP/O/$d"; printf '// TODO: %s\n' "$d" >"$TMP/O/$d/probe.js"
    done
    mkdir -p "$TMP/O/services/nested/deeper"
    printf '// FIXME nested\n' >"$TMP/O/services/nested/deeper/probe.js"
    printf '// HACK first\n// XXX second\n' >"$TMP/O/routes/two-lines.js"
    printf "const state = 'TODO';\nconst MASK = '1-XXXX-XXXX-X-0716';\n" >"$TMP/O/jobs/data.js"
    todo_check O "$TMP/O" 10

    # P, Q. A plural marker in prose is debt, once per line. No mask line here, so the
    #       plural clause is the only thing these cases test.
    todo_case P 1 <<'EOF'
// TODOs: a, b
EOF
    todo_case Q 2 <<'EOF'
// FIXMEs: cart, retry
// HACKs: gateway, vault
EOF

    echo "=================================================="
    [ "$BAD" -eq 0 ] && { echo "ratchet --selftest: $CASES/$CASES cases PASS"; exit 0; }
    echo "ratchet --selftest: $BAD assertion(s) FAILED"; exit 1
fi

HC=$(count_hardcode); TD=$(count_todo); ED=$(count_env_direct); DS=$(count_dup_source)
OUT="$EVIDENCE_DIR/ratchet-current.txt"
{
    echo "hardcode: $HC"
    echo "todo: $TD"
    echo "env-direct: $ED"
    echo "dup-source: $DS"
    echo "dead-route: DRAFT (no mechanical counter yet)"
} | tee "$OUT"

FAILED=""
for pair in "hardcode:$HC" "todo:$TD" "env-direct:$ED" "dup-source:$DS"; do
    name="${pair%%:*}"; val="${pair##*:}"
    base="$(baseline "$name")"
    if [ -z "$base" ]; then
        echo "BOOTSTRAP: no baseline for '$name' in AUDIT_LEDGER.md — seed it with $val"
    elif [ "$val" -gt "$base" ]; then
        FAILED="$FAILED $name($val>$base)"
    fi
done
[ -n "$FAILED" ] && fail "ratchet increased:$FAILED — new debt is forbidden (CLAUDE.md 3.5/3.6)"
pass "no counter above baseline — current: hardcode=$HC todo=$TD env-direct=$ED dup-source=$DS ($OUT)"
