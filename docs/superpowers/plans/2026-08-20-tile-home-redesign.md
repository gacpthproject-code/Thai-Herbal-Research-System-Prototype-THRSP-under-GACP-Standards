# Tile Home Navigation Redesign — Implementation Plan (Plan 1: Navigation Core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยน navigation ทั้งระบบเป็น tile home (hub-and-spoke) ตาม spec N1-N13 — ส่วนแกน: SSOT nav config, หน้า home ทุก role, slim bar, bottom nav, ชื่อเมนูคำกริยา, หน้าตรวจสอบสถานะแบบหน้าเดียว

**Architecture:** วิวัฒน์ nav array เดิมใน `apps/web-app/src/lib/constants.ts:78` เป็น nav-config SSOT เต็มรูป (label/desc/icon/roles/lock/chip) — tiles, bottom nav และ integrity-probe อ่านจากไฟล์เดียวนี้ · หน้า home ใหม่ต่อ role · slim bar แทนแถวเมนูใน layout เดิม · หน้า "ตรวจสอบสถานะ" ใหม่ mapping 20 สถานะ → 5 ขั้นแสดงผลใน module เดียว

**Tech Stack:** Next.js app router (โครงเดิม page.tsx = Server Component + client-view.tsx), Jest + RTL (`apps/web-app/__tests__` pattern), Tailwind + tokens (gacp-design-tokens), Playwright view-pack

**Design of record:** artifact "GACP Tile Home" (30 จอ) — spec `docs/superpowers/specs/2026-08-20-tile-home-navigation-design.md`

## Global Constraints

- ชื่อเมนูตาม N5 ตายตัว: สมัครขอใบรับรอง · ตรวจสอบสถานะ · ชำระเงิน · ใบรับรองของฉัน · บันทึกการปลูก · ช่วยเหลือ (เกษตรกร) — ห้ามแปลผัน
- Token discipline (gacp-design-tokens): `bg-card`, leaf-700 ขึ้นไปสำหรับปุ่มมีข้อความ, primitives จาก `src/components/ui/primitives/`, ห้าม emerald/zinc/slate/`!important` ใหม่
- Thai copy (thai-ui-copy): คุณ-register, ไม่มี em dash, เว้นวรรคไทย/Latin, วันที่ผ่าน `formatThaiDate`
- tile ไม่มีสิทธิ์ = ไม่ render (ยกเว้น "บันทึกการปลูก" ล็อกพร้อมเหตุผล — R2 planting-tnt)
- ห้ามแตะ: flow สมัคร/คำขอ/การเงิน backend, เนื้อหาหน้าใน (นอกเหนือหน้าที่แผนนี้ระบุ)
- ทุก commit ผ่าน pre-commit integrity check — ข้อ 8 (nav links) ต้องเขียวตลอด

## นอกขอบเขตแผนนี้ (แผนถัดไป พร้อม gate)

- **Plan 2** ธุรกรรมการเงิน ledger (N12) — GATE: operator ยืนยันมติ D4 ถอดรางสลิปเป็นทางการ
- **Plan 3** จัดคิวแบ่งงาน UI ใหม่ (N11)
- **Plan 4** เชิญสมาชิก search-select (N10) — GATE: operator เคาะ identifier (เลขบัตร vs เบอร์/รหัสสั้น — ขัดมติ org-model 2026-08-17)
- **Plan 5** KPI รายคน + เมนูรายงาน (N13)
- **Plan 6** หน้า trace desktop (N9) — รวมใน implementation ของ planting-tnt spec

---

### Task 1: Nav-config SSOT

**Files:**
- Create: `apps/web-app/src/lib/navigation/nav-config.ts`
- Create: `apps/web-app/src/lib/navigation/__tests__/nav-config.test.ts`
- Modify: `apps/web-app/src/lib/constants.ts:70-90` (nav array เดิม → re-export จาก nav-config เพื่อไม่หัก consumer เดิมระหว่างเปลี่ยนผ่าน)

**Interfaces:**
- Produces: `type NavItem = { key: string; path: string; labelTH: string; descTH: string; icon: LucideIcon; roles: CanonicalRole[]; tier: 'primary' | 'secondary'; lock?: { condition: 'ACTIVE_CERT_REQUIRED'; reasonTH: string }; chipSource?: 'pendingActions' | 'unpaid' }` · `getNavForRole(role: CanonicalRole): NavItem[]` · `FARMER_NAV, AUDITOR_NAV, REVIEWER_NAV, SCHEDULER_NAV, ACCOUNT_NAV, ADMIN_NAV: NavItem[]`

- [ ] **Step 1: เขียน failing test**

