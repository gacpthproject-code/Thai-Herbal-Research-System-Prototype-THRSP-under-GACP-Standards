/**
 * กทล.1 ส่วนที่ ๒ ข้อ ๑-๒ — where the plants are, and by what right.
 *
 * EXACTLY the paper's fields and nothing else. The v1 site step had grown a water
 * system, an expected-yield estimate and other questions the form never asks; every one
 * of them is a thing a farmer has to answer before they can file, and none of them is a
 * thing anyone is entitled to require. A certification wizard may ask what the law asks.
 *
 * Two of these answers are DIMENSIONS the requirement register matches rules on —
 * `landOwnership` and `areaType` — so changing either changes which papers the filing
 * owes. That is why the screen re-asks the server after they change rather than keeping
 * its own idea of the required set.
 */

import { isThaiPhoneNumber, siteContactComplete } from '@gacp/validation/site-contact';
import { SITE_FIELDS, needsLandlordName as landNeedsOwner, siteFieldGaps, siteFieldsFor } from '@gacp/validation/filing-fields';
import { GROWING_MEDIUM_OPTIONS as GROWING_MEDIA, asksGrowingMedium } from '@gacp/validation/growing-medium';
import type { CertScope, RequestType } from '../hooks/use-application-flow-store.state-types';

/** What the filing asks for, as the store holds it: the declaration reads the same two words off a stored formData. */
export interface FilingKind {
    certScope?: CertScope | null;
    requestType?: RequestType | null;
}

export type LandTenure = 'OWNED' | 'STATE_PERMITTED' | 'RENTED' | 'CONSENT';
export type SiteAreaType = 'OUTDOOR' | 'GREENHOUSE' | 'INDOOR';

export interface ChoiceTH<T extends string> {
    value: T;
    labelTH: string;
}

/** ข้อ ๒ (๑) สิทธิในที่ดิน. The register's words; the applicant reads the labels. */
export const LAND_TENURE_OPTIONS: ReadonlyArray<ChoiceTH<LandTenure>> = Object.freeze([
    { value: 'OWNED', labelTH: 'เป็นเจ้าของที่ดินเอง' },
    { value: 'STATE_PERMITTED', labelTH: 'ได้รับอนุญาตจากหน่วยงานของรัฐ' },
    { value: 'RENTED', labelTH: 'เช่าที่ดินจากผู้อื่น' },
    // A relative's land (operator 2026-10-06): the consent letter is required. The server
    // files CONSENT under the rule set that asks for LANDLORD_CONSENT.
    { value: 'CONSENT', labelTH: 'ที่ดินญาติ / ได้รับยินยอมให้ใช้' },
]);

/**
 * ข้อ ๒ (๒) ลักษณะพื้นที่ปลูก — ติ๊กได้หลายข้อ ตามที่กระดาษวางเป็นแถวเช็กบ็อกซ์
 *
 * **สามข้อ ไม่มี "อื่น ๆ"** (operator 2026-09-11: *"เรามีแค่ 3 อย่างนะ"*)
 *
 * ทำไมข้อนี้สำคัญกว่าที่ตาเห็น: จำนวนข้อที่ติ๊กคือ **ตัวคูณค่าบริการ** (หนึ่งข้อ = 35,310 บาท)
 * และชุดที่ติ๊กคือ **ขอบเขตที่ใบรับรองจะประกาศ** ซึ่งล็อกว่าฟาร์มจะเพิ่มแปลงแบบอื่นได้หรือไม่
 * (certified-scope.js) · ช่องที่สี่จึงไม่ใช่ตัวเลือกที่ไม่มีราคา
 *
 * ประตูยื่นถือคำชุดเดียวกันและปฏิเสธคำอื่นด้วยข้อความไทย
 * (`validation/canonical-application-validator.js` AREA_TYPES)
 */
export const AREA_TYPE_OPTIONS: ReadonlyArray<ChoiceTH<SiteAreaType>> = Object.freeze([
    { value: 'OUTDOOR', labelTH: 'กลางแจ้ง' },
    { value: 'GREENHOUSE', labelTH: 'โรงเรือน' },
    { value: 'INDOOR', labelTH: 'อาคารระบบปิด' },
]);

