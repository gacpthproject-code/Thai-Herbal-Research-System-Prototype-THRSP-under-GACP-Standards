# PR 861 evidence pack · head 11eef54e1 เทียบ main aaa6b80f6

ทั้งสองฝั่งรันบน WSL ของ PC · Postgres `Etc/UTC` · ไม่ตั้ง `PAYMENT_ADAPTER`

**verdict: NEW-FAILURES** จาก 1 แถว คือ `probe-ci\tgate-attestation` · ไม่รายงานว่าไม่มีความล้มเหลวใหม่

| ด่าน | main | head | อ่านแล้ว |
|---|---|---|---|
| suite-green | fail | fail | 12 แถวตรงกันทุกแถว |
| integration-pg | fail | fail | 20 แถวตรงกันทุกแถว เทสต์ล้ม 8 ข้อเท่ากัน |
| secret-scan-deep | fail | pass | 68 fingerprint `dedupeKey` ที่ operator อนุมัติ |
| probe-ci | fail | fail | `no-secret` ผ่านแล้ว · `gate-attestation` เป็นแถวใหม่ |
| probe-prisma-deps | pass | pass | |
| deploy-drift | fail | fail | staging เข้าไม่ได้ และ demo ตาม main 97 commit เหมือนกันสองฝั่ง |
| integration-no-skip (advisory) | fail | fail | `numPendingTests=13` เท่ากัน |

`gate-attestation`: ไม่ใช่ regression ของ branch · ฝั่ง main ผ่านเพราะไม่มีไฟล์เปลี่ยน · ฝั่ง head ล้มเพราะ probe รันก่อน attestation ของ commit นั้นจะเกิด ทุกกิ่งที่แตะ `^apps/` ได้ผลเดียวกัน · ต้องให้ operator ตัดสิน

ไฟล์: `test-output.txt` · `probe-results.json` · `gate-compare.json` · `ratchet-before-after.txt` (เขียน NOT-AVAILABLE ค่าดิบสองฝั่งเท่ากัน 26/33/96/0)

log ดิบไม่ commit: `evidence/gate/logs/<sha>/` บนเครื่อง DESKTOP-R53T303

ผู้ตรวจอิสระ: code review รอบแรก VETO · รอบสอง VETO · รอบสาม VETO · ปิดครบและอนุมัติ · security review อนุมัติ (ถึง 2faff51fd) · รอบสุดท้ายตรวจ code และ security ของส่วนต่างถึง 9bb15842d อนุมัติ
