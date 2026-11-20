#!/usr/bin/env bash
# usage: run-web-at.sh <worktree> <log> <jest args...>
set -uo pipefail
WT=$1; LOG=$2; shift 2
cd "$WT/apps/web-app" || exit 2
export NODE_OPTIONS=--max-old-space-size=3072
echo "[run-web] $(date +%T) sha=$(git rev-parse HEAD) dirty=$(git status --porcelain | wc -l) jest $*" > "$LOG"
node node_modules/jest/bin/jest.js "$@" >> "$LOG" 2>&1
echo "[run-web] exit=$? $(date +%T)" >> "$LOG"
