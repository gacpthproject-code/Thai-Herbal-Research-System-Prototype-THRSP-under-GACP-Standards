/**
 * x4-fix-d-a11y-polish.test.ts — X4-FIX-D regression suite.
 *
 * Pins the 6 fix groups landed by X4-FIX-D against the X4 audit:
 *
 *   H-7  · 5 modal headers raw bg-emerald-700 → bg-primary token
 *   H-11 · 7 modals first-input autoFocus (WAI-ARIA APG)
 *   H-9  · 9 irreversible-action buttons bumped 32-40px → 44px (WCAG 2.5.5)
 *   H-10 · accounting dashboard ยกเลิก / ดู buttons → 44px
 *   H-12 · (receipts page removed 2026-10-06: receipts are issued by the webhook)
 *   M-10 · whtAmount input has inputMode="decimal"
 *   H-4  · RETIRED 2026-09-27 — the 5 DTAM-gate sites and <DtamForbiddenCallout>
 *          were deleted (operator 2026-09-11 "finance ต้องเห็นเหมือนกัน"); the
 *          suite now pins that no DTAM gate remains on those pages
 *
 * Strategy — source-grep (same pattern X3-FIX-B used for gov-gradient
 * regression: `x3-fix-b-gov-gradient.test.tsx`). Mounting the modal
 * components requires heavy provider mocks (auth, api, sonner) that are
 * orthogonal to the class/attribute contracts being pinned here. The
 * JSX-level contract is the truth — render-time fidelity is covered by
 * the existing per-modal test files (close-period-modal.test.tsx etc).
 *
 * If any of the X4-FIX-D edits gets reverted accidentally, this suite
 * fails fast on the next CI run.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ACC_ROOT = path.resolve(
    __dirname,
    '..',
);

// The refund confirm pane moved into refund-record-panel.tsx (order 22, 2026-10-06).
const INVOICE_DETAIL = readFileSync(path.join(ACC_ROOT, 'refund-record-panel.tsx'), 'utf8');
// subscription-cancel-modal.tsx ถูกลบ 2026-09-11 พร้อมพื้นผิวแพ็กเกจสมาชิกทั้งชุด
// B5: the accounting dashboard UI was extracted from page.tsx into the
// shared accounting-dashboard-client.tsx (so the per-side landing routes
// /dtam + /platform render the same component). The source-grep contracts
// below now read the client where the JSX actually lives. page.tsx is now a
// thin wrapper that just renders <AccountingDashboardClient />.
const ACC_DASHBOARD = readFileSync(path.join(ACC_ROOT, 'accounting-dashboard-client.tsx'), 'utf8');

const WHT_RECORD = readFileSync(
    path.join(ACC_ROOT, 'wht', 'record-certificate-modal.tsx'),
    'utf8',
);
const WHT_CLIENT = readFileSync(
    path.join(ACC_ROOT, 'wht', 'client-view.tsx'),
    'utf8',
);

const REPORTS_CLIENT = readFileSync(
    path.join(ACC_ROOT, 'reports', 'client-view.tsx'),
    'utf8',
);


// ── H-7 — 5 modal headers emerald → primary ─────────────────────────────────
describe('X4-FIX-D H-7 — modal headers bg-emerald-700 → bg-primary', () => {
    it('record-certificate-modal header is bg-primary not raw emerald', () => {
        expect(WHT_RECORD).toMatch(/DialogHeader[^>]*bg-primary[^>]*p-5[^>]*text-primary-foreground/);
        expect(WHT_RECORD).not.toMatch(/DialogHeader[^>]*bg-emerald-700/);
    });

});

// ── H-11 — 7 modals first-input autoFocus ──────────────────────────────────
describe('X4-FIX-D H-11 — modals receive first-input autoFocus', () => {
    it('record-certificate-modal invoiceId input has autoFocus', () => {
        expect(WHT_RECORD).toMatch(/id="wht-cert-invoice-id"[\s\S]*?jsx-a11y\/no-autofocus[\s\S]*?autoFocus/);
    });

    it('invoice-detail-modal refund-confirm sub-state focuses the safe cancel', () => {
        // X4-FIX-D chose to focus the *safe* (cancel) button so the first
        // Enter doesn't accidentally fire the destructive refund.
        expect(INVOICE_DETAIL).toMatch(/key="refund-confirm-pane"/);
        expect(INVOICE_DETAIL).toMatch(/safe-action focus[\s\S]*?autoFocus/);
    });
});

// ── H-9 + H-10 — 9 irreversible buttons + dashboard ตรวจ → 44px ────────────
describe('X4-FIX-D H-9 / H-10 — irreversible-action buttons 44px (WCAG 2.5.5)', () => {
    it('invoice-detail refund-confirm + cancel buttons are 44px', () => {
        // Two adjacent buttons inside the refund-confirm sub-state.
        const matches = INVOICE_DETAIL.match(/min-h-\[44px\] min-w-\[44px\] flex-1 rounded-xl/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    // Minimal redesign (2026-07): the radius token on these CTAs moved
    // rounded-xl -> rounded-lg (`borderRadius.lg: var(--radius)`); the 44px
    // tap-target contract this suite exists to protect is unchanged.
    // ปุ่ม "ยกเลิก" ของแพ็กเกจสมาชิกเคยถูกตรึงไว้ที่นี่ด้วย — แท็บแพ็กเกจสมาชิกถูกลบทั้งแท็บ
    // 2026-09-11 (operator: แพลตฟอร์มไม่มีบริการนี้) เหลือปุ่มของใบแจ้งหนี้ซึ่งยังอยู่จริง
    it('accounting dashboard invoice ดู button is 44px', () => {
        expect(ACC_DASHBOARD).toMatch(
            /aria-label="ดูรายละเอียดใบแจ้งหนี้"[\s\S]*?min-h-\[44px\] min-w-\[44px\] rounded-lg p-0/,
        );
    });
});

// ── M-10 — 2 amount fields receive inputMode="decimal" ─────────────────────
describe('X4-FIX-D M-10 — amount fields have inputMode="decimal"', () => {
    it('wht record-certificate whtAmount input declares inputMode="decimal"', () => {
        expect(WHT_RECORD).toMatch(/id="wht-cert-amount"[\s\S]*?inputMode="decimal"/);
    });
});

// ── H-4 retired — no DTAM gate left on the five accounting pages ──────────
// เดิม: ห้าหน้านี้ต้อง import + render <DtamForbiddenCallout> · คำตัดสิน operator 2026-09-11
// ("finance ต้องเห็นเหมือนกัน") ลบประตูนั้นทิ้ง ⇒ ตอนนี้ตรึงว่าไม่มีประตูแบบนั้นเหลือ
describe('X4-FIX-D H-4 (retired) — the accounting pages carry no DTAM gate', () => {
    const SITES: ReadonlyArray<{ name: string; src: string }> = [
        { name: 'reports/client-view.tsx', src: REPORTS_CLIENT },
        { name: 'wht/client-view.tsx', src: WHT_CLIENT },
    ];

    it.each(SITES)('$name neither imports nor renders DtamForbiddenCallout', ({ src }) => {
        expect(src).not.toMatch(/DtamForbiddenCallout/);
        expect(src).not.toMatch(/getAccountSide|accountSide === 'DTAM'/);
    });

    it.each(SITES)('$name no longer holds the verbatim 25-line amber-card block', ({ src }) => {
        const stillHasOldGate = /<div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-8 text-center">[\s\S]*?<IconBuildingBank[\s\S]*?size=\{48\}[\s\S]*?text-amber-700/.test(src);
        expect(stillHasOldGate).toBe(false);
    });
});

// ── Annotation sentinel — every patch carries an X4-FIX-D tag for trace ───
describe('X4-FIX-D — annotation comments present on every patched site', () => {
    it.each([
        ['record-certificate-modal.tsx', WHT_RECORD],
        ['invoice-detail-modal.tsx', INVOICE_DETAIL],
        ['accounting/accounting-dashboard-client.tsx', ACC_DASHBOARD],
        // reports / wht client views dropped out: their only X4-FIX-D patch was the H-4 DTAM
        // gate, deleted 2026-09-27 (see the retired H-4 block above). The period-close,
        // manual-journal-entries and purchase-invoices files left with their pages (F-A8b-15).
    ] as ReadonlyArray<readonly [string, string]>)(
        '%s carries an X4-FIX-D trace comment',
        (_name, src) => {
            expect(src).toMatch(/X4-FIX-D/);
        },
    );
});
