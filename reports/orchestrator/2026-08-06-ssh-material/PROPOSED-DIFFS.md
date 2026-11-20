# PROPOSED DIFFS — `no-agent-ssh-material` + การถอนสิทธิ์ที่ค้างอยู่

> **agent เสนอ · operator เขียน/merge เอง** (Law 3.12 — `CLAUDE.md`, `HARNESS.md`, `scripts/probes/*`, `scripts/check-done.sh` = operator-owned)
> ทุก diff ด้านล่างผมยังไม่ได้ทำลงไฟล์จริง — มีแค่ในไฟล์นี้
> IP/host เขียนเป็น `<PROD-IP>` โดยตั้งใจ ห้ามเติมเลขจริงลงไฟล์ที่ track ใน git

---

## 0. ทำก่อนอย่างอื่น — ถอนสิทธิ์ที่ยังเปิดอยู่ (ไม่ใช่ diff ใน git, เป็นไฟล์ local)

`.claude/settings.local.json` ตอนนี้: **allow 267 ข้อ · ไม่มี `deny` · ไม่มี `ask`** ในนั้นมี remote-exec 45 ข้อ (ssh 43 / scp 2) และ 25 ข้อเป็น prefix-wildcard — ข้อที่กว้างสุดอนุญาต root shell บน production พร้อมคำสั่งอะไรก็ได้

**ทางเลือก A (แนะนำ — เด็ดขาดที่สุด)** ลบ 45 ข้อนั้นทิ้ง แล้วเพิ่มบล็อก `deny` ดักไว้ถาวร:

```jsonc
{
  "permissions": {
    "deny": [
      "Bash(ssh:*)",
      "Bash(scp:*)",
      "Bash(sftp:*)",
      "Bash(rsync:*)",
      "Bash(plink:*)",
      "Bash(pscp:*)",
      "Bash(doctl:*)"
    ],
    "allow": [ /* ... เดิม ลบ 45 ข้อ ssh/scp ออก ... */ ]
  }
}
```

**ทางเลือก B** ถ้าต้องคง read-only diagnostic บางตัวไว้: ลบเฉพาะ **25 prefix-wildcard** (โดยเฉพาะ `Bash(ssh -o ConnectTimeout=10 root@<PROD-IP> ' *)`) แล้วคง 18 ข้อที่เป็น exact-string ล้วน — แต่ยัง**ควรมี `deny` wildcard** ด้านบนอยู่ดี เพราะ deny ชนะ allow

> ⚠️ **ผมไม่ยืนยัน syntax ของ deny rule ให้ 100%** — รูปแบบ `Bash(cmd:*)` เป็นแบบที่พบทั่วไป แต่ควรทดสอบจริงหนึ่งครั้ง (สั่ง `ssh` ดัมมี่แล้วดูว่าโดนบล็อกไหม) ก่อนถือว่าคุ้มครองแล้ว — **อย่าเชื่อว่ามันทำงานเพราะเขียนลงไฟล์แล้ว** นั่นคือวิธีที่ phantom guardrail เกิด

**ตรวจซ้ำหลังแก้**: `bash scripts/probes/no-agent-ssh-material.sh` ต้องได้ `PASS`

---

## 1. probe ใหม่ — `scripts/probes/no-agent-ssh-material.sh`

ไฟล์เต็มอยู่ที่ `reports/orchestrator/2026-08-06-ssh-material/no-agent-ssh-material.sh` — คัดลอกไปวางที่ `scripts/probes/` แล้ว `chmod +x`

**สถานะการทดสอบ (Law 3.11 RED-first)**: รันจริงบนเครื่องนี้ 2026-08-06 ผ่าน test-double ของ `_lib.sh` ใน scratchpad (ไม่แตะ `scripts/probes/`) → **`exit 1` แดงจริง** พร้อมรายการ 8 จุด · `bash -n` ผ่าน