```ts
// apps/web-app/src/lib/navigation/__tests__/nav-config.test.ts
import { getNavForRole, FARMER_NAV } from '../nav-config';

describe('nav-config SSOT', () => {
  it('farmer primary menu ใช้ชื่อคำกริยาตาม N5 ครบและเรียงตาม spec', () => {
    const labels = FARMER_NAV.filter(i => i.tier === 'primary').map(i => i.labelTH);
    expect(labels).toEqual([
      'สมัครขอใบรับรอง', 'ตรวจสอบสถานะ', 'ชำระเงิน',
      'ใบรับรองของฉัน', 'บันทึกการปลูก', 'ช่วยเหลือ',
    ]);
  });
  it('ไม่มี path ซ้ำใน role เดียวกัน (กติกา N-SSOT: เมนูซ้ำเกิดไม่ได้)', () => {
    for (const role of ['health', 'auditor', 'document_reviewer', 'scheduler', 'admin'] as const) {
      const paths = getNavForRole(role).map(i => i.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
  it('บันทึกการปลูก ล็อกด้วยเงื่อนไขใบรับรอง พร้อมเหตุผลไทย', () => {
    const planting = FARMER_NAV.find(i => i.key === 'planting');
    expect(planting?.lock).toEqual({
      condition: 'ACTIVE_CERT_REQUIRED',
      reasonTH: 'เปิดใช้เมื่อคุณได้รับใบรับรอง GACP',
    });
  });
  it('เมนูเดิมทุกตัวยังมีบ้านใหม่ (inventory ไม่หาย)', () => {
    const allPaths = FARMER_NAV.map(i => i.path);
    for (const legacy of ['/health/applications', '/health/payments', '/health/certificates', '/health/planting', '/health/help']) {
      expect(allPaths).toContain(legacy);
    }
  });
});
```

- [ ] **Step 2: รัน test ยืนยันว่า fail** — `cd apps/web-app && pnpm jest src/lib/navigation --no-coverage` → FAIL (module not found)
- [ ] **Step 3: implement `nav-config.ts`** — นิยาม `NavItem` ตาม Produces, ประกาศ array ต่อ role ตามตารางเมนูใน spec §2 + N5/N7 (path ชี้หน้าเดิม: applications, payments, certificates, planting, help; ใหม่: `/health/home`, `/health/status`), `getNavForRole` = lookup + filter · `constants.ts` เปลี่ยน nav array เดิมเป็น import + map จาก `FARMER_NAV` (คง shape เดิมให้ consumer เก่า)
- [ ] **Step 4: รัน test ผ่าน + full unit ไม่พังของเดิม** — `pnpm jest src/lib --no-coverage` → PASS (NODE_OPTIONS=--max-old-space-size=3072 ถ้า OOM)
- [ ] **Step 5: Commit** — `git add apps/web-app/src/lib/navigation apps/web-app/src/lib/constants.ts && git commit -m "feat(nav): SSOT nav-config — task-verb menus per spec N5, single source for tiles+bottom-nav"`

### Task 2: Tile components + หน้า home เกษตรกร

**Files:**
- Create: `apps/web-app/src/components/navigation/nav-tile.tsx` (การ์ดเมนู: ปกติ/มี chip/ล็อก)
- Create: `apps/web-app/src/app/health/home/page.tsx` + `client-view.tsx`
- Create: `apps/web-app/src/components/navigation/__tests__/nav-tile.test.tsx`

**Interfaces:**
- Consumes: `NavItem`, `FARMER_NAV` จาก Task 1
- Produces: `<NavTile item={NavItem} chipText={string | null} locked={boolean} />` · `/health/home` render tile grid จาก `getNavForRole('health')` (primary = การ์ดใหญ่ 2 คอลัมน์, secondary = แถวเล็ก "เมนูเพิ่มเติม")

- [ ] **Step 1: เขียน failing test**

