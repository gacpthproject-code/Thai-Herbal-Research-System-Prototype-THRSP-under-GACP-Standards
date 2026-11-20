'use strict';

/**
 * The certificate holder (operator orders 134 task 2 and 142).
 *
 * One record says whom a certificate is issued to. It lives on the Entity row the
 * application points at: the type, the legal name (`displayName`), the registration
 * number column, `identitySource`, and the rest under `payload.holder`. กทล.1, the
 * certificate, the payer block on the receipt and tax invoice, the success screen and the
 * INET seller name all read it through `readHolder`; nothing reads identity out of the
 * application's own form data any more.
 *
 * Each holder type is one row of HOLDER_TYPES. A new type is a new row, not a new branch
 * in each reader.
 */

const { z } = require('zod');
const { isThaiIdChecksumValid } = require('@gacp/validation/thai-id-checksum');

const IDENTITY_SOURCES = Object.freeze(['THAID', 'MORPROM', 'SELF_DECLARED']);
const VERIFIED_IDENTITY_SOURCES = Object.freeze(['THAID', 'MORPROM']);

const personName = (p) => [p?.firstName, p?.lastName].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
const titledName = (p) => [p?.title, p?.firstName, p?.lastName].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

const isCitizenId = (v) => /^\d{13}$/.test(v) && isThaiIdChecksumValid(v) && v[0] !== '0';
const isJuristicId = (v) => /^\d{13}$/.test(v) && isThaiIdChecksumValid(v) && v[0] === '0';
const COMMUNITY_REG_NO_MAX = 40;

/**
 * The DBD's 13-digit juristic number says in its 4th digit what kind of juristic person
 * it registered (order 145). A registered partnership is a juristic person (ป.พ.พ. มาตรา
 * 1015); an unregistered ordinary partnership has no number and cannot be a holder.
 */
const JURISTIC_KINDS = Object.freeze({
    2: 'ห้างหุ้นส่วนสามัญนิติบุคคล',
    3: 'ห้างหุ้นส่วนจำกัด',
    5: 'บริษัทจำกัด',
    7: 'บริษัทมหาชนจำกัด',
});

/** A registration rule: `refuse(value)` is the Thai reason, or '' when the value is accepted. */
const citizenRegistration = Object.freeze({
    column: 'thaiCitizenId',
    labelTh: 'เลขประจำตัวประชาชน',
    refuse: (v) => (isCitizenId(v) ? '' : 'เลขประจำตัวประชาชนไม่ถูกต้อง'),
});

function juristicRegistration({ ownLabelTh, digits, otherLabelTh }) {
    return Object.freeze({
        column: 'juristicId',
        labelTh: 'เลขทะเบียนนิติบุคคล',
        refuse(v) {
            if (!isJuristicId(v)) { return 'เลขทะเบียนนิติบุคคลไม่ถูกต้อง ต้องมี 13 หลัก ขึ้นต้นด้วย 0'; }
            const kind = v[3];
            if (digits.includes(kind)) { return ''; }
            if (JURISTIC_KINDS[kind]) {
                return `เลขทะเบียนนี้เป็นของ${JURISTIC_KINDS[kind]} (หลักที่ 4 เป็น ${kind}) เลือกประเภทผู้ถือ "${otherLabelTh}"`;
            }
            return `เลขทะเบียนนิติบุคคลของ${ownLabelTh}ต้องมีหลักที่ 4 เป็น ${digits.join(' หรือ ')}`;
        },
    });
}

/**
 * The สวช.01 code as the paper prints it (order 145): digits, dashes and a slash, no fixed
 * form. At least one digit, because a code of '-' prints as "no ID" and would hold the
 * registration key for every owner who types it; at most 40 characters, because the column
 * is otherwise unbounded.
 */
