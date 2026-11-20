/**
 * Applicant Resolver — the ONE source of the payer block on every finance document.
 *
 * Operator rule 2026-09-27 ("อนุมัติ"), for the quotation, the invoice
 * (ใบวางบิล/ใบแจ้งหนี้), the receipt, the tax invoice, the credit and debit
 * notes, and the web quotation step:
 *
 *   Entity.type            name label          id printed
 *   INDIVIDUAL             ชื่อ-นามสกุล        NEVER the national ID, full or partial — "-"
 *   JURISTIC               ชื่อบริษัท          เลขประจำตัวผู้เสียภาษี = Entity.juristicId,
 *                                              only when isPrintableJuristicTaxId passes
 *   PARTNERSHIP            ชื่อห้างหุ้นส่วน     the same as JURISTIC (order 134 task 2)
 *   COMMUNITY_ENTERPRISE   ชื่อวิสาหกิจชุมชน   เลขทะเบียนวิสาหกิจชุมชน = Entity.communityRegNo;
 *                                              the tax invoice's BUYER TAX ID is "-" (there is
 *                                              no tax-id field for a community enterprise)
 *
 * Documents are issued in the applying ENTITY's name, not the account holder's, and every
 * line of the block (name, id, address, contact) is the entity's holder record.
 *
 * Every renderer consumes the labels and the printed id from here — the PDF
 * templates (services/pdf/invoice-template-service.js) and, through the
 * quotation API's `payer` object (`payerBlockForApi`), the web. No second copy of
 * the label logic may exist anywhere (guarded by
 * __tests__/unit/payer-block-by-type.test.js).
 *
 * The national ID is never RETURNED, not merely never printed: `resolveFromEntity`
 * does not read `Entity.thaiCitizenId` and the no-entity fallback does not read
 * `applicant.nationalId`, `person.idCard` or `person.nationalId`. Callers select
 * with PAYER_ENTITY_SELECT, which does not carry `thaiCitizenId` at all.
 * (Before 2026-09-27 the fallback returned `person.idCard` and the quotation
 * printed it under "เลขประจำตัวผู้เสียภาษี" — AUDIT_LEDGER L-084.)
 *
 * @module utils/applicant-resolver
 */

'use strict';

// The ONE place the Thai mod-11 checksum arithmetic lives
// (packages/validation/src/thai-id-checksum.js header) — reused, never copied.
const { isThaiIdChecksumValid, normalizeThaiId } = require('@gacp/validation/thai-id-checksum');
const { HOLDER_TYPES, readHolder, titledName, isCommunityRegNo } = require('../shared/holder-registry');

/**
 * What the resolver needs from an Entity row. `thaiCitizenId` is DELIBERATELY
 * ABSENT (operator ruling 2026-09-27): a column that is never selected can never
 * be printed. `juristicId` / `communityRegNo` are `enc:v1:` at rest and are
 * decrypted by the PDPA prisma extension's read-time walker on the same read.
 */
const PAYER_ENTITY_SELECT = Object.freeze({
    id: true, type: true, displayName: true, juristicId: true, communityRegNo: true, payload: true,
});

/**
 * What the resolver needs from an Application row (spread into a caller's own
 * `select`): the wizard's formData (address, contact phone) and the entity.
 */
const PAYER_APPLICATION_SELECT = Object.freeze({
    formData: true,
    entity: { select: PAYER_ENTITY_SELECT },
});

// Labels by holder type: the payer row of shared/holder-registry.js. Thai is what every
// surface prints; the PDFs print the bilingual "TH / EN" form.
const PAYER_LABELS = Object.freeze(Object.fromEntries(
    Object.entries(HOLDER_TYPES).map(([type, def]) => [type, def.payer]),
));

// The legacy spelling of a no-entity filing's applicantType.
const LEGACY_TYPE_TO_ENTITY_TYPE = Object.freeze({
    INDIVIDUAL: 'INDIVIDUAL',
    JURISTIC: 'JURISTIC',
    COMMUNITY: 'COMMUNITY_ENTERPRISE',
    COMMUNITY_ENTERPRISE: 'COMMUNITY_ENTERPRISE',
});

