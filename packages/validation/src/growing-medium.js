'use strict';

// Order 159 soil follow-up 2 (operator 2026-11-04): the paper กทล.1 has no such question.

/** @typedef {'SOIL' | 'SOILLESS'} GrowingMedium */

const GROWING_MEDIUM_OPTIONS = Object.freeze([
    Object.freeze({ value: 'SOIL', labelTh: 'ปลูกในดิน' }),
    Object.freeze({ value: 'SOILLESS', labelTh: 'ไม่ใช้ดิน' }),
]);

/** @type {ReadonlyArray<GrowingMedium>} */
const GROWING_MEDIA = Object.freeze(GROWING_MEDIUM_OPTIONS.map((option) => /** @type {GrowingMedium} */ (option.value)));

function areaWords(areaTypes) {
    return (Array.isArray(areaTypes) ? areaTypes : []).map((value) => String(value ?? '').trim().toUpperCase());
}

/** @param {unknown} areaTypes */
function asksGrowingMedium(areaTypes) {
    return areaWords(areaTypes).includes('INDOOR');
}

/**
 * @param {{ areaTypes?: unknown, growingMedium?: unknown } | null | undefined} farmData
 * @returns {GrowingMedium | null}
 */
function growingMediumOf(farmData) {
    const farm = farmData && typeof farmData === 'object' ? farmData : {};
    if (!asksGrowingMedium(farm.areaTypes)) { return null; }
    return GROWING_MEDIA.find((word) => word === farm.growingMedium) ?? null;
}

/** @param {{ areaTypes?: unknown, growingMedium?: unknown } | null | undefined} farmData */
function growsOnlyWithoutSoil(farmData) {
    const words = new Set(areaWords(farmData?.areaTypes));
    return words.size === 1 && words.has('INDOOR') && growingMediumOf(farmData) === 'SOILLESS';
}

/** @param {unknown} medium */
function growingMediumLabelTh(medium) {
    return GROWING_MEDIUM_OPTIONS.find((option) => option.value === medium)?.labelTh ?? null;
}

module.exports = {
    GROWING_MEDIA,
    GROWING_MEDIUM_OPTIONS,
    asksGrowingMedium,
    growingMediumOf,
    growsOnlyWithoutSoil,
    growingMediumLabelTh,
};