const communityRegistration = Object.freeze({
    column: 'communityRegNo',
    labelTh: 'รหัสทะเบียนวิสาหกิจชุมชน (สวช.01)',
    refuse(v) {
        if (v === '') { return 'กรุณากรอกรหัสทะเบียนวิสาหกิจชุมชนตามหนังสือสำคัญ สวช.01'; }
        if (!/^[0-9/-]+$/.test(v)) { return 'รหัสทะเบียนวิสาหกิจชุมชนใช้ได้เฉพาะตัวเลข ขีด (-) และเครื่องหมาย /'; }
        if (!/[0-9]/.test(v)) { return 'รหัสทะเบียนวิสาหกิจชุมชนต้องมีตัวเลขอย่างน้อย 1 หลัก'; }
        if (v.length > COMMUNITY_REG_NO_MAX) { return `รหัสทะเบียนวิสาหกิจชุมชนต้องยาวไม่เกิน ${COMMUNITY_REG_NO_MAX} ตัวอักษร`; }
        return '';
    },
});

/** A stored code the rule accepts prints as typed on the finance documents. */
const isCommunityRegNo = (v) => communityRegistration.refuse(v) === '';

const TAX_ID_PAYER = Object.freeze({ idTh: 'เลขประจำตัวผู้เสียภาษี', idEn: 'Tax ID' });

/**
 * signatory: who signs for the holder. SELF for a person (the applicant signs and is the
 * INET seller); NAMED for an organisation (its signatory's first and last name, asked
 * separately, are the INET seller name — order 134 task 2).
 */
const HOLDER_TYPES = Object.freeze({
    INDIVIDUAL: Object.freeze({
        labelTh: 'บุคคลธรรมดา',
        registration: citizenRegistration,
        signatory: 'SELF',
        requirementHolderType: 'INDIVIDUAL',
        payer: Object.freeze({ nameTh: 'ชื่อ-นามสกุล', nameEn: 'Name', idTh: 'เลขประจำตัวประชาชน', idEn: 'ID No.' }),
        printsPayerId: false,
    }),
    JURISTIC: Object.freeze({
        labelTh: 'บริษัท',
        registration: juristicRegistration({ ownLabelTh: 'บริษัท', digits: ['5', '7'], otherLabelTh: 'ห้างหุ้นส่วน' }),
        signatory: 'NAMED',
        signatoryLabelTh: 'กรรมการผู้มีอำนาจลงนาม',
        requirementHolderType: 'JURISTIC',
        payer: Object.freeze({ nameTh: 'ชื่อบริษัท', nameEn: 'Company Name', ...TAX_ID_PAYER }),
        printsPayerId: true,
    }),
    PARTNERSHIP: Object.freeze({
        labelTh: 'ห้างหุ้นส่วน',
        noteTh: 'เฉพาะห้างหุ้นส่วนที่จดทะเบียนกับกรมพัฒนาธุรกิจการค้าแล้ว (เป็นนิติบุคคลตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 1015) '
            + 'ห้างหุ้นส่วนสามัญที่ไม่ได้จดทะเบียนไม่เป็นนิติบุคคล ยื่นในนามห้างไม่ได้ ให้จดทะเบียนก่อน หรือยื่นในนามบุคคลธรรมดา',
        registration: juristicRegistration({ ownLabelTh: 'ห้างหุ้นส่วน', digits: ['2', '3'], otherLabelTh: 'บริษัท' }),
        signatory: 'NAMED',
        signatoryLabelTh: 'หุ้นส่วนผู้จัดการ',
        // A partnership registered with the DBD is a juristic person and files the same
        // papers as a company until the register carries rows of its own for it.
        requirementHolderType: 'JURISTIC',
        payer: Object.freeze({ nameTh: 'ชื่อห้างหุ้นส่วน', nameEn: 'Partnership Name', ...TAX_ID_PAYER }),
        printsPayerId: true,
    }),
    COMMUNITY_ENTERPRISE: Object.freeze({
        labelTh: 'วิสาหกิจชุมชน',
        registration: communityRegistration,
        signatory: 'NAMED',
        signatoryLabelTh: 'ประธานวิสาหกิจชุมชน',
        requirementHolderType: 'COMMUNITY_ENTERPRISE',
        houseCode: true,
        payer: Object.freeze({
            nameTh: 'ชื่อวิสาหกิจชุมชน', nameEn: 'Community Enterprise Name',
            idTh: 'เลขทะเบียนวิสาหกิจชุมชน', idEn: 'Registration No.',
        }),
        printsPayerId: true,
    }),
});

const HOLDER_TYPE_KEYS = Object.freeze(Object.keys(HOLDER_TYPES));
const ORGANISATION_TYPES = Object.freeze(HOLDER_TYPE_KEYS.filter((t) => HOLDER_TYPES[t].signatory === 'NAMED'));

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const text = (v) => (typeof v === 'string' ? v.trim() : '');

