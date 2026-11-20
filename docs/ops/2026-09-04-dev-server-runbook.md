# Dev-server migration runbook — ย้ายงานพัฒนาไปรันบนเซิร์ฟเวอร์ (2026-09-04)

เครื่อง: `ubuntu@43.134.175.51` (VM-0-3-ubuntu) หลังอัปเกรด: **4 vCPU / 16 GB RAM / ดิสก์ 217 GB (ว่าง 131 GB)** · Ubuntu 22.04.5
ขอบเขต: งานพัฒนา (Claude Code + เทส + walk) อยู่ใต้ `~/work/` แยกขาดจาก stack ที่ให้บริการ (`/opt/gacp-platform`, containers `gacp-*` ทั้ง 17 ตัว) — **ห้ามงานพัฒนาแตะ containers เดิม**

## สิ่งที่ติดตั้ง/เตรียมแล้ว (โดย agent, 2026-09-04)

| รายการ | สถานะ |
|---|---|
| Clone repo ที่ `~/work/GACP-Certification-Application` | ✓ (origin = GitHub, branch main = a1f02b5a) |
| Branch `feat/application-submission-v2` + `feat/revoked-certificate-consequences` push ขึ้น origin แล้ว | ✓ (`git fetch` บนเซิร์ฟเวอร์ได้เลย) |
| Node 20.20.2 ผ่าน nvm (สถานะ ณ วันที่เขียน 2026-09-04) + pnpm 8.15.0 (ตาม `packageManager`) | ✓ — เข้า shell แล้ว `nvm use 20` (ตั้ง default ไว้แล้ว) · **อัปเดต 2026-09-26: `engines` ของ repo เปลี่ยนเป็น 24.x บน `chore/node-24` — เครื่องนี้ยังเป็น default 20 จนกว่า Task 5 จะสั่ง `nvm alias default 24` (ขั้นของ operator หลัง merge)** |
| `pnpm install` ทั้ง workspace | ✓ EXIT=0 |
| Playwright chromium + system deps | รันใน tmux session `pw` (ดู `/tmp/playwright-install.log`) |
| Claude Code | ✓ มีอยู่แล้ว v2.1.220 + **login แล้ว** (`~/.claude/.credentials.json` มีอยู่) · หมายเหตุ: `install.sh`/update ตอบ 403 จากเครื่องนี้ (CDN อาจบล็อก region) — ใช้เวอร์ชันที่มีไปก่อน |
| Memory ของ agent (34 ไฟล์) | ✓ copy ไป `~/.claude/projects/-home-ubuntu-work-GACP-Certification-Application/memory/` |
| tmux 3.2a | ✓ |

## สิ่งที่ต้องทำโดย operator (2 อย่าง — agent ทำแทนไม่ได้)

**1. โอนไฟล์ลับ** — classifier ของ Claude Code ไม่อนุญาตให้ agent โอนไฟล์ .env/private key ออกนอกเครื่องเอง (ถูกต้องตามหลักแล้ว) รันเองจากเครื่องโน้ตบุ๊ก (PowerShell ใน `C:\Users\charo\Documents\GitHub\GACP-Certification-Application`):

```powershell
scp .env ubuntu@43.134.175.51:~/work/GACP-Certification-Application/.env
scp apps\backend\.env ubuntu@43.134.175.51:~/work/GACP-Certification-Application/apps/backend/.env
scp apps\backend\keys\private.pem apps\backend\keys\public.pem ubuntu@43.134.175.51:~/work/GACP-Certification-Application/apps/backend/keys/
ssh ubuntu@43.134.175.51 "chmod 600 ~/work/GACP-Certification-Application/.env ~/work/GACP-Certification-Application/apps/backend/.env ~/work/GACP-Certification-Application/apps/backend/keys/*.pem"
```

ไฟล์รหัสผ่าน walk (ไม่บังคับตอนนี้ ใช้ตอนย้าย walk): `scp` ไฟล์ `uat-creds.txt` และ `g4-creds.txt` จาก scratchpad เดิมไปที่ `~/work/gacp-secrets/` แล้ว `chmod 600`

**2. เปิด session แรกบนเซิร์ฟเวอร์** (Claude login มีอยู่แล้ว — ถ้า token หมดอายุค่อย `claude` แล้วทำตาม URL ที่ขึ้น):

```bash
ssh ubuntu@43.134.175.51
tmux new -s claude          # session ค้างได้แม้หลุด SSH; กลับเข้า: tmux attach -t claude
cd ~/work/GACP-Certification-Application && git fetch origin && git checkout feat/application-submission-v2
nvm use   # อ่าน .nvmrc ของ branch นั้นเอง — 24 บน main/chore/node-24 ขึ้นไป, ไม่ hardcode เลขที่จะเก่าอีก
claude
```

