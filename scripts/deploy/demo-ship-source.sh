#!/usr/bin/env bash
# demo-ship-source.sh <sha> — ขั้น 2: ส่ง source ของ sha ไปเครื่อง demo ด้วย git archive + scp
# รัน demo-precheck.sh ก่อน (sha = origin/main และมี attestation) · วางที่ ~/gacp-build/<sha12>/src.tar.gz ของผู้ใช้ deploy · เครื่องเทียบ sha256 แล้วบันทึกไว้ให้ build ตรวจซ้ำ (runbook docs/operations/runbooks/deploy-demo.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib/demo.sh"
one_sha "$@"
sha=$1

# precheck ซ้ำทุกครั้ง: sha ที่ไม่ใช่ origin/main หรือไม่มี attestation ไปไม่ถึงเครื่อง
bash "$DEMO_LIB/../demo-precheck.sh" "$sha"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git archive --format=tar.gz -o "$tmp/src.tar.gz" "$sha"
here=$(sha256sum "$tmp/src.tar.gz" | cut -d' ' -f1)
on_box prep "$sha"
scp -q -o BatchMode=yes "$tmp/src.tar.gz" "$DEMO_HOST:gacp-build/${sha:0:12}/src.tar.gz"
on_box src-ok "$sha" "$here"
echo "ส่ง source ผ่าน: ~/gacp-build/${sha:0:12}/src.tar.gz · sha256 ${here:0:16}… ตรงสองฝั่ง"
