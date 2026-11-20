# หลักฐาน chore/staff-2fa-golive รอบ 2 (ชั้น C · คำสั่ง 89)

ฐานที่แตกกิ่ง: origin/main 4b549f17c · รอบ 1 จบที่ 9a6bd8727 · รอบ 2: 8e9ce7fd2 (RED) → a9a829cb7 (GREEN) → หน้าจอ 7 commit → c7e0cb456 คู่มือ → 103bf4bf3 deslop → a6c47e7bb → 88953b435 (no-comments)
ต้นไม้โค้ดตอนรันงานหนัก = 88953b435 · commit หลังจากนั้น (takeover 2026-10-20 21:20) แตะเฉพาะ `docs/runbooks/go-live-gate.md` ข้อ 6, `evidence/`, และ `HARNESS_LOG.md`

## สิ่งที่วัดแล้วใน session (ผลรันจริง นอก heavy.sh เพราะไม่แตะฐานข้อมูล)

| ไฟล์ | ว่าอะไร | ผล |
|---|---|---|
| `probes/unit-red-8e9ce7fd2.txt` | ชุดหน่วย/mock-prisma 10 ไฟล์ บนต้นไม้ที่มีเทสต์ใหม่แต่ยังไม่มีโค้ด | 19 ข้อแดงใน 6 ชุด (ตามสัญญาใหม่) · 2 ชุด Postgres จริงข้าม · 2 ชุดคุม (second-factor-doors · closing-review) ยังเขียว |
| `probes/unit-green-a9a829cb7.txt` | ชุดเดียวกันหลังสร้าง | 8 ชุด 97/97 · ซ้ำหลัง deslop 6 ชุด 64/64 |
| `probes/web-jest.txt` | เทสต์หน้าจอ 3 ชุดบน wt-2fa หลัง cherry-pick | 39/39 |
| `probes/error-codes-validate.txt` | `--markdown` แล้ว `--validate` (ตอน 88953b435) | 464/464 (เพิ่ม MFA_BACKUP_CODES_NOT_CONFIRMED) |
| `probes/eslint.txt` | eslint ไฟล์ backend ที่แก้ 14 ไฟล์ | 0 errors 0 warnings |
| `probes/ratchet-branch.txt` · `ratchet-main.txt` | ratchet.sh กิ่งเทียบ main (ตอน 88953b435) | เท่ากัน 26/33/93/0 PASS |
| `probes/tier-check.txt` | tier-check.sh (ตอน 88953b435) | TIER=C (auth-identity) |
| `probes/gitleaks-files.txt` · `gitleaks-probes.txt` | gitleaks ทีละไฟล์ ทุกไฟล์ที่แก้และทุกไฟล์หลักฐานของรอบนั้น | no leaks ทุกไฟล์ |
| `probes/fd9-probe.txt` | `harness/probe-fd9.sh`: บรรทัด serve() ของ job-round2.sh รันกับ `sleep` แทน node (การตกทอดของ fd เป็นสมบัติของบรรทัด shell ไม่ใช่ของโปรแกรม) | child ที่ `$!` ชี้คือคำสั่งเอง (comm=sleep ไม่ใช่ bash) · fd 9 ปิด (`closed`) · ตัวควบคุมที่ไม่มี `9>&-` ถือไฟล์ล็อก · SIGTERM จบทั้งคู่ |
| `probes/gitleaks-runs.txt` | `harness/collect-runs-round2.sh`: คัดลอกผลงานหนักเข้า `runs*/` ตัดเฟรม stack ปิดบังเลข 13 หลัก แล้ว gitleaks ทีละไฟล์ | 43 ไฟล์ no leaks · ไม่มีเลข 13 หลักเหลือ |
| `probes/ratchet-final.txt` · `tier-check-final.txt` · `error-codes-validate-final.txt` | รันซ้ำบนต้นไม้สุดท้ายก่อน push (takeover) | ดูในไฟล์ |

## งานหนัก (heavy.sh งานเดียว `harness/job-round2.sh` · Postgres 17 + Redis 7 ชั่วคราวบน loopback · ค่าลับในไฟล์ 0600 ไม่อยู่ใน argv)

