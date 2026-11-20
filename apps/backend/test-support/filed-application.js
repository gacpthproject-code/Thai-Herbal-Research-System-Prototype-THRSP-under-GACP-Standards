'use strict';

function filedFormData(overrides = {}) {
    return {
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantType: 'JURISTIC',
        applicantData: {
            companyName: 'บริษัท ยื่นแล้ว จำกัด', registrationNumber: '0105560000001', directorName: 'สมชาย ใจดี',
            phone: '0812345678', address: '99 หมู่ 1 บางพลี สมุทรปราการ 10540',
        },
        farmData: {
            siteName: 'แปลงบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '1600', province: 'สมุทรปราการ',
            district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', landOwnership: 'OWN', areaTypes: ['OUTDOOR'],
            siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
            landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '13.6069, 100.7061',
            plantsPerCycle: '500', cyclesPerYear: '2',
        },
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
        declarationsAcceptedAt: '2026-01-01T00:00:00.000Z',
        serverRequirementSnapshot: { stampedAt: '2026-01-01T00:00:00.000Z', ruleIds: [], slotIds: [] },
        ...overrides,
    };
}

/**
 * A holder record complete for กทล.1 ส่วนที่ ๑ (shared/holder-registry.js), as
 * PUT /api/entities/:id/holder or POST /api/entities takes it. A กทล.1 filing is judged on
 * its entity's holder record at submit, so a filed fixture's entity carries one.
 */
function filedHolderInput(type = 'JURISTIC') {
    const contact = { address: '99 หมู่ 1 บางพลี สมุทรปราการ 10540', phone: '0812345678', email: '' };
    if (type === 'INDIVIDUAL') {
        return { person: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', nationality: 'ไทย' }, contact };
    }
    return {
        legalName: 'บริษัท ยื่นแล้ว จำกัด',
        signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '3100600123450', nationality: 'ไทย' },
        ...(type === 'COMMUNITY_ENTERPRISE' ? { houseCode: '10540-001' } : {}),
        contact,
    };
}

/** The Entity.payload a filed fixture's entity carries (raw.entity.create({ data: { payload } })). */
function filedHolderPayload(type = 'JURISTIC') {
    const { legalName: _name, ...holder } = filedHolderInput(type);
    return { holder };
}

/**
 * The Entity columns that make a fixture's holder record complete: the registration number
 * and payload.holder. Spread into raw.entity.create({ data }).
 */
function filedHolderData(type = 'JURISTIC') {
    const registration = {
        INDIVIDUAL: { thaiCitizenId: '1101700207030' },
        JURISTIC: { juristicId: '0105561234560' },
        PARTNERSHIP: { juristicId: '0103555123458' },
        COMMUNITY_ENTERPRISE: { communityRegNo: '12345678901' },
    }[type];
    return { ...registration, payload: filedHolderPayload(type) };
}

/** An Entity row with a complete holder record, for mocked prisma.entity.findUnique. */
function filedHolderEntity(type = 'JURISTIC') {
    const displayName = type === 'INDIVIDUAL' ? 'สมชาย ใจดี' : filedHolderInput(type).legalName;
    return { id: `entity-filed-${type}`, type, displayName, identitySource: 'SELF_DECLARED', ...filedHolderData(type) };
}

const { dropConsentRows } = require('./consent-history');
const FILING_CONSENTS = Object.freeze(['TERMS_OF_SERVICE', 'PRIVACY_POLICY']);

async function grantFilingConsents(raw, { userIds, organizationId }) {
    const { ConsentVersions } = require('../middleware/consent-manager');
    for (const userId of userIds) {
        for (const category of FILING_CONSENTS) {
            await raw.userConsent.create({
                data: { userId, organizationId, category, version: ConsentVersions[category], granted: true, grantedAt: new Date() },
            });
        }
    }
}

async function dropFilingConsents(raw, userIds) {
    await dropConsentRows(raw, { in: userIds });
}

module.exports = { filedFormData, filedHolderInput, filedHolderPayload, filedHolderData, filedHolderEntity, grantFilingConsents, dropFilingConsents };
