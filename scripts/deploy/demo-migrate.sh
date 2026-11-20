#!/usr/bin/env bash
# demo-migrate.sh <sha> — ขั้น 5: ตรวจ project ref ของ DIRECT_URL แล้ว prisma migrate status และ deploy ด้วย image ใหม่
# runbook: docs/operations/runbooks/deploy-demo.md · ทำงานบนเครื่องผ่าน ssh gacp-demo (scripts/deploy/demo-remote.sh ขั้น migrate)
source "$(dirname "${BASH_SOURCE[0]}")/lib/demo.sh"
one_sha "$@"
on_box migrate "$1"
