#!/usr/bin/env bash
# พิสูจน์ว่า build นี้ปิดปุ่มชำระเงินออนไลน์จริง — ดูจากพฤติกรรมของบันเดิล ไม่ใช่จากป้ายเวอร์ชัน
# สัญญาณ: Next ฝังค่า NEXT_PUBLIC_CHECKOUT_UI_ENABLED ตอน build จน isCheckoutUiEnabled
#          ถูก fold เป็นค่าคงที่ — เปิด = return!0 · ปิด = return!1
set -uo pipefail
IMG="${1:?ใช้: verify-flag-off.sh <image>}"
docker run --rm --entrypoint node "$IMG" -e '
const fs=require("fs"),path=require("path");
const dir="/app/apps/web-app/.next/static/chunks";
const walk=(d,out=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
  if(e.isDirectory())walk(p,out); else if(p.endsWith(".js"))out.push(p);} return out;};
let found=null;
for(const p of walk(dir)){
  const s=fs.readFileSync(p,"utf8");
  const m=s.match(/w:\(\)=>(\w+)\}\);var \w+=r\(\d+\);function \w+\(\)\{var e;return"mock"===[^}]*\}function \1\(\)\{return(![01])\}/);
  if(m){ found={file:path.basename(p), folded:m[2]}; break; }
}
if(!found){ console.log("UNKNOWN — หารูปแบบ isCheckoutUiEnabled ที่ fold แล้วไม่เจอ (บันเดิลเปลี่ยนรูป?)"); process.exit(2); }
const on = found.folded === "!0";
console.log("chunk           :", found.file);
console.log("isCheckoutUiEnabled ถูก fold เป็น:", found.folded, on ? "(= true)" : "(= false)");
console.log(on ? "ผล: ปุ่มชำระเงินออนไลน์ ยังเปิดอยู่" : "ผล: ปุ่มชำระเงินออนไลน์ ปิดแล้ว");
process.exit(on ? 1 : 0);
'
