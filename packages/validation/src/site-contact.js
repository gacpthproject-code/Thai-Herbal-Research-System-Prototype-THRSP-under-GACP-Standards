'use strict';

/**
 * The person on site, as the application wizard asks it and the submit door checks it, in ONE place
 * (operator order 65(2), 2026-10-09). The dispatcher books the visit and the field inspector meets the
 * applicant's side through this contact and no other (orders 29 and 56(3)), so a filing names it:
 * a name and a Thai phone number. When the contact is someone other than the applicant, the applicant
 * confirms having told them that an officer will call and meet them at the site.
 *
 * CommonJS + JSDoc for the reason thai-id-checksum.js gives: the browser half and the server half of
 * the wizard both load it.
 *
 * Keys under farmData: siteContactName, sitePhone, siteContactIsApplicant (set by the wizard's
 * "ใช้ชื่อและเบอร์ของฉัน"), siteContactInformed (the applicant's confirmation).
 */

/**
 * The keys of farmData the rule reads; the rest of farmData passes through unread.
 * @typedef {{ siteContactName?: unknown, sitePhone?: unknown, siteContactIsApplicant?: unknown, siteContactInformed?: unknown }} SiteContactFields
 */

/**
 * A Thai phone number the officer can call: a mobile 06/08/09 + 8 digits, or a landline 02-07 + 7
 * digits; spaces, dashes, dots and brackets are ignored, and +66 stands for the leading 0.
 * @param {unknown} value
 * @returns {boolean}
 */
function isThaiPhoneNumber(value) {
    if (typeof value !== 'string') { return false; }
    const digits = value.replace(/[\s\-.()]/g, '').replace(/^\+66/, '0');
    return /^0[689]\d{8}$/.test(digits) || /^0[2-7]\d{7}$/.test(digits);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function stated(value) {
    return typeof value === 'string' && value.trim() !== '';
}

/**
 * What a filing's on-site contact still lacks: each of 'name', 'phone', 'informed'.
 * @param {SiteContactFields | null | undefined} farmData
 * @returns {Array<'name' | 'phone' | 'informed'>}
 */
function siteContactGaps(farmData) {
    const farm = farmData && typeof farmData === 'object' ? farmData : {};
    const gaps = [];
    if (!stated(farm.siteContactName)) { gaps.push('name'); }
    if (!isThaiPhoneNumber(farm.sitePhone)) { gaps.push('phone'); }
    if (farm.siteContactIsApplicant !== true && farm.siteContactInformed !== true) { gaps.push('informed'); }
    return gaps;
}

/**
 * @param {SiteContactFields | null | undefined} farmData
 * @returns {boolean}
 */
function siteContactComplete(farmData) {
    return siteContactGaps(farmData).length === 0;
}

module.exports = { isThaiPhoneNumber, siteContactGaps, siteContactComplete };
