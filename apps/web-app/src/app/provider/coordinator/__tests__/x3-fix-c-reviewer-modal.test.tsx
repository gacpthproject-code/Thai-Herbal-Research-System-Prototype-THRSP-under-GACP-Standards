/**
 * x3-fix-c-reviewer-modal.test.tsx — Loop X Iter 3 (X3-FIX-C).
 *
 * Coordinator (dispatcher) reviewer-assignment modal:
 *
 *   1. M-9 — the modal was hand-rolled, so it lacked the Dialog
 *      primitive's Escape handling. It is now the Dialog primitive
 *      (2026-10-10), which closes on Escape, keeps focus inside, and
 *      renders above the phone tab bar that used to cover its buttons.
 *   2. H-11 — the first interactive control inside the modal (the
 *      reviewer `<select>`) now carries `autoFocus` so keyboard
 *      users do not have to Tab past the dialog title + close icon.
 *   3. M-7 — decorative lucide icons used in tab triggers, action
 *      buttons, and the empty-state are now `aria-hidden="true"` so
 *      screen readers do not announce them.
 *
 * Strategy: production-source grep for the M-7 + M-9 + H-11 wiring
 * (cheap, deterministic, blocks future regressions). Whether the modal's
 * buttons can be reached on a desktop and a phone is checked in a real
 * browser by playwright/dispatcher-dialogs-reachable.spec.ts.
 */

import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const coordinatorSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'client-view.tsx'),
    'utf8',
);
const contextPanelSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'coordinator-context-panel.tsx'),
    'utf8',
);

describe('[X3-FIX-C / M-9] Coordinator reviewer modal — the Dialog primitive (source)', () => {
    it('is built on the Dialog primitive, with no hand-rolled overlay or Escape listener left', () => {
        expect(coordinatorSrc).toContain('from "@/components/ui/primitives/dialog"');
        expect(coordinatorSrc).toMatch(/<DialogContent[^>]*>[\s\S]*?จ่ายงานตรวจเอกสาร[\s\S]*?ยืนยันจ่ายงาน/);
        expect(coordinatorSrc).not.toContain('aria-modal');
        expect(coordinatorSrc).not.toContain("event.key === 'Escape'");
    });
});

describe('[X3-FIX-C / H-11] Coordinator reviewer modal — autoFocus on select (source)', () => {
    it('declares autoFocus + the standard eslint-disable on the reviewer select', () => {
        // The select is the first focusable control after the close
        // icon — autoFocus ensures keyboard users land on it.
        expect(coordinatorSrc).toContain('id={reviewerSelectId}');
        expect(coordinatorSrc).toContain(
            'eslint-disable-next-line jsx-a11y/no-autofocus',
        );
        // Verify the autoFocus token appears inside the reviewer
        // <select> opening tag (between `<select` and the first
        // `<option`). We can't just use `>` as a terminator because
        // arrow-function syntax (`(e) =>`) contains it.
        const selectOpenIdx = coordinatorSrc.indexOf(
            '<select\n              id={reviewerSelectId}',
        );
        expect(selectOpenIdx).toBeGreaterThan(-1);
        const firstOptionIdx = coordinatorSrc.indexOf('<option', selectOpenIdx);
        const reviewerBlock = coordinatorSrc.slice(selectOpenIdx, firstOptionIdx);
        expect(reviewerBlock).toContain('autoFocus');
    });
});

describe('[X3-FIX-C / M-7] Coordinator lucide icons aria-hidden (source)', () => {
    it('decorative icons next to text labels carry aria-hidden="true"', () => {
        // Spot-check a handful of the bulk-update icons across the
        // dashboard. Each of these renders next to a Thai label, so
        // they are decorative and should be hidden from AT.
        expect(coordinatorSrc).toContain('<RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true"');
        expect(coordinatorSrc).toContain('<FileCheck size={14} className="mr-1" aria-hidden="true"');
        expect(coordinatorSrc).toContain('<Calendar size={14} className="mr-1" aria-hidden="true"');
        expect(coordinatorSrc).toContain('<UserCheck size={14} className="mr-1.5" aria-hidden="true"');
        expect(coordinatorSrc).toContain('<AlertCircle size={14} className="mr-1" aria-hidden="true"');
        expect(coordinatorSrc).toContain('<ChevronRight size={16} className="ml-1" aria-hidden="true"');
    });

    it('coordinator-context-panel decorative icons also carry aria-hidden', () => {
        // The right-rail context panel renders Flame/Calendar/Clock/Users
        // alongside their tile titles. All should be decorative-hidden.
        // Minimal-redesign pass (2026-07-24): these dropped from size={20} in a
        // 40px tinted icon tile to a plain size={16} glyph beside the heading.
        // The aria-hidden contract this test exists for is unchanged.
        expect(contextPanelSrc).toContain('<Flame size={16} className="shrink-0 text-destructive" aria-hidden="true"');
        expect(contextPanelSrc).toContain('<Calendar size={16} className="shrink-0 text-muted-foreground" aria-hidden="true"');
        expect(contextPanelSrc).toContain('<Users size={16} className="shrink-0 text-muted-foreground" aria-hidden="true"');
    });
});
