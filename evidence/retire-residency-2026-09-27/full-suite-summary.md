# สรุปชุดเทสเต็ม — retire-residency 2026-09-27

log ดิบเก็บนอกรีโป (scratchpad ของ session) — ถอดจากประวัติ branch นี้เพราะ gitleaks จับ hash ของ fanout dedupeKey ใน log เป็น generic-api-key (ผลบวกลวง ไม่ใช่ความลับ) และ full-gate สแกนทุก ref

## backend (Node 24, private.pem mtime ไม่เปลี่ยน)
Test Suites: 3 failed, 32 skipped, 853 passed, 856 of 888 total
Tests:       4 failed, 221 skipped, 11016 passed, 11241 total

ไฟล์ที่ตก (3 ไฟล์ upload-disk-state — ซ้ำได้เฉพาะตอน jest หลายตัวรันพร้อมกันบน upload dir เดียว, รันเดี่ยวผ่าน 19/19 สองรอบ — backend-flake-isolation-retest.txt):
FAIL __tests__/unit/draft-document-upload-content-guard.test.js
FAIL __tests__/unit/the-farmer-can-answer-the-defect-list.test.js
FAIL __tests__/unit/the-upload-door-refuses-an-accepted-slot.test.js

## web
Test Suites: 406 passed, 406 total
Tests:       3307 passed, 3307 total
