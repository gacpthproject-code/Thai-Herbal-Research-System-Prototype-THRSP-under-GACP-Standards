#!/usr/bin/env bash
# no-agent-ssh-material — an agent's own uid must not hold a usable path to a
# real server: no usable key material, AND no standing permission grant.
#
# ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
# HARNESS_LOG.md:99 recorded, as reason (ก) for refusing to execute #762, that
# the agent had "no SSH/exec path and is forbidden to hold an SSH key". Both
# halves failed on inspection 2026-08-06:
#   (1) /usr/bin/ssh + /usr/bin/scp on PATH; ~/.ssh held an UNENCRYPTED private
#       key named gacp_deploy dated 2026-07-22 — predating the entry — owned by
#       the very uid the agent's Bash runs as; known_hosts already trusted the
#       production host key.
#   (2) worse: .claude/settings.local.json held 267 allow rules with NO deny and
#       NO ask, of which 43 were Bash(ssh ... root@<prod-ip> ...), including
#       `Bash(ssh -o ConnectTimeout=10 root@<prod-ip> ' *)` — a prefix wildcard
#       that pre-approves root shell on production with ANY command, silently.
# The refusal was still correct, but it rested on the agent's own compliance.
# A sentence in a log is not a guardrail. This probe makes it checkable.
#
# Same failure family as: backup cron never installed, RLS policies returning
# TRUE, e2e-golden asserting [200,400,404]. Present-but-inert.
#
# ── SCOPE HONESTY — READ BEFORE TRUSTING A GREEN RESULT ───────────────────────
# The value of this probe is on the OPERATOR / AGENT WORKSTATION. In CI there is
# normally no ~/.ssh and no settings.local.json at all, so a green CI run proves
# almost nothing. DO NOT cite a CI pass as evidence a workstation is clean.
#
# KNOWN BLIND SPOTS (stated so this probe does not become the next phantom):
#   - only ~/.ssh, ~/.claude, the repo .claude/ and the working tree are scanned;
#     a key or settings file parked elsewhere is NOT detected
#   - cloud/CLI credentials that also grant server access (gh token, doctl, aws,
#     kubeconfig) are OUT OF SCOPE — separate probe if wanted
#   - a passphrase-protected key is accepted, but a passphrase stored in a
#     nearby file is not detectable here
#   - it cannot see a grant made interactively during a session
#
# Exit: 0 PASS · 1 FAIL (usable path reachable) · 2 BLOCKED (cannot tell)
# Never prints key CONTENTS, host addresses, or key material — filenames and
# rule SHAPES only.
source "$(dirname "$0")/_lib.sh"

ALLOWLIST="$(dirname "$0")/no-agent-ssh-material-allowlist.txt"
SSH_DIR="${HOME:-}/.ssh"
FINDINGS=""
NOTES=""

add_finding() { FINDINGS="${FINDINGS}  - $*"$'\n'; }
add_note()    { NOTES="${NOTES}  · $*"$'\n'; }

# ── 1. ssh-agent — a loaded identity is usable with no key file on disk ──────
if [ -n "${SSH_AUTH_SOCK:-}" ]; then
    command -v ssh-add >/dev/null 2>&1 \
        || blocked "operator:probe-deps — SSH_AUTH_SOCK is set but ssh-add is absent; cannot tell whether identities are loaded. Refusing to PASS a check that did not run."
    if ssh-add -l >/dev/null 2>&1; then
        N=$(ssh-add -l 2>/dev/null | grep -c . || true)
        add_finding "ssh-agent holds $N loaded identity(ies) — usable with no key file present"
    else
        add_note "ssh-agent reachable but holds no identities"
    fi
fi

# ── 2. private key files under ~/.ssh ────────────────────────────────────────
if [ -n "${HOME:-}" ] && [ -d "$SSH_DIR" ]; then
    command -v ssh-keygen >/dev/null 2>&1 \
        || blocked "operator:probe-deps — $SSH_DIR exists but ssh-keygen is absent, so passphrase protection cannot be tested. Refusing to PASS."
    while IFS= read -r f; do
        [ -n "$f" ] && [ -f "$f" ] || continue
        case "$(basename "$f")" in
            *.pub|known_hosts|known_hosts.old|config|authorized_keys|environment|*.log) continue ;;
        esac
        # Header match only — the file is never read to stdout.
        grep -qE '^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----' "$f" 2>/dev/null || continue
        # ssh-keygen -y with an EMPTY passphrase succeeds only on an unencrypted
        # key. Output discarded — no reason to print anything from a key file.
        if ssh-keygen -y -P '' -f "$f" >/dev/null 2>&1; then
            add_finding "UNENCRYPTED private key readable by this uid: $f"
        else
            add_note "passphrase-protected private key present (acceptable): $f"
        fi
    done <<EOF
