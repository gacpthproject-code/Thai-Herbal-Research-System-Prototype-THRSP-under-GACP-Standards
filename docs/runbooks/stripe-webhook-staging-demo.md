# env และ nginx ของการชำระเงินบน staging/demo

ย้ายมาจากสกิล `gacp-payment-invariants` (2026-11-03) เพราะเป็นรายละเอียดการ deploy ไม่ใช่กติกาเงิน
ข้อมูลชุดนี้บันทึกตอน deploy 2026-09-27 · **ยังไม่ได้ตรวจซ้ำ** หลัง demo ย้ายไป 119.59.105.140 และหลังคำสั่งให้หมุน secret
หลังย้ายเครื่อง ก่อนใช้ให้เทียบกับ Stripe dashboard (โหมดทดสอบ) และ env ของคอนเทนเนอร์ที่รันอยู่ โดยไม่พิมพ์ค่าออกมา

- `STRIPE_CHECKOUT_ENABLED=true` (operator: "เปิดทั้ง staging และ demo") · `STRIPE_PUBLISHABLE_KEY` (pk_test) ·
  `STRIPE_WEBHOOK_SECRET` = secret ของ endpoint โหมดทดสอบ (staging `we_1UK9euQ4HsQ2Gmd565gwUAJn`, demo
  `we_1UK9evQ4HsQ2Gmd5ac9Wsq5W` ณ 2026-09-27 · เก็บที่ `~/work/state/stripe-webhooks/`) · ทุกคีย์เป็นโหมดทดสอบ
  การตั้ง live key เป็นของ operator (CLAUDE.md หัวข้อ "ขอบเขตที่ห้ามข้าม")
- nginx: `~^/api(/v1)?/webhooks/stripe$ 1;` ใน `map $request_uri $gacp_prelaunch_exempt` (operator อนุญาตตรง) เพราะ Stripe
  ถือคุกกี้ gate ไม่ได้ · route ตรวจลายเซ็นเอง · พิสูจน์ 2026-09-27: `stripe trigger` จาก IP ของ Stripe ได้ 200 ทั้งสอง env
- ไฟล์สำรองของ nginx ห้ามวางใน `sites-enabled/` (nginx โหลดซ้ำแล้วได้ duplicate upstream) ใช้ `/etc/nginx/backup/`