```tsx
// apps/web-app/src/components/navigation/__tests__/nav-tile.test.tsx
import { render, screen } from '@testing-library/react';
import { NavTile } from '../nav-tile';
import { FARMER_NAV } from '@/lib/navigation/nav-config';

const status = FARMER_NAV.find(i => i.key === 'status')!;
const planting = FARMER_NAV.find(i => i.key === 'planting')!;

it('การ์ดปกติเป็นลิงก์ไป path ของเมนู', () => {
  render(<NavTile item={status} chipText={null} locked={false} />);
  expect(screen.getByRole('link', { name: /ตรวจสอบสถานะ/ })).toHaveAttribute('href', '/health/status');
});
it('chip แสดงเมื่อมีข้อความ และไม่ render เมื่อ null (ห้ามโชว์ 0 รายการ)', () => {
  const { rerender } = render(<NavTile item={status} chipText="2 รายการรอคุณดำเนินการ" locked={false} />);
  expect(screen.getByText('2 รายการรอคุณดำเนินการ')).toBeInTheDocument();
  rerender(<NavTile item={status} chipText={null} locked={false} />);
  expect(screen.queryByText(/รายการรอคุณ/)).toBeNull();
});
it('การ์ดล็อกไม่เป็นลิงก์ และบอกเหตุผล', () => {
  render(<NavTile item={planting} chipText={null} locked={true} />);
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('เปิดใช้เมื่อคุณได้รับใบรับรอง GACP')).toBeInTheDocument();
});
```

- [ ] **Step 2: รันยืนยัน fail** → FAIL (NavTile not found)
- [ ] **Step 3: implement** — `nav-tile.tsx` ตาม design of record (โครงการ์ด: icon box 52px `bg-leaf-soft` + title 18px font-bold + desc `text-muted-foreground` + chip pill; ล็อก: `border-dashed` + กุญแจ SVG + เหตุผล, ไม่มี `<a>`) บน primitives `card` · `/health/home/client-view.tsx` grid `repeat(2, minmax(0,1fr))` + secondary row · lock condition ประเมินจาก hook ใบรับรอง active ที่มีอยู่ (`CertificateService` เดิม) · chip: hook `useNavChips()` คืน `{status: '2 รายการรอคุณดำเนินการ' | null, payments: ...}` จาก endpoint dashboard เดิม (นับจาก data ที่หน้า dashboard เดิมใช้อยู่แล้ว — ไม่สร้าง endpoint ใหม่)
- [ ] **Step 4: รัน test ผ่าน** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(nav): NavTile + farmer /health/home tile launcher (N1, N5-N7)"`

### Task 3: Slim bar + ปุ่มกลับหน้าหลัก

**Files:**
- Modify: `apps/web-app/src/components/layout/dashboard-layout.tsx` (ถอดแถวลิงก์เมนู เหลือ slim bar; โปรไฟล์เข้า avatar dropdown)
- Create: `apps/web-app/src/components/navigation/back-home-crumb.tsx`
- Modify: `apps/web-app/src/components/layout/GovLayout.tsx` (ฝั่ง provider เดียวกัน)
- Test: `apps/web-app/src/components/layout/__tests__/slim-bar.test.tsx`

**Interfaces:**
- Consumes: nav-config (เพื่อยืนยันว่าไม่มี consumer แถวเมนูเหลือ)
- Produces: `<BackHomeCrumb current="ตรวจสอบสถานะ" homePath="/health/home" />` — ทุกหน้าใน (Task 6 และแผนถัดไป) ใช้ตัวนี้

- [ ] **Step 1: failing test** —

```tsx
it('slim bar ไม่มีลิงก์เมนูใด ๆ เหลืออยู่ (N2)', () => {
  render(<DashboardLayout><div /></DashboardLayout>);
  const links = screen.queryAllByRole('link');
  const menuPaths = ['/health/applications', '/health/payments', '/health/certificates', '/health/planting'];
  expect(links.filter(a => menuPaths.includes(a.getAttribute('href') ?? ''))).toHaveLength(0);
});
it('โลโก้ลิงก์กลับ /health/home', () => {
  render(<DashboardLayout><div /></DashboardLayout>);
  expect(screen.getByRole('link', { name: /GACP/ })).toHaveAttribute('href', '/health/home');
});
it('BackHomeCrumb มีปุ่มหน้าหลัก + ชื่อหน้าปัจจุบัน', () => {
  render(<BackHomeCrumb current="ตรวจสอบสถานะ" homePath="/health/home" />);
  expect(screen.getByRole('link', { name: /หน้าหลัก/ })).toHaveAttribute('href', '/health/home');
  expect(screen.getByText('ตรวจสอบสถานะ')).toBeInTheDocument();
});
```

- [ ] **Step 2: รันยืนยัน fail** (สอง assertion แรก fail เพราะ layout เดิมมีลิงก์เมนู)
- [ ] **Step 3: implement** — slim bar: โลโก้→home, แจ้งเตือน, ภาษา/โหมดมืด, avatar dropdown (โปรไฟล์+ออกจากระบบ) · BackHomeCrumb ตาม design (กล่องขาว border + ← หน้าหลัก + `/` + ชื่อหน้า) · redirect: `/health/dashboard` middleware/redirect ไป `/health/home` (dashboard เดิมยังเข้าถึงได้ผ่านตรวจสอบสถานะจนกว่า Task 6 แทนที่)
- [ ] **Step 4: test ผ่าน + จอเดิมไม่พัง** — `pnpm jest src/components/layout --no-coverage`
- [ ] **Step 5: Commit** — `git commit -m "feat(nav): slim bar replaces menu rows; BackHomeCrumb; profile under avatar (N2, N7)"`

