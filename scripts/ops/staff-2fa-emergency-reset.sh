#!/usr/bin/env bash
# ทางฉุกเฉินของคำสั่ง 89 ข: ล้าง 2FA ของบัญชีเจ้าหน้าที่หนึ่งบัญชีในคอนเทนเนอร์ backend หลัง operator อนุมัติครั้งนั้น
# ไม่มีกฎ allow สำหรับสคริปต์นี้ (คำสั่ง 105 ข้อ 4)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/staff-2fa-host.sh"
s2fa_bind staff-2fa-emergency-reset.sh "${1:-}" mfa-clear
usage='usage: staff-2fa-emergency-reset.sh <staging|demo> --target <account id> --requester <same-side admin account id> --confirmation <written confirmation ref> --approval <operator approval ref>'
[ $# -ge 9 ] || s2fa_refuse "$usage" "bad usage"
s2fa_container_check
s2fa_node_script staff-2fa-emergency-reset.js "${@:2}"
