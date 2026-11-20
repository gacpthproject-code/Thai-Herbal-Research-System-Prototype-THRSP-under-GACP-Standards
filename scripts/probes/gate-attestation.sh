#!/usr/bin/env bash
# gate-attestation — turn "we ran the full gate" into a fact a machine can check.
#
# WHAT IT PROVES: the commit under test has an attestation written by
# scripts/ci/full-gate.sh (evidence/gate/<sha>.json), that the attestation is
# BOUND TO THAT SHA, recent, produced from a clean tree, not a dry run, and that
# every check marked `required` in scripts/ci/full-gate-checks.txt came back PASS.
#
# WHAT IT CANNOT DO: it does not PREVENT anything. Branch protection is not
# available on the current GitHub plan, so nobody can be stopped from merging a
# commit with no attestation. This probe makes that state DETECTABLE and
# un-hideable — the merge still happens, the lie does not.
#
# THE ONE ALLOWANCE (selftest L, and its mutation M): committing the attestation
# moves HEAD, so an attestation for an ancestor counts when the ONLY change since
# is under evidence/gate/. One byte of source changed after it and the attestation
# is void.
#
# TRUST MODEL, stated plainly: an attestation is a JSON file in the repo. Anyone
# with write access can hand-write one. This probe is a check against forgetting
# and against stale claims, not against a determined forger — the defence there is
# that the file records hostname/timestamp/versions and lands in a reviewed commit.
#
# Contract: exit 0 PASS · 1 FAIL · 2 BLOCKED (cannot determine ⇒ never a vacuous pass).
#
# Usage:  bash scripts/probes/gate-attestation.sh
#         bash scripts/probes/gate-attestation.sh --selftest
#         GATE_ATTESTATION_MAX_AGE_DAYS=14 bash scripts/probes/gate-attestation.sh
#         GATE_BASE_REF=origin/develop  bash scripts/probes/gate-attestation.sh
#         GATE_ATTESTATION_ROOT=<dir>   — inspect a synthetic repo (selftest only;
#           same convention as HOLIDAY_BACKEND_ROOT / STATUS_VOCAB_ROOT)
source "$(dirname "$0")/_lib.sh"

CHECKS_FILE="${GATE_CHECKS_FILE:-$(cd "$(dirname "$0")/../ci" && pwd)/full-gate-checks.txt}"
SCAN_ROOT="${GATE_ATTESTATION_ROOT:-$ROOT}"
MAX_AGE_DAYS="${GATE_ATTESTATION_MAX_AGE_DAYS:-7}"
BASE_REF="${GATE_BASE_REF:-origin/main}"

