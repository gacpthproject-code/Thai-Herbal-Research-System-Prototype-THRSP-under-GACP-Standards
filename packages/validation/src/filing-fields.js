'use strict';

/**
 * The กทล.1 ส่วนที่ ๒-๓ fields a six-step filing must state, as the wizard asks them and the
 * submit door checks them, in ONE place (operator order 143(4), 2026-10-27): the land tenure with
 * the land document's type and number (and the owner's name when the land is someone else's),
 * the site's position, the planting volume, and at least one named variety.
 *
 * CommonJS + JSDoc for the reason site-contact.js gives: the browser half and the server half of
 * the wizard both load it.
 *
 * Keys under farmData: landOwnership, landDocumentDetail.{type,number}, landlordName, coordinates
 * (one "ละติจูด, ลองจิจูด" string, split on the comma the way the Farm row is materialised from
 * it), plantsPerCycle, cyclesPerYear, growingMedium. Varieties are the filing's top-level `varieties` rows.
 *
 * The planting volume is a PLANTING question: a PROCESSING filing grows nothing, so its two
 * entries carry `certScope` and are asked only of that scope. A filing that names no scope is a
 * planting filing, the form's first checkbox and the requirement engine's own default.
 *
 * A replacement (ใบแทน) is asked none of them (operator order 147, 2026-10-28): the form's own
 * note says "กรณีขอต่ออายุใบอนุญาตหรือขอรับใบแทนใบอนุญาต ไม่ต้องกรอกข้อมูลในส่วนที่ ๑ และส่วนที่ ๒",
 * and a replacement is reissued from the certificate it replaces. A renewal stays asked: its
 * answers are carried over from the previous filing for the applicant to confirm.
 *
 * The request type is read the way the requirement engine reads it (requestTypeOf): the
 * server-owned keys requestType / replacementOf / renewalOf, which only a door that verified the
 * claim against a certificate writes (application-law-dimensions.js). In the browser the store
 * holds the same words.
 *
 * These fields are judged where the applicant files or refiles the form (first submit, revision
 * resubmit). The CAR door sends evidence for a form already accepted at review, so it does not
 * judge them (application-filing-gates.js).
 */

const { GROWING_MEDIA, asksGrowingMedium } = require('./growing-medium');

/** How a draft spells land tenure → the word the requirement register keys on. */
const LAND_TENURE_BY_INPUT = Object.freeze({
    OWNED: 'OWNED',
    OWN: 'OWNED',
    'เจ้าของ': 'OWNED',
    STATE: 'STATE_PERMITTED',
    STATE_PERMITTED: 'STATE_PERMITTED',
    // Land that is not yours, used with the owner's consent: the register files the
    // หนังสือยินยอม under RENTED, the paper DTAM wants for both.
    CONSENT: 'RENTED',
    RENT: 'RENTED',
    RENTED: 'RENTED',
    'เช่า': 'RENTED',
});

/**
 * @param {unknown} value
 * @returns {'OWNED' | 'STATE_PERMITTED' | 'RENTED' | null} the register's word, or null for a word it does not know
 */
function landTenureWord(value) {
    const word = typeof value === 'string' ? value.trim() : '';
    return LAND_TENURE_BY_INPUT[word] || LAND_TENURE_BY_INPUT[word.toUpperCase()] || null;
}

/** Land held by a lease or a consent letter: the letter names its owner. */
function needsLandlordName(value) {
    const word = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return word === 'RENTED' || word === 'RENT' || word === 'เช่า' || word === 'CONSENT';
}

/** A plain decimal degree as a farmer types it: digits with an optional fraction, never 1e1 or 0x10. */
const DECIMAL_DEGREES = /^[+-]?\d+(\.\d+)?$/;

/**
 * "ละติจูด, ลองจิจูด" as typed → the pair, or null when the text is not two decimal numbers on the globe.
 * @param {unknown} text
 * @returns {{ latitude: number, longitude: number } | null}
 */
