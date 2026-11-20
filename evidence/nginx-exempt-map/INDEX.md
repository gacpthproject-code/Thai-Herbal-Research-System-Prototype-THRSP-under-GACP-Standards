# nginx-exempt-map · ผลบน nginx จริง

งาน: ผู้ถูกบล็อกต้องผ่านประตูก่อนเปิดตัวไปถึง upstream ไม่ได้ · fix commit `c8c8a00b1` · ฐานก่อนแก้ `16ed718b5` · รันเมื่อ 2026-11-07

- `matrix.tsv` 105 แถว คือ request, expected, got บน staging, demo, gacpth.com และ Host อื่น (default server)
- `rows.txt` รายการคำขอและค่าที่คาด
- `run-matrix.sh` รันซ้ำได้ด้วย `NGINX_BIN=<nginx 1.24> evidence/nginx-exempt-map/run-matrix.sh` · upstream เป็น stub · ต้องได้อย่างน้อย 105 แถว ไม่งั้นถือว่าล้ม

| ชุดที่รัน | คอลัมน์ | แถวที่ควร 403 แต่ถึง upstream |
|---|---|---|
| ก่อนแก้ | `got_shipped` | 22 |
| ทดลอง `map $uri` + `$` | `got_uri_trial` | 15 |
| แก้แล้ว `00-gacp-platform.conf` | `got_fixed` | 0 |
| แก้แล้ว `gacp-platform.conf` กับ vhost staging เดิม | `got_old_copy` | 0 |

ทำไมไม่ใช้ `$uri`: `proxy_pass` ที่ไม่มี URI ส่งบรรทัดดิบต่อ ค่า `fwd=` ในคอลัมน์ `got_uri_trial` คือสิ่งที่ stub ได้รับจริง
เช่น `/api/v1/applications/x%2f..%2f..%2f..%2fwebhooks/stripe` ถูกยกเว้นเพราะ normalize แล้วตรงแถว stripe และ `$` ของ PCRE ยังตรงก่อน `\n` ท้ายสตริง ทำให้ `/__gate%0a` ผ่าน

คอลัมน์ `got_old_copy` เทียบเฉพาะ status และไม่เทียบ gacpth.com เพราะสำเนานั้นมีหน้าเปล่าแทน notice และไม่มี redirect `/verify/`

พิสูจน์ไม่ได้ที่นี่: พฤติกรรมของ Cloudflare หน้า origin, build nginx บน AlmaLinux ของเครื่อง demo, certbot และ Stripe ตัวจริง, ผลต่อ backend หลัง Docker nginx

ข้อจำกัดของ matrix นี้:

- `matrix.tsv` เป็นผลรันครั้งเดียวของวันที่ 2026-11-07 ตอนนี้เครื่องนี้ไม่มี nginx binary แล้ว จึงรันซ้ำไม่ได้ · เกณฑ์ขั้นต่ำ 105 แถวเพิ่มทีหลังและตรวจด้วย nginx ปลอมบนสำเนาทิ้งเท่านั้น ไม่ได้รันกับ nginx จริง
- สคริปต์ไม่ได้แก้แค่ port, path และ token: ลบ `listen [::]` และ `default_server` ออกจาก conf และเพิ่ม `set_real_ip_from 127.0.0.1` ในตัวห่อ
- จึงไม่ได้ทดสอบ listener IPv6 และที่อยู่ผู้เยี่ยมชมมาจาก `CF-Connecting-IP` ที่ส่งจาก loopback ไม่ใช่จากช่วง IP ของ Cloudflare
- ไม่ได้เก็บ `nginx -V` ไว้ จึงไม่มีหลักฐานของ build และ module ที่ใช้รัน นอกจากเลขรุ่น 1.24 ที่บันทึกไว้
