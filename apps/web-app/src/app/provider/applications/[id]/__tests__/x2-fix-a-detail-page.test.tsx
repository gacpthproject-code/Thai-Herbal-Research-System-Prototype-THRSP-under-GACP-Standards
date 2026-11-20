/**
 * x2-fix-a-detail-page.test.tsx — X2-FIX-A (H-1, H-7, H-10) regression.
 *
 * Source-shape tests covering the patches on
 * `app/provider/applications/[id]/page.tsx`:
 *   - H-1: action panel labels and buttons must read in Thai.
 *   - H-7: history-tab actor attribution uses the fallback chain
 *          `actorName ?? actorRole ?? by ?? "SYSTEM"`.
 *   - H-10: the document-check link enforces the 44×44
 *           touch target (WCAG 2.5.5).
 *
 * Shape — file-read assertions. The project does not pull
 * `@testing-library/react`; sibling tests (review-decision-modal-thai-
 * copy.test.tsx) use `renderToStaticMarkup` but the canReview branch
 * requires the role fetch + isReviewableState predicate to resolve
 * synchronously, which cannot happen in SSR. Reading the source as a
 * string is the same pattern used by `i18n-canonical-source-check.test.
 * ts` elsewhere in the repo to lock JSX-level invariants.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE_SOURCE = readFileSync(
    path.resolve(__dirname, '..', 'page.tsx'),
    'utf8',
);

describe('X2-FIX-A H-1 — action panel buttons Thai', () => {
    it('renders the Thai eyebrow "รอการดำเนินการ" instead of "Action Required"', () => {
        expect(PAGE_SOURCE).toMatch(/รอการดำเนินการ/);
        expect(PAGE_SOURCE).not.toMatch(/Action Required/);
    });

    it('renders the Thai sub-label "รอผลการตรวจ" instead of "Pending Review Decision"', () => {
        expect(PAGE_SOURCE).toMatch(/รอผลการตรวจ/);
        expect(PAGE_SOURCE).not.toMatch(/Pending Review Decision/);
    });

    it('sends the reviewer to the per-document check instead of deciding here', () => {
        // The approve / request-revision buttons here posted /workflow-transitions and
        // skipped the per-document check (staging 2026-10-06: approve shown on a filing
        // whose check said INCOMPLETE). The panel now only opens the check.
        expect(PAGE_SOURCE).toMatch(/data-testid="action-open-document-check"/);
        expect(PAGE_SOURCE).toMatch(/\/provider\/reviewer\/\$\{[^}]+\}\/document-check/);
        expect(PAGE_SOURCE).not.toMatch(/action-approve-documents|action-request-revision/);
        expect(PAGE_SOURCE).not.toMatch(/applicationWorkflowTransitions/);
    });
});

describe('X2-FIX-A H-7 — history tab actor name fallback', () => {
    it('reads the actor name with the documented fallback chain', () => {
        // The chain locks the rendering order:
        //   actorName -> actorRole -> by -> "SYSTEM"
        // Backend admin extension/override handlers persist actorName;
        // the canonical workflow event builder still emits only
        // actorRole, so the fallback keeps history attribution intact
        // for both paths.
        // Post Y1-FIX-C: the final "SYSTEM" fallback is wrapped in
        // (detailDict?.history?.system || "SYSTEM") so the dict can
        // localize the system actor label. The chain order is preserved.
        expect(PAGE_SOURCE).toMatch(
            /item\?\.actorName\s*\?\?\s*item\?\.actorRole\s*\?\?\s*item\?\.by\s*\?\?\s*[(\s\w?.|]*"SYSTEM"/,
        );
    });

    it('no longer uses the legacy actorRole-first fallback', () => {
        // The legacy line was:
        //   By: {item?.actorRole || item?.by || "SYSTEM"}
        // which never surfaced actorName even when present. Guard.
        expect(PAGE_SOURCE).not.toMatch(
            /\{item\?\.actorRole \|\| item\?\.by \|\| "SYSTEM"\}/,
        );
    });
});

describe('X2-FIX-A H-10 — the document-check link keeps the 44×44 touch target', () => {
    it('applies min-h-[44px] min-w-[44px] to the document-check link', () => {
        expect(PAGE_SOURCE).toMatch(
            /min-h-\[44px\][\s\S]*?min-w-\[44px\][\s\S]*?data-testid="action-open-document-check"/,
        );
    });
});