# ── selftest ──────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0

    REQUIRED_IDS="$(awk -F'|' '/^[[:space:]]*#/ {next} {gsub(/[[:space:]]/,"",$1); gsub(/[[:space:]]/,"",$2); gsub(/[[:space:]]/,"",$3)} $1=="check" && $3=="required" { print $2 }' "$CHECKS_FILE")"

    # Build a repo whose HEAD changes $2 (a path) on top of a base commit.
    mkrepo() { # $1 dir  $2 path-changed-by-HEAD
        mkdir -p "$1"
        git -C "$1" init -q -b main
        git -C "$1" config user.email gate@selftest.local
        git -C "$1" config user.name gate-selftest
        mkdir -p "$1/apps"; printf 'base\n' >"$1/apps/app.js"
        git -C "$1" add -A; git -C "$1" commit -q -m base
        BASE_SHA="$(git -C "$1" rev-parse HEAD)"
        mkdir -p "$(dirname "$1/$2")"; printf 'change\n' >"$1/$2"
        git -C "$1" add -A; git -C "$1" commit -q -m change
        HEAD_SHA="$(git -C "$1" rev-parse HEAD)"
    }

    # Write an attestation. Overrides come from env so each case edits one thing.
    write_att() { # $1 repo  $2 filename-sha
        mkdir -p "$1/evidence/gate"
        A_REQUIRED="$REQUIRED_IDS" A_FILE="$1/evidence/gate/$2.json" \
        A_SHA="${A_SHA:-$2}" A_TS="${A_TS:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" \
        A_DIRTY="${A_DIRTY:-false}" A_DROP="${A_DROP:-}" A_STATUS="${A_STATUS:-}" \
        A_ALLOW="${A_ALLOW:-}" A_DRY="${A_DRY:-false}" \
        python3 - <<'PY'
import json, os
required = os.environ['A_REQUIRED'].split()
drop = os.environ['A_DROP']
forced = dict(p.split('=', 1) for p in os.environ['A_STATUS'].split(',') if p)
checks = [{'id': i, 'required': True, 'status': forced.get(i, 'pass'), 'reason': '',
           'log': 'evidence/gate/logs/x/%s.log' % i}
          for i in required if i != drop]
doc = {
    'schema': 'gacp-full-gate/1',
    'sha': os.environ['A_SHA'],
    'timestamp_utc': os.environ['A_TS'],
    'hostname': 'selftest-host',
    'dirty': os.environ['A_DIRTY'] == 'true',
    'dry_run': os.environ['A_DRY'] == 'true',
    'versions': {'node': 'v22', 'pnpm': '9', 'postgres': '16'},
    'checks': checks,
    'not_run': [],
    'allow_blocked': json.loads(os.environ['A_ALLOW']) if os.environ['A_ALLOW'] else None,
    'verdict': 'pass',
}
open(os.environ['A_FILE'], 'w').write(json.dumps(doc, indent=2))
PY
    }

    check() { # $1 label  $2 repo  $3 base-ref  $4 expected-exit  [needles...]
        local out code label="$1" repo="$2" base="$3" want="$4"; shift 4
        CASES=$((CASES + 1))
        out="$(GATE_ATTESTATION_ROOT="$repo" GATE_BASE_REF="$base" bash "$0" 2>&1)"; code=$?
        echo "--- selftest $label → exit $code (expected $want)"; printf '%s\n' "$out"
        [ "$code" = "$want" ] || { echo "*** $label FAILED: exit $code != $want"; BAD=$((BAD + 1)); }
        local needle
        for needle in "$@"; do
            printf '%s' "$out" | grep -qi -- "$needle" \
                || { echo "*** $label FAILED: output does not mention '$needle'"; BAD=$((BAD + 1)); }
        done
        echo
    }

    # A — attestation for exactly this SHA, fresh, clean, all required checks pass.
    #     Baseline: without it, a probe that always fails would satisfy every case below.
    mkrepo "$TMP/A" apps/app.js;   write_att "$TMP/A" "$HEAD_SHA"
    check A "$TMP/A" "$BASE_SHA" 0 "$HEAD_SHA"

    # B — no attestation at all. "We ran the gate" with no artifact is the claim
    #     this probe exists to refuse.
    mkrepo "$TMP/B" apps/app.js
    check B "$TMP/B" "$BASE_SHA" 1 'no attestation'

    # C — file is NAMED for HEAD but its sha field is another commit: the exact
    #     shape of "copy an old result under a new name".
    mkrepo "$TMP/C" apps/app.js;   A_SHA="$BASE_SHA" write_att "$TMP/C" "$HEAD_SHA"
    check C "$TMP/C" "$BASE_SHA" 1 'sha'

    # D — stale: a gate run from a month ago is not evidence about today's machine.
    mkrepo "$TMP/D" apps/app.js;   A_TS="$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)" write_att "$TMP/D" "$HEAD_SHA"
    check D "$TMP/D" "$BASE_SHA" 1 'stale'

    # E — dirty tree: the SHA does not describe what was actually tested.
    mkrepo "$TMP/E" apps/app.js;   A_DIRTY=true write_att "$TMP/E" "$HEAD_SHA"
    check E "$TMP/E" "$BASE_SHA" 1 'dirty'

    # F — a required check is simply absent from the attestation. Silence about a
    #     mandatory check must never read as PASS.
    mkrepo "$TMP/F" apps/app.js;   A_DROP=suite-green write_att "$TMP/F" "$HEAD_SHA"
    check F "$TMP/F" "$BASE_SHA" 1 'suite-green'

    # G — a required check recorded as fail.
    mkrepo "$TMP/G" apps/app.js;   A_STATUS='integration-pg=fail' write_att "$TMP/G" "$HEAD_SHA"
    check G "$TMP/G" "$BASE_SHA" 1 'integration-pg'

    # H — required check NOT-RUN with nobody accepting it ⇒ fail-closed.
    mkrepo "$TMP/H" apps/app.js;   A_STATUS='secret-scan-deep=not-run' write_att "$TMP/H" "$HEAD_SHA"
    check H "$TMP/H" "$BASE_SHA" 1 'secret-scan-deep'

    # H2 — same, but the operator typed an acceptance naming that check. Passes,
    #      and the acceptance must be shouted, not hidden.
    mkrepo "$TMP/H2" apps/app.js
    A_STATUS='secret-scan-deep=not-run' \
    A_ALLOW='{"accepted_by":"jonmaxmore","at":"2026-08-08T00:00:00Z","checks":["secret-scan-deep"],"note":"gitleaks not installed yet"}' \
        write_att "$TMP/H2" "$HEAD_SHA"
    #      The PASS line must NOT claim all required checks passed: 8 did, one was
    #      accepted. A summary that rounds an acceptance up to a pass is the same
    #      over-claim this whole mechanism exists to stop.
    check H2 "$TMP/H2" "$BASE_SHA" 0 'jonmaxmore' 'ACCEPTED-NOT-RUN' '8/9 required check(s) PASS'

    # I — unparseable JSON ⇒ fail, never "assume it was fine".
    mkrepo "$TMP/I" apps/app.js;   mkdir -p "$TMP/I/evidence/gate"; printf '{not json' >"$TMP/I/evidence/gate/$HEAD_SHA.json"
    check I "$TMP/I" "$BASE_SHA" 1 'parse'

    # J — dry_run attestations are produced by full-gate.sh --selftest and prove
    #     nothing about the code. Accepting one would be a forgery path.
    mkrepo "$TMP/J" apps/app.js;   A_DRY=true write_att "$TMP/J" "$HEAD_SHA"
    check J "$TMP/J" "$BASE_SHA" 1 'dry'

    # K — HEAD changes no gated path (docs only) ⇒ no attestation required.
    mkrepo "$TMP/K" docs/note.md
    check K "$TMP/K" "$BASE_SHA" 0 'no gated path'

    # L — THE WORKFLOW CASE: the attestation is for the parent, and the only thing
    #     that changed since is the attestation file itself (committing it moves
    #     HEAD). Without this, the mechanism can never be satisfied.
    mkrepo "$TMP/L" apps/app.js;   write_att "$TMP/L" "$HEAD_SHA"
    git -C "$TMP/L" add -A; git -C "$TMP/L" commit -q -m 'chore: attestation'
    check L "$TMP/L" "$BASE_SHA" 0 "$HEAD_SHA"

    # M — MUTATION of L: apps/ changed after the attested commit ⇒ the old
    #     attestation must stop counting. This is what stops L becoming a hole.
    mkrepo "$TMP/M" apps/app.js;   write_att "$TMP/M" "$HEAD_SHA"
    git -C "$TMP/M" add -A; git -C "$TMP/M" commit -q -m 'chore: attestation'
    printf 'more\n' >>"$TMP/M/apps/app.js"
    git -C "$TMP/M" add -A; git -C "$TMP/M" commit -q -m 'feat: more code'
    check M "$TMP/M" "$BASE_SHA" 1 'apps/app.js'

    # O — a timestamp in the FUTURE defeats the staleness rule (case D) in one
    #     line, so it is rejected too: an attestation cannot be evidence about a
    #     run that has not happened.
    mkrepo "$TMP/O" apps/app.js;   A_TS="$(date -u -d '3 days' +%Y-%m-%dT%H:%M:%SZ)" write_att "$TMP/O" "$HEAD_SHA"
    check O "$TMP/O" "$BASE_SHA" 1 'future'

    # N — base ref cannot be resolved (shallow clone): the probe cannot tell
    #     whether this commit is gated ⇒ BLOCKED (2), not a guess in either direction.
    mkrepo "$TMP/N" apps/app.js;   write_att "$TMP/N" "$HEAD_SHA"
    check N "$TMP/N" origin/does-not-exist 2 'base'

    # P — python3 missing or not runnable. The adjudication below is written in
    #     it, so without it this probe learns nothing about the document and must
    #     say so: BLOCKED (2), never a pass and never a fail. `command -v` alone
    #     would not catch it — a stub or a broken install answers the lookup and
    #     then produces nothing, and silence read as "no errors found" is the
    #     phantom-guardrail shape this repository keeps closing.
    #
    #     Simulated with a stub that exits non-zero rather than by emptying PATH:
    #     prepending works on every platform, while a PATH sandbox cannot be built
    #     on git-bash (MSYS binaries resolve msys-2.0.dll through PATH).
    CASES=$((CASES + 1))
    mkrepo "$TMP/P" apps/app.js;   write_att "$TMP/P" "$HEAD_SHA"
    PBIN="$TMP/pbin"; mkdir -p "$PBIN"
    printf '#!/usr/bin/env bash\nexit 1\n' > "$PBIN/python3"; chmod +x "$PBIN/python3"
    P_OUT="$(PATH="$PBIN:$PATH" GATE_ATTESTATION_ROOT="$TMP/P" GATE_BASE_REF="$BASE_SHA" bash "$0" 2>&1)"; P_CODE=$?
    echo "--- selftest P → exit $P_CODE (expected 2)"; printf '%s\n' "$P_OUT"
    if [ "$P_CODE" != "2" ]; then
        echo "*** P FAILED: exit $P_CODE != 2 — a probe that cannot run its own adjudicator must not return a verdict about the commit"; BAD=$((BAD + 1))
    elif ! printf '%s' "$P_OUT" | grep -qi 'python3'; then
        echo "*** P FAILED: blocked without naming python3, so the reader cannot tell a tooling fault from a real finding"; BAD=$((BAD + 1))
    fi
    echo

    echo "=================================================="
    [ "$BAD" -eq 0 ] && { echo "gate-attestation --selftest: $CASES/$CASES cases PASS"; exit 0; }
    echo "gate-attestation --selftest: $BAD assertion(s) FAILED"; exit 1
