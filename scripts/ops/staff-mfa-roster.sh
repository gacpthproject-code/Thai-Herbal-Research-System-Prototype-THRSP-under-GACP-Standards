#!/usr/bin/env bash
# ทะเบียน 2FA ของเจ้าหน้าที่ (อ่านอย่างเดียว · คำสั่ง 105 ข้อ 4)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/staff-2fa-host.sh"
s2fa_bind staff-mfa-roster.sh "${1:-}" roster
[ $# -eq 1 ] || s2fa_refuse "usage: staff-mfa-roster.sh <staging|demo>" "bad usage"
s2fa_container_check
s2fa_node_script staff-mfa-roster.js
