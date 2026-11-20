#!/usr/bin/env bash
# main-attestation-audit — every commit that landed on main touching gated paths
# must be able to point at a full-gate run.
#
# WHY THIS SHAPE. Branch protection is not available on the current GitHub plan,
# so there is no way to STOP a merge that skipped the gate. This probe accepts
# that and changes the game: it walks main's first-parent history and names every
# gated commit that has no attestation, with sha, date and author. Prevention is
# impossible here; concealment is what this removes.
#
# THREE WAYS A COMMIT IS COVERED (each proven by a selftest case, each with a
# mutation case that must go red):
#   1. evidence/gate/<sha>.json for the commit itself — or for an ancestor whose
#      only difference is the attestation file, since committing it moves the sha
#   2. merge commit → the attestation of the MERGED HEAD (second parent), which is
#      the sha a PR gate would have tested
#   3. a `Gate-Attestation: <40-hex>` trailer in the commit message, for squash
#      merges which have no second parent. The trailer is a pointer to a file that
#      must exist — case G pins that a trailer alone proves nothing.
#
# Contract: exit 0 PASS · 1 FAIL (uncovered commits listed) · 2 BLOCKED.
#
# Usage:  bash scripts/probes/main-attestation-audit.sh
#         bash scripts/probes/main-attestation-audit.sh --selftest
#         GATE_AUDIT_REF=origin/main GATE_AUDIT_DEPTH=30 GATE_AUDIT_CUTOFF=2026-08-08 ...
source "$(dirname "$0")/_lib.sh"

CHECKS_FILE="${GATE_CHECKS_FILE:-$(cd "$(dirname "$0")/../ci" && pwd)/full-gate-checks.txt}"
SCAN_ROOT="${GATE_AUDIT_ROOT:-$ROOT}"
AUDIT_REF="${GATE_AUDIT_REF:-origin/main}"
AUDIT_DEPTH="${GATE_AUDIT_DEPTH:-30}"
# CUTOFF — commits committed BEFORE this date are exempt, because the mechanism
# did not exist yet and a rule cannot bind the past. Authored 2026-08-08 on
# branch feat/full-gate-offline; verified on that date that no commit on
# origin/main dated 2026-08-08 or later touches apps/ (git log origin/main
# --since=2026-08-08T00:00:00 -- apps → empty), so this cutoff exempts nothing
# that the mechanism could have covered. Raising it = weakening the audit and is
# an operator decision.
CUTOFF="${GATE_AUDIT_CUTOFF:-2026-08-08}"

