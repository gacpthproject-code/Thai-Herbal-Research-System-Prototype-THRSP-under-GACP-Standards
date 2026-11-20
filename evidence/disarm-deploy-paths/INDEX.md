# evidence — ปิดสองเส้นทางที่ยิงใส่ staging ได้เอง

Status: `PENDING` — หลักฐานที่รันได้บนเครื่องนี้ครบแล้ว แต่ **ยังไม่ผ่าน gate**
tier ที่เครื่องตัดสิน: **`TIER=C`** ⇒ ตาม `CLAUDE.md` L5 **operator merge เท่านั้น**

Spec/เหตุผลเต็ม: `reports/risk-assessment/2026-08-13.md` §4 R1 และ R2
⚠️ ไฟล์นั้นอยู่บน branch `reports/ops-review-2026-08-13` **ยังไม่ merge** — อ่านจาก branch นี้จะไม่เจอ
ข้อเท็จจริงทั้งหมดที่ใบนี้พึ่งพาถูกเขียนซ้ำไว้ในคอมเมนต์ของไฟล์ที่แก้แล้ว จึงรีวิวได้โดยไม่ต้องรออีกใบ

## รอบที่ 2 — สิ่งที่ adversarial review จับได้ และแก้แล้ว

agent ที่ไม่เคยเห็นงานนี้ตรวจแล้วตัดสิน **`SERIOUS_PROBLEMS`** · ที่แก้ในรอบนี้:

| ปัญหา | แก้อย่างไร |
|---|---|
| **guard ทำให้คำสั่งกู้ภัยพิบัติของอีก runbook พัง** — `rotate-database-credential.md` §8.4 สั่ง `sudo bash … --restore` ไม่ตั้ง `DB_NAME` (และ `sudo` ตัด environment อยู่แล้ว) ⇒ หลังใส่ guard คำสั่งนั้น exit 1 | แก้ runbook นั้นให้เป็น `sudo env DB_NAME=gacp_db bash …` ในคอมมิตเดียวกัน |
| ข้อความของ guard **แนะนำ `gacp_staging` ตายตัว** ทั้งที่บริบท DR ต้องการ `gacp_db` | เลิกแนะนำชื่อ · บอกทั้งสองตัวพร้อมว่าเล่มไหนใช้อันไหน + คำสั่ง `psql -lqt` ให้ดูของจริง |
| ข้อความของ guard อ้าง **ไดเรกทอรีผิด** — บอกว่าดัมป์รายคืนอยู่ `/opt/gacp-platform/backups` ทั้งที่สคริปต์นี้เขียนลง `/var/backups/gacp/scheduled/daily` | เปลี่ยนไปอธิบายด้วย**รูปแบบไฟล์** (`*.sql.gz` vs `*.dump`) แทนไดเรกทอรี |
| คำสั่ง rollback ที่เสนอ **ขาด `-v ON_ERROR_STOP=1`** ⇒ psql จะ rollback ทั้งหมดแล้ว **exit 0** — ความพลาดแบบเดียวกับที่ใบนี้อ้างว่ากำลังปิด | เพิ่มทั้งใน runbook และใน `pg-backup.sh` เอง |
| runbook ไม่บอกว่าไฟล์ pre-deploy dump อยู่ที่ไหน | เพิ่ม `ls -lt /var/backups/gacp-staging/staging-pre-deploy-*.sql.gz` เป็นขั้นแรก |
| citation `pg-backup.sh:33` ผิดตั้งแต่คอมมิตที่สร้างมันเอง (การแทรกบรรทัดดันเป็น :36) | เขียนเป็น "33 ก่อนแก้ · 36 หลังแก้" |

## ไฟล์

| ไฟล์ | คือ |
|---|---|
| `red-before-fix.txt` | RED — รันกับ **โค้ดก่อนแก้จริง** (`git show HEAD~1:`) แสดงว่าคำสั่งใน runbook เขียนลงฐานผิด และไม่มี guard ขวางเลย |
| `green-after-fix.txt` | GREEN — guard ใหม่บล็อกเคสนั้น · `bash -n` ผ่าน · trigger ของ `production.yml` ก่อน/หลัง |

## ผล tier-check

```
  C  .github/workflows/ci.yml  (infra)
  C  .github/workflows/production.yml  (infra)
  A  docs/operations/runbooks/deploy-staging-manual.md  (docs)
  C  scripts/backup/pg-backup.sh  (deploy)
TIER=C
```

## ความซื่อสัตย์ของลำดับ RED-first

**ผมแก้โค้ดก่อนแล้วค่อยทำ RED — ผิดลำดับที่ `CLAUDE.md` §5 ชั้น C บังคับ**

RED ใน `red-before-fix.txt` จึงเป็นการ**ย้อนกลับไปรันกับ commit ก่อนหน้าจริง**
(`git show HEAD~1:scripts/backup/pg-backup.sh`) ไม่ใช่ RED ที่เขียนไว้ล่วงหน้า
มันพิสูจน์ว่าบั๊กมีจริงและ guard แก้ได้จริง แต่**ไม่ได้พิสูจน์ว่าผมทำตามลำดับ**
บันทึกไว้ให้ตรง ไม่กลบ

## สิ่งที่ยังไม่ได้ทำ — ต้องทำก่อน merge

| ข้อ | เหตุผลที่ยังไม่ได้ทำ |
|---|---|
| `bash scripts/ci/local-gate.sh` | `node` ไม่มีบนเครื่องนี้ — probe ทั้ง 4 ตัวเป็นสคริปต์ node · **เซิร์ฟเวอร์มี node v22 รันได้ที่นั่น** |
| unit suite | เหมือนกัน |
| ทดสอบ guard กับ `pg-backup.sh` ของจริงบนเครื่อง | ต้องรันบนเซิร์ฟเวอร์ · **ห้ามรัน `--restore` จริงเพื่อทดสอบ** — ทดสอบได้แค่ว่ามันปฏิเสธเมื่อไม่ตั้ง `DB_NAME` |
| ตรวจว่า `ENABLE_PRODUCTION_DEPLOY` มีค่าอะไร | `gh` ไม่มีบนเครื่องนี้ ⇒ **ยังไม่รู้ว่า trigger ที่ถอดออกไปเคยยิงถึง job จริงหรือไม่** · การถอด trigger ถูกต้องไม่ว่าค่าจะเป็นอะไร แต่ระดับความรุนแรงของ R1 ยังไม่ยืนยัน |

## คำสั่งตรวจบนเซิร์ฟเวอร์ (อ่านอย่างเดียว ยกเว้นข้อ 2 ที่ clone ใหม่)

```bash
# 1) guard ปฏิเสธจริงไหม — ไม่แตะฐานข้อมูล เพราะ guard คั่นก่อนถึง psql
cd ~/gate-workspace 2>/dev/null || git clone --branch fix/disarm-accidental-deploy-and-restore \
  https://github.com/jonmaxmore/GACP-Certification-Application.git ~/gate-workspace
cd ~/gate-workspace
echo "" | gzip > /tmp/fake.sql.gz
bash scripts/backup/pg-backup.sh --restore /tmp/fake.sql.gz ; echo "exit=$?"
# คาดหวัง: ข้อความปฏิเสธ + exit=1  (ห้ามเห็นคำว่า Restoring...)

# 2) gate 4 ตัว (เครื่องนี้มี node)
bash scripts/ci/local-gate.sh
```