fi

# ── implementation ───────────────────────────────────────────────────────────
[ -r "$CHECKS_FILE" ] \
    || blocked "cannot read $CHECKS_FILE — the required-check list lives there (Law L4); refusing to guess it"

GATED_PATTERNS="$(awk -F'|' '/^[[:space:]]*#/ {next} {gsub(/[[:space:]]/,"",$1); gsub(/[[:space:]]/,"",$2); gsub(/[[:space:]]/,"",$3)} $1=="path" && $3=="gated" { print $2 }' "$CHECKS_FILE")"
REQUIRED_IDS="$(awk -F'|' '/^[[:space:]]*#/ {next} {gsub(/[[:space:]]/,"",$1); gsub(/[[:space:]]/,"",$2); gsub(/[[:space:]]/,"",$3)} $1=="check" && $3=="required" { print $2 }' "$CHECKS_FILE")"
[ -n "$GATED_PATTERNS" ] || blocked "no gated path row in $CHECKS_FILE — cannot tell which commits need an attestation"
[ -n "$REQUIRED_IDS" ]   || blocked "no required check row in $CHECKS_FILE — an attestation with no mandatory checks would pass vacuously"

cd "$SCAN_ROOT" 2>/dev/null || blocked "cannot cd into $SCAN_ROOT"
git -C "$SCAN_ROOT" rev-parse --git-dir >/dev/null 2>&1 || blocked "$SCAN_ROOT is not a git repository"
HEAD_SHA="$(git -C "$SCAN_ROOT" rev-parse HEAD 2>/dev/null)"
[ -n "$HEAD_SHA" ] || blocked "cannot resolve HEAD in $SCAN_ROOT"