function namePart(raw) {
    const p = obj(raw);
    return { title: text(p.title), firstName: text(p.firstName), lastName: text(p.lastName) };
}

/**
 * The holder, read whole from one Entity row. Every field is a string ('' when absent),
 * so a reader never branches on undefined.
 */
function readHolder(entity) {
    if (!entity || !HOLDER_TYPES[entity.type]) { return null; }
    const def = HOLDER_TYPES[entity.type];
    const stored = obj(obj(entity.payload).holder);
    const contact = obj(stored.contact);
    const identitySource = IDENTITY_SOURCES.includes(entity.identitySource) ? entity.identitySource : 'SELF_DECLARED';
    const person = def.signatory === 'SELF'
        ? { ...namePart(stored.person), nationality: text(obj(stored.person).nationality) }
        : null;
    const signatory = def.signatory === 'NAMED'
        ? {
            ...namePart(stored.signatory),
            idCard: text(obj(stored.signatory).idCard),
            nationality: text(obj(stored.signatory).nationality),
        }
        : null;
    return {
        id: entity.id,
        type: entity.type,
        typeLabelTh: def.labelTh,
        identitySource,
        verified: VERIFIED_IDENTITY_SOURCES.includes(identitySource),
        legalName: person ? personName(person) || text(entity.displayName) : text(entity.displayName),
        registrationNo: text(entity[def.registration.column]),
        person,
        signatory,
        contact: { address: text(contact.address), phone: text(contact.phone), email: text(contact.email) },
        houseCode: def.houseCode ? text(stored.houseCode) : '',
    };
}

/** What กทล.1 ส่วนที่ ๑ needs from a holder of this type, by field path. */
function requiredFieldsFor(type) {
    const def = HOLDER_TYPES[type];
    if (!def) { return []; }
    const fields = [
        { path: 'legalName', labelTh: def.signatory === 'SELF' ? 'ชื่อ-นามสกุล' : `ชื่อ${def.labelTh}` },
        { path: 'registrationNo', labelTh: def.registration.labelTh },
    ];
    if (def.signatory === 'SELF') {
        fields.push(
            { path: 'person.title', labelTh: 'คำนำหน้าชื่อ' },
            { path: 'person.firstName', labelTh: 'ชื่อ' },
            { path: 'person.lastName', labelTh: 'นามสกุล' },
            { path: 'person.nationality', labelTh: 'สัญชาติ' },
        );
    } else {
        fields.push(
            { path: 'signatory.title', labelTh: `คำนำหน้าชื่อ${def.signatoryLabelTh}` },
            { path: 'signatory.firstName', labelTh: `ชื่อ${def.signatoryLabelTh}` },
            { path: 'signatory.lastName', labelTh: `นามสกุล${def.signatoryLabelTh}` },
            { path: 'signatory.idCard', labelTh: `เลขประจำตัวประชาชน${def.signatoryLabelTh}` },
            { path: 'signatory.nationality', labelTh: `สัญชาติ${def.signatoryLabelTh}` },
        );
    }
    if (def.houseCode) { fields.push({ path: 'houseCode', labelTh: 'เลขรหัสประจำบ้าน' }); }
    fields.push(
        { path: 'contact.address', labelTh: 'ที่อยู่' },
        { path: 'contact.phone', labelTh: 'โทรศัพท์' },
    );
    return fields;
}

const at = (holder, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), holder);

/** The required fields this holder has not filled. Empty means กทล.1 ส่วนที่ ๑ prints whole. */
function missingHolderFields(holder) {
    if (!holder) { return [{ path: 'holder', labelTh: 'ผู้ถือใบรับรอง' }]; }
    return requiredFieldsFor(holder.type).filter((f) => text(at(holder, f.path)) === '');
}

/** The name printed as the certificate's holder line. */
function certificateHolderLine(holder) {
    return holder ? holder.legalName : '';
}

/** INET seller name: the person for an individual, the signatory for an organisation (order 134 task 2). */
function inetSellerName(holder) {
    if (!holder) { return ''; }
    return personName(holder.person || holder.signatory);
}