## 2. allowlist ประกอบ — `scripts/probes/no-agent-ssh-material-allowlist.txt`

```
# no-agent-ssh-material — path substring ที่ยกเว้นจากการสแกน key material ใน working tree
# หนึ่งบรรทัด = หนึ่ง substring · '#' = comment
# ใส่เฉพาะไฟล์ที่ยืนยันแล้วว่าเป็น fixture/ตัวอย่างในเอกสาร ไม่ใช่ key จริง
# (ปัจจุบัน: ว่าง — key 3 ใบที่ probe เจอเป็น key จริง ไม่ควร allowlist)
```

## 3. `scripts/check-done.sh` — เสียบเข้า DEFAULT

```diff
@@ -12,1 +12,1 @@
-DEFAULT="suite-green no-skip no-secret ratchet stripe-sdk-isolated webhook-idempotent settle-webhook-only holiday-single-source stripe-keys-ready drain-complete money-equation crawler-clean evidence-complete report-integrity"
+DEFAULT="suite-green no-skip no-secret no-agent-ssh-material ratchet stripe-sdk-isolated webhook-idempotent settle-webhook-only holiday-single-source stripe-keys-ready drain-complete money-equation crawler-clean evidence-complete report-integrity"
```

## 4. `HARNESS.md` §4.1 — เพิ่มแถวในตาราง Integrity

```diff
@@ §4.1 Integrity (ทุก iteration) @@
 | `no-secret` | gitleaks + grep `sk_\|whsec_\|pk_live` | 0 hit |
+| `no-agent-ssh-material` | uid ที่ agent รันอยู่ **เอื้อมไม่ถึง** เส้นทางเข้า server: ไม่มี key ไม่เข้ารหัสใน `~/.ssh` · ไม่มี identity ค้างใน ssh-agent · ไม่มี key material ใน working tree · **ไม่มี standing remote-exec grant (`Bash(ssh/scp/rsync …@host)`) ใน `.claude/settings*.json`** | ครบทุกข้อ — ตรวจไม่ได้ = BLOCKED ห้าม PASS เงียบ · **workstation-scoped: CI เขียวไม่ใช่หลักฐาน** |
 | `report-integrity` | parse report ล่าสุด | … |
```

## 5. `CLAUDE.md` §3 — เพิ่ม Law 3.13

```diff
@@ §3 LAWS @@
 | 3.12 | agent แก้ CLAUDE.md / HARNESS.md / probe files ไม่ได้ — เสนอ diff เท่านั้น | CODEOWNERS + CI path guard |
+| 3.13 | NO AGENT→SERVER PATH — เครื่องที่ agent รันต้องไม่มีทางเข้า server จริง: ห้ามมี private key ที่ใช้งานได้ในมือ uid นั้น และ **ห้ามมี standing permission grant สำหรับ ssh/scp/rsync ไปยัง host จริง** · การ "อนุมัติล่วงหน้า" ใน `.claude/settings*.json` ถือเป็นการให้สิทธิ์ระดับเดียวกับมอบ key — และเพราะไฟล์นั้น gitignored จึงอยู่นอกสายตา CODEOWNERS | probe `no-agent-ssh-material` |
```

**เหตุผลที่ต้องเป็นกฎแยก ไม่ใช่แค่ต่อท้าย 3.3**: 3.3 คุมความลับ*ในโค้ด/log/report* · ข้อนี้คุม*ความสามารถเข้าถึง infrastructure* ซึ่งละเมิดได้โดยไม่มี secret รั่วสักตัว (allow rule ไม่ใช่ secret แต่ให้ผลเท่าการมี key)

## 6. `AUDIT_LEDGER.md` — เพิ่ม finding

