> ## ⚠️ เอกสารนี้บันทึกโมเดลที่เลิกใช้แล้ว (ปักป้าย 2026-09-05)
>
> ตัวเลขค่าธรรมเนียมและจุดยืนทางภาษีในเอกสารนี้เป็นของสูตรก่อน W14 (VAT คิดเฉพาะส่วนแพลตฟอร์ม)
> ปัจจุบัน: **ผู้ออกเอกสารรายเดียว · VAT 7% บนค่าบริการทั้งก้อน · งวด 1 = 5,885 · งวด 2 = 29,425**
> เก็บไว้อ่านเป็นบันทึกประวัติ · ความจริงปัจจุบัน: `apps/backend/services/fee-service.js`

# Close the Renewal Online Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดเส้นทางต่ออายุใบรับรองออนไลน์ทั้งเว็บและมือถือ ไม่ให้มีหน้าจอใดผลิตเอกสารการเงินหรือแจ้งความสำเร็จที่ไม่มีหลังบ้านรองรับ

**Architecture:** route `/health/applications/renewal` เปลี่ยนไป render หน้าสถานะเดียวแทน wizard 4 ขั้น · `client-view.tsx` และ `*-step.tsx` **ยังคงอยู่ในรีโป** แต่ไม่ถูก render (ใบ 3 จะใช้โครงเดิมบางส่วน) · ฝั่งมือถือปิดปุ่มยื่นและลบ `_submitRenewal()` ทิ้ง · ลบ endpoint ที่ไม่มีอยู่จริงออกจากสัญญา OpenAPI · ผูกเหตุผลที่ห้ามแก้ 404 ไว้ในโค้ดทั้งสองฝั่งพร้อม test ตรึง

**Tech Stack:** Next.js App Router (React 19, TypeScript) · Tailwind · Jest 30 (web + backend, source-file assertion pattern) · Flutter/Dart (mobile) · OpenAPI 3 YAML

**Spec:** `docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md`
**Branch:** `docs/renewal-fake-financial-docs-spec` (ทำต่อบน branch เดิม — spec คือแบบของ diff ชุดนี้ ควรอยู่ PR เดียวกัน)

## Global Constraints

- **เครื่องนี้รัน test ไม่ได้เลย** — `node` และ `flutter/dart` ไม่ได้ติดตั้ง (ตรวจแล้วทั้ง PATH ของ bash และ PowerShell รวมถึง `C:\Program Files\nodejs`, Volta, nvm, fnm) ⇒ ทุกขั้นที่เขียนว่า "Run" ต้องรันบนเครื่องที่มี toolchain · **ห้ามเขียน `DONE(probe:…)` โดยไม่มี output จริงแนบ** (CLAUDE.md L1) ถ้ารันไม่ได้ให้เขียน `BLOCKED(operator:node-runtime)`
- **ห้ามแก้ path 404 ที่ `apps/web-app/src/app/health/applications/renewal/client-view.tsx:227`** — spec §4 · การแก้จะทำให้ระบบเริ่มสร้างคำขอต่ออายุที่ถูกตั้งราคา 2 งวด 33,210 ตาม default ของ `apps/backend/prisma/schema/application.prisma:34,65,80`
- **ห้ามลบ** `client-view.tsx`, `upload-step.tsx`, `quotation-step.tsx`, `invoice-step.tsx`, `payment-step.tsx`, `types.tsx`
- **ห้ามแตะ** `apps/backend/routes/api/applications/applications.js` (ใบ 0), ตารางค่าธรรมเนียม (ใบ 2), `subscription-order-service.js`
- test เดิม 3 ตัวต้องยังเขียว: `renewal-payment-pending.test.tsx`, `renewal-advisory-banner.test.tsx`, `certificates-renewal-cta.test.ts`
- ข้อความไทยทุกบรรทัดต้องผ่านกติกา `.claude/skills/thai-ui-copy` · class Tailwind ตาม `.claude/skills/gacp-design-tokens`
- tier ตัดสินโดย `bash scripts/probes/tier-check.sh` เท่านั้น — ห้ามประเมินเอง
- ratchet counter ต้องไม่เพิ่ม (ตัวเลขจาก probe ห้ามพิมพ์มือ)
- PR body ต้องมีหัวข้อ "สรุปสำหรับ operator" 3 บรรทัดบนสุด ตาม `QUEUE.md` R-PR-1

---

