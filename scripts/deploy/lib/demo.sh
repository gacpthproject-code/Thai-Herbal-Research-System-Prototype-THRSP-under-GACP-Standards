# shellcheck shell=bash
# ส่วนกลางของ scripts/deploy/demo-*.sh (runbook docs/operations/runbooks/deploy-demo.md)
# ทุกขั้นที่ต้องทำบนเครื่อง demo ส่ง demo-remote.sh ทาง stdin ให้ `ssh gacp-demo bash -s -- <ขั้น> <sha>`
# อาร์กิวเมนต์มีแค่ชื่อขั้นกับ sha · ค่าลับอ่านบนเครื่องเข้า env ของ process ไม่ผ่าน argv
set -euo pipefail
DEMO_HOST=gacp-demo
DEMO_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_REPO="$(cd "$DEMO_LIB/../../.." && pwd)"

die() { echo "หยุด: $*" >&2; exit 1; }

one_sha() {
  [ "$#" -eq 1 ] || die "ต้องระบุ sha หนึ่งตัวพอดี (ได้ $# อาร์กิวเมนต์)"
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "อาร์กิวเมนต์ต้องเป็น sha เต็ม 40 ตัวอักษรตัวพิมพ์เล็ก"
  # สคริปต์ที่กำลังรัน (checkout ที่สคริปต์อยู่ ไม่ใช่ cwd) ต้องตรงกับ commit ที่อนุมัติ · กันความคลาดเคลื่อนโดยไม่ตั้งใจ
  # ไม่กันคนที่แก้ตัวตรวจนี้เอง: ตัวคุมจริงคือสิทธิ์รายสคริปต์ของ operator
  git -C "$DEMO_REPO" diff --quiet "$1" -- scripts/deploy 2>/dev/null \
    && [ -z "$(git -C "$DEMO_REPO" ls-files --others --exclude-standard -- scripts/deploy)" ] \
    || die "scripts/deploy ใน checkout นี้ไม่ตรงกับ ${1:0:12} (แก้ค้าง, ไฟล์ใหม่ หรือไม่มี commit นี้) · checkout sha นั้นก่อน"
}

# สคริปต์ฝั่งเครื่องอ่านจาก commit ที่อนุมัติ ($2 = sha) ไม่ใช่จาก working tree
on_box() {
  local body
  body=$(git -C "$DEMO_REPO" show "$2:scripts/deploy/demo-remote.sh") || die "อ่าน scripts/deploy/demo-remote.sh จาก ${2:0:12} ไม่ได้"
  ssh -o BatchMode=yes "$DEMO_HOST" bash -s -- "$@" <<< "$body"
}