# ── selftest ──────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0

    git_at() { GIT_AUTHOR_DATE="$1T12:00:00+00:00" GIT_COMMITTER_DATE="$1T12:00:00+00:00" git -C "$REPO" "${@:2}"; }

    newrepo() { # $1 dir
        REPO="$1"; mkdir -p "$REPO"
        git -C "$REPO" init -q -b main
        git -C "$REPO" config user.email audit@selftest.local
        git -C "$REPO" config user.name audit-selftest
        mkdir -p "$REPO/apps"; printf 'seed\n' >"$REPO/apps/app.js"
        git_at 2026-07-01 add -A; git_at 2026-07-01 commit -q -m 'seed'
    }
    commit_apps() { # $1 date  $2 message   → sets LAST
        printf '%s\n' "$2" >>"$REPO/apps/app.js"
        git_at "$1" add -A; git_at "$1" commit -q -m "$2"
        LAST="$(git -C "$REPO" rev-parse HEAD)"
    }
    commit_docs() { # $1 date  $2 message
        mkdir -p "$REPO/docs"; printf '%s\n' "$2" >>"$REPO/docs/note.md"
        git_at "$1" add -A; git_at "$1" commit -q -m "$2"
        LAST="$(git -C "$REPO" rev-parse HEAD)"
    }
    attest() { # $1 sha  [$2 date]
        mkdir -p "$REPO/evidence/gate"; printf '{"sha":"%s"}\n' "$1" >"$REPO/evidence/gate/$1.json"
        git_at "${2:-2026-08-10}" add -A; git_at "${2:-2026-08-10}" commit -q -m "chore(gate): attestation for $1"
    }

    check() { # $1 label  $2 repo  $3 expected-exit  [needles...]
        local out code label="$1" repo="$2" want="$3"; shift 3
        CASES=$((CASES + 1))
        out="$(GATE_AUDIT_ROOT="$repo" GATE_AUDIT_REF=main bash "$0" 2>&1)"; code=$?
        echo "--- selftest $label → exit $code (expected $want)"; printf '%s\n' "$out"
        [ "$code" = "$want" ] || { echo "*** $label FAILED: exit $code != $want"; BAD=$((BAD + 1)); }
        local needle
        for needle in "$@"; do
            printf '%s' "$out" | grep -qi -- "$needle" \
                || { echo "*** $label FAILED: output does not mention '$needle'"; BAD=$((BAD + 1))
                   }
        done
        echo
    }

    # A — every post-cutoff apps/ commit carries an attestation ⇒ PASS.
    #     Baseline case: without it, an always-failing probe would satisfy B..E.
    newrepo "$TMP/A"; commit_apps 2026-08-11 'feat: gated change'; attest "$LAST"
    check A "$TMP/A" 0 '1 gated commit'

    # B — THE POINT OF THIS PROBE: an apps/ commit landed after the cutoff with no
    #     attestation. It cannot be prevented; it must be impossible to hide.
    newrepo "$TMP/B"; commit_apps 2026-08-11 'feat: ungated change'
    check B "$TMP/B" 1 "$(git -C "$TMP/B" rev-parse --short HEAD)" 'audit-selftest' '2026-08-11'

    # C — same commit, but dated BEFORE the cutoff ⇒ exempt, and the exemption is
    #     counted out loud rather than silently dropped.
    newrepo "$TMP/C"; commit_apps 2026-07-15 'feat: pre-cutoff change'
    check C "$TMP/C" 0 'before cutoff'

    # D — a post-cutoff commit that touches no gated path needs no attestation.
    newrepo "$TMP/D"; commit_docs 2026-08-11 'docs: note'
    check D "$TMP/D" 0 '0 gated commit'

    # E — MERGE COMMIT: the attestation was produced for the branch head (second
    #     parent), which is what a PR gate would have checked. The merge commit
    #     itself never has one, so without this rule every merge is a false FAIL.
    #     main is deliberately moved forward before the merge, otherwise the
    #     branch attestation would already satisfy the plain ancestor walk and
    #     this case would prove nothing about merges.
    newrepo "$TMP/E"
    git -C "$TMP/E" checkout -q -b feature
    commit_apps 2026-08-11 'feat: on branch'; attest "$LAST"
    BRANCH_TIP="$(git -C "$TMP/E" rev-parse HEAD)"
    git -C "$TMP/E" checkout -q main
    commit_docs 2026-08-11 'docs: main moved on'
    git_at 2026-08-12 merge -q --no-ff "$BRANCH_TIP" -m 'Merge pull request #1'
    check E "$TMP/E" 0 'via merged head'

    # F — SQUASH MERGE has no second parent, so the escape hatch is an explicit
    #     trailer naming the attested sha. Anything weaker (trusting the subject
    #     line) would let a message claim a gate that never ran.
    newrepo "$TMP/F"
    ATTESTED="$(git -C "$TMP/F" rev-parse HEAD)"; attest "$ATTESTED"
    printf 'squashed\n' >>"$TMP/F/apps/app.js"
    git_at 2026-08-11 add -A
    git_at 2026-08-11 commit -q -m "feat: squashed work

Gate-Attestation: $ATTESTED"
    check F "$TMP/F" 0 'via trailer'

    # G — MUTATION of F: the trailer names a sha with no attestation file. A
    #     trailer must be a pointer to evidence, not a password.
    newrepo "$TMP/G"
    printf 'squashed\n' >>"$TMP/G/apps/app.js"
    git_at 2026-08-11 add -A
    git_at 2026-08-11 commit -q -m "feat: squashed work

Gate-Attestation: 0000000000000000000000000000000000000000"
    check G "$TMP/G" 1 'trailer' '0000000'

    # H — several uncovered commits: ALL are listed, not just the first. A report
    #     that stops at one hides the size of the hole.
    newrepo "$TMP/H"
    commit_apps 2026-08-11 'feat: one'; ONE="$(git -C "$TMP/H" rev-parse --short HEAD)"
    commit_apps 2026-08-12 'feat: two'; TWO="$(git -C "$TMP/H" rev-parse --short HEAD)"
    check H "$TMP/H" 1 "$ONE" "$TWO" '2 gated commit'

    # I — the audited ref does not exist ⇒ BLOCKED, never a pass.
    newrepo "$TMP/I"
    CASES=$((CASES + 1))
    out="$(GATE_AUDIT_ROOT="$TMP/I" GATE_AUDIT_REF=refs/heads/nope bash "$0" 2>&1)"; code=$?
    echo "--- selftest I → exit $code (expected 2)"; printf '%s\n' "$out"
    [ "$code" = "2" ] || { echo "*** I FAILED: exit $code != 2"; BAD=$((BAD + 1)); }
    echo

    echo "=================================================="
    [ "$BAD" -eq 0 ] && { echo "main-attestation-audit --selftest: $CASES/$CASES cases PASS"; exit 0; }
    echo "main-attestation-audit --selftest: $BAD assertion(s) FAILED"; exit 1
fi

# ── implementation ───────────────────────────────────────────────────────────
[ -r "$CHECKS_FILE" ] \
    || blocked "cannot read $CHECKS_FILE — the gated-path list lives there (Law L4); refusing to guess it"
GATED_PATTERNS="$(awk -F'|' '/^[[:space:]]*#/ {next} {gsub(/[[:space:]]/,"",$1); gsub(/[[:space:]]/,"",$2); gsub(/[[:space:]]/,"",$3)} $1=="path" && $3=="gated" { print $2 }' "$CHECKS_FILE")"
[ -n "$GATED_PATTERNS" ] || blocked "no gated path row in $CHECKS_FILE — cannot tell which commits need an attestation"