## File Structure

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `apps/web-app/src/app/health/applications/renewal/unavailable-view.tsx` *(สร้าง)* | หน้าสถานะเดียว — แจ้งว่ายังไม่เปิดให้บริการ + ช่องทางติดต่อ + ทางกลับ |
| `apps/web-app/src/app/health/applications/renewal/page.tsx` *(แก้)* | สลับจาก render wizard เป็น render หน้าสถานะ |
| `apps/web-app/src/lib/i18n/dictionaries/sections/th-core.ts` *(แก้)* | ข้อความไทยของ `renewalAdvisory` — จาก "ชำระเงินไม่ได้" เป็น "ยังไม่เปิดให้บริการ" |
| `apps/web-app/src/lib/i18n/dictionaries/sections/en-core.ts` *(แก้)* | ข้อความอังกฤษชุดเดียวกัน |
| `apps/web-app/src/app/health/applications/renewal/client-view.tsx` *(แก้ comment เท่านั้น)* | คอมเมนต์กันคนแก้ 404 |
| `apps/backend/services/renewal-service.js` *(แก้ comment เท่านั้น)* | คอมเมนต์กันคนแก้ราคา default |
| `apps/mobile-app/lib/presentation/features/application/screens/renewal_application_screen.dart` *(แก้)* | ปิดปุ่มยื่น ลบ `_submitRenewal()` เพิ่มคำแจ้ง |
| `openapi/certificate-service.yaml` *(แก้)* | ลบ path item ที่ไม่มีอยู่จริง |

---

## Task 1: หน้าสถานะแทน wizard (เว็บ)

**Files:**
- Create: `apps/web-app/src/app/health/applications/renewal/unavailable-view.tsx`
- Create: `apps/web-app/src/app/health/applications/renewal/__tests__/renewal-route-closed.test.tsx`
- Modify: `apps/web-app/src/app/health/applications/renewal/page.tsx:1-19`
- Modify: `apps/web-app/src/lib/i18n/dictionaries/sections/th-core.ts:396-402`
- Modify: `apps/web-app/src/lib/i18n/dictionaries/sections/en-core.ts:413-419`

**Interfaces:**
- Consumes: `useLanguage()` จาก `@/lib/i18n/language-context` (คืน `{ dict }`) · `dict.renewalAdvisory` รูปทรง `{ title, body, contactCta, contactEmail, contactFormCta }` · `dict.health.renewal.goToCertList` (string)
- Produces: default export `RenewalUnavailableView` จาก `./unavailable-view` · `data-testid="renewal-unavailable"`

- [ ] **Step 1: เขียน test ที่ต้อง fail**

สร้าง `apps/web-app/src/app/health/applications/renewal/__tests__/renewal-route-closed.test.tsx`:

```tsx
/**
 * ใบ 1 — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md
 *
 * SOURCE-FILE assertions ตามแบบเดียวกับ renewal-advisory-banner.test.tsx:10-15
 * (ไม่ mount จริงเพราะ Suspense + router + api หนัก) — พอจับ regression ที่
 * route กลับไป render wizard หรือกลับมามีตัวเลขค่าธรรมเนียม
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const page = readFileSync(resolve(__dirname, '../page.tsx'), 'utf8');
const view = readFileSync(resolve(__dirname, '../unavailable-view.tsx'), 'utf8');

describe('[ใบ 1] renewal route ไม่ผลิตเอกสารการเงิน', () => {
    it('page.tsx render หน้าสถานะ ไม่ใช่ wizard', () => {
        expect(page).toContain('./unavailable-view');
        expect(page).not.toContain('./client-view');
    });

    it('หน้าที่ถูก render ไม่ import ค่าคงที่ค่าธรรมเนียมใด ๆ', () => {
        expect(view).not.toMatch(/GACP_RENEWAL_FEE|RENEWAL_FEE|constants\/fees/);
    });

    it('หน้าที่ถูก render ไม่มีเอกสารใบเสนอราคา/ใบแจ้งหนี้ และไม่มีจำนวนเงิน', () => {
        expect(view).not.toMatch(/ใบเสนอราคา|ใบแจ้งหนี้|30,000|30000|33,210/);
    });

    it('มีทางออกให้ผู้ใช้ — อีเมลและหน้าติดต่อ', () => {
        expect(view).toContain('mailto:');
        expect(view).toContain('/help/contact');
    });

    it('ข้อความมาจาก dict ไม่ใช่ literal ลอย', () => {
        expect(view).toContain('dict.renewalAdvisory');
        expect(view).toContain('useLanguage');
    });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail จริง**

Run: `cd apps/web-app && node node_modules/jest/bin/jest.js src/app/health/applications/renewal/__tests__/renewal-route-closed.test.tsx`
Expected: FAIL — `ENOENT: no such file or directory, open '.../unavailable-view.tsx'`
**แนบ output จริงลง evidence ก่อนไปขั้นถัดไป** (นี่คือ RED ที่ CLAUDE.md §5 ชั้น B บังคับ)

- [ ] **Step 3: สร้างหน้าสถานะ**

สร้าง `apps/web-app/src/app/health/applications/renewal/unavailable-view.tsx`:

```tsx
'use client';

