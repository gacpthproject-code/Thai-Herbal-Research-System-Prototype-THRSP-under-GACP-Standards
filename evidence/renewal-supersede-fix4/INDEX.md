# fix/renewal-supersede รอบแก้ 4 (MEDIUM-1 · LOW 2 · LOW 3 · LOW 4)

ผลรันทั้งหมดผ่าน `~/work/state/heavy.sh` บน postgres:17 ชั่วคราว (`evidence/renewal-supersede-fix/harness/pg-jest.sh`) · สรุปผลอยู่ใน `runs/summary.txt` (log ดิบเก็บนอก repo)

| ข้อ | RED (e266a946c) | GREEN |
|---|---|---|
| 1 MEDIUM-1 ล็อตที่เก็บใต้ใบเดิมก่อนรอบย้าย | ล็อตได้ reference ใบใหม่ · isValid false · producedInForce false · renewal null | reference ใบเดิม · producedInForce true · renewal ชี้ใบใหม่ ทั้ง lot, batch, generic lot, generic batch |
| 1 เก็บเกี่ยวบนรอบที่ย้ายแล้ว ลงวันในช่วงใบเดิม | 400 | 201 และล็อตผูกใบเดิม |
| 2 PUT /harvest-batches/:id และ POST /:id/harvest วันในช่วงว่าง | 200 | 400 HARVEST_DATE_OUTSIDE_CERTIFICATE วันเดิมไม่เปลี่ยน รุ่นยัง GROWING |
| 3 ประตูพาร์ทเนอร์ | certificateStatus active ของใบใหม่ | ใบเดิม renewed + producedInForce true · ล็อตช่วงว่าง outside_validity + producedInForce false |
| 4 lapsedBeforeRenewal | ใบใหม่ออกวันถัดจากวันหมดอายุได้ true | false · true เมื่อมีวันกรุงเทพฯ ที่ไม่มีใบครอบคลุม |

`runs/summary.txt` บันทึก related3 ที่ล้ม 5 ชุดตอนโหลด: เป็นการลอง refactor ประตูพาร์ทเนอร์ให้เรียก trace-service/common ซึ่งถูกยกเลิกแล้ว · related-final คือ tree ที่ commit

ภาพ `screens/` 390x844 และ 1440x900: หน้าล็อต หน้าสแกนทั่วไป และหน้า verify ใบเดิม ของล็อตที่เก็บ 1 ก.ค. 2569 ใต้ใบเดิม แล้วรอบปลูกย้ายไปใบใหม่ (`seed.json` cycleMovedToRenewal true) · scrollWidth เท่าความกว้างทุกภาพ

ชุด backend ทั้งหมดบน Postgres จริงที่ 274bbdfc5: 6 ชุดล้ม 10 ข้อ · 4 ชุด 8 ข้อเป็นชุดเดิมที่ล้มบนฐาน 6c91e6141 (a0-pr2-per-hop-invariant, dtam-schema-drop-migration-real-postgres, onsite-decision-mint-e2e, status-writer-audit-default-invariant) · error-codes-source-pointers ล้มจากรอบนี้จริง (สองตัวชี้บรรทัดขยับ) แก้แล้วใน commit ถัดไปและผ่าน · document-precheck/extract ล้มข้อจับเวลา child process ใต้โหลดเต็ม ผ่าน 18/18 เมื่อรันเดี่ยว (pointers-and-extract) ไม่แตะโค้ดส่วนนั้น