export type GrowingMedium = 'SOIL' | 'SOILLESS';

export const GROWING_MEDIUM_OPTIONS: ReadonlyArray<ChoiceTH<GrowingMedium>> = Object.freeze(
    GROWING_MEDIA.map((option) => ({ value: option.value as GrowingMedium, labelTH: option.labelTh })),
);

export { asksGrowingMedium };

/**
 * The only unit this form takes.
 *
 * ตารางเมตร, never ไร่ and never a picker. A unit the applicant chooses is a number
 * whose meaning depends on a second field, and this platform has already had to heal 19
 * farms whose area had been stored against the wrong unit.
 */
export const AREA_UNIT_TH = 'ตารางเมตร';

export interface LandDocumentDetail {
    type: string;
    number: string;
    volume: string;
    page: string;
    issuedBy: string;
}

/** Which of the five boxes the submit door demands is the shared declaration's word, not this file's. */
const landDocumentFieldRequired = (key: keyof LandDocumentDetail): boolean =>
    SITE_FIELDS.some((field) => field.key === `landDocumentDetail.${key}`);

export const LAND_DOCUMENT_FIELDS: ReadonlyArray<{ key: keyof LandDocumentDetail; labelTH: string; required: boolean }> =
    Object.freeze(([
        { key: 'type', labelTH: 'ประเภทเอกสารสิทธิ์ เช่น โฉนด น.ส.3 ส.ป.ก.' },
        { key: 'number', labelTH: 'เลขที่เอกสารสิทธิ์' },
        { key: 'volume', labelTH: 'เล่มที่' },
        { key: 'page', labelTH: 'หน้าที่' },
        { key: 'issuedBy', labelTH: 'ออกให้โดย' },
    ] as const).map((field) => ({ ...field, required: landDocumentFieldRequired(field.key) })));

export const STEP3_COPY_TH = Object.freeze({
    siteHeading: 'สถานที่ปลูก',
    landHeading: 'สิทธิในที่ดิน',
    scaleHeading: 'ขนาดพื้นที่และรอบการปลูก',
    documentsHeading: 'เอกสารตามเงื่อนไขของแปลงนี้',
    siteName: 'ชื่อสถานที่ปลูก',
    siteAddress: 'ที่อยู่สถานที่ปลูก (บ้านเลขที่ หมู่ ถนน)',
    // กทล.๑ ส่วนที่ ๒ ข้อ ๑ writes the location as three separate fields; the certificate
    // names them, so they are collected here rather than buried in the free-text address.
    siteProvince: 'จังหวัด',
    siteDistrict: 'อำเภอ/เขต',
    siteSubDistrict: 'ตำบล/แขวง',
    sitePostalCode: 'รหัสไปรษณีย์',
    sitePhone: 'โทรศัพท์ที่ติดต่อได้ ณ สถานที่ปลูก',
    // The person the field inspector meets on site; the only contact the inspector and the
    // dispatcher read (orders 29 and 56(3)). Name and phone are both required (order 65(2)).
    siteContactName: 'ชื่อผู้ติดต่อ ณ สถานที่ปลูก',
    siteContactHeading: 'ผู้ติดต่อหน้างาน',
    siteContactHelp: 'ผู้จัดคิวจะโทรหาคนนี้เพื่อนัดวันตรวจ และผู้ตรวจพื้นที่จะพบคนนี้ที่แปลง',
    useMyContact: 'ใช้ชื่อและเบอร์ของฉัน',
    siteContactInformed: 'ได้แจ้งผู้ติดต่อแล้วว่าเจ้าหน้าที่จะโทรนัดและพบที่แปลง',
    sitePhoneInvalid: 'กรอกเบอร์โทรศัพท์ไทย เช่น 081-234-5678 หรือ 02-123-4567',
    landOwnership: 'ที่ดินนี้คุณใช้โดยสิทธิใด',
    landlordName: 'ชื่อเจ้าของที่ดิน',
    landConsentValidUntil: 'หนังสือยินยอม/สัญญาเช่ามีผลถึงวันที่',
    areaType: 'ลักษณะพื้นที่ปลูก เลือกได้มากกว่าหนึ่งข้อ',
    areaSqm: `ขนาดพื้นที่ปลูก (${AREA_UNIT_TH})`,
    coordinates: 'พิกัดที่ตั้ง (ละติจูด, ลองจิจูด)',
    growingMedium: 'อาคารระบบปิดปลูกในดินหรือไม่ใช้ดิน',
    growingMediumHelp: 'ข้อมูลเพิ่มเติมนอกแบบ กทล.1 ถ้าปลูกในอาคารระบบปิดแบบไม่ใช้ดินอย่างเดียว ระบบจะไม่ถามผลตรวจดิน',
    plantsPerCycle: 'จำนวนต้นต่อรอบการปลูก',
    cyclesPerYear: 'จำนวนรอบการปลูกต่อปี',
    /** The explainer strip on the approved Step 3 board. */
    conditionalExplainer:
        'รายการเอกสารด้านล่างเปลี่ยนตามคำตอบเรื่องสิทธิในที่ดินและลักษณะพื้นที่ ถ้าคุณเปลี่ยนคำตอบ ระบบจะถามเอกสารชุดใหม่ให้อัตโนมัติ',
});

