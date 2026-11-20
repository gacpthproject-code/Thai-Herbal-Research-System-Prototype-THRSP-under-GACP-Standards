#!/usr/bin/env bash
# usage: scripts/ops/qa-staff-2fa.sh <base url> <credentials file>
#   base url: https://... (หรือ http://127.0.0.1:<port> สำหรับการทดสอบในเครื่องเท่านั้น)
#   credentials file: บรรทัด 1 = รหัสผู้ใช้ของบัญชีเจ้าหน้าที่ทดสอบที่ยังไม่ลงทะเบียน 2FA, บรรทัด 2 = รหัสผ่าน,
#                     สิทธิ์ 600; ไฟล์ถูกลบทันทีที่อ่านเสร็จ รหัสผ่านไม่อยู่ใน argv ไม่ถูกพิมพ์
# พิมพ์คำตัดสินภาษาไทยบรรทัดเดียว · exit 0 = บังคับจริง, 1 = ไม่บังคับ, 3 = สรุปไม่ได้
set -uo pipefail
umask 077
say() { printf '%s\n' "$1"; }

base="${1:-}"
cred="${2:-}"
[ -n "$base" ] && [ -n "$cred" ] || { say "สรุปไม่ได้: ต้องระบุที่อยู่ระบบและไฟล์บัญชี"; exit 3; }
case "$base" in
  https://*|http://127.0.0.1:*) ;;
  *) say "สรุปไม่ได้: ที่อยู่ระบบต้องขึ้นต้นด้วย https://"; exit 3 ;;
esac
base="${base%/}"
[ -f "$cred" ] || { say "สรุปไม่ได้: ไม่พบไฟล์บัญชี"; exit 3; }
case "$(stat -c %a "$cred")" in
  600|400) ;;
  *) say "สรุปไม่ได้: ไฟล์บัญชีต้องมีสิทธิ์ 600 (chmod 600 ชื่อไฟล์)"; exit 3 ;;
esac

work=$(mktemp -d) || { say "สรุปไม่ได้: สร้างโฟลเดอร์ชั่วคราวไม่ได้"; exit 3; }
trap 'rm -rf "$work"' EXIT

if ! python3 -I - "$cred" "$work/body.json" <<'PY'
import json, sys
lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
if len(lines) < 2 or not lines[0].strip() or not lines[1]:
    sys.exit(2)
with open(sys.argv[2], "w", encoding="utf-8") as out:
    json.dump({"providerId": lines[0].strip(), "password": lines[1]}, out)
PY
then
  say "สรุปไม่ได้: ไฟล์บัญชีต้องมี 2 บรรทัด บรรทัดแรกรหัสผู้ใช้ บรรทัดที่สองรหัสผ่าน"
  exit 3
fi
rm -f "$cred"

login=$(curl -s -m 30 -o "$work/login.json" -w '%{http_code}' \
  -H 'Content-Type: application/json' --data-binary @"$work/body.json" \
  "$base/api/auth/provider/login") || login=000
rm -f "$work/body.json"

outcome=$(python3 -I - "$work/login.json" "$work/auth.hdr" "$login" <<'PY'
import json, sys
path, header_path, status = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    body = json.load(open(path, encoding="utf-8"))
except Exception:
    body = {}
if not isinstance(body, dict):
    body = {}
data = body.get("data") if isinstance(body.get("data"), dict) else {}
if status == "200" and data.get("mfa_setup_required") is True and isinstance(data.get("setup_token"), str):
    with open(header_path, "w", encoding="utf-8") as out:
        out.write("Authorization: Bearer " + data["setup_token"] + "\n")
    print("SETUP_TICKET")
elif status == "200" and data.get("token"):
    print("SESSION")
elif status == "200" and data.get("mfa_required") is True:
    print("ENROLLED")
else:
    code = body.get("code") if isinstance(body.get("code"), str) else ""
    print(("HTTP_" + status + " " + code).strip())
PY
)
rm -f "$work/login.json"

case "$outcome" in
  SETUP_TICKET)
    probe=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -H @"$work/auth.hdr" \
      "$base/api/auth/provider/me/notification-prefs") || probe=000
    setup=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST -H @"$work/auth.hdr" \
      -H 'Content-Type: application/json' --data '{}' "$base/api/mfa/setup") || setup=000
    rm -f "$work/auth.hdr"
    case "$probe/$setup" in
      401/200) say "ผ่าน: ระบบบังคับ 2FA จริง บัญชีที่ยังไม่ลงทะเบียนใส่รหัสผ่านถูกแล้วยังเข้าระบบไม่ได้ ได้แค่ตั๋วสำหรับลงทะเบียนแอปยืนยันตัวตน หน้าของเจ้าหน้าที่ปฏิเสธตั๋วนั้น และหน้าลงทะเบียนรับตั๋วนั้น"; exit 0 ;;
      200/*) say "ไม่ผ่าน: ตั๋วสำหรับลงทะเบียนใช้เปิดหน้าของเจ้าหน้าที่ได้"; exit 1 ;;
      401/*) say "สรุปไม่ได้: หน้าของเจ้าหน้าที่ปฏิเสธตั๋วแล้ว แต่หน้าลงทะเบียนแอปยืนยันตัวตนตอบรหัส $setup แทนที่จะรับตั๋ว (บัญชีจะลงทะเบียนไม่ได้)"; exit 3 ;;
      *) say "สรุปไม่ได้: ขั้นตรวจตั๋วได้รหัสตอบกลับ $probe"; exit 3 ;;
    esac ;;
  SESSION) say "ไม่ผ่าน: บัญชีที่ยังไม่ลงทะเบียน 2FA เข้าระบบได้ทันที ระบบยังไม่บังคับ 2FA"; exit 1 ;;
  ENROLLED) say "สรุปไม่ได้: บัญชีนี้ลงทะเบียน 2FA แล้ว ให้ใช้บัญชีเจ้าหน้าที่ที่ยังไม่ลงทะเบียน"; exit 3 ;;
  "HTTP_401 INVALID_PASSWORD") say "สรุปไม่ได้: รหัสผ่านไม่ถูกต้อง ระบบนับเป็นการกรอกผิด 1 ครั้ง ตรวจรหัสก่อนลองใหม่ (ผิดครบ 5 ครั้งบัญชีถูกล็อก)"; exit 3 ;;
  "HTTP_423"*) say "สรุปไม่ได้: บัญชีถูกล็อกชั่วคราว"; exit 3 ;;
  HTTP_000*) say "สรุปไม่ได้: ติดต่อระบบไม่ได้"; exit 3 ;;
  *) say "สรุปไม่ได้: ระบบตอบ ${outcome#HTTP_}"; exit 3 ;;
esac
