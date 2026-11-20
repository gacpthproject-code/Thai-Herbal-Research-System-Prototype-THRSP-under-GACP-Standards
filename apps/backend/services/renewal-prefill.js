'use strict';

/**
 * What a renewal starts with (operator order 143 (3), 2026-10-27): the previous filing's
 * answers to wizard steps 3-4, each still editable. กทล.1 does not refill ส่วนที่ ๑-๒ for a
 * renewal, so the applicant is not asked to type them again.
 *
 * Not carried, on purpose:
 *   - the holder (step 2) is the holder record, read live; identity is never copied in;
 *   - uploads: DTAM's baseline lists what a renewal attaches but says nothing about reusing
 *     the previous filing's files or how long they stay valid, so none are carried;
 *   - farmData.siteContactInformed: a statement about THIS inspection, asked again;
 *   - any farmData key step 3 does not ask (a filing from the pre-2026-09 wizard stored the
 *     site under other names, and a tenure word that wizard used is not one of step 3's).
 */

const { PURPOSE_CODES } = require('../shared/certification-purposes');
const { AREA_TYPES } = require('../validation/canonical-application-validator');
const { GROWING_MEDIA, asksGrowingMedium } = require('@gacp/validation/growing-medium');

/** ข้อ ๒ (๑) สิทธิในที่ดิน as step 3 offers it (step3-site-land-config.ts LAND_TENURE_OPTIONS). */
const LAND_TENURES = Object.freeze(['OWNED', 'STATE_PERMITTED', 'RENTED', 'CONSENT']);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function isBlank(value) {
    if (value === null || value === undefined || value === '') { return true; }
    if (Array.isArray(value)) { return value.length === 0; }
    if (isPlainObject(value)) { return Object.values(value).every(isBlank); }
    return false;
}

const asFiled = (value) => value;
const oneOf = (words) => (value) => (words.includes(value) ? value : null);
const onlyWords = (words) => (value) => (Array.isArray(value) ? value.filter((word) => words.includes(word)) : null);

/** Step 3's fields of `farmData` (step3-site-land.tsx), each with what the renewal accepts from the previous filing. */
const SITE_LAND_FIELDS = Object.freeze({
    siteName: asFiled,
    siteAddress: asFiled,
    subDistrict: asFiled,
    district: asFiled,
    province: asFiled,
    postalCode: asFiled,
    coordinates: asFiled,
    sitePhone: asFiled,
    siteContactName: asFiled,
    siteContactIsApplicant: asFiled,
    landOwnership: oneOf(LAND_TENURES),
    landlordName: asFiled,
    landConsentValidUntil: asFiled,
    landDocumentDetail: asFiled,
    areaTypes: onlyWords(AREA_TYPES),
    growingMedium: oneOf(GROWING_MEDIA),
    areaSqm: asFiled,
    plantsPerCycle: asFiled,
    cyclesPerYear: asFiled,
});

/** farmData field by field: a field the renewal has answered is kept, a blank one takes the previous filing's. */
function fillSiteLand(previous, current) {
    const have = isPlainObject(current) ? current : {};
    const from = isPlainObject(previous) ? previous : {};
    const filled = { ...have };
    let added = false;
    for (const [field, accept] of Object.entries(SITE_LAND_FIELDS)) {
        if (!isBlank(have[field])) { continue; }
        const value = accept(from[field]);
        if (isBlank(value)) { continue; }
        filled[field] = value;
        added = true;
    }
    if (filled.growingMedium !== have.growingMedium && !asksGrowingMedium(filled.areaTypes)) {
        delete filled.growingMedium;
    }
    return added ? filled : null;
}

const whenBlank = (accept) => (previous, current) => (isBlank(current) ? accept(previous) : null);

/** Wizard key → what the renewal takes from the previous filing's value under the same key, given its own answer. */
const RENEWAL_PREFILL = Object.freeze({
    farmData: fillSiteLand,
    varieties: whenBlank((rows) => (Array.isArray(rows) ? rows : null)),
    varietiesNote: whenBlank((note) => (typeof note === 'string' ? note : null)),
    processing: whenBlank((processing) => (isPlainObject(processing) ? processing : null)),
    certificationPurposes: whenBlank((codes) => (Array.isArray(codes) ? codes.filter((code) => PURPOSE_CODES.includes(code)) : null)),
});

/**
 * @param {object} previousFiling the formData of the application that issued the certificate
 * @param {object} answers        the renewal's answers as they stand after this save's merge
 * @returns {object} the keys to write: each the renewal's answer completed from the previous filing
 */
function renewalPrefill(previousFiling, answers) {
    const previous = isPlainObject(previousFiling) ? previousFiling : {};
    const current = isPlainObject(answers) ? answers : {};
    const fill = {};
    for (const [key, take] of Object.entries(RENEWAL_PREFILL)) {
        const value = take(previous[key], current[key]);
        if (!isBlank(value)) { fill[key] = value; }
    }
    return fill;
}

module.exports = { renewalPrefill };