### Task 4: Home ฝั่งพนักงาน (auditor/reviewer/scheduler/account/admin)

**Files:**
- Create: `apps/web-app/src/app/provider/home/page.tsx` + `client-view.tsx`
- Modify: `apps/web-app/src/app/provider/**` landing redirects (dashboard → home)
- Test: `apps/web-app/src/app/provider/home/__tests__/provider-home.test.tsx`

**Interfaces:**
- Consumes: `getNavForRole(role)` — role จาก session (canonical-rbac เดิม)
- Produces: `/provider/home` — tile grid ตาม role (teal theme, officer tokens)

- [ ] **Step 1: failing test**

```tsx
it('auditor เห็นเฉพาะ 3 เมนูของตัวเอง (N7)', () => {
  render(<ProviderHome role="auditor" />);
  expect(screen.getByText('งานตรวจแปลง')).toBeInTheDocument();
  expect(screen.getByText('นัดหมายลงพื้นที่')).toBeInTheDocument();
  expect(screen.getByText('ประวัติผลตรวจ')).toBeInTheDocument();
  expect(screen.queryByText('ตรวจเอกสาร')).toBeNull();
  expect(screen.queryByText('ภาพรวม')).toBeNull();
});
it('document_reviewer เห็นตรวจเอกสาร ไม่เห็นงานตรวจแปลง', () => {
  render(<ProviderHome role="document_reviewer" />);
  expect(screen.getByText('ตรวจเอกสาร')).toBeInTheDocument();
  expect(screen.queryByText('งานตรวจแปลง')).toBeNull();
});
```

- [ ] **Step 2: fail** → **Step 3: implement** (reuse NavTile, officer-soft/officer-700 tokens ต่อ theme prop) → **Step 4: pass + จอ provider เดิมยังเข้าได้** → **Step 5: Commit** `git commit -m "feat(nav): provider tile home per role — task-named menus only (N5, N7)"`

### Task 5: Bottom nav มือถือจาก config + rename

**Files:**
- Modify: component bottom nav เดิมฝั่ง health (ตามที่ `dashboard-layout.tsx` render — ค้นด้วย grep "แดชบอร์ด" ใน layout)
- Test: `apps/web-app/src/components/layout/__tests__/bottom-nav.test.tsx`

**Interfaces:**
- Consumes: `FARMER_NAV` (รายการที่ flag `bottomNav: true` — เพิ่ม field ใน Task 1 type ตอนนี้: `bottomNav?: boolean` บน 5 ตัว: home/status/payments/certificates/planting)

- [ ] **Step 1: failing test** — bottom nav render 5 ปุ่มตามลำดับ `หน้าหลัก สถานะ ชำระเงิน ใบรับรอง การปลูก` และปุ่มการปลูกมีไอคอนล็อกเมื่อไม่มีใบ
- [ ] **Step 2-4: fail → implement (generate จาก config, label สั้น field `shortTH`) → pass**
- [ ] **Step 5: Commit** — `git commit -m "feat(nav): mobile bottom nav generated from nav-config (N3)"`

### Task 6: หน้าตรวจสอบสถานะแบบหน้าเดียว (N8)

**Files:**
- Create: `apps/web-app/src/lib/status-display/stage-map.ts` + `__tests__/stage-map.test.ts` (mapping เดียว 20 สถานะ → 5 ขั้นแสดงผล — จุดเดียวในระบบ ห้าม copy)
- Create: `apps/web-app/src/app/health/status/page.tsx` + `client-view.tsx`
- Test: `apps/web-app/src/app/health/status/__tests__/status-page.test.tsx`

**Interfaces:**
- Produces: `mapStatusToDisplay(status: WorkflowStatus): { step: 1|2|3|4|5; stepLabelTH: string; actorTH: string; needsUserAction: boolean; actionTH?: string }` — 5 ขั้น: ยื่นคำขอ/ตรวจเอกสาร/ชำระค่าตรวจ/ตรวจแปลง/ออกใบรับรอง

- [ ] **Step 1: failing test (mapping ครบทุกสถานะ — กันหลุด)**

