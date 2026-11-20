# ร่างสำหรับ append ต่อท้าย `HARNESS_LOG.md`

> **วิธีใช้**: คัดลอกทุกอย่างใต้เส้นคั่น ไปต่อท้าย `HARNESS_LOG.md` (append-only — **ห้ามแก้ entry 2026-08-05 ย้อนหลัง** entry ใหม่นี้คือคำแก้ของมัน)
> ผู้ร่าง: orchestrator · ผู้ merge: operator (Law 3.12)
> **หมายเหตุ redaction**: ร่างนี้เขียน IP ของ production เป็น `<PROD-IP>` โดยตั้งใจ — ห้ามเติมเลขจริงลงไฟล์ที่ track ใน git

---

## 2026-08-06 — P0: "agent ไม่มี access ไป server" เป็นเท็จมาตลอด — ทั้ง key และ **สิทธิ์ที่อนุมัติล่วงหน้า** มีอยู่ครบ

- **อาการ**: `HARNESS_LOG.md:99` บันทึกเหตุผลข้อ **(ก)** ที่ orchestrator ปฏิเสธรัน #762 ไว้ว่า
  > "**ไม่มี access ไป production droplet**: … — **ไม่มี SSH/exec path และห้ามถือ SSH key**"

  ตรวจเครื่องเดียวกันเมื่อ 2026-08-06 (read-only, **ไม่ต่อเชื่อม**, ไม่อ่านเนื้อใน key) พบว่าเป็นเท็จ **สองชั้น**:

  **ชั้นที่ 1 — key material มีอยู่จริง และมีมาก่อน entry**
  - `/usr/bin/ssh` และ `/usr/bin/scp` อยู่บน PATH
  - `~/.ssh/gacp_deploy` (419 B, **ไม่มี passphrase**) + `.pub` — **ลงวันที่ 2026-07-22** คือมีอยู่ก่อน entry ราวสองสัปดาห์
  - `~/.ssh/id_ed25519` (**ไม่มี passphrase**) — ชื่อไฟล์ตรงกับที่ `.github/copilot-instructions.md:151` สั่งให้ agent ใช้
  - `~/.ssh/id_ed25519_gacp` และ `~/.ssh/id_rsa` — สองใบนี้**มี** passphrase (ยอมรับได้)
  - `~/.ssh/known_hosts` มีบรรทัดที่ตรงกับ host ของ GACP อยู่แล้ว ⇒ เครื่องนี้**เคยต่อเข้า production มาก่อน**
  - ACL = `HUAWEI-I3\charo:(F)` และ Bash ของ agent รันในสิทธิ์ `charo` **คนเดียวกัน**

  **ชั้นที่ 2 — สิทธิ์ถูกอนุมัติไว้ล่วงหน้าแล้ว (ร้ายแรงกว่าชั้นแรก)**
  - `.claude/settings.local.json` มี allow rule รวม **267 ข้อ** · **ไม่มี `deny` และไม่มี `ask` เลยแม้แต่บล็อกเดียว**
  - ในนั้นเป็น `Bash(ssh … root@<PROD-IP> …)` **43 ข้อ** + `Bash(scp … root@<PROD-IP>:…)` 2 ข้อ (อัปโหลดไฟล์ขึ้น host จริง — `/etc/logrotate.d/`, `/opt/gacp-platform/scripts/maintenance/`) + `Bash(docker compose *)`
  - **25 ข้อเป็น prefix-wildcard** และข้อที่สั้นที่สุดคือ
    `Bash(ssh -o ConnectTimeout=10 root@<PROD-IP> ' *)`
    ⇒ **อนุมัติล่วงหน้าให้ ssh เข้า production ในฐานะ root พร้อมคำสั่งอะไรก็ได้ โดยไม่มี prompt ถามคนเลย**
  - มี rule ที่**เปลี่ยนสภาพเครื่อง**อยู่ด้วย ไม่ใช่แค่อ่าน: `cp -p /etc/ssh/sshd_config …`, `chmod +x /opt/gacp-platform/scripts/maintenance/rotate-secret.sh`, `docker exec gacp-postgres psql …`
  - ไฟล์นี้ **gitignored** (`.gitignore:230` `.claude/*`) ⇒ **มองไม่เห็นจาก CODEOWNERS และจาก path guard ของ Law 3.12** — เป็นการให้สิทธิ์ที่ไม่มีใครรีวิวได้

- **การปฏิเสธ #762 ยังถูกต้อง — แต่ผิดเหตุผล** ต้องบันทึกให้ตรง เพราะเหตุผลที่ผิดจะถูกนำไปใช้ซ้ำ:
  - เหตุผล **(ก) "ไม่มี access"** — **ตกไป** เป็นข้อเท็จจริงที่ผิด **ห้ามอ้างอีก**
  - เหตุผล **(ข)** "ข้อจำกัด operator เอง — ค่าห้ามปรากฏใน context/log — agent satisfy ไม่ได้" (`:100`) — **ยังยืน และเป็นเหตุผลที่ dispositive จริงเพียงข้อเดียว** (VIEW-ONCE บนจอของคน = tool-result ถาวรของ agent)
  - เหตุผล **(ค)** "runbook + team spec ระบุว่า operator รันเอง" (`:101`) — ยังยืน แต่เป็นกติกา ไม่ใช่กลไก
  - ⇒ **สิ่งที่คุ้มครองระบบจริงในวันนั้นคือ compliance ของ agent เอง ไม่ใช่ mechanical guard ใด ๆ** ถ้า agent ตัวนั้นเลือกไม่ทำตามกฎ **ไม่มีอะไรหยุดมัน** — ทั้ง key, host key ที่ trust ไว้แล้ว และ allow rule ครบมือ