$(find "$SSH_DIR" -maxdepth 1 -type f 2>/dev/null)
EOF
else
    add_note "no ~/.ssh directory for this uid"
fi

# ── 3. private key material inside the repo working tree ─────────────────────
# Allowlist = one path substring per line, '#' comments ignored — for fixtures
# and docs that legitimately contain a PEM header as sample text.
REPO_HITS=$(grep -rlE '^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----' "$ROOT" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next \
    --exclude-dir=build --exclude-dir=dist --exclude-dir=coverage 2>/dev/null || true)
if [ -n "$REPO_HITS" ] && [ -f "$ALLOWLIST" ]; then
    PAT=$(grep -vE '^\s*(#|$)' "$ALLOWLIST" 2>/dev/null || true)
    [ -n "$PAT" ] && REPO_HITS=$(printf '%s\n' "$REPO_HITS" | grep -vFf <(printf '%s\n' "$PAT") || true)
fi
if [ -n "$REPO_HITS" ]; then
    while IFS= read -r h; do
        [ -n "$h" ] && add_finding "private key material in the working tree: $h"
    done <<EOF
$REPO_HITS
EOF
fi

# ── 4. standing permission grants — the half that actually bit on 2026-08-06 ──
# A key is only half a path. A pre-approved Bash(ssh user@host ...) rule is the
# other half: it removes the human prompt that would otherwise be the last stop.
command -v python3 >/dev/null 2>&1 \
    || blocked "operator:probe-deps — python3 absent, cannot parse .claude/settings*.json for standing remote-exec grants. Refusing to PASS (check-done.sh already requires python3)."

for SF in "$ROOT/.claude/settings.local.json" "$ROOT/.claude/settings.json" "${HOME:-}/.claude/settings.json"; do
    [ -f "$SF" ] || continue
    OUT=$(python3 - "$SF" <<'PY' 2>/dev/null
import json, re, sys
try:
    d = json.load(open(sys.argv[1], encoding='utf-8'))
except Exception as e:
    print("PARSE_ERROR %s" % e); raise SystemExit(0)
p = d.get('permissions', d)
if not isinstance(p, dict): raise SystemExit(0)
allow = p.get('allow') or []
REMOTE = re.compile(r'^Bash\((ssh|scp|rsync|sftp|plink|pscp)\b')
# a grant is remote-exec if it targets user@host or an explicit -p/-i to a host
hits = [r for r in allow if REMOTE.match(r) and '@' in r]
wild = [r for r in hits if r.rstrip().endswith('*)')]
if hits:
    shortest = min((len(r) for r in wild), default=0)
    print("REMOTE_GRANTS %d %d %d" % (len(hits), len(wild), shortest))
if 'deny' not in p:  print("NO_DENY")
if 'ask'  not in p:  print("NO_ASK")
PY
)
    REL="${SF#$ROOT/}"
    case "$OUT" in
        *PARSE_ERROR*) add_finding "cannot parse $REL — a grant file that cannot be read cannot be audited" ;;
    esac
    G=$(printf '%s\n' "$OUT" | grep '^REMOTE_GRANTS' || true)
    if [ -n "$G" ]; then
        set -- $G
        add_finding "$REL grants $2 standing remote-exec rule(s) (ssh/scp/rsync to a user@host), $3 of them prefix-wildcards — these remove the human prompt, so no key check alone is sufficient"
    fi
    if printf '%s\n' "$OUT" | grep -q '^NO_DENY' && [ -n "$G" ]; then
        add_finding "$REL has remote-exec grants and NO 'deny' block — nothing revokes them"
    fi
done

# ── verdict ──────────────────────────────────────────────────────────────────
[ -n "$NOTES" ] && printf 'notes:\n%s' "$NOTES"
if [ -n "$FINDINGS" ]; then
    fail "a usable agent→server path exists — the 'agent has no server access' claim is not mechanically true:
$FINDINGS  Fix: move/passphrase the key AND remove the standing grants (add an explicit deny). Do not silence this probe."
fi
pass "no unencrypted private key under ${SSH_DIR}, no loaded ssh-agent identity, no key material in the working tree, no standing remote-exec grant in .claude/settings*.json (workstation-scoped — see SCOPE HONESTY in this file)"
