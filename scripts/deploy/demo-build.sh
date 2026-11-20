#!/usr/bin/env bash
# demo-build.sh <sha> — ขั้น 3: build backend และ frontend (NEXT_PUBLIC_API_URL ของ demo) เป็น tag local-<sha12> ตรวจ GIT_SHA แล้วรัน image-smoke
# runbook: docs/operations/runbooks/deploy-demo.md · ทำงานบนเครื่องผ่าน ssh gacp-demo (scripts/deploy/demo-remote.sh ขั้น build)
source "$(dirname "${BASH_SOURCE[0]}")/lib/demo.sh"
one_sha "$@"
on_box build "$1"
