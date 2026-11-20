'use strict';

/**
 * What the dispatcher and the field inspector read of a filing (orders 29 and 56(3), 2026-10-09):
 * an allowlist of what the two roles need to book and to inspect, not a list of what to hide. Who
 * the applicant is and the place to inspect pass; a contact channel stays out under whatever key an
 * older wizard stored it (companyPhone, directorEmail, coordinatorLineId, ...), and so does any key
 * this file does not name. The person on site comes only from
 * GET /api/provider/applications/:id/site-contact, which writes an audit row for every view.
 *
 * @module shared/applicant-contact
 */

const { CANONICAL_ROLES, normalizeRole } = require('./canonical-rbac');
const { siteContactEditable } = require('./site-contact-window');

const CONTACT_WITHHELD_ROLES = Object.freeze(new Set([CANONICAL_ROLES.DISPATCHER, CANONICAL_ROLES.FIELD_INSPECTOR]));

/**
 * Who the applicant is, as กทล.1 names it for each applicant type (and as older filings stored it at
 * the top of the filing): names, registrations, national IDs (masked on the way out, order 10) and
 * addresses. No phone, e-mail, LINE or contact person.
 */
const APPLICANT_IDENTITY_KEYS = Object.freeze(new Set([
    'applicantType', 'title', 'prefix', 'firstName', 'lastName', 'fullName', 'idCard', 'nationalId', 'nationality',
    'address', 'province', 'district', 'subdistrict', 'subDistrict', 'postalCode', 'registeredAddress',
    'communityName', 'communityAddress', 'communityRegDate', 'communityRegNumber', 'communityRegistrationNo',
    'registrationSVC01', 'registrationTVC3', 'houseCode', 'houseRegistrationCode', 'memberCount', 'presidentName', 'presidentIdCard',
    'companyName', 'companyAddress', 'companyType', 'taxId', 'registrationNumber', 'registeredCapital',
    'directorName', 'directorIdCard', 'directorPosition', 'authorizedSignatory', 'authorisedIdCard',
    'responsibleName', 'qualification', 'plantingStatus', 'licenseNumber', 'licenseType', 'personnelHygiene',
]));

/** The place to inspect: where it is, by what right, how large, and how it is kept (farmData, siteData). */
const SITE_KEYS = Object.freeze(new Set([
    'id', 'siteName', 'farmName', 'siteAddress', 'address', 'farmAddress', 'subDistrict', 'subdistrict', 'district',
    'province', 'postalCode', 'branch', 'coordinates', 'latitude', 'longitude', 'lat', 'lng', 'gpsLat', 'gpsLng',
    'landOwnership', 'landlordName', 'landConsentValidUntil', 'landDocumentDetail', 'landDocuments',
    'areaTypes', 'areaType', 'growingMedium', 'areaSqm', 'areaSize', 'areaUnit', 'totalAreaSize', 'totalAreaUnit',
    'plantsPerCycle', 'cyclesPerYear', 'plots', 'documents',
    'northBorder', 'southBorder', 'eastBorder', 'westBorder', 'waterSource', 'waterSourceDetail', 'electricitySource',
    'soilType', 'soilPH', 'soilHistory', 'environmentChecks', 'securityChecks',
    'hasFence', 'hasCCTV', 'hasGuard', 'hasAccessControl', 'hasAccessLog', 'hasBiometric', 'hasAnimalFence', 'hasZoneSign', 'hasWarningSign',
]));

/** The sections that describe people, each read through its own list (applicantInfo: older rows). */
const PERSON_SECTIONS = Object.freeze({
    applicantData: APPLICANT_IDENTITY_KEYS,
    applicantInfo: APPLICANT_IDENTITY_KEYS,
    farmData: SITE_KEYS,
    siteData: SITE_KEYS,
});

/**
 * The rest of the filing the two roles work from: the plant and the request, how it is grown,
 * harvested and kept, the documents, and the officers' own records of the review, the visit and
 * the correction rounds.
 */
