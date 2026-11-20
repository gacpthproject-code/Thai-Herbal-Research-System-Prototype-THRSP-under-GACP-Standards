#!/usr/bin/env bash
# Record which containers run on the staging and demo hosts, for check-architecture.js (K1).
# Reads container names, images and compose service labels only. Never env, never inspect.
#   scripts/docs/snapshot-hosts.sh            # staging = this machine, demo = ssh alias "newhost"
#   DEMO_SSH=<alias> scripts/docs/snapshot-hosts.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
out=evidence/architecture/hosts
mkdir -p "$out"
fmt='{{.Names}} {{.Image}} {{.Label "com.docker.compose.project"}} {{.Label "com.docker.compose.service"}}'
sha=$(git rev-parse --short=12 origin/main)

record() {
  local env="$1"; shift
  {
    echo "# ${env}: docker ps (name image compose-service) · project gacp-platform only · origin/main ${sha}"
    "$@" "docker ps --format '$fmt'" | awk '$3 == "gacp-platform" { print $1, $2, $4 }' | sort
  } > "$out/${env}.txt"
  echo "wrote $out/${env}.txt ($(grep -vc '^#' "$out/${env}.txt") containers)"
}

record staging bash -c
record demo ssh -o BatchMode=yes "${DEMO_SSH:-newhost}"
