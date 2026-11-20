#!/usr/bin/env bash
# Exports <commit>'s web app, packages and backend/shared to <dir> with the worktree's node_modules linked in.
# usage: export-tree.sh <commit> <dir>
set -euo pipefail
wt=/home/ubuntu/work/wt-dispatcher
sha=$(git -C "$wt" rev-parse --short=9 "$1"); dir="$2"
rm -rf "$dir"; mkdir -m 700 -p "$dir"
git -C "$wt" archive "$sha" apps/web-app packages apps/backend/shared | tar -x -C "$dir"
ln -s "$wt/apps/web-app/node_modules" "$dir/apps/web-app/node_modules"
ln -s "$wt/node_modules" "$dir/node_modules"
echo "$sha" > "$dir/.export-sha"
echo "exported $sha to $dir"
