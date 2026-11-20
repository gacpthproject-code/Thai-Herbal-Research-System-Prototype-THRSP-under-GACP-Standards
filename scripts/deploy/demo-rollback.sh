#!/usr/bin/env bash
# demo-rollback.sh <sha> — ย้อน: ขึ้น previous-tag ของรอบ <sha> ด้วย --no-deps แล้วตรวจ healthy และ revision เดิม · ไม่แตะฐานข้อมูล
# runbook: docs/operations/runbooks/deploy-demo.md · ทำงานบนเครื่องผ่าน ssh gacp-demo (scripts/deploy/demo-remote.sh ขั้น rollback)
source "$(dirname "${BASH_SOURCE[0]}")/lib/demo.sh"
one_sha "$@"
on_box rollback "$1"
