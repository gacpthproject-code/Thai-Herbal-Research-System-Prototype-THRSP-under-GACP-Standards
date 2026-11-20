#!/usr/bin/env bash
# Is the preview CAR-button test red on base c84940ec3 too? Run it in the detached base worktree.
set -uo pipefail
cd /home/ubuntu/work/wt-ff-base/apps/web-app || exit 2
export NODE_OPTIONS=--max-old-space-size=3072
echo "[run-base-web] base=$(git rev-parse HEAD) $(date +%T)" > /tmp/ff/r2/base-web-preview.log
node node_modules/jest/bin/jest.js src/app/health/applications/preview/__tests__/resubmit-button-renders.test.tsx >> /tmp/ff/r2/base-web-preview.log 2>&1
echo "[run-base-web] exit=$? $(date +%T)" >> /tmp/ff/r2/base-web-preview.log