# ── 1. is this commit gated at all? ──────────────────────────────────────────
# A base ref we cannot resolve means we cannot know what changed. Guessing in
# either direction is wrong, so this is BLOCKED (2) — the same call tier-check.sh
# makes for a missing origin/main.
git -C "$SCAN_ROOT" rev-parse --verify --quiet "$BASE_REF^{commit}" >/dev/null 2>&1 \
    || blocked "cannot resolve base ref '$BASE_REF' (shallow clone? set GATE_BASE_REF) — refusing to guess whether this commit touches gated paths"
MERGE_BASE="$(git -C "$SCAN_ROOT" merge-base "$BASE_REF" HEAD 2>/dev/null || printf '%s' "$BASE_REF")"
CHANGED="$(git -C "$SCAN_ROOT" diff --name-only "$MERGE_BASE" HEAD 2>/dev/null || true)"

matches_gated() { # $1 = newline-separated paths → echoes the matching ones
    local pat
    while IFS= read -r pat; do
        [ -z "$pat" ] && continue
        printf '%s\n' "$1" | grep -E "$pat" || true
    done <<<"$GATED_PATTERNS"
}
GATED_HITS="$(matches_gated "$CHANGED" | grep -c . || true)"
if [ "$GATED_HITS" -eq 0 ]; then
    pass "no gated path changed vs $BASE_REF ($(printf '%s' "$CHANGED" | grep -c . || true) file(s) changed, none matching: $(printf '%s' "$GATED_PATTERNS" | tr '\n' ' ')) — a full-gate attestation is not required for this commit"
