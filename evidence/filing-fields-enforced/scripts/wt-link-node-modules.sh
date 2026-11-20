#!/usr/bin/env bash
# Per-entry node_modules links for a worktree: every package points at the main checkout,
# except @gacp/*, which points into the worktree's own packages/ (branch edits stay visible).
set -euo pipefail
WT=${1:?worktree path}
MAIN=/home/ubuntu/work/GACP-Certification-Application
ln -sfn "$MAIN/node_modules" "$WT/node_modules"
for app in apps/backend apps/web-app; do
  dir="$WT/$app/node_modules"; rm -rf "$dir"; mkdir -p "$dir"
  for entry in "$MAIN/$app/node_modules"/* "$MAIN/$app/node_modules"/.[!.]*; do
    name=$(basename "$entry"); [ "$name" = "@gacp" ] && continue
    ln -s "$entry" "$dir/$name"
  done
  mkdir -p "$dir/@gacp"
  for pkg in validation error-reporting; do ln -s "../../../../packages/$pkg" "$dir/@gacp/$pkg"; done
done
echo "linked: $WT"