`harness/job-round2.sh` ที่ commit = ไฟล์ที่รันจริง (`diff` กับ `/tmp/staff-2fa-golive/round2/job.sh` ว่าง วัด 2026-10-20 21:23) · worktree ชั่วคราว 3 ต้น (commit เทสต์ · หัวสำหรับ mutant · origin/main) ถูกลบตอนจบงาน · container `s2fa3-pg` `s2fa3-redis` ถูกลบ · ไม่มีโปรเซสถือ `/tmp/gacp-heavy.lock` หลังงานจบ (วัด 21:23)

### รอบที่ใช้ได้: `runs/` (19:42:39-19:44:37 บน 88953b435)

| ไฟล์ | ว่าอะไร | ผล |
|---|---|---|
| `runs/job.txt` | ลำดับทุกขั้น + PID/comm/จำนวน listener ของ server ทั้งสองตัว | ครบทุกขั้น · server ทั้งสองต้อง SIGKILL ภายใน 5 วินาที (backend จับ SIGTERM เอง) · พอร์ตว่าง (listeners=0) หลังหยุดทั้งสองครั้ง |
| `runs/migrate.txt` | `prisma migrate deploy` บนฐานชั่วคราว | exit 0 |
| `runs/red-8e9ce7fd2-rebind.txt` | ชุด ก บน commit เทสต์ (ยังไม่มีโค้ด) | 3/3 แดง: `/setup` ไม่คืน backupCodes (undefined) · รหัสสำรองได้ 401 แทน 200 · การย้ายไม่เกิด |
| `runs/red-8e9ce7fd2-reset.txt` | ชุด ข บน commit เทสต์ | 10/10 แดง: `Cannot find module .../staff-2fa-emergency-reset.js` · ทุกกรณีปฏิเสธได้ exit 1 แทน 2 |
| `runs/green-head-rebind.txt` | ชุด ก บนหัว (ช่องพัก in-memory) | 3/3 ผ่าน |
| `runs/green-head-rebind-real-redis.txt` | ชุด ก บนหัว ช่องพัก Redis จริง (`GACP_TEST_REDIS_URL`) | 3/3 ผ่าน |
| `runs/green-head-reset.txt` | ชุด ข บนหัว | 10/10 ผ่าน |
| `runs/green-head-doors.txt` | ชุดประตูของรอบ 1 บนหัว | 25/25 ผ่าน |
| `runs/green-head-units.txt` | 8 ชุดหน่วย/mock บนหัว | 98/98 ผ่าน |
| `runs/mutant-M4-script-ignores-unused-codes.*` | สคริปต์ ข ไม่สนรหัสสำรองที่เหลือ | 1/10 แดง: "ยังมีรหัสสำรอง" ได้ exit 0 แทน 2 |
| `runs/mutant-M5-script-touches-another-column.*` | สคริปต์ ข แตะ firstName ด้วย | 1/10 แดง: คอลัมน์อื่นเปลี่ยน |
| `runs/mutant-M6-verify-setup-skips-confirmation.*` | verify-setup ไม่บังคับ backupCodesSaved | 2/3 แดง: 200 แทน 400 |
| `runs/mutant-M7-setup-keeps-used-backup-code.*` | /setup ไม่ทิ้งรหัสสำรองที่ใช้แล้ว | 2/3 แดง: รหัสเดิมใช้ซ้ำได้ |
| `runs/mutant-M8-move-drops-audit-row.*` | การย้ายไม่เขียนแถว audit | 1/3 แดง: แถว audit = null |
| `runs/mutant-M9-script-ignores-side-rule.*` | สคริปต์ ข ไม่ตรวจฝั่ง (คำสั่ง 13) | 3/10 แดง: ผู้ขอที่ไม่ใช่ผู้ดูแล/ต่างฝั่ง/ต่างหน่วยงานล้างได้ และแถว audit เกิด |
| `runs/doors-base-main-4b549f17c.txt` | ชุดประตูบน origin/main (คัดลอกเทสต์ไป) | 25/25 เขียว ตามคาด: กิ่งที่รอบ 1 ลบเป็นโค้ดตาย RED ของประตูจึงแสดงด้วย M1-M3 |
| `runs/mutant-M1-provider-door-ignores-flag.*` | ประตูเจ้าหน้าที่ไม่สนธง | 9/25 แดง: 8 บทบาทได้ SESSION แทน SETUP_TICKET + ตั๋วเปิดประตูอื่นได้ |
| `runs/mutant-M2-health-door-no-portal-check.*` | ประตูผู้ยื่นถอด expectedPortal | 9/25 แดง: 8 บทบาทได้ SESSION แทน 403 AUTH_ROUTE_MISMATCH และธงปิดก็ไม่ปฏิเสธ |
| `runs/mutant-M3-thaid-links-staff.*` | ThaID รับบทบาทเจ้าหน้าที่ | 2/25 แดง: SESSION แทน 403 AUTH_AUTOPROVISION_ROLE_FORBIDDEN |
| `runs/seed.txt` | seed 10 บัญชี 2 หน่วยงาน (QA_ID ปิดบังตามรูปคำสั่ง 10) | seeded 10 accounts in 2 organizations |
| `runs/roster.txt` | ทะเบียนรายชื่อบน seed | 9 แถวเจ้าหน้าที่ ผู้ยื่นไม่ติดมา · สรุป ใช้งานอยู่ 8 ลงทะเบียนแล้ว 3 ยังไม่ 5 ปิดใช้งาน 1 · วิธี EMAIL ที่ปลดนับเป็น "ไม่ใช่" · อีเมลปิดบัง ไม่มีเลขบัตร |
| `runs/qa-script-flag-on.txt` · `serve-flag-on.log` | สคริปต์ QA ยิง server ธงเปิด (pid 2412822 comm=node) | ผ่าน exit 0 · ล็อก server: "MFA setup required for: 7-XXXX-XXXX-X-9821" |
| `runs/qa-script-flag-off.txt` · `serve-flag-off.log` | สคริปต์ QA ยิง server ธงปิด (pid 2413007 comm=node เริ่มหลัง listeners=0) | ไม่ผ่าน exit 1 · ล็อก server: "Provider login: test-mfa-check" = เข้าได้ทันที ตามพฤติกรรมเดิม |

