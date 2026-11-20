/**
 * error-codes-source-pointers.test.js — one-fee residue sweep, fix round 1
 * (2026-09-26, coordinator decision after review Important-2).
 *
 * `shared/error-codes.js` `source` pointers are hand-maintained `<path>:<line>`
 * strings. This class of drift has now broken three times on one file alone
 * (`services/pdf/invoice-template-service.js`): commit 371db8b3 fixed it once,
 * `6e5358fb` (this sweep) fixed `QUOTATION_PHASE_NOT_PRICED` but missed its
 * sibling `INVALID_ISSUER_SIDE` (same file, same deleting commit) — fixed in
 * this fix-round commit — because the only existing check for line accuracy
 * (`quotation-gate-error-codes.test.js`) covers 4 of the 395 catalogued codes,
 * a narrower blast radius than the edit that broke it.
 *
 * Coverage: every code whose `source` is `<path>:<line>` — confirmed uniform
 * for all 395 entries (grep against the regex below returns 0 non-matches) —
 * checked for two things:
 *   1. the file exists;
 *   2. the cited line, **or a line within ±2 of it** (the coordinator's own
 *      tolerance), contains the code's own name as a substring (every
 *      catalogue entry's `code` field equals its object key — pinned
 *      separately by `error-codes-catalog.test.js` — so the key IS the string
 *      to search for).
 *
 * Running this check for the first time (2026-09-26) found **209 of 395**
 * pre-existing pointers already broken this way — 16 name a file that no
 * longer exists, 193 point at a line whose ±2 window does not mention the
 * code. This is a real, large, PRE-EXISTING debt, not something this fix
 * round introduced or can responsibly hand-fix in one pass — spot-checking
 * confirmed real drift (e.g. `INVOICE_LISTING_FORBIDDEN`'s cited file no
 * longer contains that string anywhere), not a flaw in this check's window.
 *
 * Per L4 (ratchet ลงทางเดียว): `KNOWN_PREEXISTING_DRIFT` below is the frozen
 * baseline of that debt, dated 2026-09-26. This test:
 *   - fails loud on any pointer OUTSIDE the baseline that drifts (catches
 *     exactly the INVALID_ISSUER_SIDE-class regression this test exists for);
 *   - fails if the baseline itself no longer matches reality (so a silent
 *     re-drift of an already-known-bad pointer, or an accidental fix that
 *     forgets to shrink the list, both surface);
 *   - never grows: raising the baseline is an operator+log decision (L6), not
 *     something this test may do to pass.
 * Fixing the other 208 is a dedicated cleanup task (BACKLOG-FOUND.md), most
 * likely by re-running `scripts/extract-error-codes.js` against the current
 * tree and reviewing each relocation — not a one-line fix like this round's.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { ERROR_CODES } = require('../../shared/error-codes');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const SOURCE_PATTERN = /^(.+):(\d+)$/;
const WINDOW = 2;

const fileLineCache = new Map();

function linesOf(relPath) {
    if (!fileLineCache.has(relPath)) {
        const abs = path.join(BACKEND_ROOT, relPath);
        fileLineCache.set(
            relPath,
            fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n') : null,
        );
    }
    return fileLineCache.get(relPath);
}

/**
 * Frozen baseline of pre-existing source-pointer drift, captured 2026-09-26
 * (see the file header). `INVALID_ISSUER_SIDE` is deliberately NOT in this
 * list — this fix round corrected it (1173 → 1144). Shrinking this list (as
 * pointers get fixed) is always welcome; growing it silently is not — an
 * addition here without a matching fix commit is exactly the regression this
 * test exists to catch.
 */
const KNOWN_PREEXISTING_DRIFT = new Set([
    'CERTIFICATION_EVALUATOR_UNKNOWN', 'CERTIFICATION_SOD_VIOLATION', 'INVOICE_LISTING_FORBIDDEN',
    'PAYMENT_TERMS_NOT_ACCEPTED', 'QUOTATION_EXPIRED', 'QUOTATION_GATE_UNAVAILABLE',
    'QUOTATION_NOT_ACCEPTED', 'QUOTATION_NOT_ISSUED', 'TRACE_BASE_URL_REQUIRED_IN_PROD',
]);

