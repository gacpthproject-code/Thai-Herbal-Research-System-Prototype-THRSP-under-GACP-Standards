# หลักฐาน — ถอดโหมด workspace (R1 + R2)

สาขา `feat/remove-workspace-mode` (worktree `wt-r2`) · ledger: `.superpowers/sdd/2026-09-30-remove-workspace-mode/progress.md`
ชั้นของงาน: C (auth/identity) · สถานะ: `PENDING`

## Task และ commit (จาก ledger)

R1 (merge เข้า main แล้ว df107376 · 2026-10-03)

| Task | commit |
|---|---|
| 1 | bbdee648, 3f6f7b3a |
| 2 | 1395d502, e46ceba0 |
| 3 | 068baad1, c26c9529 |
| 4 | 99b6b2c0, e7e7db12, a58fcec2, 7c13dcea |
| 5 | 22a9e0a0, 1c302fb4, bbf70ec0 |
| 6 | bf36df48, f26ac6e2, 0a00758d, f40be2b0 |
| 7 | 5ab13298, 64a2aacf |
| final-fix | 1cc1aa0d, 2473a388, eea3266e (merge main → 1d6a7dff) |

R2 (สาขานี้)

| Task | commit |
|---|---|
| 7b | cde25f0c, c751af13, 0024877a, 1f7239dd, be4930b3, 87d00502, 9f4ef4af, 49c23490, f5b92ad8 |
| 8 | 8c14babc, 15455b27 |
| 9 | 002c4bc2, 68b21b6d, e9b8bcf7 |
| 10 | 5b0594be, 013de5c6, e3794e44, 3d5fc593, d652bd7f, 737822b2 |
| 11 | 985d1a4c, 3a7a5e9e, cc87292a |
| 12 | 000a2b31, ad04359a, e1dacd84, 47c62dd7 (+ 788f5128, 138c86c8 กันคำขอต่ออายุซ้ำ) |
| 13 | bd5824c9 |
| 14 | 4a9ba006, 89748289, 87b8cf10 |
| 15 | abc080f1, 95fc5143 |
| 16 | runbook R2 + BACKLOG-FOUND + ไฟล์นี้ · merge origin/main (ดู git log) |

หมายเหตุ: ตัวเลข Task ตาม ledger (7b แทรกระหว่าง 7 กับ 8) · 8f4c7407 คือ fixture หลัง merge main รอบก่อนหน้า

## ผล gate สุดท้าย

PENDING — coordinator runs the final gate

(รายการที่ต้องมี: `LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh` · web suite · real-PG suites พอร์ต 55431–55439
ลบ container ทุกตัวหลังรัน · `ratchet.sh` · `holder-read-scope.sh` · `tier-check.sh` คาดชั้น C)

## view-pack

PENDING — ถ่ายหลัง operator deploy ลง staging (`evidence/remove-workspace-mode/view-pack/INDEX.md`)
