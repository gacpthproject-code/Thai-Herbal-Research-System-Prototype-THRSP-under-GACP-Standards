# GACP Certification Platform

> **พัฒนาโดย บริษัท พรีเมียร์ ไพร์ม จำกัด (Premier Prime Co., Ltd.) · สงวนสิทธิทั้งปวงที่มีอยู่หรืออาจมี · ข้อมูลความลับทางการค้า**
> ห้ามทำซ้ำ ดัดแปลง เผยแพร่ นำเสนอ หรือนำไปใช้ โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษรจากผู้พัฒนา หรือมีสิทธิตามกฎหมายหรือตามสัญญา การส่งมอบหรือการเข้าถึงไม่ถือเป็นการโอนสิทธิหรืออนุญาต
> *Developed by Premier Prime Co., Ltd. All rights reserved. Confidential. See [LICENSE](LICENSE).*

**Status:** อยู่ระหว่างการพัฒนาและทดสอบ ยังไม่เปิดให้บริการจริง (pre-production, v3.0)
**Stack:** Next.js, Node.js 24 (Express), PostgreSQL, Prisma, Docker, Nginx · package manager: pnpm

A comprehensive digital platform for **Good Agricultural and Collection Practices (GACP)** certification, enabling Applicants to apply for certification and officers to trace compliance from seed to sale.

---

## Quick Start

### Option A: Docker (Recommended)
The easiest way to run the full stack (Frontend + Backend + DB + Nginx).

```bash
docker-compose up -d --build
```
*   **Web App:** [http://localhost](http://localhost) (via Nginx)
*   **API:** [http://localhost/api](http://localhost/api)
*   **Database:** Port `5432` · ค่าเชื่อมต่ออ่านจาก environment (`DB_USER` / `DB_PASSWORD` / `DB_NAME`) ไม่มีรหัสผ่านใน README

### Option B: Local Development
Run services individually for active development.

**1. Database**
```bash
docker-compose up -d postgres redis
```

**2. Install (ครั้งเดียว ที่ราก repo)**
```bash
pnpm install --frozen-lockfile
```

**3. Backend (Port 8000)**
```bash
pnpm --filter gacp-backend dev
```

**4. Frontend (Port 3000)**
```bash
pnpm --filter web-app dev
```

---

## Testing & Verification

We have automated scripts to verify the core flows:

```bash
# ERP Regression Gate (Full Loop Verification)
node scripts/test/run-regression-gate.js

# Auth Hardening + Security Conventions Gate
npm run gate:auth-hardening

# Full Journey Matrix (lint + test + e2e + uat)
npm run test:journey:full
```

---

## Operations

### Backups
Automated backup script uses `pg_dump` from within the container.
```bash
# Creates .sql file in /backups folder
node scripts/db/backup-db.js
```

### Test accounts (Development)
บัญชีทดสอบสร้างด้วย `scripts/db/seed-test-health-users.js` บนฐานข้อมูล local เท่านั้น · README ไม่เก็บรหัสผ่าน

---

## Documentation Resources
*   **[Repository Naming Standard](docs/standards/repository-naming-and-structure.md)** - file/folder/path naming and safe refactor rules.
*   **[Scripts Handbook](scripts/readme.md)** - canonical scripts for regression/UAT/release gates.
*   **[สถาปัตยกรรมระบบ](docs/architecture/README.md)** - ตรวจกับโค้ดด้วย `node scripts/docs/check-architecture.js`
*   **[Operations runbooks](docs/operations/runbooks/)** - deploy and data-repair procedures (operator-run).

---

## สถานะ / Status

ระบบสำหรับการรับรองมาตรฐาน GACP ของสมุนไพรไทย อยู่ระหว่างการพัฒนาและทดสอบ ยังไม่เปิดให้บริการจริง ข้อมูลในระบบขณะนี้ใช้เพื่อการทดสอบเท่านั้น

## สิทธิและความลับ / Rights and confidentiality

พัฒนาโดย บริษัท พรีเมียร์ ไพร์ม จำกัด ผู้พัฒนาสงวนสิทธิทั้งปวงที่มีอยู่หรืออาจมีในงานนี้ตามกฎหมายและตามสัญญา
สิทธิในงานนี้โอนหรืออนุญาตได้ด้วยหนังสือที่ผู้พัฒนาลงนามเท่านั้น การส่งมอบ การเปิดใช้งานระบบ หรือการเข้าถึง repository
ไม่ถือเป็นการโอนสิทธิหรืออนุญาตโดยปริยาย ข้อมูลใน repository นี้เป็นความลับทางการค้า
ส่วนประกอบของบุคคลที่สามเป็นไปตามสัญญาอนุญาตของเจ้าของแต่ละราย

Developed by Premier Prime Co., Ltd. All rights reserved; confidential. See [LICENSE](LICENSE) for the full notice.