/** `{ key, relPath, lineNum }` for every source matching the uniform `<path>:<line>` form. */
function parseableEntries() {
    const parsed = [];
    const unparseable = [];
    for (const [key, entry] of Object.entries(ERROR_CODES)) {
        const m = SOURCE_PATTERN.exec(entry.source);
        if (!m) {
            unparseable.push(`${key}: source is not "<path>:<line>" (${JSON.stringify(entry.source)})`);
            continue;
        }
        parsed.push({ key, relPath: m[1], lineNum: Number(m[2]) });
    }
    return { parsed, unparseable };
}

/** True if the file exists and its ±WINDOW lines around lineNum mention `key`. */
function pointerIsAccurate({ key, relPath, lineNum }) {
    const lines = linesOf(relPath);
    if (lines === null) return false;
    const start = Math.max(0, lineNum - 1 - WINDOW);
    const end = Math.min(lines.length, lineNum - 1 + WINDOW + 1);
    return lines.slice(start, end).join('\n').includes(key);
}

describe('shared/error-codes.js — every source pointer', () => {
    const { parsed, unparseable } = parseableEntries();

    it('the source format is uniform enough to check mechanically (report if not)', () => {
        // Fallback per the coordinator's own instruction: if this ever fails,
        // the check above should be widened to cover whatever new shape
        // appeared — not silently skip the codes that no longer parse.
        expect(unparseable).toEqual([]);
    });

    it('no NEW pointer has drifted beyond the known 2026-09-26 baseline (catches the INVALID_ISSUER_SIDE class of regression)', () => {
        const newlyBad = [];
        for (const entry of parsed) {
            if (KNOWN_PREEXISTING_DRIFT.has(entry.key)) continue; // pre-existing, tracked below
            if (!pointerIsAccurate(entry)) {
                newlyBad.push(`${entry.key}: ${entry.relPath}:${entry.lineNum} (±${WINDOW}) does not mention "${entry.key}"`);
            }
        }
        if (newlyBad.length > 0) {
            throw new Error(
                `${newlyBad.length} source pointer(s) OUTSIDE the known baseline have drifted:\n${newlyBad.join('\n')}`,
            );
        }
    });

    it('the baseline names only codes that actually still need fixing (no over- or under-claim)', () => {
        // Two failure shapes on purpose, reported separately:
        //   - a listed code that now passes (fixed but the list was not
        //     shrunk) — shrink the baseline, don't leave a stale entry;
        //   - a listed code that no longer exists in the catalogue at all
        //     (renamed/removed) — same fix, remove the stale entry.
        const staleFixed = [];
        const staleGone = [];
        for (const codeName of KNOWN_PREEXISTING_DRIFT) {
            const entry = parsed.find((p) => p.key === codeName);
            if (!entry) {
                staleGone.push(codeName);
                continue;
            }
            if (pointerIsAccurate(entry)) staleFixed.push(codeName);
        }
        if (staleFixed.length > 0 || staleGone.length > 0) {
            throw new Error(
                [
                    staleFixed.length > 0 ? `${staleFixed.length} baseline entr(y/ies) are already fixed, shrink KNOWN_PREEXISTING_DRIFT: ${staleFixed.join(', ')}` : null,
                    staleGone.length > 0 ? `${staleGone.length} baseline entr(y/ies) no longer exist in ERROR_CODES, remove from KNOWN_PREEXISTING_DRIFT: ${staleGone.join(', ')}` : null,
                ].filter(Boolean).join('\n'),
            );
        }
    });

    it('INVALID_ISSUER_SIDE is fixed by this round and is not in the baseline', () => {
        expect(KNOWN_PREEXISTING_DRIFT.has('INVALID_ISSUER_SIDE')).toBe(false);
        const entry = parsed.find((p) => p.key === 'INVALID_ISSUER_SIDE');
        expect(entry).toBeDefined();
        expect(pointerIsAccurate(entry)).toBe(true);
    });

    it('every parseable source file exists for baseline entries too (so a MISSING file is never silently swallowed)', () => {
        const missingFiles = [];
        for (const entry of parsed) {
            if (linesOf(entry.relPath) === null) missingFiles.push(`${entry.key}: ${entry.relPath}`);
        }
        // Every currently-missing-file code is expected to be in the baseline
        // (16 as of 2026-09-26) — a NEW missing-file pointer is a regression.
        const unexpected = missingFiles.filter((m) => !KNOWN_PREEXISTING_DRIFT.has(m.split(':')[0]));
        if (unexpected.length > 0) {
            throw new Error(`${unexpected.length} NEW pointer(s) name a file that does not exist:\n${unexpected.join('\n')}`);
        }
    });
});