const FILING_KEYS = Object.freeze(new Set([
    'plantId', 'plantName', 'scientificName', 'plantPart', 'usedPart', 'usePurpose', 'purpose',
    'certificationPurpose', 'certificationPurposes', 'serviceType', 'serviceTypes', 'applicationType', 'requestType', 'certScope',
    'locationType', 'siteTypes', 'areaType', 'areaTypes', 'cultivationMethod', 'cultivationMethods', 'cultivationDetails',
    'varieties', 'varietiesNote', 'processing', 'productionData', 'harvestData', 'securityData', 'generalInfo',
    'plots', 'lots', 'plantTracking', 'documents', 'uploadedDocs', 'uploadedDocuments', 'stepDocuments', 'licensePdfUrl',
    'youtubeUrl', 'videoLink', 'dryingMethod', 'dryingDetail', 'harvestMethod', 'storageMethod', 'storageSystem',
    'packaging', 'packagingMethod', 'farmName', 'farmAddress', 'locationProvince', 'consentLetter',
    'consentedPDPA', 'acknowledgedStandards',
    'workflowState', 'workflowStateUpdatedAt', 'submittedAt', 'revisionDueAt', 'revision_due_at', 'revisionRequestedAt',
    'revisionRequest', 'reviewHistory', 'reviewProgress', '_lastReviewComment', 'carDueAt', 'car_due_at', 'carRequestedAt',
    'carDocuments', 'carNotes', 'carRequest', 'carEvidenceViews', 'auditSchedule', 'auditDecision', 'auditDecisions', 'auditNotes', 'auditorComments', 'auditFollowup',
    'auditResult', 'auditedAt', 'auditExecution', 'auditorName', 'reinspection', 'rescheduleRequests', '_reassignmentHistory',
    'onsiteAuditId', 'certificationDecision',
]));

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function pick(object, keys) {
    return Object.fromEntries(Object.entries(object).filter(([key]) => keys.has(key)));
}

/** Whether `user` reads applications without the applicant's contact. */
function withholdsContactFrom(user) {
    return CONTACT_WITHHELD_ROLES.has(normalizeRole(user?.canonicalRole || user?.role));
}

/** The filing as the dispatcher and the field inspector read it. */
function formDataWithoutContact(formData) {
    const filing = asObject(formData);
    if (!filing) { return formData; }
    const out = {};
    for (const [key, value] of Object.entries(filing)) {
        if (PERSON_SECTIONS[key]) {
            const section = asObject(value);
            if (section) { out[key] = pick(section, PERSON_SECTIONS[key]); }
        } else if (FILING_KEYS.has(key) || APPLICANT_IDENTITY_KEYS.has(key)) {
            out[key] = value;
        }
    }
    return out;
}

/**
 * Whether a value at `path` of the filing ('applicantData.phone', 'farmData.waterSourceDetail.sourceType')
 * is one the dispatcher and the field inspector may read: the same lists as formDataWithoutContact.
 */
function readableWithoutContact(path) {
    const [first, second] = String(path || '').split('.');
    if (PERSON_SECTIONS[first]) { return PERSON_SECTIONS[first].has(second); }
    return FILING_KEYS.has(first) || APPLICANT_IDENTITY_KEYS.has(first);
}

/**
 * An audit row's metadata as the two roles read it: a filing edit still names every field it
 * changed, with the old and new values only where the field is readable without contact.
 */
function auditMetadataWithoutContact(metadata) {
    const record = asObject(metadata);
    if (!record || !Array.isArray(record.changedFields)) { return metadata; }
    return {
        ...record,
        changedFields: record.changedFields.map((change) => (readableWithoutContact(change?.path)
            ? change
            : { path: change?.path ?? null, changed: true })),
    };
}

/**
 * What the dispatcher's queues say about the person on site, with no contact in it (order 65(2)):
 * whether the filing names a name and a phone, when the applicant was asked to add them, and whether
 * the system will still ask. jobs/site-contact-request-job.js asks exactly the pending ones, so the
 * card never promises an ask that will not come.
 *
 * @param {{ formData?: unknown, status?: string, scheduledDate?: Date|string|null }} application
 */
function siteContactStateOf(application, now = new Date()) {
    const formData = asObject(application?.formData);
    const { siteContactName, sitePhone } = siteContactOf(formData);
    const siteContactGiven = Boolean(siteContactName && sitePhone);
    const siteContactRequestedAt = asObject(formData?.siteContactRequest)?.sentAt || null;
    return {
        siteContactGiven,
        siteContactRequestedAt,
        siteContactRequestPending: Boolean(formData) && !siteContactGiven && !siteContactRequestedAt && siteContactEditable(application, now),
    };
}

/** The person on site the filing names: { siteContactName, sitePhone }, each null when not given. */
function siteContactOf(formData) {
    const farm = asObject(asObject(formData)?.farmData) || {};
    const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    return { siteContactName: text(farm.siteContactName), sitePhone: text(farm.sitePhone) };
}

module.exports = {
    CONTACT_WITHHELD_ROLES,
    APPLICANT_IDENTITY_KEYS,
    SITE_KEYS,
    withholdsContactFrom,
    formDataWithoutContact,
    readableWithoutContact,
    auditMetadataWithoutContact,
    siteContactStateOf,
    siteContactOf,
};
