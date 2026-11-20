#!/usr/bin/env bash
# demo-up.sh <sha> — ขั้น 6: บันทึก previous-tag แล้ว up -d --no-deps backend-demo frontend-demo รอ healthy และ revision ตรงภายใน 3 นาที
# runbook: docs/operations/runbooks/deploy-demo.md · ทำงานบนเครื่องผ่าน ssh gacp-demo (scripts/deploy/demo-remote.sh ขั้น up)
source "$(dirname "${BASH_SOURCE[0]}")/lib/demo.sh"
one_sha "$@"
on_box up "$1"
