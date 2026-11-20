'use strict';

/**
 * One holder record prints everywhere (orders 134 task 2 and 142).
 *
 * The wizard investigation of 2026-10-27 found the holder typed twice: กทล.1 printed the
 * step-2 copy in formData.applicantData while the certificate printed Entity.displayName,
 * so one filing could name two different holders. It also found rows กทล.1 asks for and
 * nobody collected: an individual's title and nationality, a company signatory's ID and
 * nationality, a community enterprise's president (presidentName was written, firstName
 * and lastName were read). Partnership had no type of its own.
 *
 * Every application below carries a DIFFERENT, stale identity in applicantData. The holder
 * record on the entity is the only one any reader may print.
 */

const { renderKatorlor1Html } = require('../../services/pdf/katorlor1-template-service');
const { resolveHolderForIssuance } = require('../../services/certificate-service');
const { resolveApplicantInfo } = require('../../utils/applicant-resolver');

const CITIZEN_ID = '1101700207030';
const SIGNATORY_ID = '3100600123450';
const COMPANY_ID = '0105569999999';
const PARTNERSHIP_ID = '0103555123458';
const COMMUNITY_REG = '12345678901';

const STALE_STEP2 = {
    applicantType: 'JURISTIC',
    companyName: 'บริษัท พิมพ์ผิดในขั้นสอง จำกัด',
    firstName: 'ชื่อเก่า',
    lastName: 'ที่พิมพ์ซ้ำ',
    idCard: '3609900123459',
    authorizedSignatory: 'ผู้ลงนามเก่า',
    address: 'ที่อยู่เก่าจากขั้นสอง',
    phone: '0800000000',
};

const CONTACT = { address: '99 หมู่ 1 ต.ริมใต้ อ.แม่ริม จ.เชียงใหม่ 50180', phone: '0812345678', email: 'holder@example.test' };

const ENTITIES = {
    INDIVIDUAL: {
        id: 'ent-ind', type: 'INDIVIDUAL', displayName: 'สมหญิง ปลูกดี', thaiCitizenId: CITIZEN_ID, identitySource: 'THAID',
        payload: { holder: { person: { title: 'นาง', firstName: 'สมหญิง', lastName: 'ปลูกดี', nationality: 'ไทย' }, contact: CONTACT } },
    },
    JURISTIC: {
        id: 'ent-co', type: 'JURISTIC', displayName: 'บริษัท สวนจริง จำกัด', juristicId: COMPANY_ID, identitySource: 'SELF_DECLARED',
        payload: {
            holder: {
                signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: SIGNATORY_ID, nationality: 'ไทย' },
                contact: CONTACT,
            },
        },
    },
    PARTNERSHIP: {
        id: 'ent-pt', type: 'PARTNERSHIP', displayName: 'ห้างหุ้นส่วนจำกัด สมุนไพรสองพี่น้อง', juristicId: PARTNERSHIP_ID, identitySource: 'SELF_DECLARED',
        payload: {
            holder: {
                signatory: { title: 'นางสาว', firstName: 'มาลี', lastName: 'ศรีสุข', idCard: SIGNATORY_ID, nationality: 'ไทย' },
                contact: CONTACT,
            },
        },
    },
    COMMUNITY_ENTERPRISE: {
        id: 'ent-ce', type: 'COMMUNITY_ENTERPRISE', displayName: 'วิสาหกิจชุมชนสมุนไพรบ้านสวน', communityRegNo: COMMUNITY_REG, identitySource: 'SELF_DECLARED',
        payload: {
            holder: {
                signatory: { title: 'นาย', firstName: 'บุญมี', lastName: 'รักษ์ดิน', idCard: SIGNATORY_ID, nationality: 'ไทย' },
                houseCode: '50180-001',
                contact: CONTACT,
            },
        },
    },
};

function filing(type) {
    return {
        id: `app-${type}`,
        applicationNumber: `APP-${type}`,
        entityId: ENTITIES[type].id,
        entity: ENTITIES[type],
        applicant: { id: 'u1', firstName: 'ผู้ใช้', lastName: 'ที่ล็อกอิน' },
        formData: {
            applicantType: type,
            requestType: 'NEW',
            plantId: 'cannabis',
            applicantData: STALE_STEP2,
            farmData: { siteName: 'แปลงทดสอบ', siteAddress: '1 หมู่ 2', areaSqm: '1600' },
        },
    };
}

const sectionOne = (html) => html.slice(html.indexOf('ส่วนที่ ๑'), html.indexOf('ส่วนที่ ๒'));

