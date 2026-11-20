# ผลตรวจอิสระ (pstack:poteto-agent บน sonnet · ไม่ได้เขียนงานนี้ · ไม่ ssh ไม่แตะเครื่อง demo)

| รอบ | head | ผู้ตรวจ | ผล | ประเด็นหลัก |
|---|---|---|---|---|
| 1 | 40e8ae052 | code | REQUEST-CHANGES | rerun backup เทียบกับ dump เล็กที่ถูกปฏิเสธ · rollback ไม่ตรวจ revision เมื่อบันทึกว่าง · PASS → NOT-YET เงียบ · rename · ref check หลวม · previous-tag เก่า · marker ค้าง · ช่องว่างของ selftest |
| 1 | 40e8ae052 | security | REQUEST-CHANGES | บรรทัดสิทธิ์ไม่มี `--exec` (อักขระพิเศษรันใน WSL ได้ ทดลองแล้ว) · ต่อ `--rows cert-path` ได้ · rollback ข้ามรอบ · ขั้นหลังไม่บังคับ precheck · rename · การทดสอบค่าลับอ่อน · backup.log ไม่ปิด URL |
| 2 | 3ed52e20f | code | APPROVE | medium: demo-walk เขียนทับผล · low: FAIL ไม่มีฐานไม่เด่น · src-ok ไม่ล้าง marker |
| 2 | 3ed52e20f | security | REQUEST-CHANGES | สคริปต์ฝั่งเครื่องอ่านจาก working tree · ref check เลี่ยงด้วย `?host=` `#@` `?y=@` `a:b@c@` · scrub สนตัวพิมพ์ · tail ไม่ผ่าน scrub · คีย์ซ้ำ |
| 3 | 3796a3c35 | code+security | REQUEST-CHANGES | blocker: `/` ในส่วนผู้ใช้เลี่ยง ref check · wrapper ไม่ผูกกับ sha · scrub หยุดที่ @ แรก |
| 4 | cb0af1300 | code+security | REQUEST-CHANGES | blocker: `?%68ost=` · high: host หลายตัวคั่นจุลภาค · ตัวตรวจ sha ใช้ cwd และไม่เห็นไฟล์ใหม่ |
| 5 | af4799949 | code+security | APPROVE | ลอง URL ราว 50 แบบใน 4 locale ไม่พบทางเลี่ยง · low: scrub กับ byte ที่ไม่ใช่ UTF-8, URL ที่ถูกตัดข้ามบรรทัด, .env.demo แบบ CRLF ล้มแบบปิดด้วยข้อความชวนสับสน |

ทุกประเด็นระดับ blocker/high/medium แก้แล้วพร้อมเคสใน selftest และ mutation (red-green.txt)
ประเด็น low ของรอบ 5 ไม่ได้แก้ในงานนี้ (บันทึกไว้เป็นงานต่อใน INDEX.md)
หลังรอบ 3 ล้มซ้ำ เปลี่ยนวิธีจากแยก URL เองเป็น allowlist ของรูป URL ทั้งเส้น (principle: attack the premise)