## แผน cutover (ตามลำดับ ไม่รีบ)

1. **B1 (appv2 tasks 1-4) จบบนโน้ตบุ๊กก่อน** — workflow กำลังรัน อย่าตัดกลางคัน → gate → commit → push
2. เปิด session บนเซิร์ฟเวอร์ (ข้อ 2 ข้างบน) → บอก agent บนนั้นว่า "อ่าน memory แล้วต่อ batch B2 ของ appv2" — memory + repo + plan + briefs พาไปถูกที่เอง (briefs อยู่ใน plan; แตกใหม่บนเครื่องนั้นได้)
3. โน้ตบุ๊กเหลือหน้าที่: จอ SSH + กด UI ดู view-pack (เบราว์เซอร์ walk รันบนเซิร์ฟเวอร์แบบ headless ได้ วิดีโอ/ภาพครบ)
4. ระวังตอนรัน stack พัฒนาบนเซิร์ฟเวอร์: backend :8000 / web :3000 **ชนพอร์ต** กับ containers staging/preview — ใช้พอร์ต 8010/3010 สำหรับ dev stack (ตั้งใน env ตอนรัน ไม่แก้ไฟล์) หรือหยุด preview ชั่วคราวเมื่อ operator สั่งเท่านั้น
5. ข้อจำกัดที่รู้แล้ว: 4 cores ⇒ workflow แบบขนานกว้าง (census 12 ตัว) จะถูกจำกัด concurrency เหลือ ~2 — งาน batch แบบเรียงลำดับ (implement→review→fix) ไม่กระทบ

## หมายเหตุความปลอดภัย
- อย่ารัน `prisma migrate reset/dev` บนเครื่องนี้ — DB คือ Supabase demo ตัวเดียวกับที่ preview ใช้
- `~/work/gacp-secrets/` และไฟล์ .env ทุกไฟล์ = chmod 600, ห้าม commit, ห้าม cat ลง log
- เครื่องนี้ยังเป็นบ้านของ staging/preview — งานพัฒนาห้ามแตะ `/opt/gacp-platform`, nginx, containers

## Claude Remote Control (สั่งงานจากเว็บ/มือถือ ไม่ต้องเปิด SSH ค้าง)

ใช้ได้กับเครื่อง headless: session รันบนเซิร์ฟเวอร์ สั่ง/ดูจาก claude.ai หรือแอปมือถือ

```bash
ssh ubuntu@43.134.175.51
tmux new -s claude
cd ~/work/GACP-Certification-Application
claude            # เปิดครั้งแรกในโฟลเดอร์นี้หนึ่งครั้งเพื่อกดยอมรับ workspace trust
# จากใน session: พิมพ์ /remote-control (หรือ /rc)
# หรือเปิดแบบ remote ตั้งแต่ต้น: claude remote-control --name "GACP Dev Server"
```

ระบบจะพิมพ์ URL (claude.ai/code/...) + QR — เปิดจากเบราว์เซอร์หรือสแกนด้วยแอป Claude แล้วสั่งงานได้เลย ตัวงานรันบนเซิร์ฟเวอร์ทั้งหมด ปิดมือถือ/หลุดเน็ตได้ session ไม่ตาย · เงื่อนไข: login แบบ claude.ai (มีแล้วบนเครื่อง) ไม่รองรับ API key · กลับมาต่อหลังหยุด: `claude remote-control --continue` · อย่าสับสนกับ "Claude Code on the web" ที่รันใน cloud ของ Anthropic ไม่ใช่เครื่องเรา · docs: https://code.claude.com/docs/en/remote-control.md

## ผลตรวจความพร้อม (2026-09-04)

- suite จริงรันผ่านบนเซิร์ฟเวอร์แล้ว: `error-codes-catalog` 11/11 ใน 2.1 วินาที (ใต้ node 20)
- ระหว่างตั้งเครื่องพบและแก้ bug จริงของ repo: `.gitignore` กลืน `test-support/test-database-guard.js` ทำให้ทุก clone ใหม่รัน Jest ไม่ได้เลย — commit `066bd6eb`
- stripe CLI 1.21.8 ติดตั้งแล้ว · Playwright chromium + deps ติดตั้งแล้ว
- 2026-09-04 16:1x: ไฟล์ลับครบ (chmod 600) · DB จริงเชื่อมได้จากเซิร์ฟเวอร์แล้ว (SELECT count จาก applications = 6) — ข้อแม้: หลังวาง .env ต้องรัน `npx prisma generate` ซ้ำหนึ่งครั้ง (client ที่ generate ตอนยังไม่มี .env จะหา DATABASE_URL ไม่เจอ)