const ENTITY_TYPE_TO_LEGACY = Object.freeze({
    INDIVIDUAL: 'INDIVIDUAL',
    JURISTIC: 'JURISTIC',
    PARTNERSHIP: 'PARTNERSHIP',
    COMMUNITY_ENTERPRISE: 'COMMUNITY',
});

/**
 * A JURISTIC tax id that may be printed: DOPA mod-11 checksum valid AND leading
 * digit '0' (Thai convention reserves '0' for juristic/company registration; a
 * personal ID's first digit is 1-8). Rejects a typo'd/corrupted id, the PDPA
 * decrypt-failure marker, and a person's own national ID reaching a JURISTIC
 * payer. Moved here from invoice-template-service.js (fix/invoice-tax-id round 3)
 * so the printable-id rule has one home with the labels.
 */
function isPrintableJuristicTaxId(id) {
    const value = String(id ?? '');
    return isThaiIdChecksumValid(value) && normalizeThaiId(value)[0] === '0';
}

function printableIdFor(entityType, id) {
    const def = HOLDER_TYPES[entityType];
    if (!def || !def.printsPayerId) { return '-'; }
    const value = String(id ?? '');
    if (def.registration.column === 'juristicId') { return isPrintableJuristicTaxId(value) ? value : '-'; }
    // The สวช.01 code as typed (order 145); the registry owns its shape.
    return isCommunityRegNo(value) ? value : '-';
}

/** The payer from the holder record. INDIVIDUAL: no id, by rule; thaiCitizenId is never selected. */
function resolveFromEntity(entity) {
    const holder = readHolder(entity);
    if (!holder) { return null; }
    const def = HOLDER_TYPES[holder.type];
    return {
        entityType: holder.type,
        name: holder.legalName || '-',
        id: def.printsPayerId ? holder.registrationNo || '-' : '-',
        address: holder.contact.address,
        phone: holder.contact.phone,
        email: holder.contact.email,
        contactName: titledName(holder.person || holder.signatory) || holder.legalName,
    };
}

/**
 * Resolve the payer of an Application / Invoice / Credit- or Debit-note's
 * original invoice.
 *
 * @param {Object} record - Prisma Application or Invoice record
 * @param {Object} [record.applicant] - Direct applicant relation (User)
 * @param {Object} [record.entity] - Direct entity relation (Phase 66+)
 * @param {Object} [record.application] - Parent application (for invoices)
 * @param {Object} [record.formData] - Wizard form data (applications only)
 * @returns {{
 *   name: string, id: string, phone: string, email: string, address: string,
 *   applicantType: ?string, entityType: string,
 *   nameLabel: string, nameLabelBilingual: string, idLabel: string, idLabelBilingual: string,
 *   idPrinted: string, buyerTaxIdPrinted: string, contactName: string, contactPhone: string,
 * }}
 */