fi

# ── 2. find the attestation that covers HEAD ─────────────────────────────────
# Bound to the SHA, with exactly one allowance: commits whose ONLY change since
# the attested commit is the attestation file itself — because committing the
# attestation moves HEAD, and without this the mechanism could never be satisfied.
# Anything else in that diff (case M) voids it.
ATT_SHA=""; ATT_FILE=""; EXTRA_CHANGES=""
SEARCH_DEPTH="${GATE_ATTESTATION_SEARCH_DEPTH:-50}"
while IFS= read -r c; do
    [ -z "$c" ] && continue
    f="$SCAN_ROOT/evidence/gate/$c.json"
    [ -f "$f" ] || continue
    since="$(git -C "$SCAN_ROOT" diff --name-only "$c" HEAD 2>/dev/null || true)"
    extra="$(printf '%s\n' "$since" | grep -vE '^evidence/gate/' | grep -v '^$' || true)"
    ATT_SHA="$c"; ATT_FILE="$f"; EXTRA_CHANGES="$extra"
    break
done <<<"$(git -C "$SCAN_ROOT" rev-list -n "$SEARCH_DEPTH" HEAD 2>/dev/null)"

[ -n "$ATT_SHA" ] \
    || fail "no attestation for HEAD $HEAD_SHA — evidence/gate/$HEAD_SHA.json does not exist (searched $SEARCH_DEPTH commit(s) back). Run scripts/ci/full-gate.sh on the gate machine; see docs/operations/runbooks/full-gate-on-staging.md"
[ -z "$EXTRA_CHANGES" ] \
    || fail "the newest attestation covers $ATT_SHA, but these gated/source files changed after it: $(printf '%s' "$EXTRA_CHANGES" | tr '\n' ' ')— re-run the full gate on $HEAD_SHA"

# ── 3. adjudicate the document ───────────────────────────────────────────────
# Everything above answers without python3 — whether an attestation exists, which
# SHA it covers, what changed after it — so the guard belongs HERE, immediately
# before the first use, not at the top. Blocking early would throw away findings
# this probe can still make on a machine that cannot run the adjudicator.
#
# RUN python3 rather than asking `command -v`. On the Windows checkout used on
# 2026-08-14 `command -v python3` succeeded and `python3 -c 'pass'` exited 9009:
# Windows ships an App Execution Alias that resolves as an executable and then
# refuses to run — a lookup that answers yes about a tool that does nothing.
# Sixteen selftest assertions were failing there for that reason alone, reported
# as though the probe had found problems with the repository.
#
# Without the adjudicator this probe learns NOTHING about the document, and
# nothing must be reported as BLOCKED: not a pass (silence read as no-errors-
# found) and not a fail (a tooling fault dressed as a verdict about the commit).
# Pinned by --selftest case P.
python3 -c 'pass' >/dev/null 2>&1 \
    || blocked "python3 is missing or not runnable here, and the attestation document is adjudicated with it — so nothing was learned about whether $ATT_SHA is properly gated. This is a tooling fault on this machine, not a verdict about the commit. Check it with: python3 -c 'pass'"