function parseCoordinatePair(text) {
    if (typeof text !== 'string') { return null; }
    const parts = text.split(',').map((part) => part.trim());
    if (parts.length !== 2 || !parts.every((part) => DECIMAL_DEGREES.test(part))) { return null; }
    const [latitude, longitude] = parts.map(Number);
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { return null; }
    return { latitude, longitude };
}

/**
 * @typedef {{ certScope?: unknown, requestType?: unknown, replacementOf?: unknown, renewalOf?: unknown }} FilingKind
 *   What the filing asks for: a stored formData, or the wizard store's own answers.
 */

const REQUEST_TYPES = Object.freeze(['NEW', 'RENEWAL', 'REPLACEMENT']);

/**
 * The request a filing makes. A replacementOf link is a replacement whatever word sits beside
 * it, a known word is itself, a renewalOf link alone is a renewal, and anything else is NEW,
 * the strictest reading.
 * @param {FilingKind | null | undefined} filing
 * @returns {'NEW' | 'RENEWAL' | 'REPLACEMENT'}
 */
function requestTypeOf(filing) {
    const kind = asObject(filing);
    if (stated(kind.replacementOf)) { return 'REPLACEMENT'; }
    const word = typeof kind.requestType === 'string' ? kind.requestType.trim().toUpperCase() : '';
    if (REQUEST_TYPES.includes(word)) { return word; }
    return stated(kind.renewalOf) ? 'RENEWAL' : 'NEW';
}

/** Whether the filing fills ส่วนที่ ๒ at all: a replacement does not. */
function asksSectionTwo(filing) {
    return requestTypeOf(filing) !== 'REPLACEMENT';
}

/**
 * The certificate a filing asks for.
 * @param {unknown} certScope the filing's `certScope`
 * @returns {'PLANTING' | 'PROCESSING'}
 */
function certScopeOf(certScope) {
    return certScope === 'PROCESSING' ? 'PROCESSING' : 'PLANTING';
}

/** A count of plants or of planting rounds: a whole number above zero. */
function isPositiveCount(value) {
    const text = typeof value === 'number' ? String(value) : (typeof value === 'string' ? value.trim() : '');
    return /^\d+$/.test(text) && Number(text) > 0;
}