/**
 * ใบ 1 — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md
 *
 * เส้นทางต่ออายุออนไลน์ถูกปิด: wizard เดิม (client-view.tsx + *-step.tsx) วาด
 * ใบเสนอราคา/ใบแจ้งหนี้จากค่าคงที่ฝั่ง frontend และปุ่มยื่นยิงไปยัง route ที่ไม่มีอยู่จริง
 *
 * ไฟล์ wizard ยังคงอยู่ในรีโปโดยตั้งใจ — ใบ 3 (renewal เป็น flow จริง) จะใช้โครงเดิม
 * บางส่วน การลบทิ้งตอนนี้ทำให้ diff ของใบ 3 อ่านยากขึ้นโดยไม่จำเป็น
 */

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

const FALLBACK = {
    title: 'ยังไม่เปิดให้บริการต่ออายุใบรับรองออนไลน์',
    body: 'ขณะนี้ระบบยังไม่รองรับการยื่นคำขอต่ออายุผ่านเว็บไซต์ กรุณาติดต่อกรมการแพทย์แผนไทยและการแพทย์ทางเลือก (DTAM)',
    contactCta: 'ติดต่อเจ้าหน้าที่',
    contactEmail: 'support@gacpth.com',
    contactFormCta: 'เปิดฟอร์มติดต่อ',
};