```diff
@@ ## Findings (open) @@
+| L-007 | **P0** | agent→server path เปิดอยู่จริงและไม่มี guard เชิงกล: `~/.ssh/gacp_deploy` + `~/.ssh/id_ed25519` = private key ไม่มี passphrase อ่านได้ด้วย uid เดียวกับที่ agent รัน · `.claude/settings.local.json` allow 267 ข้อ **ไม่มี deny/ask** ในนั้น remote-exec 45 ข้อ (ssh 43 / scp 2) และ 25 ข้อเป็น prefix-wildcard — ข้อที่กว้างสุดอนุญาต root shell บน production พร้อมคำสั่งอะไรก็ได้ · `HARNESS_LOG.md:99` บันทึกตรงข้ามว่า "ไม่มี SSH/exec path" | probe `no-agent-ssh-material` (RED 2026-08-06, exit 1, 8 จุด) · `reports/orchestrator/2026-08-06-ssh-material/` | (ก) ถอน grant + ใส่ deny (ข) ย้าย/ใส่ passphrase ให้ key (ค) merge probe เข้า DEFAULT (ง) append คำแก้ HARNESS_LOG | operator |
+| L-008 | P1 | เอกสารที่ track ใน git **สั่งให้ agent ssh เข้า production เป็น root**: `.github/copilot-instructions.md:151` (ใต้หัวข้อ MUST FOLLOW `:149`, ตามด้วย `docker compose down && up -d --build` `:154-156`, แก้ล่าสุด 2026-03-24 = ก่อน harness v2) · `DEVELOPMENT-GUIDE.md:176-177` (แก้ล่าสุด 2026-07-24) — ขัด `CLAUDE.md` §3.1/§7 และ `HARNESS.md:32` โดยตรง | grep ทั้งสองไฟล์ | ถอนคำสั่งออก แล้วชี้ไปที่ช่องทางที่ถูก (operator กด `workflow_dispatch`) · ตรวจว่า agent อื่นเคยทำตามไปแล้วหรือยัง | S |
+| L-009 | P2 | claim "no server access" ที่พิสูจน์แล้วว่าเท็จ: `docs/adr/ADR-017-deploy-pipeline-manual-gated.md:39` · และช่องทางที่อนุมัติจริงไม่ตรงมาตรฐาน — `docs/standards/production-infrastructure-standard.md:24` ระบุ port 2222 เป็น "the only approved remote access method" แต่ allow rule ทั้ง 43 ข้อใช้ port default | grep ทั้งสองไฟล์ | แก้ถ้อยคำ ADR ให้เหลือเฉพาะ Tier C · ตัดสินว่ามาตรฐาน port 2222 ยังใช้อยู่จริงไหม | S |
```

## 7. หมายเหตุ private key 3 ใบใน working tree (จาก probe เดียวกัน)

`apps/backend/keys/private.pem` · `scripts/nginx/ssl/gacp.key` · `scripts/nginx/ssl/local/localhost.key`

**ตรวจแล้ว — ไม่ใช่การรั่วขึ้น git**: ทั้งสามไฟล์ `untracked`, `git log --all` = **0 commit** แตะ path เหล่านี้, ครอบด้วย `.gitignore:105 *.pem` / `:106 *.key` · ทั้งรีโปมีไฟล์ key/pem ที่ track อยู่ **0 ไฟล์** ⇒ **ไม่เข้าเงื่อนไข rotate ตาม `CLAUDE.md` §7**

ที่ยังเป็นประเด็น: ทั้งสามใบ **อ่านได้ด้วย uid ที่ agent รัน** · โดยเฉพาะ `apps/backend/keys/private.pem` ควรตรวจว่าเป็น signing key ของใบรับรองหรือไม่ (ผูกกับ GAP-3 / D5 signing fail-closed) — **ถ้าใช่ และเป็นใบเดียวกับที่ production ใช้ ระดับความเสี่ยงขึ้นเป็น P0 ทันที** ผมไม่ได้เปิดไฟล์เพื่อยืนยัน จึง**ไม่เคลม** — operator ตรวจเอง