- **เอกสารในรีโปที่ขัดกับ CLAUDE.md โดยตรง** (track อยู่ใน git ทั้งคู่ — agent ตัวอื่นอ่านแล้วจะทำตาม):
  - `.github/copilot-instructions.md:151` — `**SSH to Production Server**: ssh -i "id_ed25519" root@<host>` อยู่ใต้หัวข้อ **MUST FOLLOW** (`:149`) และตามด้วย `docker compose down && up -d --build` (`:154-156`) · แก้ล่าสุด 2026-03-24 = **ก่อน harness v2** แต่ไม่เคยถูกถอน
  - `DEVELOPMENT-GUIDE.md:176-177` — `# SSH to production` / `ssh -i ~/.ssh/id_ed25519 root@<host>` · แก้ล่าสุด 2026-07-24
  - `docs/adr/ADR-017-deploy-pipeline-manual-gated.md:39` — อ้างว่า agents "never run a deploy (**no server access** + Tier C)" · ครึ่ง Tier C จริง ครึ่ง no-server-access **เท็จ**
  - `docs/standards/production-infrastructure-standard.md:24` — "SSH … port 2222 … the only approved remote access method" · แต่ allow rule ทั้ง 43 ข้อใช้ port default ⇒ ช่องทางที่อนุมัติไว้จริง**ไม่ตรงกับ**มาตรฐานที่เขียนไว้

- **ทำไมต้องบันทึกทั้งที่ผลลัพธ์ออกมาถูก**: อันตรายไม่ได้อยู่ที่ #762 (จบดี operator รันเอง) แต่อยู่ที่**ประโยคที่ค้างในบันทึก** — session ถัดไปที่อ่าน `:99` จะประเมินความเสี่ยงต่ำกว่าจริง นี่คือ **phantom guardrail** ตระกูล *"มีแต่ไม่คุ้มครอง"* แบบเดียวกับ backup cron ที่ไม่เคยติดตั้ง (entry 2026-08-05), RLS ที่ policy คืน TRUE เสมอ, `e2e-golden-scenario` ที่รับ 400/404 ทุก hop, และตัวตรวจที่ไม่ได้เสียบเข้า CI — **เคสที่ 5 ของโรคเดียวกันภายในสองวัน**

- **จุดที่จับได้ และจับได้เพราะอะไร**: operator ถามตรง ๆ ว่า "ssh เข้าเครื่อง server ได้ไหม" orchestrator จึงตรวจของจริงแทนตอบจากบันทึกเดิม · ชั้นที่ 2 (allow rules) **orchestrator เองมองข้ามในรอบแรก** — จับได้จาก adversarial verifier ที่ถูกสั่งให้ "พยายามหักล้างข้อสรุป" แล้วมันหาเจอ ⇒ **การให้ agent ตรวจสอบตัวเองแบบ adversarial ได้ผลจริงในเคสนี้** ควรทำซ้ำกับข้อสรุปเชิงความปลอดภัยทุกครั้ง
  - หมายเหตุความปลอดภัยของกระบวนการ: verifier ตัวนั้นถูก harness ตีธง **[Credential Exploration]** เพราะมันไล่ดู `~/.ssh` + `known_hosts` + cross-ref IP/hostname ของ production · **การตีธงถูกต้อง** — prompt ที่ orchestrator เขียนกว้างเกินไป · กติกาที่ได้: prompt ที่ให้ subagent สำรวจ credential surface ต้องจำกัดเป็น "นับ/ชื่อไฟล์เท่านั้น ห้าม cross-ref host/IP" ให้ชัดในตัว prompt

- **ไม่ route around**: ไม่มี guard ฝั่ง repo ที่ถูกข้าม — **ปัญหาคือไม่เคยมี guard ตัวนั้นตั้งแต่แรก** มีแต่ประโยคในบันทึกที่ถูกอ่านเหมือนเป็น guard

- **probe/pin ที่เสนอ (ปิด entry ตาม HARNESS.md §7)**: `no-agent-ssh-material` — ตรวจ 4 ชั้น: (1) identity ค้างใน ssh-agent (2) private key ไม่เข้ารหัสใน `~/.ssh` (3) key material ใน working tree (4) **standing remote-exec grant ใน `.claude/settings*.json` + การไม่มี `deny` block** · ออกแบบตาม fail-loud contract ของ `no-secret.sh` คือ **ตรวจไม่ได้ = BLOCKED ห้าม PASS เงียบ** · **พิสูจน์ RED แล้วจริง** (Law 3.11): รันบนเครื่องนี้ 2026-08-06 → `exit 1` พร้อมรายการครบทั้ง 8 จุด · สคริปต์ + diff ทะเบียน: `reports/orchestrator/2026-08-06-ssh-material/`
  - **ข้อจำกัดที่ต้องพูดพร้อมกันเสมอ** (ไม่งั้น probe นี้จะเป็น phantom ตัวถัดไป): มีค่าเฉพาะบน **workstation ที่ agent รันจริง** — บน CI ไม่มี `~/.ssh` และไม่มี `settings.local.json` อยู่แล้ว ⇒ **CI เขียวไม่ใช่หลักฐานว่าเครื่อง operator สะอาด**