export default function RenewalUnavailableView() {
    const { dict } = useLanguage();
    const advisory = dict.renewalAdvisory || FALLBACK;
    const backLabel = dict.health?.renewal?.goToCertList || 'ไปหน้ารายการใบรับรอง';

    return (
        <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-10">
            <div
                role="alert"
                data-testid="renewal-unavailable"
                className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm"
            >
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                        <AlertTriangle className="h-5 w-5" aria-hidden="true" focusable="false" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-bold leading-snug text-amber-900 sm:text-lg">
                            {advisory.title}
                        </h1>
                        <p className="mt-2 text-sm leading-relaxed text-amber-800">{advisory.body}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <a
                                href={`mailto:${advisory.contactEmail}`}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
                            >
                                {advisory.contactCta}
                            </a>
                            <Link
                                href="/help/contact"
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
                            >
                                {advisory.contactFormCta}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 text-center">
                <Link
                    href="/health/certificates"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-7 py-3.5 font-semibold text-white shadow-sm"
                >
                    {backLabel}
                </Link>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: สลับ page.tsx**

แก้ `apps/web-app/src/app/health/applications/renewal/page.tsx` บรรทัด 1 และ 16:

```tsx
import RenewalUnavailableView from './unavailable-view';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ต่ออายุใบรับรอง | GACP',
  description: 'ต่ออายุใบรับรอง GACP',
};

/**
 * Server Component wrapper — exports route metadata at build-time
 * and renders the Client island below.
 *
 * ใบ 1: เส้นทางต่ออายุออนไลน์ปิดอยู่ — render หน้าสถานะแทน wizard
 * spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md
 */
export default function Page() {
  return (
    <main className="h-full min-h-screen w-full">
      <RenewalUnavailableView />
    </main>
  );
}
```

- [ ] **Step 5: แก้ข้อความไทย**

`apps/web-app/src/lib/i18n/dictionaries/sections/th-core.ts` แทนที่ `title` และ `body` ใน `renewalAdvisory` (บรรทัด 397-398) — คีย์อื่นคงเดิม:

```ts
renewalAdvisory: {
        title: "ยังไม่เปิดให้บริการต่ออายุใบรับรองออนไลน์",
        body: "ขณะนี้ระบบยังไม่รองรับการยื่นคำขอต่ออายุและการชำระค่าธรรมเนียมต่ออายุผ่านเว็บไซต์ กรุณาติดต่อกรมการแพทย์แผนไทยและการแพทย์ทางเลือก (DTAM) เพื่อดำเนินการต่ออายุ โดยส่งอีเมลถึง support@gacpth.com หรือผ่านหน้าติดต่อเจ้าหน้าที่",
        contactCta: "ติดต่อเจ้าหน้าที่",
        contactEmail: "support@gacpth.com",
        contactFormCta: "เปิดฟอร์มติดต่อ"
    }
```

- [ ] **Step 6: แก้ข้อความอังกฤษ**

`apps/web-app/src/lib/i18n/dictionaries/sections/en-core.ts` แทนที่ `title` และ `body` (บรรทัด 414-415):

```ts
renewalAdvisory: {
        title: "Online certificate renewal is not available yet",
        body: "The platform cannot yet accept renewal applications or renewal fee payments online. Please contact the Department of Thai Traditional and Alternative Medicine (DTAM) to renew your certificate — email support@gacpth.com or use the contact page below.",
        contactCta: "Contact DTAM staff",
        contactEmail: "support@gacpth.com",
        contactFormCta: "Open contact form"
    }
```

- [ ] **Step 7: รัน test ใหม่ + test เดิมที่ต้องไม่แดง**

Run: `cd apps/web-app && node node_modules/jest/bin/jest.js src/app/health/applications/renewal src/app/health/certificates`
Expected: PASS ทั้งหมด — รวม `renewal-payment-pending.test.tsx`, `renewal-advisory-banner.test.tsx`, `certificates-renewal-cta.test.ts` ที่ต้องเขียวตามเดิม (ทั้งสามอ่าน source ของ `client-view.tsx` / `certificates/client-view.tsx` ซึ่งไม่ถูกแก้ในงานนี้)

- [ ] **Step 8: Commit**

```bash
git add apps/web-app/src/app/health/applications/renewal/unavailable-view.tsx \
        apps/web-app/src/app/health/applications/renewal/page.tsx \
        apps/web-app/src/app/health/applications/renewal/__tests__/renewal-route-closed.test.tsx \
        apps/web-app/src/lib/i18n/dictionaries/sections/th-core.ts \
        apps/web-app/src/lib/i18n/dictionaries/sections/en-core.ts
git commit -m "fix(renewal): serve a status page instead of a wizard that prints unbacked invoices"
```

---

## Task 2: คอมเมนต์กันคนแก้ 404 ทั้งสองฝั่ง

**Files:**
- Modify: `apps/web-app/src/app/health/applications/renewal/client-view.tsx:225-227`
- Modify: `apps/backend/services/renewal-service.js:305-319`
- Create: `apps/web-app/src/app/health/applications/renewal/__tests__/renewal-404-guard.test.tsx`
- Create: `apps/backend/__tests__/unit/renewal-service-price-guard.test.js`

**Interfaces:**
- Consumes: ไม่มี (comment-only + test)
- Produces: string `2026-08-13-renewal-fake-financial-docs-design.md` ปรากฏในทั้งสองไฟล์ต้นทาง

- [ ] **Step 1: เขียน test ฝั่งเว็บที่ต้อง fail**

สร้าง `apps/web-app/src/app/health/applications/renewal/__tests__/renewal-404-guard.test.tsx`:

```tsx
/**
 * ใบ 1 — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md §4
 *
 * `/api/applications/renewal` (เอกพจน์) ไม่มี route อยู่จริง — route จริงคือ
 * `/renewals` (apps/backend/routes/api/index.js:137) 404 นี้กำลังทำหน้าที่เป็น
 * ตาข่ายกันโดยบังเอิญ ห้ามแก้จนกว่าใบ 3 จะให้ renewal มี milestone และราคาของตัวเอง
 * test นี้ตรึงเหตุผลไว้กับโค้ด ไม่ให้เหลืออยู่แค่ในเอกสาร
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const clientView = readFileSync(resolve(__dirname, '../client-view.tsx'), 'utf8');

describe('[ใบ 1 §4] เหตุผลที่ห้ามแก้ 404 ถูกบันทึกไว้ในโค้ด', () => {
    it('client-view.tsx ชี้ไปที่ spec', () => {
        expect(clientView).toContain('2026-08-13-renewal-fake-financial-docs-design.md');
    });

    it('path เดิมยังไม่ถูก "แก้ให้ถูก"', () => {
        expect(clientView).toContain("'/api/applications/renewal'");
    });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail จริง**

Run: `cd apps/web-app && node node_modules/jest/bin/jest.js src/app/health/applications/renewal/__tests__/renewal-404-guard.test.tsx`
Expected: FAIL — `Expected substring: "2026-08-13-renewal-fake-financial-docs-design.md"` ที่ test แรก

- [ ] **Step 3: ใส่คอมเมนต์ฝั่งเว็บ**

แทรกเหนือบรรทัด 227 ของ `apps/web-app/src/app/health/applications/renewal/client-view.tsx`:

```tsx
                // ⚠️ ห้าม "แก้ path ให้ถูก" — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md §4
                // route จริงคือ /renewals (apps/backend/routes/api/index.js:137) แต่การยิงให้ถูก
                // จะทำให้ระบบเริ่มสร้าง Application ต่ออายุที่ถูกตั้งราคา 2 งวด 33,210 ตาม default
                // ของ apps/backend/prisma/schema/application.prisma:34,65,80 ซึ่งขัดกติกาจ่ายครั้งเดียว
                // 30,000 ต่อใบ (operator 2026-08-13) — รอใบ 3 ที่ให้ renewal มี milestone และราคาของตัวเอง
                // หน้านี้ไม่ถูก render แล้วตั้งแต่ใบ 1 (page.tsx → unavailable-view.tsx)
```

- [ ] **Step 4: เขียน test ฝั่ง backend ที่ต้อง fail**

สร้าง `apps/backend/__tests__/unit/renewal-service-price-guard.test.js`:

```js
/**
 * ใบ 1 — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md §4
 *
 * createRenewalApplication ไม่ตั้ง serviceType / phase1Amount / phase2Amount แถวจึงเกิดมา
 * พร้อม default ของ schema (new_application / 5535 / 27675) ซึ่งขัดกติกาจ่ายครั้งเดียว
 * ตรึงคอมเมนต์เตือนไว้กับโค้ดจนกว่าใบ 3 จะแก้ของจริง
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

const src = readFileSync(
    resolve(__dirname, '../../services/renewal-service.js'),
    'utf8',
);

describe('[ใบ 1 §4] renewal-service เตือนเรื่องราคา default', () => {
    it('ชี้ไปที่ spec', () => {
        expect(src).toContain('2026-08-13-renewal-fake-financial-docs-design.md');
    });

    it('ยังไม่ตั้งราคาเอง (ใบ 3 เป็นคนแก้)', () => {
        expect(src).not.toContain('phase1Amount:');
        expect(src).not.toContain('phase2Amount:');
    });
});
```

- [ ] **Step 5: รัน test ให้เห็นว่า fail จริง**

Run: `cd apps/backend && node node_modules/jest/bin/jest.js __tests__/unit/renewal-service-price-guard.test.js`
Expected: FAIL ที่ test แรก — `Expected substring: "2026-08-13-renewal-fake-financial-docs-design.md"`

- [ ] **Step 6: ใส่คอมเมนต์ฝั่ง backend**

แทรกเหนือ `const createPayload` (ราวบรรทัด 305) ของ `apps/backend/services/renewal-service.js`:

```js
    // ⚠️ ราคาของคำขอต่ออายุยังไม่ถูกตั้งที่นี่โดยตั้งใจ
    // spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md §4
    //
    // payload นี้ไม่ตั้ง serviceType / phase1Amount / phase2Amount แถวจึงเกิดมาพร้อม default
    // ของ schema ซึ่งเป็นราคาของ "คำขอใหม่ 2 งวด" — ค่าจริงอยู่ที่
    // prisma/schema/application.prisma:34,65,80 (ห้ามคัดตัวเลขมาเขียนซ้ำที่นี่ ดูหมายเหตุท้ายขั้นนี้)
    // ซึ่งขัดกติกา operator 2026-08-13 ที่ว่าต่ออายุจ่ายครั้งเดียวต่อใบ
    //
    // อย่าเติมราคาที่นี่แบบเดี่ยว ๆ — ต้องรอใบ 3 ที่เพิ่ม milestone ที่สาม, แก้ Postgres CHECK
    // milestone IN ('M1','M2') (migrations/20260802150000_wave1_checkout_engine_expand/migration.sql:54)
    // และเพิ่ม serviceType ใน phase-billing-service.js CANONICAL_SERVICE_TYPES พร้อมกัน
```

- [ ] **Step 7: รัน test ทั้งสองฝั่งให้ผ่าน**

Run: `cd apps/web-app && node node_modules/jest/bin/jest.js src/app/health/applications/renewal`
Run: `cd apps/backend && node node_modules/jest/bin/jest.js __tests__/unit/renewal-service-price-guard.test.js`
Expected: PASS ทั้งสองชุด

- [ ] **Step 8: Commit**

```bash
git add apps/web-app/src/app/health/applications/renewal/client-view.tsx \
        apps/web-app/src/app/health/applications/renewal/__tests__/renewal-404-guard.test.tsx \
        apps/backend/services/renewal-service.js \
        apps/backend/__tests__/unit/renewal-service-price-guard.test.js
git commit -m "docs(renewal): pin the reason the 404 and the default price must not be fixed yet"
```

---

## Task 3: มือถือ — เลิกแจ้งสำเร็จปลอม

**Files:**
- Modify: `apps/mobile-app/lib/presentation/features/application/screens/renewal_application_screen.dart:26-34,40-55,242-248`
- Create: `apps/mobile-app/test/unit/renewal_screen_no_fake_success_test.dart`

**Interfaces:**
- Consumes: `AppTheme` จาก `../../../../core/theme/app_theme.dart` (มี `bgGray`, `primaryGreen`)
- Produces: ไม่มี symbol ใหม่ที่ task อื่นใช้ · `_submitRenewal` **ถูกลบทิ้ง**

- [ ] **Step 1: ยืนยันก่อนว่าจอนี้เข้าถึงได้จริงหรือไม่**

Run: `grep -rn "RenewalApplicationScreen" apps/mobile-app/lib --include=*.dart`
บันทึกผลตามจริงลง evidence: ถ้าพบเฉพาะในไฟล์ตัวเอง ⇒ จอนี้ยังไม่มีทางเข้าที่ลงทะเบียนไว้ ให้เขียนข้อเท็จจริงนั้นในรายงาน **ห้ามสรุปว่า "ไม่มีปัญหา"** — โค้ดที่แจ้งสำเร็จปลอมยังอยู่และรอบหน้าอาจถูกต่อ route เข้ามา

- [ ] **Step 2: เขียน test ที่ต้อง fail**

สร้าง `apps/mobile-app/test/unit/renewal_screen_no_fake_success_test.dart`:

```dart
// ใบ 1 — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md §6.2
//
// _submitRenewal() เดิมมีเพียง `// TODO: Submit to API` แล้วแสดง SnackBar
// 'ยื่นคำขอต่ออายุสำเร็จ' + Navigator.pop() — แจ้งสำเร็จโดยไม่มีคำขอเกิดขึ้นจริง

import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/presentation/features/application/screens/renewal_application_screen.dart',
  ).readAsStringSync();

  test('ไม่มีข้อความแจ้งสำเร็จ', () {
    expect(source.contains('ยื่นคำขอต่ออายุสำเร็จ'), isFalse);
  });

  test('ไม่มี _submitRenewal เหลืออยู่', () {
    expect(source.contains('_submitRenewal'), isFalse);
  });

  test('ปุ่มขั้นสุดท้ายกดไม่ได้', () {
    expect(source.contains('_currentStep == 3 ? null : details.onStepContinue'), isTrue);
  });
}
```

- [ ] **Step 3: รัน test ให้เห็นว่า fail จริง**

Run: `cd apps/mobile-app && flutter test test/unit/renewal_screen_no_fake_success_test.dart`
Expected: FAIL ทั้งสามข้อ (source ยังมี `ยื่นคำขอต่ออายุสำเร็จ` และ `_submitRenewal`)

- [ ] **Step 4: ลบ `_submitRenewal()` ทั้งฟังก์ชัน**

ลบบรรทัด 242-248 ของ `renewal_application_screen.dart` (ตั้งแต่ `void _submitRenewal() {` ถึง `}` ที่ปิดฟังก์ชัน) ออกทั้งก้อน

- [ ] **Step 5: ตัดสาขาที่เรียกมันออก**

แก้ `onStepContinue` (บรรทัด 28-34) ให้เหลือ:

```dart
        onStepContinue: () {
          // ใบ 1 — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md
          // ขั้นสุดท้ายไม่มีปลายทาง: ระบบยังไม่รองรับการยื่นคำขอต่ออายุ
          // เดิมสาขา else เรียกฟังก์ชันที่แสดงข้อความสำเร็จโดยไม่ส่งอะไรไปที่ระบบเลย
          if (_currentStep < 3) {
            setState(() => _currentStep++);
          }
        },
```

- [ ] **Step 6: ปิดปุ่มขั้นสุดท้ายและเปลี่ยนป้าย**

แก้ `ElevatedButton` ใน `controlsBuilder` (บรรทัด 46-54):

```dart
                  child: ElevatedButton(
                    onPressed: _currentStep == 3 ? null : details.onStepContinue,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryGreen,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    child: Text(_currentStep == 3 ? 'ยังไม่เปิดให้บริการ' : 'ถัดไป'),
                  ),
```

- [ ] **Step 7: เพิ่มคำแจ้งบนสุดของจอ**

แก้ `body:` (บรรทัด 26) ให้ห่อ `Stepper` ด้วย `Column` พร้อมคำแจ้ง:

```dart
      body: Column(
        children: [
          Container(
            width: double.infinity,
            margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              border: Border.all(color: const Color(0xFFFCD34D), width: 2),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Text(
              'ยังไม่เปิดให้บริการต่ออายุใบรับรองออนไลน์ '
              'กรุณาติดต่อกรมการแพทย์แผนไทยและการแพทย์ทางเลือก (DTAM) '
              'ที่ support@gacpth.com',
              style: TextStyle(color: Color(0xFF92400E), fontSize: 14, height: 1.5),
            ),
          ),
          Expanded(
            child: Stepper(
```

ปิด `Expanded` และ `Column` ให้ครบหลังบล็อก `steps: [...]` ของ `Stepper`

- [ ] **Step 8: รัน test ให้ผ่าน + วิเคราะห์โค้ด**

Run: `cd apps/mobile-app && flutter test test/unit/renewal_screen_no_fake_success_test.dart`
Expected: PASS ทั้งสามข้อ
Run: `cd apps/mobile-app && flutter analyze lib/presentation/features/application/screens/renewal_application_screen.dart`
Expected: No issues found

- [ ] **Step 9: Commit**

```bash
git add apps/mobile-app/lib/presentation/features/application/screens/renewal_application_screen.dart \
        apps/mobile-app/test/unit/renewal_screen_no_fake_success_test.dart
git commit -m "fix(mobile): stop reporting a renewal submission that never happens"
```

---

## Task 4: ลบ endpoint ที่ไม่มีอยู่จริงออกจากสัญญา OpenAPI

**Files:**
- Modify: `openapi/certificate-service.yaml:376-440`
- Create: `apps/backend/__tests__/unit/openapi-no-phantom-renew.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: **สเปกนี้ถูก codegen จริง** — `.github/workflows/generate-api-clients.yml:15-21` trigger บน `openapi/**/*.yaml` และ `:62` มี `certificate-service` ในรายการ → สร้าง client ลง `apps/web-app/src/generated/api/` (`:76`) ⇒ ต้องทำ Step 0 ก่อนลบ

- [ ] **Step 0: ตรวจว่ามีใครเรียก operation ที่จะลบหรือไม่**

Run: `grep -rn "renewCertificate" apps/web-app/src apps/mobile-app/lib --include=*.ts --include=*.tsx --include=*.dart`
Expected: ไม่มีผลลัพธ์ · **ถ้ามีผลลัพธ์ ให้หยุดและรายงาน** — แปลว่ามีโค้ดเรียก endpoint ที่ไม่มีอยู่จริง ซึ่งเป็น finding ใหม่ที่ใบนี้ไม่ครอบ
บันทึกผลลง evidence ไม่ว่าจะเจอหรือไม่เจอ

- [ ] **Step 1: เขียน test ที่ต้อง fail**

สร้าง `apps/backend/__tests__/unit/openapi-no-phantom-renew.test.js`:

```js
/**
 * ใบ 1 — spec: docs/superpowers/specs/2026-08-13-renewal-fake-financial-docs-design.md §6.3
 *
 * openapi/certificate-service.yaml ประกาศ POST /certificates/{certificateId}/renew
 * ที่ไม่มี route รองรับในระบบ — สัญญาที่ประกาศออกไปต้องตรงกับสิ่งที่มีอยู่จริง
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

const spec = readFileSync(
    resolve(__dirname, '../../../../openapi/certificate-service.yaml'),
    'utf8',
);

describe('[ใบ 1 §6.3] OpenAPI ไม่ประกาศ endpoint ที่ไม่มีอยู่จริง', () => {
    it('ไม่มี path /certificates/{certificateId}/renew', () => {
        expect(spec).not.toContain('/certificates/{certificateId}/renew');
    });

    it('ไม่มี operationId renewCertificate', () => {
        expect(spec).not.toContain('renewCertificate');
    });

    // กันตัดเกิน — path เพื่อนบ้านและ section ถัดไปต้องยังอยู่ครบ
    it('path ก่อนหน้ายังอยู่', () => {
        expect(spec).toContain('/certificates/{certificateId}/revoke:');
        expect(spec).toContain('operationId: revokeCertificate');
    });

    it('section components ยังอยู่ที่คอลัมน์ 0', () => {
        expect(spec).toMatch(/^components:$/m);
        expect(spec).toMatch(/^  securitySchemes:$/m);
    });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail จริง**

Run: `cd apps/backend && node node_modules/jest/bin/jest.js __tests__/unit/openapi-no-phantom-renew.test.js`
Expected: FAIL ทั้งสองข้อ

- [ ] **Step 3: ลบ path item**

ลบบรรทัด 376 ถึง 440 ของ `openapi/certificate-service.yaml` (ตั้งแต่ `  /certificates/{certificateId}/renew:` จนถึงบรรทัดว่างก่อน `components:`) ผลลัพธ์: บรรทัดว่างเดิมที่ 375 ตามด้วย `components:` ทันที

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd apps/backend && node node_modules/jest/bin/jest.js __tests__/unit/openapi-no-phantom-renew.test.js`
Expected: PASS ทั้ง 4 ข้อ

หมายเหตุ: ไม่มี YAML parser ในรีโป (`js-yaml` / `yaml` ไม่อยู่ใน dependency ของ workspace ใดเลย — ตรวจแล้ว 2026-08-13) จึงใช้ assertion เชิงโครงใน test แทนการ parse: ข้อ 3 พิสูจน์ว่า path เพื่อนบ้าน `/certificates/{certificateId}/revoke:` (`openapi/certificate-service.yaml:343` operationId) ยังอยู่ และข้อ 4 พิสูจน์ว่า `components:` ยังอยู่ที่คอลัมน์ 0 (เดิมบรรทัด 441-442) — สองข้อนี้จับการตัดเกินได้โดยไม่ต้องเพิ่ม dependency **ห้ามเพิ่ม js-yaml เข้ามาเพื่อ test ข้อนี้**

- [ ] **Step 5: Commit**

```bash
git add openapi/certificate-service.yaml apps/backend/__tests__/unit/openapi-no-phantom-renew.test.js
git commit -m "docs(openapi): drop the certificate renew endpoint that does not exist"
```

---

## Task 5: Gate + evidence pack + PR

**Files:**
- Create: `evidence/renewal-close-online-path/` (RED output, GREEN output, gate output, view-pack)

- [ ] **Step 1: รัน gate เต็ม**

Run: `bash scripts/ci/local-gate.sh`
Expected: PASS · **ถ้า `node` ไม่มีบนเครื่อง gate จะ FAIL 4 ตัวเพราะ infra ไม่ใช่เนื้อหา** — ในกรณีนั้นห้ามเขียน DONE ให้เขียน `BLOCKED(operator:node-runtime)` แล้วแนบ output จริงที่ได้

- [ ] **Step 2: ตรวจ tier**

Run: `bash scripts/probes/tier-check.sh`
บันทึกผลตามที่เครื่องบอก — ห้ามประเมินเอง ถ้าเป็น Tier C ต้องให้ operator merge

- [ ] **Step 3: ตรวจ ratchet**

Run: `bash scripts/probes/ratchet.sh`
Expected: ไม่มีตัวนับเกิน baseline · คัดลอกตัวเลขจาก output ห้ามพิมพ์มือ

- [ ] **Step 4: ทำ view-pack**

ตาม `.claude/skills/gacp-view-in-the-loop` — ภาพก่อน/หลังของ:
1. `/health/applications/renewal` (เดิม = ขั้น upload ของ wizard · ใหม่ = หน้าสถานะ)
2. `/health/applications/renewal` ขั้น quotation และ invoice เดิม (หลักฐานว่าเอกสาร 30,000 หายไปแล้ว)
3. ทางเข้าทั้ง 4 จุด: `health/applications/[id]` , `health/certificates` (2 ปุ่ม) , `health/start` — พิสูจน์ว่ากดแล้วไปหน้าสถานะ
4. จอมือถือ: ขั้นสุดท้ายที่ปุ่มกดไม่ได้ + คำแจ้งบนสุด
พร้อม `INDEX.md` ที่ชี้ทุกภาพ

- [ ] **Step 5: เปิด PR**

PR body ต้องขึ้นต้นด้วย (ตาม `QUEUE.md` R-PR-1 — ห้ามใช้ศัพท์โค้ด):

```
## สรุปสำหรับ operator
1. ผู้ใช้จริงเห็นอะไรเปลี่ยน: หน้าต่ออายุใบรับรองไม่แสดงใบเสนอราคาและใบแจ้งหนี้อีกต่อไป เปลี่ยนเป็นหน้าแจ้งว่ายังไม่เปิดให้บริการพร้อมช่องทางติดต่อเจ้าหน้าที่ · แอปมือถือปุ่มยื่นคำขอต่ออายุกดไม่ได้แล้ว จากเดิมที่กดแล้วขึ้นว่าสำเร็จทั้งที่ไม่มีคำขอเกิดขึ้น
2. ถ้าพลาด อะไรพัง กู้ยากแค่ไหน: ย้อนได้ด้วยการ revert ไม่มีข้อมูลใดถูกเขียนหรือลบ · ความเสี่ยงที่เหลือคือผู้ที่เคยใช้หน้านี้ต้องติดต่อเจ้าหน้าที่แทน
3. มีอะไรที่ operator ต้องตัดสินใจไหม: ยืนยันว่าไม่มีคู่สัญญาภายนอกที่ถือเอกสาร API ฉบับเก่าซึ่งประกาศบริการต่ออายุไว้
```

---

## Self-Review

**Spec coverage**

| spec | task |
|---|---|
| §3 R1 เอกสาร 30,000 | Task 1 |
| §3 R2 404 | Task 2 (คอมเมนต์ ไม่แก้ path — ตาม §4) |
| §3 R3 upload 4 ไฟล์ | Task 1 (ทั้ง wizard ไม่ถูก render) |
| §3 R4 มือถือ | Task 3 |
| §3 R5 openapi | Task 4 |
| §3 หมายเหตุ: ยืนยันการเข้าถึงจอมือถือ | Task 3 Step 1 |
| §4 ข้อห้ามแก้ 404 | Task 2 |
| §6.1 ไม่แตะทางเข้า 4 จุด | ไม่มี task — โดยตั้งใจ ลิงก์เดิมพาไปหน้าสถานะ · Task 5 Step 4 ข้อ 3 ถ่ายภาพพิสูจน์ |
| §6.4 คอมเมนต์กัน | Task 2 |
| §7 T1-T5 | T1,T2 → Task 1 · T3 → Task 3 · T4 → Task 4 · T5 → Task 1 Step 7 |
| §8 DoD | Task 5 |

**Placeholder scan:** ไม่มี TBD/TODO · ทุกขั้นที่แก้โค้ดมีบล็อกโค้ดจริง · ข้อความไทยเขียนเต็มไม่ใช่ "ใส่ข้อความที่เหมาะสม"

**Type consistency:** `RenewalUnavailableView` เป็น default export ชื่อเดียวตลอด (Task 1 Step 3 นิยาม · Step 4 import) · `data-testid="renewal-unavailable"` ใช้ชื่อเดียว · path ของ spec สะกดเหมือนกันทั้ง Task 2 Step 3/6 และ test ทั้งสองตัว
