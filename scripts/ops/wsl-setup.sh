#!/usr/bin/env bash
# wsl-setup — Ubuntu WSL on the operator's PC as the dev and gate machine.
#
#   sudo bash scripts/ops/wsl-setup.sh           install Postgres 15 for the gate (idempotent)
#   bash scripts/ops/wsl-setup.sh --check        read-only report
#   bash scripts/ops/wsl-setup.sh --gate-env     print the env lines the gate needs (no secrets)
#
# Node 24, pnpm 8.15.0 and gitleaks 8.30.1 stay per-user in ~/.local. Running pnpm as root would
# leave root-owned node_modules. The gate's Postgres must run in UTC: a Bangkok cluster fails tests
# that depend on the session time zone. PAYMENT_ADAPTER must stay unset: mock fails the money tests.
set -uo pipefail
PG_PORT=5433
GATE_URL="postgresql://root@127.0.0.1:$PG_PORT/postgres"
CONF=/etc/postgresql/15/main

install_pg() {
  set -e
  [ "$(id -u)" = 0 ] || { echo 'run as root'; exit 2; }
  if [ ! -x /usr/lib/postgresql/15/bin/postgres ]; then
    curl -fsSL -o /usr/share/keyrings/pgdg.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
    echo "deb [signed-by=/usr/share/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo "$VERSION_CODENAME")-pgdg main" > /etc/apt/sources.list.d/pgdg.list
    apt-get update -q >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-15 >/dev/null
  fi
  pg_ctlcluster 15 main stop 2>/dev/null || true
  sed -i -E "s/^port = [0-9]+/port = $PG_PORT/; s/^timezone = .*/timezone = 'Etc\/UTC'/" "$CONF/postgresql.conf"
  pg_ctlcluster 15 main start
  sleep 2
  su postgres -c "psql -p $PG_PORT -Atc \"select 1 from pg_roles where rolname='root'\"" | grep -q 1 \
    || su postgres -c "createuser -p $PG_PORT -s root"
  grep -q gacp-gate "$CONF/pg_hba.conf" || { sed -i '1i host all root 127.0.0.1/32 trust  # gacp-gate: loopback scratch DBs, no password' "$CONF/pg_hba.conf"; pg_ctlcluster 15 main reload; }
  set +e
  check
}

check() {
  local miss=0
  ok() { echo "  [ok]   $*"; }
  no() { echo "  [MISS] $*"; miss=$((miss + 1)); }
  [ "$(psql "$GATE_URL" -Atc 'show timezone' 2>/dev/null)" = 'Etc/UTC' ] && ok "gate Postgres :$PG_PORT in UTC" || no "gate Postgres :$PG_PORT in UTC"
  node -v 2>/dev/null | grep -q '^v24\.' && ok 'node 24' || no 'node 24'
  [ "$(pnpm -v 2>/dev/null)" = 8.15.0 ] && ok 'pnpm 8.15.0' || no 'pnpm 8.15.0'
  [ "$(gitleaks version 2>/dev/null)" = 8.30.1 ] && ok 'gitleaks 8.30.1' || no 'gitleaks 8.30.1'
  [ -z "${PAYMENT_ADAPTER:-}" ] && ok 'PAYMENT_ADAPTER unset' || no 'PAYMENT_ADAPTER must be unset'
  echo "== $miss missing"
  return $((miss > 0))
}

case "${1:-}" in
  --check) check ;;
  --gate-env)
    echo "export GATE_PG_ADMIN_URL='$GATE_URL' NODE_OPTIONS=--max-old-space-size=4096"
    echo 'unset PAYMENT_ADAPTER'
    ;;
  '') install_pg ;;
  *) sed -n 2,6p "${BASH_SOURCE[0]}"; exit 2 ;;
esac
