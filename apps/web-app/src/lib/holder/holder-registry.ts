/**
 * The certificate holder record as the web reads and writes it (orders 134 task 2, 142).
 *
 * The server (apps/backend/shared/holder-registry.js) owns the record: it validates every
 * write, says which fields are still missing for กทล.1 ส่วนที่ ๑, and masks national IDs.
 * This file holds what the screens need to draw the record: one row per holder type with
 * its labels and its fields. A new holder type is a new row here and there, not a new
 * branch in each screen.
 */

import { isThaiIdChecksumValid } from '@gacp/validation/thai-id-checksum';

export type HolderType = 'INDIVIDUAL' | 'JURISTIC' | 'PARTNERSHIP' | 'COMMUNITY_ENTERPRISE';
export type OrganisationHolderType = Exclude<HolderType, 'INDIVIDUAL'>;
export type IdentitySource = 'THAID' | 'MORPROM' | 'SELF_DECLARED';

export interface HolderNameParts {
    title: string;
    firstName: string;
    lastName: string;
}

export interface HolderRecord {
    id: string;
    type: HolderType;
    typeLabelTh: string;
    identitySource: IdentitySource;
    verified: boolean;
    legalName: string;
    /** Masked for an individual (a national ID); printed whole for an organisation. */
    registrationNo: string;
    person: (HolderNameParts & { nationality: string }) | null;
    signatory: (HolderNameParts & { idCard: string; nationality: string }) | null;
    contact: { address: string; phone: string; email: string };
    houseCode: string;
    lockedFields: string[];
    missing: { path: string; labelTh: string }[];
    complete: boolean;
}

export interface HolderField {
    /** Dotted path into the holder record, the same path the server reports as missing. */
    path: string;
    labelTh: string;
    required: boolean;
    kind: 'text' | 'tel' | 'email' | 'nationalId';
    helpTh?: string;
}

interface HolderTypeDef {
    labelTh: string;
    /** Shown on the create page above the form: who may be a holder of this type. */
    noteTh?: string;
    registrationLabelTh: string;
    /** Digits the registration number has, for the create form's input; null when it is free text. */
    registrationDigits: number | null;
    registrationHintTh?: string;
    signatoryLabelTh: string | null;
    fields: readonly HolderField[];
}

/**
 * The DBD's 13-digit juristic number says in its 4th digit what kind of juristic person
 * it registered (order 145). Mirrors shared/holder-registry.js JURISTIC_KINDS.
 */
export const JURISTIC_KINDS: Readonly<Record<string, string>> = Object.freeze({
    2: 'ห้างหุ้นส่วนสามัญนิติบุคคล',
    3: 'ห้างหุ้นส่วนจำกัด',
    5: 'บริษัทจำกัด',
    7: 'บริษัทมหาชนจำกัด',
});
const JURISTIC_DIGITS: Readonly<Record<'JURISTIC' | 'PARTNERSHIP', readonly string[]>> = Object.freeze({
    JURISTIC: ['5', '7'],
    PARTNERSHIP: ['2', '3'],
});

const CONTACT_FIELDS: readonly HolderField[] = [
    { path: 'contact.address', labelTh: 'ที่อยู่', required: true, kind: 'text' },
    { path: 'contact.phone', labelTh: 'โทรศัพท์มือถือ', required: true, kind: 'tel' },
    { path: 'contact.email', labelTh: 'อีเมล', required: false, kind: 'email' },
];

function signatoryFields(labelTh: string): HolderField[] {
    return [
        { path: 'signatory.title', labelTh: `คำนำหน้าชื่อ${labelTh}`, required: true, kind: 'text', helpTh: 'เช่น นาย นาง นางสาว' },
        { path: 'signatory.firstName', labelTh: `ชื่อ${labelTh}`, required: true, kind: 'text' },
        { path: 'signatory.lastName', labelTh: `นามสกุล${labelTh}`, required: true, kind: 'text' },
        { path: 'signatory.idCard', labelTh: `เลขประจำตัวประชาชน${labelTh}`, required: true, kind: 'nationalId' },
        { path: 'signatory.nationality', labelTh: `สัญชาติ${labelTh}`, required: true, kind: 'text' },
    ];
}

