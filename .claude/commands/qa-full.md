---
description: รัน QA matrix เต็ม (role × flow × state + crawler + visual) ผ่าน qa-e2e agent
---
Dispatch qa-e2e agent (.claude/agents/qa-e2e.md) ให้รัน matrix
PROMPT-PAYMENT-REWORK.md §6 เต็ม สำหรับ work item ปัจจุบัน:
1. §6.1 role × flow × state matrix
2. §6.2 button crawler → evidence/<work-item>/crawler-report.json
3. §6.3 visual regression เทียบ baseline
4. §6.4 webhook integration (mock ก่อนมี key — mark integration=mock)

เสร็จแล้ว: รัน `bash scripts/check-done.sh crawler-clean evidence-complete suite-green`
แล้วรายงานตาม CLAUDE.md **§6** (รูปแบบ report — v2 §5 เลื่อนเป็น §6 ใน v3; §5 วันนี้คือ DoD ตามชั้น)
— ตัวเลขจาก probe เท่านั้น ห้ามเชื่อ summary ของ agent
