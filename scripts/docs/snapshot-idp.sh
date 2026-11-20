#!/usr/bin/env bash
# Record which identity providers the public door reports on staging and demo, for
# check-architecture.js (K8). Public GET only: no login, no env, no credential.
#   scripts/docs/snapshot-idp.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
out=evidence/architecture/idp
mkdir -p "$out"

for env in staging demo; do
  url="https://${env}.gacpth.com/api/auth/idp/providers"
  body=$(curl -fsS -m 30 "$url")
  {
    echo "# ${env}: GET ${url} (key state enabled) · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    node -e 'for (const p of JSON.parse(process.argv[1]).data.providers) console.log(p.key, p.state, p.enabled)' "$body" | sort
  } > "$out/${env}.txt"
  echo "wrote $out/${env}.txt ($(grep -vc '^#' "$out/${env}.txt") providers)"
done