เลข 13 หลักในสำเนาทุกไฟล์ถูกปิดบัง: QA_ID ของ seed (เลขสุ่มของฐานชั่วคราว ผ่าน checksum จึงดูเหมือนจริง) และ epoch ms ใน `logId` ของแถว audit (`LOG-<epoch-ms>-…`)

### รอบที่ตัดทิ้ง (เก็บเฉพาะสรุป ไม่นับผลใด)

- `runs-void-1/` (19:22-19:32 บน a6c47e7bb): พอร์ต 55492 ที่ตั้งตายตัวชนกับ container ของงานอื่น (`Bind for 127.0.0.1:55492 failed`) Postgres ไม่ขึ้น → migrate "provide valid database credentials" → ทุกชุด Postgres จริงรายงาน skipped แต่ jest exit 0 (describeIfTestDatabase) เหลือชุดหน่วย 97/97 ที่ไม่แตะฐานข้อมูล → seed ล้ม QA_ID ว่าง → สคริปต์ QA exit 3 "ไฟล์บัญชีต้องมี 2 บรรทัด" → server ธงเปิดไม่ตายด้วย SIGTERM งานค้างที่ `wait` จน worker ส่ง TERM ให้งานและ KILL ให้ server (heavy.out: Terminated) trap เก็บกวาดครบ
- `runs-void-2/` (19:38 บน 88953b435): ตัวตรวจ migrate อ่าน `tail -2` ซึ่งเป็นกล่องแจ้งอัปเดต prisma (`npm i @prisma/client@latest`) ไม่ใช่บรรทัดผล จึงหยุดงานก่อนรันเทสต์ใด
- harness ที่แก้ระหว่างสามรอบ (ทั้งหมดอยู่ใน `harness/job-round2.sh` ที่ commit): docker เลือกพอร์ต loopback เอง · หยุดเมื่อ container ไม่ขึ้น / migrate exit ≠ 0 / seed ไม่ได้บัญชี QA · ป้าย SKIPPED-ONLY เมื่อชุดไม่มีข้อผ่านหรือล้ม · stop_server ส่ง TERM แล้ว KILL ภายใน 5 วินาที แล้วรอพอร์ตว่าง

