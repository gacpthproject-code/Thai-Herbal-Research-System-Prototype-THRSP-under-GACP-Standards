# INDEX — evidence pack ของ integration/2026-11-08b (PR #869 + #870)

วัดที่ head H = af94cff9aad7bd31baab50f39cc7c965655ef991 เทียบ base 63454a892545c265ad17864be55f09fd6871de55
H = main e4a746ea3 + merge --no-ff ของ #869 (0e9a92163) และ #870 (cbed212f5) · gate รันบน DESKTOP-R53T303 เมื่อ 2026-11-08
ชุดนี้แทน `evidence/pr869-gate-2026-11-08/` ที่เก่า (head 4ce025735 / base 3878f42c1 / ล้มใหม่ 22 เทสต์ PDF ซึ่ง #873 แก้แล้ว)
Tier C ต้องให้ operator merge เอง ชุดนี้ยังไม่ใช่คำสั่ง merge

## ผลสรุป
gate-compare: verdict UNPROVEN · ล้มใหม่ 0 check · ล้มใหม่ 0 เทสต์ · check ที่ผ่านแล้วกลายเป็น not-run 0
UNPROVEN มาจาก 3 แถวด้านล่าง ไม่มีแถวไหนเป็นความล้มเหลวใหม่

## แถว UNPROVEN ทั้ง 3
1. probe-ci "1 name(s) gone while the check still fails". probe ชื่อ `gate-attestation` ล้มที่ base (attestation ล่าสุดคลุม 3878f42c1 แต่ไฟล์ gated เปลี่ยนไปหลังจากนั้น) และไม่ล้มที่ head แล้ว เพราะ attestation ของ base ถูก commit เข้า main (e4a746ea3) ชื่อที่หายคือชื่อที่ผ่าน ไม่ใช่ที่ถูกซ่อน probe-ci ยังแดงที่ head เพราะ deploy-drift และ status-vocab ยังล้ม (ล้มเหมือนกันทั้งสองฝั่ง)
2. deploy-drift ล้มทั้งสองฝั่งโดยไม่มีชื่อเทสต์ เหตุผลเดียวกัน ตามที่ log ที่ head ระบุ: demo-backend/demo-frontend รัน b8d27a690 ตามหลัง origin/main (e4a746ea3) 170 commit คือ demo ยังไม่ถูก deploy และ staging เข้าถึง https://staging.gacpth.com ไม่ได้จากเครื่องนี้ (เป็นผลของสภาพแวดล้อม ไม่ใช่คำตัดสินเรื่อง deployment) ไม่เกี่ยวกับโค้ดของ #869/#870
3. integration-no-skip ล้มทั้งสองฝั่งโดยไม่มีชื่อเทสต์ log ที่ head ระบุ numPendingTests=13 ทั้งที่มี Postgres จริง ตัวเลข 13 เท่ากับที่ base (integration-pg: skipped 13 ทั้งสองฝั่ง) check นี้ไม่ใช่ required

## สิ่งที่ล้มทั้งสองฝั่งเหมือนกัน (ไม่ใช่ความล้มเหลวใหม่)
- suite-green และ integration-pg: 5 เทสต์ใน 2 suite ล้มเท่ากันทั้งสองฝั่ง (Tests 5 failed · 52 skipped · 16267 passed · 16324 total ทั้ง base และ head)
  - __tests__/integration/a0-pr2-per-hop-invariant.test.js: hop #7, #8/#9, #13, #14 ข้อ "(1) the hop commits ⇒ exactly one canonical row per edge it walks"
  - __tests__/integration/dtam-schema-drop-migration-real-postgres.test.js: "PR3: ดรอป schema ของ DTAM remittance ... ตัวตรวจก่อน deploy: exit"
- probe-gate ที่ head: deploy-drift, status-vocab ล้ม (ที่ base เพิ่ม gate-attestation) · probe-results.json ยังมี main-attestation-audit และ a5-accuracy FAIL, db-session-timezone กับ nginx-config-drift BLOCKED, report-integrity PENDING เหมือน base

## ratchet
hardcode 26 · todo 33 · env-direct 96 · dup-source 0 ทั้ง base และ head ไม่ขยับ รายละเอียดใน ratchet-before-after.txt

## ไฟล์ในชุด
- INDEX.md: ไฟล์นี้
- gate-compare.txt: ผลดิบของ `gate-compare --base 63454a892 --head H`
- gate-compare.json: ผลเดียวกันจาก evidence-pack.js
- probe-results.json: ผล probe ของ head ทั้ง 27 ตัว
- ratchet-before-after.txt: ตัวเลข ratchet ดิบสองฝั่ง
- test-output.txt: สถานะแต่ละ check ของสองฝั่ง และผล gate-compare
- ไม่มี rerun-new-failures.txt เพราะไม่มีเทสต์ล้มใหม่ให้รันซ้ำ

## ที่ทำไม่ได้ / ไม่ได้อยู่ในชุด
- log ดิบไม่ถูก commit (HARNESS.md §5) อยู่ที่ evidence/gate/logs/af94cff9a…/ บน DESKTOP-R53T303 (gitignored) · log ของ base อยู่ที่ wt-pdffix ของเครื่องเดียวกัน
- ไม่มีภาพ/วิดีโอ view-pack เพราะ #869/#870 เป็น harness และแถวใน walk ไม่ได้เปลี่ยนหน้าจอผู้ใช้
- flow-proof-full, stripe-keys-ready, money-equation-real, drain-complete-real เป็น not-run ทั้งสองฝั่ง เพราะต้องมี credential หรือข้อมูลจริง
- ไม่มีคำสั่ง "merge" ของ operator อยู่ในชุดนี้ จะเพิ่มตอน merge