function stated(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * @typedef {{ key: string, path: string, labelTh: string, messageTh: string }} FieldGap
 *   key: the farmData key the screen writes · path: the name the 422 carries
 */

/** The site fields, in the order the paper asks them. An entry with `certScope` is asked of that scope only. */
const SITE_FIELDS = Object.freeze([
    {
        key: 'landOwnership', path: 'land_tenure', labelTh: 'สิทธิในที่ดิน',
        messageTh: 'กรุณาเลือกสิทธิในที่ดิน',
        missing: (farm) => landTenureWord(farm.landOwnership) === null,
    },
    {
        key: 'landDocumentDetail.type', path: 'land_document_type', labelTh: 'ประเภทเอกสารสิทธิ์',
        messageTh: 'กรุณาระบุประเภทเอกสารสิทธิ์ เช่น โฉนด น.ส.3 ส.ป.ก.',
        missing: (farm) => !stated(asObject(farm.landDocumentDetail).type),
    },
    {
        key: 'landDocumentDetail.number', path: 'land_document_number', labelTh: 'เลขที่เอกสารสิทธิ์',
        messageTh: 'กรุณาระบุเลขที่เอกสารสิทธิ์',
        missing: (farm) => !stated(asObject(farm.landDocumentDetail).number),
    },
    {
        key: 'landlordName', path: 'landlord_name', labelTh: 'ชื่อเจ้าของที่ดิน',
        messageTh: 'กรุณาระบุชื่อเจ้าของที่ดิน หนังสือยินยอมหรือสัญญาเช่าต้องมีชื่อนี้',
        missing: (farm) => needsLandlordName(farm.landOwnership) && !stated(farm.landlordName),
    },
    {
        key: 'coordinates', path: 'coordinates', labelTh: 'พิกัดที่ตั้ง',
        messageTh: 'กรุณากรอกพิกัดที่ตั้งเป็นละติจูด, ลองจิจูด เช่น 18.7883, 98.9853',
        missing: (farm) => parseCoordinatePair(farm.coordinates) === null,
    },
    {
        key: 'plantsPerCycle', path: 'plants_per_cycle', labelTh: 'จำนวนต้นต่อรอบการปลูก',
        messageTh: 'กรุณาระบุจำนวนต้นต่อรอบการปลูกเป็นจำนวนเต็มมากกว่า 0',
        missing: (farm) => !isPositiveCount(farm.plantsPerCycle),
        certScope: 'PLANTING',
    },
    {
        key: 'cyclesPerYear', path: 'cycles_per_year', labelTh: 'จำนวนรอบการปลูกต่อปี',
        messageTh: 'กรุณาระบุจำนวนรอบการปลูกต่อปีเป็นจำนวนเต็มมากกว่า 0',
        missing: (farm) => !isPositiveCount(farm.cyclesPerYear),
        certScope: 'PLANTING',
    },
    {
        key: 'growingMedium', path: 'growing_medium', labelTh: 'ปลูกในดินหรือไม่ใช้ดิน',
        messageTh: 'กรุณาเลือกว่าอาคารระบบปิดปลูกในดินหรือไม่ใช้ดิน',
        missing: (farm) => asksGrowingMedium(farm.areaTypes) && !GROWING_MEDIA.includes(farm.growingMedium),
    },
    {
        key: 'growingMedium', path: 'growing_medium', labelTh: 'ปลูกในดินหรือไม่ใช้ดิน',
        messageTh: 'ตอบเรื่องปลูกในดินหรือไม่ใช้ดินได้เฉพาะเมื่อเลือกอาคารระบบปิด',
        missing: (farm) => !asksGrowingMedium(farm.areaTypes) && farm.growingMedium !== undefined && farm.growingMedium !== null,
    },
]);

/**
 * The site fields this filing is asked: none for a replacement, otherwise the scope's.
 * @param {FilingKind | null | undefined} filing
 */
function siteFieldsFor(filing) {
    if (!asksSectionTwo(filing)) { return []; }
    const scope = certScopeOf(asObject(filing).certScope);
    return SITE_FIELDS.filter((field) => !field.certScope || field.certScope === scope);
}

/**
 * What a filing's site block still lacks, in the paper's order.
 * @param {Record<string, unknown> | null | undefined} farmData
 * @param {FilingKind | null | undefined} [filing] absent means a NEW planting filing
 * @returns {FieldGap[]}
 */
function siteFieldGaps(farmData, filing) {
    const farm = asObject(farmData);
    return siteFieldsFor(filing)
        .filter((field) => field.missing(farm))
        .map(({ key, path, labelTh, messageTh }) => ({ key, path, labelTh, messageTh }));
}

const VARIETY_GAP = Object.freeze({
    key: 'varieties', path: 'name', labelTh: 'ชื่อสายพันธุ์',
    messageTh: 'กรุณาระบุชื่อสายพันธุ์อย่างน้อยหนึ่งรายการ',
});

/**
 * The variety rows that name a variety. A blank row the applicant started and could not
 * remove is not a variety, and does not block one that is named.
 * @param {unknown} rows
 */
function namedVarieties(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => stated(asObject(row).name));
}

/**
 * @param {unknown} rows the filing's `varieties`
 * @param {FilingKind | null | undefined} [filing] a replacement names no variety
 * @returns {FieldGap[]}
 */
function varietyGaps(rows, filing) {
    if (!asksSectionTwo(filing)) { return []; }
    return namedVarieties(rows).length > 0 ? [] : [{ ...VARIETY_GAP }];
}

module.exports = {
    LAND_TENURE_BY_INPUT,
    SITE_FIELDS,
    requestTypeOf,
    asksSectionTwo,
    landTenureWord,
    needsLandlordName,
    parseCoordinatePair,
    isPositiveCount,
    siteFieldsFor,
    siteFieldGaps,
    namedVarieties,
    varietyGaps,
};