### relay ของ coordinator (ข้อบกพร่องของ harness รอบ 1) ตรวจทีละข้อ

1. job.sh รอบ 1 ฆ่า subshell ไม่ใช่ node: server ธงปิดตายด้วย EADDRINUSE ผล "qa flag off" ของรอบ 1 (`/tmp/staff-2fa-golive/logs/`, 18:48-18:49) จึงวัดบน server ธงเปิด = ใช้ไม่ได้ ไม่ commit · job รอบ 2 เริ่ม server ด้วย `( exec env … node … 9>&- ) &` → `runs/job.txt` บันทึก `comm=node` ทั้งสองครั้ง และ QA ธงปิดได้ "ไม่ผ่าน" บน server ตัวใหม่
2. fd 9 ของ heavy.sh ตกทอดไป node ที่ค้าง (ล็อกเลนทั้งหมด 19:05): `9>&-` ปิดให้ child → `probes/fd9-probe.txt` · ไม่มีโปรเซสถือ `/tmp/gacp-heavy.lock` หลังงานรอบ 2 (วัด 21:23)
3. `docs/runbooks/go-live-gate.md` ข้อ 6 ชี้หน้าผิด: รอบ 2 ชี้ `app/(marketing)/privacy-policy/page.tsx` แล้ว · takeover แก้ต่อ: เลขบรรทัด 159 กลายเป็น 151 ที่ 74e2c9726 และ `app/privacy/page.tsx` กลายเป็น redirect บนกิ่งนั้น จึงชี้ด้วยข้อความของประโยค + จุดปัก + บรรทัดบน main (147 ที่ 1b785c48c) แทนเลขบรรทัดของกิ่งที่ยังไม่ merge
4. production compose ค่าเริ่มต้น false และวันขึ้นระบบตั้ง true: `docker-compose.production.yml:122` `${REQUIRE_MFA_FOR_PRIVILEGED:-false}` อยู่บน main อยู่แล้ว (กิ่งนี้ไม่แตะ) และหัวไฟล์สั่ง `--env-file .env.production` · staging บรรทัด 124 กิ่งนี้เปลี่ยนจาก `false` ตายตัวเป็น `${…:-false}` (รอบ 1) · `docker-compose.bluegreen.yml:61` ค่าเริ่มต้น false เหมือนกัน · `docker-compose.preview.yml:139` ยัง `false` ตายตัว ไม่แตะเพราะ preview ถูกถอดตามมติ 2026-09-05

## สิ่งที่ไม่ได้รันโดยตั้งใจ
- ไม่แตะ staging หรือ demo · ไม่รันสคริปต์ ข ที่ไหนนอกฐานข้อมูลชั่วคราว (รอคำว่า "deploy" และกฎ allow ชื่อสคริปต์ตามคำสั่ง 76)
- ไม่เปิดดูหน้าจริงในเบราว์เซอร์: หน้าจอค้ำด้วย jest render เท่านั้น (chromium ของ playwright มีบนเครื่อง แต่ต้องยกทั้ง stack ขึ้น) เป็นงานรอบ QA/walk ก่อน merge ตาม CLAUDE.md ชั้น B/C
- ไม่รันงานหนักซ้ำใน takeover: รอบ 19:44 ครบทุกข้อของ brief (PID ของ server · RED/GREEN ทุกประตู · M1-M9 · ก และ ข · QA ธงเปิด/ปิด) การพิสูจน์ fd 9 ทำด้วย probe นอกเลนแทน
- full gate และการตรวจอิสระ (code + security, Claude คนละรุ่น คำสั่ง 77) เป็นของ coordinator