function organisation(labelTh: string, registrationLabelTh: string, registrationDigits: number | null, signatoryLabelTh: string, extra: HolderField[] = []): HolderTypeDef {
    return {
        labelTh,
        registrationLabelTh,
        registrationDigits,
        signatoryLabelTh,
        fields: [
            { path: 'legalName', labelTh: `ชื่อ${labelTh}`, required: true, kind: 'text' },
            ...extra,
            ...signatoryFields(signatoryLabelTh),
            ...CONTACT_FIELDS,
        ],
    };
}

export const HOLDER_TYPES: Readonly<Record<HolderType, HolderTypeDef>> = Object.freeze({
    INDIVIDUAL: {
        labelTh: 'บุคคลธรรมดา',
        registrationLabelTh: 'เลขประจำตัวประชาชน',
        registrationDigits: 13,
        signatoryLabelTh: null,
        fields: [
            { path: 'person.title', labelTh: 'คำนำหน้าชื่อ', required: true, kind: 'text', helpTh: 'เช่น นาย นาง นางสาว' },
            { path: 'person.firstName', labelTh: 'ชื่อ', required: true, kind: 'text' },
            { path: 'person.lastName', labelTh: 'นามสกุล', required: true, kind: 'text' },
            { path: 'person.nationality', labelTh: 'สัญชาติ', required: true, kind: 'text' },
            ...CONTACT_FIELDS,
        ],
    },
    JURISTIC: organisation('บริษัท', 'เลขทะเบียนนิติบุคคล', 13, 'กรรมการผู้มีอำนาจลงนาม'),
    PARTNERSHIP: {
        ...organisation('ห้างหุ้นส่วน', 'เลขทะเบียนนิติบุคคล', 13, 'หุ้นส่วนผู้จัดการ'),
        noteTh: 'เฉพาะห้างหุ้นส่วนที่จดทะเบียนกับกรมพัฒนาธุรกิจการค้าแล้ว (เป็นนิติบุคคลตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 1015) '
            + 'ห้างหุ้นส่วนสามัญที่ไม่ได้จดทะเบียนไม่เป็นนิติบุคคล ยื่นในนามห้างไม่ได้ ให้จดทะเบียนก่อน หรือยื่นในนามบุคคลธรรมดา',
    },
    COMMUNITY_ENTERPRISE: {
        ...organisation('วิสาหกิจชุมชน', 'รหัสทะเบียนวิสาหกิจชุมชน (สวช.01)', null, 'ประธานวิสาหกิจชุมชน', [
            { path: 'houseCode', labelTh: 'เลขรหัสประจำบ้าน', required: true, kind: 'text' },
        ]),
        registrationHintTh: 'ตามหนังสือสำคัญแสดงการจดทะเบียน (สวช.01) เช่น 5-50-01-11/1-0123 เจ้าหน้าที่ตรวจกับเอกสารที่แนบ',
    },
});

const COMMUNITY_REG_NO_MAX = 40;

/**
 * The reason a registration number is refused for this holder type, or null. The same rules
 * as the server's checkRegistrationNo (shared/holder-registry.js), so the create page can
 * say so before the request leaves (order 145).
 */
