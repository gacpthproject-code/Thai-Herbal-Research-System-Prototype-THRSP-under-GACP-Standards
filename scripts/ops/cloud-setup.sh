#!/usr/bin/env bash
# cloud-setup — the Claude Code cloud container as the dev + gate machine (order 164, amended 2026-11-07:
# dev and gate run in the cloud session; the operator's Windows PC only runs ssh deploys).
# Idempotent; run as root. Also the body of the cloud environment's setup script.
#
#   bash scripts/ops/cloud-setup.sh            install what is missing, then --check
#   bash scripts/ops/cloud-setup.sh --check    read-only report
#   bash scripts/ops/cloud-setup.sh --gate-env print the env lines the gate needs (no secrets)
#
# Installs: Node 24 (nodejs.org, SHA256 checked) at /opt/node24 + PATH via /etc/profile.d · pnpm 8.15.0
# (corepack) · Postgres 15 from apt.postgresql.org on :5433 with a passwordless `root` superuser trusted on
# 127.0.0.1 only (scratch DBs; the container is not reachable from outside) · gitleaks 8.30.1 (the version in every evidence/gate
# attestation, SHA256 checked) · full git history + pnpm install when run inside the repo.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PNPM=8.15.0; GITLEAKS=8.30.1; PG_PORT=5433
GATE_URL="postgresql://root@127.0.0.1:$PG_PORT/postgres"
n24() { [ -x /opt/node24/bin/node ] && /opt/node24/bin/node -v | grep -q '^v24\.'; }

install() {
  set -e
  if ! n24; then
    local v t; t=$(mktemp -d)
    v=$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c "import sys,json;print([r['version'] for r in json.load(sys.stdin) if r['version'].startswith('v24.')][0])")
    (cd "$t" && curl -fsSLO "https://nodejs.org/dist/$v/node-$v-linux-x64.tar.xz" \
      && curl -fsSL "https://nodejs.org/dist/$v/SHASUMS256.txt" | grep " node-$v-linux-x64.tar.xz\$" | sha256sum -c -)
    rm -rf /opt/node24 && mkdir -p /opt/node24 && tar -xJf "$t/node-$v-linux-x64.tar.xz" -C /opt/node24 --strip-components=1
  fi
  echo 'export PATH=/opt/node24/bin:$PATH' > /etc/profile.d/zz-gacp-node24.sh
  grep -q '/opt/node24/bin' /root/.bashrc 2>/dev/null || echo 'export PATH=/opt/node24/bin:$PATH' >> /root/.bashrc
  export PATH=/opt/node24/bin:$PATH
  corepack enable && corepack prepare "pnpm@$PNPM" --activate >/dev/null
  if [ ! -x /usr/lib/postgresql/15/bin/postgres ]; then
    curl -fsSL -o /usr/share/keyrings/pgdg.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
    echo "deb [signed-by=/usr/share/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo "$VERSION_CODENAME")-pgdg main" > /etc/apt/sources.list.d/pgdg.list
    apt-get update -q >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-15 >/dev/null
  fi
  pg_lsclusters -h | awk '$1==15' | grep -q . || pg_createcluster 15 main --port "$PG_PORT" >/dev/null
  pg_ctlcluster 15 main start 2>/dev/null || true
  su postgres -c "psql -p $PG_PORT -Atc \"select 1 from pg_roles where rolname='root'\"" | grep -q 1 \
    || su postgres -c "createuser -p $PG_PORT -s root"
  # full-gate.sh builds scratch URLs from the authority part of GATE_PG_ADMIN_URL, so it needs TCP, not a socket.
  local hba=/etc/postgresql/15/main/pg_hba.conf
  grep -q gacp-gate "$hba" || { sed -i '1i host all root 127.0.0.1/32 trust  # gacp-gate: loopback scratch DBs, no password' "$hba"; pg_ctlcluster 15 main reload; }
  if [ "$(gitleaks version 2>/dev/null)" != "$GITLEAKS" ]; then
    local g="gitleaks_${GITLEAKS}_linux_x64.tar.gz" t; t=$(mktemp -d)
    (cd "$t" && curl -fsSLO "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS/$g" \
      && curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS/gitleaks_${GITLEAKS}_checksums.txt" | grep " $g\$" | sha256sum -c - \
      && tar -xzf "$g" gitleaks && install -m755 gitleaks /usr/local/bin/gitleaks)
  fi
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    [ "$(git -C "$ROOT" rev-parse --is-shallow-repository)" = true ] && git -C "$ROOT" fetch -q --unshallow origin
    git -C "$ROOT" fetch -q origin '+refs/heads/*:refs/remotes/origin/*' || true
    (cd "$ROOT" && pnpm install --frozen-lockfile >/dev/null)
  fi
  set +e
  check
}

check() {
  local miss=0; ok() { echo "  [ok]   $*"; }; no() { echo "  [MISS] $*"; miss=$((miss+1)); }
  echo "== $(. /etc/os-release; echo "$PRETTY_NAME") · $(nproc) cores · $(awk '/MemTotal/{print int($2/1048576)}' /proc/meminfo) GB RAM · $(df -BG --output=avail "$ROOT" | tail -1 | tr -d ' ') free"
  n24 && ok "node $(/opt/node24/bin/node -v) at /opt/node24" || no "node 24"
  [ "$(PATH=/opt/node24/bin:$PATH pnpm -v 2>/dev/null)" = "$PNPM" ] && ok "pnpm $PNPM" || no "pnpm $PNPM"
  [ "$(gitleaks version 2>/dev/null)" = "$GITLEAKS" ] && ok "gitleaks $GITLEAKS" || no "gitleaks $GITLEAKS"
  psql "$GATE_URL" -Atc 'select 1' >/dev/null 2>&1 && ok "gate Postgres 15 :$PG_PORT (127.0.0.1, role root)" || no "gate Postgres"
  [ "$(git -C "$ROOT" rev-parse --is-shallow-repository 2>/dev/null)" = false ] && ok "full git history" || no "full git history"
  [ -d "$ROOT/node_modules" ] && ok "node_modules" || no "pnpm install"
  [ -d /opt/pw-browsers ] && ok "playwright chromium (/opt/pw-browsers)" || no "playwright chromium"
  command -v cu-desktop >/dev/null && ok "cu-desktop (desktop + screen recording)" || no "cu-desktop"
  echo "== $miss missing"; return $(( miss > 0 ))
}

case "${1:-}" in
  --check) check ;;
  --gate-env) cat <<EOF
export PATH=/opt/node24/bin:\$PATH GATE_PG_ADMIN_URL='$GATE_URL'
export NODE_OPTIONS=--max-old-space-size=4096
# gate:    scripts/ops/heavy.sh timeout 7200 bash scripts/ci/full-gate.sh <sha>   (from a clean checkout)
# compare: node scripts/ops/gate-compare.js --base <main-gated-sha> --head <sha>
EOF
  ;;
  "") install ;;
  *) sed -n 2,14p "${BASH_SOURCE[0]}"; exit 2 ;;
esac