// ── the write boundary ──────────────────────────────────────────────────────

const trimmed = (max) => z.string().trim().max(max);
const NAME_PART = z.object({
    title: trimmed(40).default(''),
    firstName: trimmed(120).default(''),
    lastName: trimmed(120).default(''),
});
const CONTACT = z.object({
    address: trimmed(500).default(''),
    phone: z.string().trim().max(20).regex(/^[0-9+\-\s]*$/, 'เบอร์โทรศัพท์ใช้ได้เฉพาะตัวเลข').default(''),
    email: z.union([z.literal(''), z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').max(200)]).default(''),
});
const SIGNATORY = NAME_PART.extend({
    idCard: z.string().trim().refine((v) => v === '' || isCitizenId(v), 'เลขประจำตัวประชาชนไม่ถูกต้อง').default(''),
    nationality: trimmed(60).default(''),
});

/**
 * The holder fields an owner may write, parsed per type. Partial input is allowed: the
 * holder page saves what it has and กทล.1 completeness is judged by missingHolderFields
 * at submit, not here.
 */
function holderInputSchema(type) {
    const def = HOLDER_TYPES[type];
    if (!def) { return null; }
    const base = { contact: CONTACT.default({}) };
    if (def.signatory === 'SELF') {
        return z.object({ ...base, person: NAME_PART.extend({ nationality: trimmed(60).default('') }).default({}) }).strict();
    }
    return z.object({
        ...base,
        legalName: trimmed(300).default(''),
        signatory: SIGNATORY.default({}),
        ...(def.houseCode ? { houseCode: trimmed(20).default('') } : {}),
    }).strict();
}

/** Parse an owner's holder input. Returns { ok, value } or { ok:false, issues:[{path,message}] }. */
function parseHolderInput(type, input) {
    const schema = holderInputSchema(type);
    if (!schema) { return { ok: false, issues: [{ path: 'type', message: 'ประเภทผู้ถือไม่ถูกต้อง' }] }; }
    const result = schema.safeParse(input || {});
    if (result.success) { return { ok: true, value: result.data }; }
    return {
        ok: false,
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
}

/** A registration number for a new holder of this type, or the reason it is refused. */
function checkRegistrationNo(type, value) {
    const def = HOLDER_TYPES[type];
    const v = text(value);
    if (!def) { return { ok: false, message: 'ประเภทผู้ถือไม่ถูกต้อง' }; }
    const message = def.registration.refuse(v);
    return message ? { ok: false, message } : { ok: true, value: v };
}

/**
 * The fields a verified identity fixes. A holder whose person came from ThaiD or หมอพร้อม
 * keeps those values until the next verified login says otherwise.
 */
const LOCKED_WHEN_VERIFIED = Object.freeze(['person.title', 'person.firstName', 'person.lastName', 'person.nationality', 'contact.address']);

function lockedFieldsChanged(holder, value) {
    if (!holder || !holder.verified) { return []; }
    return LOCKED_WHEN_VERIFIED.filter((path) => {
        const next = at(value, path);
        return next !== undefined && text(next) !== text(at(holder, path));
    });
}

/** The payload.holder object stored on the Entity row. */
function storedHolder(type, value) {
    const def = HOLDER_TYPES[type];
    const stored = { contact: value.contact };
    if (def.signatory === 'SELF') { stored.person = value.person; }
    else { stored.signatory = value.signatory; }
    if (def.houseCode) { stored.houseCode = value.houseCode; }
    return stored;
}

/** The Entity.displayName this holder value implies (the certificate's holder line). */
function displayNameFor(type, value) {
    return HOLDER_TYPES[type].signatory === 'SELF' ? personName(value.person) : text(value.legalName);
}

module.exports = {
    HOLDER_TYPES,
    JURISTIC_KINDS,
    isCommunityRegNo,
    HOLDER_TYPE_KEYS,
    ORGANISATION_TYPES,
    VERIFIED_IDENTITY_SOURCES,
    LOCKED_WHEN_VERIFIED,
    readHolder,
    requiredFieldsFor,
    missingHolderFields,
    certificateHolderLine,
    inetSellerName,
    titledName,
    parseHolderInput,
    checkRegistrationNo,
    lockedFieldsChanged,
    storedHolder,
    displayNameFor,
};
