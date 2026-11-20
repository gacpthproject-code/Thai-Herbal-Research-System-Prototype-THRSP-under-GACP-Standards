# pre-pilot-dependency-bump · หลักฐานรอบขยับ dependency

ถ่ายจาก standalone build ของ branch `fix/pre-pilot-dependency-bump` (next 15.5.29) รันแบบเดียวกับ Dockerfile บน 127.0.0.1 โดยไม่มี backend
ทุกหน้าจึงมี console error 503 หนึ่งบรรทัด จาก API ที่ต่อ port 8000 ไม่ได้ ภาพเหล่านี้พิสูจน์การ render ไม่ได้พิสูจน์เส้นข้อมูลจริง

| ไฟล์ | คืออะไร | ผล |
|---|---|---|
| `home.png` | หน้าแรก `/` | HTTP 200 · ภาษาไทยอ่านได้ |
| `login.png` | `/login` ถูกส่งต่อไป `/auth/health/login` | HTTP 200 · ภาษาไทยอ่านได้ |
| `verify.png` | `/verify` | HTTP 200 · ภาษาไทยอ่านได้ |
| `runtime-check.cjs` | สคริปต์ยิงผ่าน socket จริง ใช้ `mountBodyParsers` และ `multipartLimits` ของ repo | รันซ้ำได้ `node runtime-check.cjs <repo-root>` |
| `runtime-output.txt` | ผลของสคริปต์บน branch นี้ | PASS · ตรงกับผลบน main ทุกบรรทัด |
| `zod-diff.cjs` | เทียบ schema จริง 32 ตัว 1140 เคส ระหว่าง zod สองรุ่น | เหตุผลที่ถอน zod 4.6.7 |
| `zod-classification.txt` | สรุปผลเทียบ | ผ่าน/ไม่ผ่านตรงกันทุกเคส · ข้อความ error ต่าง 163 เคส |

Image optimizer ของ next ผ่าน sharp 0.35.5 บน build เดียวกัน: `/_next/image` แปลง PNG 55450 ไบต์เป็น `image/webp` 3288 ไบต์ HTTP 200
