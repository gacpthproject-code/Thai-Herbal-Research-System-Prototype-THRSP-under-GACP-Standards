#!/usr/bin/env bash
# คำสั่ง 94 ข้อ 5: รายงานอ่านอย่างเดียวจากบันทึกการตรวจสอบ ว่าการเข้าระบบครั้งแรกที่ได้ session ของเจ้าหน้าที่แต่ละคนเกิดหลังการลงทะเบียน 2FA
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/staff-2fa-host.sh"
s2fa_bind staff-first-signin-report.sh "${1:-}" first-signin-report
[ $# -eq 1 ] || s2fa_refuse "usage: staff-first-signin-report.sh <staging|demo>" "bad usage"
s2fa_container_check
s2fa_node_script staff-first-signin-report.js