export function registrationNoProblem(type: HolderType, value: string): string | null {
    const v = value.trim();
    if (type === 'COMMUNITY_ENTERPRISE') {
        if (v === '') { return 'กรุณากรอกรหัสทะเบียนวิสาหกิจชุมชนตามหนังสือสำคัญ สวช.01'; }
        if (!/^[0-9/-]+$/.test(v)) { return 'รหัสทะเบียนวิสาหกิจชุมชนใช้ได้เฉพาะตัวเลข ขีด (-) และเครื่องหมาย /'; }
        if (!/[0-9]/.test(v)) { return 'รหัสทะเบียนวิสาหกิจชุมชนต้องมีตัวเลขอย่างน้อย 1 หลัก'; }
        if (v.length > COMMUNITY_REG_NO_MAX) { return `รหัสทะเบียนวิสาหกิจชุมชนต้องยาวไม่เกิน ${COMMUNITY_REG_NO_MAX} ตัวอักษร`; }
        return null;
    }
    if (type === 'INDIVIDUAL') {
        return /^\d{13}$/.test(v) && isThaiIdChecksumValid(v) && v[0] !== '0' ? null : 'เลขประจำตัวประชาชนไม่ถูกต้อง';
    }
    if (!(/^\d{13}$/.test(v) && isThaiIdChecksumValid(v) && v[0] === '0')) {
        return 'เลขทะเบียนนิติบุคคลไม่ถูกต้อง ต้องมี 13 หลัก ขึ้นต้นด้วย 0';
    }
    const kind = v[3] as string;
    const digits = JURISTIC_DIGITS[type];
    if (digits.includes(kind)) { return null; }
    const other = type === 'JURISTIC' ? HOLDER_TYPES.PARTNERSHIP.labelTh : HOLDER_TYPES.JURISTIC.labelTh;
    const known = JURISTIC_KINDS[kind];
    if (known) { return `เลขทะเบียนนี้เป็นของ${known} (หลักที่ 4 เป็น ${kind}) เลือกประเภทผู้ถือ "${other}"`; }
    return `เลขทะเบียนนิติบุคคลของ${HOLDER_TYPES[type].labelTh}ต้องมีหลักที่ 4 เป็น ${digits.join(' หรือ ')}`;
}

export const ORGANISATION_HOLDER_TYPES: readonly OrganisationHolderType[] = ['JURISTIC', 'PARTNERSHIP', 'COMMUNITY_ENTERPRISE'];

function thaiList(items: readonly string[], conjunction: string): string {
    return `${items.slice(0, -1).join(' ')} ${conjunction}${items[items.length - 1]}`;
}

export const HOLDER_TYPES_TH = thaiList(Object.values(HOLDER_TYPES).map((t) => t.labelTh), 'และ');

export const ORGANISATION_HOLDER_TYPES_TH = thaiList(ORGANISATION_HOLDER_TYPES.map((t) => HOLDER_TYPES[t].labelTh), 'หรือ');

/** The holder record as staff read it: no lockedFields, contact null when the role may not read it. */
export type StaffHolder = Omit<HolderRecord, 'lockedFields' | 'contact'> & { contact: HolderRecord['contact'] | null };

type PrintableHolder = Pick<HolderRecord, 'type' | 'registrationNo' | 'legalName' | 'person' | 'signatory' | 'houseCode'>
    & { contact: HolderRecord['contact'] | null };

/**
 * The rows every screen prints for a holder, in the order กทล.1 ส่วนที่ ๑ asks them: what
 * step 2 shows the applicant and what staff read on the application and its print page.
 * Contact rows are left out when the viewer may not read them (contact null).
 */
export function holderPrintRows(holder: PrintableHolder): { label: string; value: string }[] {
    const def = HOLDER_TYPES[holder.type];
    return [
        { label: 'ประเภทผู้ถือ', value: def.labelTh },
        { label: def.registrationLabelTh, value: holder.registrationNo },
        ...def.fields
            .filter((f) => holder.contact !== null || !f.path.startsWith('contact.'))
            .map((f) => ({ label: f.labelTh, value: holderValue(holder, f.path) })),
    ];
}