/**
 * Which slots step 3 is responsible for showing. The SERVER decides which of them this
 * filing actually owes; this list only says where they appear.
 */
export const STEP3_SITE_SLOT_IDS: readonly string[] = Object.freeze([
    'land_rights',
    'landlord_consent',
    'site_map_coords',
    'building_plan_photos',
    'field_surround_photos',
    'site_photos',
]);

/** The owner has to be named when the land is someone else's: the consent letter names them. */
export function needsLandlordName(landOwnership: LandTenure | null): boolean {
    return landNeedsOwner(landOwnership);
}

/** Land held by a lease or a consent letter: the letter has an end date worth knowing. */
export function needsConsentValidUntil(landOwnership: LandTenure | null): boolean {
    return landOwnership === 'RENTED' || landOwnership === 'CONSENT';
}

export const CONSENT_ENDS_EARLY_TH =
    'หนังสือยินยอมสิ้นสุดก่อนใบรับรองจะหมดอายุ เจ้าหน้าที่จะพิจารณาเป็นรายกรณี';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in a calendar month (month 1-12), Gregorian. Pure arithmetic on the calendar date. */
function daysInMonth(year: number, month: number): number {
    if (month === 2) {
        const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        return leap ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * `iso` (yyyy-mm-dd) plus calendar months, clamped to the last day of the target month.
 * Calendar arithmetic on the date itself: no clock, no time zone.
 */
function addMonthsIso(iso: string, months: number): string | null {
    const match = ISO_DATE.exec(iso);
    if (!match) { return null; }
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const index = year * 12 + (month - 1) + months;
    const ty = Math.floor(index / 12);
    const tm = (index % 12) + 1;
    const td = Math.min(day, daysInMonth(ty, tm));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${ty}-${pad(tm)}-${pad(td)}`;
}

/**
 * Whether the consent or lease ends before a certificate issued today would expire.
 *
 * A warning, never a block (operator 2026-10-06: the officer decides). The term is the
 * served rule (GET /api/certificate-validity); without one there is nothing to compare,
 * so nothing is said.
 */
export function consentEndsBeforeCertificateExpiry(
    validUntil: string,
    { todayIso, months }: { todayIso: string; months: number | null },
): boolean {
    if (months === null || !ISO_DATE.test(validUntil)) { return false; }
    const expiry = addMonthsIso(todayIso, months);
    return expiry !== null && validUntil < expiry;
}

/**
 * ขั้นที่ 3 ครบหรือยัง — ตัดสินด้วยสิ่งที่หน้าจอนี้ถาม ไม่ใช่ด้วยฟิลด์ของ wizard รุ่นก่อน
 *
 * ประตูเดิมถาม `farmData.farmName`, `farmData.address` และ `plots.length > 0` ทั้งที่หน้าจอ
 * เขียน `siteName` / `siteAddress` และไม่เคยสร้างแถว plot เลย ⇒ ขั้นนี้ทำให้ครบไม่ได้เลย
 * ไม่ว่ากรอกอย่างไร · เป็นชนิดเดียวกับที่โค้ดของขั้น 4 เตือนไว้เองว่า "เรียกร้องสิ่งที่ขั้นนั้น
 * ไม่ได้เก็บแล้ว คือ v1 hard-lock เป๊ะ ๆ"
 *
 * รายการที่ถาม = ช่องที่หน้าจอทำดอกจันไว้ + คำถามที่ต้องเลือก:
 * ชื่อสถานที่ · ที่อยู่ · สิทธิในที่ดิน · เอกสารสิทธิ์ (ประเภท+เลขที่) · ลักษณะพื้นที่อย่างน้อยหนึ่ง
 * · ขนาดพื้นที่ · ชื่อผู้ให้เช่าเมื่อเช่า · ข้อความของ "อื่น ๆ" เมื่อติ๊กอื่น ๆ
 */
export function step3CanProceed(farmData: Record<string, unknown> | null | undefined, filing: FilingKind = {}): boolean {
    const data = farmData ?? {};
    const stated = (value: unknown) => String(value ?? '').trim() !== '';

    if (!stated(data.siteName) || !stated(data.siteAddress)) { return false; }
    // The certificate names จังหวัด/อำเภอ/ตำบล; a filing without them passes submit and then
    // cannot be certified (F-WALK-03), so the step is not complete until they are stated.
    if (!stated(data.province) || !stated(data.district) || !stated(data.subDistrict)) { return false; }
    // Order 143(4): tenure, land document, position and planting volume, by the SAME
    // declaration the submit door judges (@gacp/validation/filing-fields). Order 147: a
    // replacement is asked none of them.
    if (siteFieldGaps(data, filing).length > 0) { return false; }

    const areaTypes = Array.isArray(data.areaTypes) ? (data.areaTypes as SiteAreaType[]) : [];
    if (areaTypes.length === 0) { return false; }
    // Order 65(2): the same rule the submit door runs (@gacp/validation/site-contact).
    if (!siteContactComplete(data)) { return false; }

    return stated(data.areaSqm);
}

/** The Thai message for each กทล.1 ข้อ ๒ field the site block still lacks, by the farmData key the screen writes. */
export function step3FieldErrors(farmData: Record<string, unknown> | null | undefined, filing: FilingKind = {}): Record<string, string> {
    return Object.fromEntries(siteFieldGaps(farmData, filing).map((gap) => [gap.key, gap.messageTh]));
}

/** The farmData keys the declaration judges, for naming every gap at once. */
export const SITE_FIELD_KEYS: readonly string[] = Array.from(new Set(SITE_FIELDS.map((field) => field.key)));

/** Whether this filing is asked the field: a replacement is asked none, a PROCESSING filing no planting volume. */
export function siteFieldAsked(key: string, filing: FilingKind = {}): boolean {
    return siteFieldsFor(filing).some((field) => field.key === key);
}

/**
 * The site block has been written to: the same mark the submit door reads as "a กทล.1 filing"
 * (isKatorlor1Filing). A draft resumed or bounced here with this mark names every gap at once;
 * a blank site keeps its asterisks until each box is left.
 */
export function siteStarted(farmData: Record<string, unknown> | null | undefined): boolean {
    const data = farmData ?? {};
    return [data.siteName, data.siteAddress, data.areaSqm].some((value) => String(value ?? '').trim() !== '');
}

/** A phone typed into the on-site contact that is not yet a Thai number (empty is not shown as wrong). */
export function sitePhoneLooksWrong(value: unknown): boolean {
    return typeof value === 'string' && value.trim() !== '' && !isThaiPhoneNumber(value);
}
