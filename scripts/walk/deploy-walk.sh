#!/usr/bin/env bash
#   scripts/walk/deploy-walk.sh <base-url> [--target staging|demo] [--rows a,b] [--out dir] [--list]
# Exit: 0 no FAIL · 1 a row FAILED · 2 refused (unknown or demo target without --target demo,
# live Stripe key, missing or loose config).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
heavy="${GACP_HEAVY_SH:-$here/../ops/heavy.sh}"
if [ -z "${GACP_HEAVY_HELD:-}" ] && [ -x "$heavy" ]; then
  exec "$heavy" timeout 3h node "$here/deploy-walk.js" "$@"
fi
exec node "$here/deploy-walk.js" "$@"