/** The value at a dotted path of a holder-shaped object, as a string. */
export function holderValue(record: unknown, path: string): string {
    const value = path.split('.').reduce<unknown>(
        (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
        record,
    );
    return typeof value === 'string' ? value : '';
}

/** The input the holder page sends: only the paths this type's fields name. */
export function holderInputFrom(type: HolderType, values: Readonly<Record<string, string>>): Record<string, unknown> {
    const input: Record<string, Record<string, string> | string> = {};
    for (const field of HOLDER_TYPES[type].fields) {
        const [head, tail] = field.path.split('.') as [string, string | undefined];
        const value = (values[field.path] ?? '').trim();
        if (tail === undefined) {
            input[head] = value;
        } else {
            const group = (input[head] as Record<string, string> | undefined) ?? {};
            group[tail] = value;
            input[head] = group;
        }
    }
    return input;
}

/**
 * The record's values keyed by field path, for a form to start from. A national ID arrives
 * masked, so its field starts empty: an empty national ID in a save keeps the stored one.
 */
export function holderValues(record: HolderRecord | null, type: HolderType): Record<string, string> {
    return Object.fromEntries(HOLDER_TYPES[type].fields.map((f) => [f.path, f.kind === 'nationalId' ? '' : holderValue(record, f.path)]));
}

/** The masked national IDs on record, shown as the empty field's placeholder. */
export function holderPlaceholders(record: HolderRecord | null, type: HolderType): Record<string, string> {
    return Object.fromEntries(HOLDER_TYPES[type].fields
        .filter((f) => f.kind === 'nationalId' && holderValue(record, f.path))
        .map((f) => [f.path, holderValue(record, f.path)]));
}

/** Whether staff should read this holder as "not verified" (order 142). */
export function isUnverifiedPerson(holder: { type: string; identitySource?: string | null } | null | undefined): boolean {
    return Boolean(holder && holder.type === 'INDIVIDUAL' && holder.identitySource === 'SELF_DECLARED');
}

/** The server's per-field refusals (HOLDER_VALIDATION_FAILED → meta.validationErrors), keyed by path. */
export function fieldErrorsOf(meta: Record<string, unknown> | undefined): Record<string, string> {
    const list = Array.isArray(meta?.validationErrors) ? meta.validationErrors as { path?: unknown; message?: unknown }[] : [];
    return Object.fromEntries(list
        .filter((e) => typeof e.path === 'string' && typeof e.message === 'string')
        .map((e) => [e.path as string, e.message as string]));
}

export const HOLDER_PAGE_COPY_TH = Object.freeze({
    unverified: 'ยังไม่ยืนยันตัวตน',
    verifiedBy: { THAID: 'ยืนยันตัวตนด้วย ThaiD', MORPROM: 'ยืนยันตัวตนด้วยหมอพร้อม' } as Record<'THAID' | 'MORPROM', string>,
    lockedHelp: 'ข้อมูลนี้มาจากบัตรประชาชนผ่านการยืนยันตัวตน แก้ไขเองไม่ได้',
    keepNationalId: 'เว้นว่างไว้เพื่อใช้เลขเดิม กรอกใหม่เมื่อต้องการเปลี่ยน',
    editHolder: 'แก้ข้อมูลผู้ถือ',
    summaryHeading: 'ข้อมูลผู้ขอรับการรับรองที่จะพิมพ์ลงคำขอและใบรับรอง',
    summaryHelp: 'ข้อมูลนี้มาจากทะเบียนผู้ถือ กรอกครั้งเดียวใช้ได้ทุกคำขอ ถ้าต้องการแก้ ให้แก้ที่ทะเบียนผู้ถือ',
    incomplete: 'ข้อมูลผู้ถือยังไม่ครบ กรุณากรอกให้ครบก่อนไปขั้นตอนถัดไป',
    loadFailed: 'โหลดข้อมูลผู้ถือไม่สำเร็จ ลองอีกครั้ง',
    retry: 'ลองใหม่',
    noHolder: 'กรุณาเลือกผู้ยื่นในขั้นตอนที่ 1 ก่อน',
});
