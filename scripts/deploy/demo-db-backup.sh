#!/usr/bin/env bash
# demo-db-backup.sh <sha> — ขั้น 4: dump ฐาน Supabase ของ demo ด้วย gacp-demo-pg-backup.sh แล้วตรวจ gunzip -t และขนาดไม่เล็กกว่า dump ก่อนหน้า
# runbook: docs/operations/runbooks/deploy-demo.md · ทำงานบนเครื่องผ่าน ssh gacp-demo (scripts/deploy/demo-remote.sh ขั้น backup)
source "$(dirname "${BASH_SOURCE[0]}")/lib/demo.sh"
one_sha "$@"
on_box backup "$1"