describe('กทล.1 ส่วนที่ ๑ prints the holder record, never the step-2 copy', () => {
    test.each(Object.keys(ENTITIES))('%s: the name on กทล.1 is the certificate holder line', (type) => {
        const app = filing(type);
        const part = sectionOne(renderKatorlor1Html(app, null));
        const { holderDisplayName } = resolveHolderForIssuance(app, null);
        expect(part).toContain(holderDisplayName);
        expect(part).not.toContain('พิมพ์ผิดในขั้นสอง');
        expect(part).not.toContain('ชื่อเก่า');
        expect(part).not.toContain('ที่อยู่เก่าจากขั้นสอง');
    });

    test('an individual: title and nationality are printed, from the holder', () => {
        const part = sectionOne(renderKatorlor1Html(filing('INDIVIDUAL'), null));
        expect(part).toContain('นาง สมหญิง ปลูกดี');
        expect(part).toMatch(/สัญชาติ<\/span><span class="val">ไทย/);
        expect(part).toContain(CITIZEN_ID);
    });

    test('a company: the signatory row carries a first and a last name, its ID and nationality rows are filled', () => {
        const part = sectionOne(renderKatorlor1Html(filing('JURISTIC'), null));
        expect(part).toContain('นาย สมชาย ใจดี');
        expect(part).toContain(SIGNATORY_ID);
        expect(part).toContain('<span class="lbl">สัญชาติกรรมการผู้มีอำนาจลงนาม</span><span class="val">ไทย');
        expect(part).toContain(COMPANY_ID);
    });

    test('a community enterprise: the president is printed, not blank', () => {
        const part = sectionOne(renderKatorlor1Html(filing('COMMUNITY_ENTERPRISE'), null));
        expect(part).toContain('นาย บุญมี รักษ์ดิน');
        expect(part).toContain(COMMUNITY_REG);
        expect(part).toContain('50180-001');
    });

    test('a partnership is its own type: its name and registration number are printed', () => {
        const part = sectionOne(renderKatorlor1Html(filing('PARTNERSHIP'), null));
        expect(part).toContain('ห้างหุ้นส่วนจำกัด สมุนไพรสองพี่น้อง');
        expect(part).toContain(PARTNERSHIP_ID);
        expect(part).toContain('นางสาว มาลี ศรีสุข');
    });
});

describe('the payer block reads the holder record', () => {
    test.each(Object.keys(ENTITIES))('%s: name and contact come from the holder, never applicantData', (type) => {
        const p = resolveApplicantInfo(filing(type));
        expect(p.entityType).toBe(type);
        expect(p.name).toBe(ENTITIES[type].displayName);
        expect(p.address).toBe(CONTACT.address);
        expect(p.contactPhone).toBe(CONTACT.phone);
    });

    test('a partnership is labelled as one and its tax ID is printed', () => {
        const p = resolveApplicantInfo(filing('PARTNERSHIP'));
        expect(p.nameLabel).toBe('ชื่อห้างหุ้นส่วน');
        expect(p.idPrinted).toBe(PARTNERSHIP_ID);
        expect(p.buyerTaxIdPrinted).toBe(PARTNERSHIP_ID);
    });
});

describe('the INET seller name (order 134 task 2)', () => {
    const { readHolder, inetSellerName } = require('../../shared/holder-registry');

    test('an individual sells under their own name', () => {
        expect(inetSellerName(readHolder(ENTITIES.INDIVIDUAL))).toBe('สมหญิง ปลูกดี');
    });

    test.each(['JURISTIC', 'PARTNERSHIP', 'COMMUNITY_ENTERPRISE'])('%s sells under its signatory\'s name', (type) => {
        const { firstName, lastName } = ENTITIES[type].payload.holder.signatory;
        expect(inetSellerName(readHolder(ENTITIES[type]))).toBe(`${firstName} ${lastName}`);
    });
});

describe('the submit gate judges the holder record, not a step-2 copy', () => {
    const { validateFilingCompleteness } = require('../../validation/application-submission-validator');
    const v2 = (applicantData) => ({
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantType: 'JURISTIC',
        applicantData,
        farmData: {
            siteName: 'แปลง', siteAddress: '1 หมู่ 2', areaSqm: '1600', province: 'เชียงใหม่', district: 'แม่ริม',
            subDistrict: 'ริมใต้', postalCode: '50180', landOwnership: 'OWN', areaTypes: ['OUTDOOR'],
            siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
            landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '13.6069, 100.7061', plantsPerCycle: '500', cyclesPerYear: '2',
        },
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
    });

    test('a filing with no identity typed in the application passes when its holder is complete', () => {
        const out = validateFilingCompleteness({ formData: v2({}), application: {}, entity: ENTITIES.JURISTIC });
        expect(out).toEqual({ isValid: true });
    });

    test('a holder missing its signatory is refused, naming the holder fields', () => {
        const entity = { ...ENTITIES.JURISTIC, payload: { holder: { contact: CONTACT } } };
        const out = validateFilingCompleteness({ formData: v2(STALE_STEP2), application: {}, entity });
        expect(out.isValid).toBe(false);
        expect(out.missingFields).toEqual(expect.arrayContaining(['holder.signatory.firstName', 'holder.signatory.lastName']));
    });
});