OUT="$(GA_FILE="$ATT_FILE" GA_SHA="$ATT_SHA" GA_REQUIRED="$REQUIRED_IDS" GA_MAX_AGE="$MAX_AGE_DAYS" python3 - <<'PY'
import json, os, sys, datetime

path, want_sha = os.environ['GA_FILE'], os.environ['GA_SHA']
required = os.environ['GA_REQUIRED'].split()
max_age = float(os.environ['GA_MAX_AGE'])
errs, notes = [], []

try:
    doc = json.loads(open(path, encoding='utf-8').read())
except Exception as e:
    print('cannot parse %s — %s' % (path, e))
    sys.exit(1)

rel = path.split('/evidence/')[-1]
got_sha = doc.get('sha', '')
if got_sha != want_sha:
    errs.append("sha mismatch: evidence/%s declares sha '%s' but is named for %s — an attestation copied under another commit's name proves nothing" % (rel, got_sha, want_sha))
if doc.get('dry_run') is True:
    errs.append('dry_run: true — this file was produced by full-gate.sh --selftest and describes no real run')
if doc.get('dirty') is True:
    errs.append('dirty: true — the gate ran against a tree with uncommitted changes, so the sha does not describe what was tested')

ts = doc.get('timestamp_utc', '')
try:
    when = datetime.datetime.strptime(ts, '%Y-%m-%dT%H:%M:%SZ')
    age = (datetime.datetime.utcnow() - when).total_seconds() / 86400.0
    if age > max_age:
        errs.append('stale: attestation is %.1f day(s) old (max %s) — timestamp %s' % (age, max_age, ts))
    elif age < -1.0:
        errs.append('timestamp is in the future (%s, %.1f day(s) ahead) — refusing to accept evidence of a run that has not happened' % (ts, -age))
except ValueError:
    errs.append("cannot parse timestamp_utc '%s' (want YYYY-MM-DDTHH:MM:SSZ)" % ts)

allow = doc.get('allow_blocked') or {}
accepted = set(allow.get('checks') or [])
who = (allow.get('accepted_by') or '').strip()

by_id = {c.get('id'): c for c in (doc.get('checks') or []) if isinstance(c, dict)}
for cid in required:
    c = by_id.get(cid)
    if c is None:
        errs.append("required check '%s' is absent from the attestation — silence about a mandatory check is not a pass" % cid)
        continue
    st = c.get('status')
    if st == 'pass':
        continue
    if st == 'fail':
        errs.append("required check '%s' = FAIL — %s" % (cid, c.get('reason') or c.get('log') or 'see log'))
    elif cid in accepted and who:
        notes.append("required check '%s' = NOT-RUN, accepted by %s (%s)" % (cid, who, allow.get('note') or 'no note'))
    else:
        errs.append("required check '%s' = %s and nobody accepted it — fail-closed (%s)" % (cid, st, c.get('reason') or 'no reason recorded'))

if errs:
    print('\n       '.join(errs))
    sys.exit(1)

summary = 'attestation %s covers HEAD (host %s, %s, %d/%d required check(s) PASS)' % (
    want_sha, doc.get('hostname', '?'), ts, len(required) - len(notes), len(required))
if notes:
    summary += '\n       !! ACCEPTED-NOT-RUN: ' + ' | '.join(notes)
print(summary)
PY
)"; CODE=$?

[ "$CODE" -eq 0 ] || fail "$OUT"
pass "$OUT"