git -C "$SCAN_ROOT" rev-parse --git-dir >/dev/null 2>&1 || blocked "$SCAN_ROOT is not a git repository"
git -C "$SCAN_ROOT" rev-parse --verify --quiet "$AUDIT_REF^{commit}" >/dev/null 2>&1 \
    || blocked "cannot resolve audited ref '$AUDIT_REF' (fetch it, or set GATE_AUDIT_REF) — an audit that cannot read the branch reports nothing, it does not pass"

is_gated() { # $1 = newline-separated paths
    local pat
    while IFS= read -r pat; do
        [ -z "$pat" ] && continue
        printf '%s\n' "$1" | grep -qE "$pat" && return 0
    done <<<"$GATED_PATTERNS"
    return 1
}

GATED=0; EXEMPT=0; NONGATED=0; UNCOVERED=0
LINES=""; BAD_LINES=""
while IFS= read -r c; do
    [ -z "$c" ] && continue
    meta="$(git -C "$SCAN_ROOT" log -1 --format='%cI%x09%an%x09%s' "$c")"
    cdate="${meta%%T*}"; rest="${meta#*$'\t'}"; author="${rest%%$'\t'*}"; subject="${rest#*$'\t'}"
    short="$(git -C "$SCAN_ROOT" rev-parse --short "$c")"

    # A rule cannot bind commits made before it existed.
    if [ "$cdate" \< "$CUTOFF" ]; then EXEMPT=$((EXEMPT + 1)); continue; fi

    if git -C "$SCAN_ROOT" rev-parse --verify --quiet "$c^1" >/dev/null 2>&1; then
        changed="$(git -C "$SCAN_ROOT" diff --name-only "$c^1" "$c" 2>/dev/null || true)"
    else
        changed="$(git -C "$SCAN_ROOT" show --pretty=format: --name-only "$c" 2>/dev/null || true)"
    fi
    is_gated "$changed" || { NONGATED=$((NONGATED + 1)); continue; }
    GATED=$((GATED + 1))

    how=""; why=""
    # 1. the commit itself (or an ancestor whose only difference is the
    #    attestation file — committing an attestation moves the sha).
    if found="$(find_attestation "$SCAN_ROOT" "$c" "$AUDIT_DEPTH")"; then
        asha="${found%%$'\t'*}"; extra="${found#*$'\t'}"
        [ -z "$extra" ] && how="directly ($asha)"
    fi
    # 2. merge commit: the attestation belongs to the head that was merged, which
    #    is the sha a PR gate would have tested.
    if [ -z "$how" ] && p2="$(git -C "$SCAN_ROOT" rev-parse --verify --quiet "$c^2")"; then
        if found="$(find_attestation "$SCAN_ROOT" "$p2" "$AUDIT_DEPTH")"; then
            asha="${found%%$'\t'*}"; extra="${found#*$'\t'}"
            [ -z "$extra" ] && how="via merged head $p2 ($asha)"
        fi
    fi
    # 3. squash merges have no second parent, so an explicit trailer names the sha.
    #    The trailer is a POINTER to evidence: no file, no coverage.
    if [ -z "$how" ]; then
        tsha="$(git -C "$SCAN_ROOT" log -1 --format=%B "$c" | grep -oE '^Gate-Attestation:[[:space:]]*[0-9a-f]{40}' | head -1 | grep -oE '[0-9a-f]{40}' || true)"
        if [ -n "$tsha" ]; then
            if [ -f "$SCAN_ROOT/evidence/gate/$tsha.json" ]; then
                how="via trailer ($tsha)"
            else
                why="Gate-Attestation trailer names $tsha but evidence/gate/$tsha.json does not exist"
            fi
        fi
    fi

    if [ -n "$how" ]; then
        LINES="$LINES  $short $cdate $author — attested $how"$'\n'
    else
        UNCOVERED=$((UNCOVERED + 1))
        [ -z "$why" ] && why="no evidence/gate/<sha>.json for it, its merged head, or a trailer"
        BAD_LINES="$BAD_LINES  $short $cdate $author — $subject — $why"$'\n'
    fi
done <<<"$(git -C "$SCAN_ROOT" rev-list --first-parent -n "$AUDIT_DEPTH" "$AUDIT_REF" 2>/dev/null)"

SUMMARY="$GATED gated commit(s) on $AUDIT_REF in the last $AUDIT_DEPTH first-parent commit(s) (cutoff $CUTOFF: $EXEMPT skipped as before cutoff, $NONGATED touched no gated path)"
if [ "$UNCOVERED" -gt 0 ]; then
    fail "$(printf '%s' "$BAD_LINES")
$UNCOVERED of $SUMMARY have NO full-gate attestation. This probe cannot and does not block a merge — it makes an unattested merge impossible to hide."
fi
pass "$(printf '%s' "$LINES")
$SUMMARY — all attested"