function resolveApplicantInfo(record) {
    const applicant = record.applicant || record.application?.applicant || {};
    const entity = record.entity || record.application?.entity || null;
    const fd = record.formData || record.application?.formData || {};

    // ── The key the wizard writes is `applicantData`, not `applicantInfo` (2026-09-11).
    // `applicantInfo` is read second, for older rows that may carry it.
    const person = fd.applicantData || fd.applicantInfo || {};

    const fromEntity = resolveFromEntity(entity);
    const legacyType = String(fd.applicantType || fd.entityType || '').toUpperCase();
    // No type signal at all is treated as a person: the safe default prints no id.
    const entityType = fromEntity?.entityType
        || LEGACY_TYPE_TO_ENTITY_TYPE[legacyType]
        || 'INDIVIDUAL';

    let name = fromEntity?.name || '-';
    let id = fromEntity?.id || '-';

    // No usable entity: the legacy formData / User lookup by type.
    //
    // ── DEPRECATION (Wave D Phase 5a, 2026-05-02) ──
    // `applicant.companyName` / `applicant.taxId` / `applicant.
    // companyRegistrationNumber` are the last production reads of those
    // User-table columns; Phase 5b drops them.
    if (!fromEntity) {
        if (entityType === 'JURISTIC') {
            name = person.companyName || applicant.companyName || '-';
            id = person.taxId || applicant.taxId || applicant.companyRegistrationNumber || '-';
        } else if (entityType === 'COMMUNITY_ENTERPRISE') {
            // A no-entity filing's own spellings, newest first: the six-step wizard's
            // communityRegistrationNo, then communityRegNumber, then the older
            // groupName/registrationNumber.
            name = person.communityName || person.groupName || '-';
            id = person.communityRegistrationNo || person.communityRegNumber
                || person.registrationNumber || '-';
        } else {
            name = applicant.companyName
                || `${applicant.firstName || person.firstName || ''} ${applicant.lastName || person.lastName || ''}`.trim()
                || '-';
            // No id for a person — not applicant.nationalId, not person.idCard,
            // not person.nationalId (AUDIT_LEDGER L-084).
            id = '-';
        }
    }

    // With an entity, every contact line is the holder record's (orders 134 task 2, 142); the
    // application's own step-2 copy is not read. `applicant` is the Prisma User relation —
    // its column is `phoneNumber` (auth.prisma:21), not `phone`.
    const dash = (v) => v || '-';
    let phone;
    let email;
    let contactPhone;
    let contactName;
    let address;
    if (fromEntity) {
        phone = dash(fromEntity.phone || applicant.phoneNumber);
        email = dash(fromEntity.email || applicant.email);
        contactPhone = dash(fromEntity.phone);
        contactName = fromEntity.contactName || name;
        address = dash(fromEntity.address);
    } else {
        phone = dash(applicant.phoneNumber || fd.phone || person.phone);
        email = dash(applicant.email || fd.email);
        contactPhone = dash(person.phone || fd.phone);
        contactName = person.contactName || fd.contactName || name;
        address = dash([
            person.address || applicant.address,
            person.district || applicant.district,
            person.province || applicant.province,
            person.postalCode || applicant.postalCode,
        ].filter(Boolean).join(' '));
    }

    const labels = PAYER_LABELS[entityType];
    const idPrinted = printableIdFor(entityType, id);
    return {
        name,
        // `id` IS the printed id (fix round 1): a raw value that skipped the
        // shape/checksum check — e.g. a person's own national ID typed into a
        // no-entity row's juristic taxId field — never leaves this function.
        id: idPrinted,
        phone,
        email,
        address,
        applicantType: ENTITY_TYPE_TO_LEGACY[entityType],
        entityType,
        nameLabel: labels.nameTh,
        nameLabelBilingual: `${labels.nameTh} / ${labels.nameEn}`,
        idLabel: labels.idTh,
        idLabelBilingual: `${labels.idTh} / ${labels.idEn}`,
        idPrinted,
        // The tax invoice's buyer tax id: a company's or a partnership's only.
        buyerTaxIdPrinted: HOLDER_TYPES[entityType].registration.column === 'juristicId' ? idPrinted : '-',
        contactName,
        contactPhone,
    };
}

/**
 * The payer's tax-document fields: who is billed and where (no contact). Finance staff
 * read this block (order 18, operator 2026-10-06); they reach the applicant through
 * in-app notification, never by phone or email.
 */
function payerTaxBlock(record) {
    return taxFields(resolveApplicantInfo(record));
}

function taxFields(p) {
    return {
        type: p.entityType,
        nameLabel: p.nameLabel,
        name: p.name,
        idLabel: p.idLabel,
        idPrinted: p.idPrinted,
        address: p.address,
    };
}

/**
 * The payer block the quotation API hands the applicant's web (GET
 * /applications/:id/quotations `payer`): the tax fields plus the contact the
 * application names. The web renders these fields verbatim and derives nothing itself.
 */
function payerBlockForApi(record) {
    const p = resolveApplicantInfo(record);
    return { ...taxFields(p), contactName: p.contactName, phone: p.contactPhone };
}

module.exports = {
    resolveApplicantInfo,
    payerBlockForApi,
    payerTaxBlock,
    isPrintableJuristicTaxId,
    PAYER_ENTITY_SELECT,
    PAYER_APPLICATION_SELECT,
};
