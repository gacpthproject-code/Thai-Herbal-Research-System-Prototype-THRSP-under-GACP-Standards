'use strict';

/**
 * Statistical disclosure control for counts of people (order 34(5), order 49
 * Q5): a cell of fewer than SMALL_COUNT_THRESHOLD respondents points at those
 * people. The survey aggregates (survey-service getTemplateStats) and the
 * research dataset export (dataset-export-service) apply the same rule.
 * A disclosure floor, not a business rate.
 */
const SMALL_COUNT_THRESHOLD = 5;

/**
 * Small-cell suppression for one breakdown (name → count). Cells under
 * SMALL_COUNT_THRESHOLD are hidden, then the smallest shown cells join them
 * until the hidden cells together hold SMALL_COUNT_THRESHOLD or more: the
 * total minus the shown cells gives back the hidden sum, and a hidden sum of 2
 * across two cells is 1 + 1. When no shown cell is left to add, the whole
 * breakdown is hidden. Hidden cells leave no name behind.
 *
 * `blank` counts people the breakdown already shows without a name (a
 * province never given); they stand in the same blank group as the hidden
 * cells, so they count toward the hidden sum. Ties keep the order of `counts`.
 *
 * @param {Object<string, number>} counts
 * @param {{ blank?: number }} [options]
 * @returns {{ shown: Object<string, number>, hidden: Set<string>, hasSuppressedCells: boolean }}
 */
function suppressSmallCells(counts, { blank = 0 } = {}) {
    const ascending = Object.entries(counts).sort((a, b) => a[1] - b[1]);
    const hidden = new Set(ascending.filter(([, count]) => count < SMALL_COUNT_THRESHOLD).map(([name]) => name));
    let hiddenSum = blank + ascending.filter(([name]) => hidden.has(name)).reduce((sum, [, count]) => sum + count, 0);
    for (const [name, count] of ascending) {
        if (hidden.size === 0 || hiddenSum >= SMALL_COUNT_THRESHOLD) { break; }
        if (hidden.has(name)) { continue; }
        hidden.add(name);
        hiddenSum += count;
    }
    return {
        shown: Object.fromEntries(ascending.filter(([name]) => !hidden.has(name))),
        hidden,
        hasSuppressedCells: hidden.size > 0,
    };
}

module.exports = { SMALL_COUNT_THRESHOLD, suppressSmallCells };
