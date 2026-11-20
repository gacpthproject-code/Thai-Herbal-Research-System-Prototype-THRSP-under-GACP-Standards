'use strict';

const {
    LEGAL_DOCUMENT_CHANGE,
    LEGAL_DOCUMENT_HISTORY,
    LEGAL_DOCUMENT_STANDING,
    currentEditionOf,
    requiredEditionOf,
    standingIn,
} = require('@gacp/validation/legal-document-versions');

const { MATERIAL, WORDING } = LEGAL_DOCUMENT_CHANGE;
const { CURRENT, WORDING_NOTICE, MUST_ACKNOWLEDGE } = LEGAL_DOCUMENT_STANDING;

const history = [
    { version: '1.4', effectiveDate: '2026-10-28', change: MATERIAL },
    { version: '1.4.1', effectiveDate: '2026-11-10', change: WORDING },
    { version: '1.5', effectiveDate: '2026-12-01', change: MATERIAL },
    { version: '1.5.1', effectiveDate: '2026-12-20', change: WORDING },
];

describe('standing of a recorded version against a dated history', () => {
    test('nothing recorded, or a version the history never published, must be acknowledged', () => {
        expect(standingIn(history, null)).toBe(MUST_ACKNOWLEDGE);
        expect(standingIn(history, '1.0.0')).toBe(MUST_ACKNOWLEDGE);
    });

    test('a version before the latest material change must be acknowledged again', () => {
        expect(standingIn(history, '1.4')).toBe(MUST_ACKNOWLEDGE);
        expect(standingIn(history, '1.4.1')).toBe(MUST_ACKNOWLEDGE);
    });

    test('a version at or after the latest material change but before a wording change gets a notice, not a block', () => {
        expect(standingIn(history, '1.5')).toBe(WORDING_NOTICE);
    });

    test('the latest version is current', () => {
        expect(standingIn(history, '1.5.1')).toBe(CURRENT);
    });

    test('a wording change alone never asks anyone who acknowledged the material version', () => {
        const wordingOnly = history.slice(0, 2);
        expect(standingIn(wordingOnly, '1.4')).toBe(WORDING_NOTICE);
        expect(standingIn(wordingOnly, '1.4')).not.toBe(MUST_ACKNOWLEDGE);
    });
});

describe.each(Object.keys(LEGAL_DOCUMENT_HISTORY))('the published history of %s', (doc) => {
    const entries = LEGAL_DOCUMENT_HISTORY[doc];

    test('starts with a material version, so the first publication is always acknowledged', () => {
        expect(entries[0].change).toBe(MATERIAL);
    });

    test('is dated in order, with unique versions and a known change kind', () => {
        const dates = entries.map((e) => e.effectiveDate);
        expect([...dates].sort()).toEqual(dates);
        expect(new Set(entries.map((e) => e.version)).size).toBe(entries.length);
        for (const entry of entries) {
            expect(entry.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect([MATERIAL, WORDING]).toContain(entry.change);
        }
    });

    test('the current edition is the newest entry and the required one is the newest material entry', () => {
        expect(currentEditionOf(doc)).toBe(entries[entries.length - 1]);
        expect(requiredEditionOf(doc)).toBe([...entries].reverse().find((e) => e.change === MATERIAL));
    });
});

test('the editions in force today are the ones the pages printed before the registry existed', () => {
    expect(currentEditionOf('PRIVACY_POLICY')).toEqual({ version: '1.4', effectiveDate: '2026-10-28', change: MATERIAL });
    expect(currentEditionOf('TERMS_OF_SERVICE')).toEqual({ version: '1.1', effectiveDate: '2026-10-03', change: MATERIAL });
});

test('no edition is dated in the future: the registry has no notion of an announced edition, so one would be enforced the day it ships', () => {
    const todayInBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    for (const entries of Object.values(LEGAL_DOCUMENT_HISTORY)) {
        for (const entry of entries) {
            expect(entry.effectiveDate <= todayInBangkok).toBe(true);
        }
    }
});