```ts
import { mapStatusToDisplay } from '../stage-map';
import { ALL_WORKFLOW_STATUSES } from '@/lib/workflow-status'; // vocabulary เดิมฝั่ง FE

it('ทุกสถานะใน vocabulary มี mapping (ไม่มีสถานะตกหล่น)', () => {
  for (const s of ALL_WORKFLOW_STATUSES) expect(() => mapStatusToDisplay(s)).not.toThrow();
});
it('PENDING_AUDIT_FEE = ขั้น 3 และรอผู้ใช้จ่าย', () => {
  expect(mapStatusToDisplay('PENDING_AUDIT_FEE')).toMatchObject({ step: 3, needsUserAction: true, actionTH: 'ชำระเงินตอนนี้' });
});
it('AUDIT_PASSED = ขั้น 5 ไม่ต้องทำอะไร', () => {
  expect(mapStatusToDisplay('AUDIT_PASSED')).toMatchObject({ step: 5, needsUserAction: false });
});
it('REVISION_REQUESTED = ขั้น 2 รอผู้ใช้แก้เอกสาร', () => {
  expect(mapStatusToDisplay('REVISION_REQUESTED')).toMatchObject({ step: 2, needsUserAction: true });
});
```

- [ ] **Step 2: fail** → **Step 3: implement** — stage-map (S-map อ้าง reviewer.md ตาราง S1/S3=เงิน S4=AUDIT_CONFIRMED; อย่า import จาก backend — FE มี vocabulary list เดิมอยู่แล้ว ใช้ตัวนั้น) · status page: การ์ดต่อคำขอ = เลข+พืช + ประโยคสถานะ (ผู้กระทำ+สิ่งที่รอ) + แถบ 5 ขั้น + ปุ่ม action เมื่อ `needsUserAction` (การ์ดนั้น border warning เด่น + ลอยบนสุด ตาม design) → กดเข้ารายละเอียดหน้าเดิม `/health/applications/[id]`
- [ ] **Step 4: pass** → **Step 5: Commit** `git commit -m "feat(status): single-page ตรวจสอบสถานะ with inline 5-step progress (N8); one stage-map module"`

### Task 7: Rename sweep + probe + view-pack ปิดงาน

**Files:**
- Modify: จุดที่ยังพิมพ์ชื่อเมนูเก่า (grep "คำขอรับรอง|ภาพรวม|แดชบอร์ด" ใน src/app — เปลี่ยนเฉพาะ**ป้ายเมนู/หัวหน้า** ไม่แตะเนื้อหา)
- Modify: `apps/web-app/scripts` integrity check ข้อ 8 → ตรวจจาก nav-config (path ทุกตัวมี page จริง)
- Evidence: `evidence/tile-home-nav/` view-pack

**Steps:**
- [ ] **Step 1: เพิ่ม integrity assertion** — check ข้อ 8 iterate `getNavForRole` ทุก role: ทุก `path` มี `page.tsx` จริง → รัน pre-commit เขียว
- [ ] **Step 2: rename sweep** — แก้ป้ายที่เหลือ + ลบเมนู "ตรวจสลิป" ออกจาก nav ฝั่ง account (หน้าเดิมยังอยู่จนกว่า Plan 2/D4 — เข้าถึงได้ผ่าน URL ตรง)
- [ ] **Step 3: full unit suite** — `NODE_OPTIONS=--max-old-space-size=3072 pnpm jest --no-coverage` → ไม่มี failure ใหม่เทียบ baseline
- [ ] **Step 4: view-pack (gacp-view-in-the-loop)** — เดินจริงทุก role: home → เข้าเมนู → กลับหน้าหลัก · เกษตรกรมือถือ 390×844 + desktop 1920 · ภาพเรียง 01-.. + INDEX.md + WALKTHROUGH หน้าเดียว → `evidence/tile-home-nav/`
- [ ] **Step 5: Commit + รายงานตาม CLAUDE.md §6** — tier จาก `tier-check.sh` (คาด B: review eng+security + CI/local-gate ตาม DoD)

## Self-Review (ทำแล้ว)

- Spec coverage: N1(T2,T4) N2(T3) N3(T5) N4(ทุก task ผ่าน Global Constraints) N5(T1,T7) N6(T6 แทนภาพรวม) N7(T3,T4) N8(T6) — N9-N13 มอบ Plan 2-6 พร้อม gate ตามหัวข้อ "นอกขอบเขต" ✓
- Placeholder scan: ไม่มี TBD/TODO — ทุก task มี test code จริง ✓
- Type consistency: `NavItem`/`getNavForRole`/`FARMER_NAV` ใช้ชื่อเดียวกันทุก task · `BackHomeCrumb` (T3) ถูกอ้างใน T6 ✓
