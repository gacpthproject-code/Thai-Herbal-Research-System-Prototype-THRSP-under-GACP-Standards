/**
 * กทล.1 ส่วนที่ ๒-๓ fields the submit gate must demand of a six-step filing (order 143(4)).
 *
 * The wizard asks for coordinates, planting volume (ต้น/รอบ, รอบ/ปี), land tenure with the
 * land document's type and number, and the varieties of ข้อ ๓, yet the server accepted a
 * filing with none of them. The gate reads what the screen writes (farmData.coordinates is one
 * "lat, long" string, the way application-farm-materialization parses it).
 */
'use strict';

const { validateCanonicalSubmission } = require('../../validation/canonical-application-validator');
const { requestTypeOf } = require('@gacp/validation/filing-fields');

const DOCS = [{ uploaded: true, url: '/uploads/application-documents/x.pdf' }];

function completeFiling({ farm = {}, varieties } = {}) {
    return {
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantType: 'JURISTIC',
        farmData: {
            siteName: 'ฟาร์มทดสอบ', siteAddress: '12 หมู่ 3', areaSqm: '800', areaTypes: ['OUTDOOR'],
            province: 'เชียงใหม่', district: 'สันทราย', subDistrict: 'หนองหาร', postalCode: '50290',
            siteContactName: 'ก ข', sitePhone: '0812345678', siteContactIsApplicant: true,
            landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '12345' },
            coordinates: '18.7883, 98.9853', plantsPerCycle: '500', cyclesPerYear: '2',
            ...farm,
        },
        varieties: varieties === undefined
            ? [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }]
            : varieties,
    };
}

const pathsOf = (result, step) => (result.errorsByStep[step] || []).map((issue) => issue.path);
const messagesOf = (result, step) => (result.errorsByStep[step] || []).map((issue) => issue.message).join(' ');

describe('a complete กทล.1 filing passes', () => {
    test('with every ข้อ ๒-๓ field stated', () => {
        const result = validateCanonicalSubmission(completeFiling(), DOCS);
        expect(result.errorsByStep).toEqual({});
        expect(result.isValid).toBe(true);
    });

    test('the older spelling of land tenure (OWN) is still a tenure', () => {
        const result = validateCanonicalSubmission(completeFiling({ farm: { landOwnership: 'OWN' } }), DOCS);
        expect(result.errorsByStep).toEqual({});
    });
});

describe('site fields (ส่วนที่ ๒) are refused by name under wizard step 3', () => {
    test.each([
        ['land tenure missing', { landOwnership: undefined }, 'land_tenure', 'สิทธิในที่ดิน'],
        ['land tenure is not a known word', { landOwnership: 'SQUATTING' }, 'land_tenure', 'สิทธิในที่ดิน'],
        ['land document type missing', { landDocumentDetail: { type: '', number: '12345' } }, 'land_document_type', 'ประเภทเอกสารสิทธิ์'],
        ['land document number missing', { landDocumentDetail: { type: 'โฉนด', number: ' ' } }, 'land_document_number', 'เลขที่เอกสารสิทธิ์'],
        ['rented land without the owner named', { landOwnership: 'RENTED' }, 'landlord_name', 'ชื่อเจ้าของที่ดิน'],
        ['consented land without the owner named', { landOwnership: 'CONSENT' }, 'landlord_name', 'ชื่อเจ้าของที่ดิน'],
        ['coordinates missing', { coordinates: '' }, 'coordinates', 'พิกัด'],
        ['coordinates that are not two numbers', { coordinates: 'เชียงใหม่' }, 'coordinates', 'พิกัด'],
        ['coordinates with one half', { coordinates: '18.7883' }, 'coordinates', 'พิกัด'],
        ['latitude beyond the globe', { coordinates: '98.9853, 18.7883' }, 'coordinates', 'พิกัด'],
        ['coordinates in scientific notation', { coordinates: '1e1, 2e1' }, 'coordinates', 'พิกัด'],
        ['coordinates in hexadecimal', { coordinates: '0x10, 0x20' }, 'coordinates', 'พิกัด'],
        ['coordinates with a decimal comma', { coordinates: '18,7883, 98,9853' }, 'coordinates', 'พิกัด'],
        ['plants per cycle missing', { plantsPerCycle: '' }, 'plants_per_cycle', 'จำนวนต้นต่อรอบ'],
        ['plants per cycle zero', { plantsPerCycle: '0' }, 'plants_per_cycle', 'จำนวนต้นต่อรอบ'],
        ['plants per cycle not a whole number', { plantsPerCycle: '12.5' }, 'plants_per_cycle', 'จำนวนต้นต่อรอบ'],
        ['cycles per year missing', { cyclesPerYear: undefined }, 'cycles_per_year', 'จำนวนรอบการปลูกต่อปี'],
        ['cycles per year zero', { cyclesPerYear: 0 }, 'cycles_per_year', 'จำนวนรอบการปลูกต่อปี'],
    ])('%s', (_name, farm, path, label) => {
        const result = validateCanonicalSubmission(completeFiling({ farm }), DOCS);
        expect(result.isValid).toBe(false);
        expect(pathsOf(result, '3')).toEqual([path]);
        expect(messagesOf(result, '3')).toContain(label);
        expect(result.missingFields).toEqual([`step3.${path}`]);
    });

    test('no land document at all names both the type and the number', () => {
        const result = validateCanonicalSubmission(completeFiling({ farm: { landDocumentDetail: undefined } }), DOCS);
        expect(pathsOf(result, '3')).toEqual(['land_document_type', 'land_document_number']);
        expect(result.missingFields).toEqual(['step3.land_document_type', 'step3.land_document_number']);
    });

    test('a numeric pair typed by a farmer in the paper order (ละติจูด, ลองจิจูด) with spaces is accepted', () => {
        const result = validateCanonicalSubmission(completeFiling({ farm: { coordinates: ' 18.7883 ,98.9853 ' } }), DOCS);
        expect(result.errorsByStep).toEqual({});
    });

    test('the owner is not demanded of land the applicant owns', () => {
        const result = validateCanonicalSubmission(completeFiling({ farm: { landOwnership: 'OWNED', landlordName: '' } }), DOCS);
        expect(result.errorsByStep).toEqual({});
    });
});

describe('the planting volume is a PLANTING question (round 2, M3)', () => {
    test('a PROCESSING filing is not asked how many plants it grows', () => {
        const filing = completeFiling({ farm: { plantsPerCycle: '', cyclesPerYear: '' } });
        filing.certScope = 'PROCESSING';
        expect(validateCanonicalSubmission(filing, DOCS).errorsByStep).toEqual({});
    });

    test('a PROCESSING filing still owes its land document', () => {
        const filing = completeFiling({ farm: { plantsPerCycle: '', landDocumentDetail: { type: '', number: '1' } } });
        filing.certScope = 'PROCESSING';
        expect(validateCanonicalSubmission(filing, DOCS).missingFields).toEqual(['step3.land_document_type']);
    });

    test('a filing that names no scope is a planting filing, the form\'s own default', () => {
        const result = validateCanonicalSubmission(completeFiling({ farm: { plantsPerCycle: '' } }), DOCS);
        expect(result.missingFields).toEqual(['step3.plants_per_cycle']);
    });
});

describe('the CAR door sends evidence, not the form (round 2, I1)', () => {
    test('a filing already accepted at review is not refused its ข้อ ๒-๓ fields when it sends CAR evidence', () => {
        const filing = completeFiling({ farm: { coordinates: '', plantsPerCycle: '', landDocumentDetail: undefined }, varieties: [] });
        const result = validateCanonicalSubmission(filing, DOCS, { refilesTheForm: false });
        expect(result.errorsByStep).toEqual({});
        expect(result.isValid).toBe(true);
    });

    test('the same filing is refused where the form is filed', () => {
        const filing = completeFiling({ farm: { coordinates: '' }, varieties: [] });
        const result = validateCanonicalSubmission(filing, DOCS, { refilesTheForm: true });
        expect(result.missingFields).toEqual(['step3.coordinates', 'varieties.name']);
    });
});

describe('varieties (ข้อ ๓) are refused by name under their own key', () => {
    test.each([
        ['no varieties key', undefined],
        ['an empty list', []],
        ['a row with no name', [{ kind: 'SEED', name: '', origin: 'DOMESTIC', source: 'x', quantity: '1', unit: 'ต้น' }]],
        ['a row whose name is blank', [{ name: '   ' }]],
        ['not a list', 'หางกระรอกภูพาน'],
    ])('%s', (_name, varieties) => {
        const filing = completeFiling();
        if (varieties === undefined) { delete filing.varieties; } else { filing.varieties = varieties; }
        const result = validateCanonicalSubmission(filing, DOCS);
        expect(result.isValid).toBe(false);
        expect(pathsOf(result, 'varieties')).toEqual(['name']);
        expect(messagesOf(result, 'varieties')).toContain('สายพันธุ์');
        expect(result.missingFields).toEqual(['varieties.name']);
    });

    test('one named row is enough; a second blank row the applicant could not remove does not block', () => {
        const result = validateCanonicalSubmission(
            completeFiling({ varieties: [{ name: 'หางกระรอกภูพาน' }, { kind: null, name: '', origin: null, source: '', quantity: '', unit: '' }] }),
            DOCS,
        );
        expect(result.errorsByStep).toEqual({});
    });
});

describe('a legacy (pre-กทล.1) filing is judged by its own era and not by these fields', () => {
    test('no site block, no new demands', () => {
        const legacy = {
            plantId: 'cannabis', certificationPurposes: ['EXPORT'], cultivationMethods: ['OUTDOOR'],
            applicantType: 'JURISTIC',
            applicantData: { applicantType: 'JURISTIC', companyName: 'บ.', registrationNumber: '1', directorName: 'ก' },
            farmData: {
                farmName: 'ไร่', address: '1', province: 'เชียงใหม่', totalAreaSize: '2', totalAreaUnit: 'Rai',
                siteContactName: 'ก ข', sitePhone: '0812345678', siteContactIsApplicant: true,
            },
            plots: [{ name: 'แปลง 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
            productionData: { propagationType: ['SEED'], plantParts: ['FLOWER'] },
            harvestData: { harvestMethod: 'MANUAL', dryingMethod: 'SUN', storageSystem: 'AMBIENT' },
        };
        const result = validateCanonicalSubmission(legacy, DOCS);
        expect(result.errorsByStep).toEqual({});
    });
});

describe('a replacement (ใบแทน) is not asked ส่วนที่ ๒; a renewal still is (order 147)', () => {
    const bare = () => completeFiling({
        farm: { landOwnership: undefined, landDocumentDetail: undefined, coordinates: '', plantsPerCycle: '', cyclesPerYear: '' },
        varieties: [],
    });

    test('the server-owned word REPLACEMENT lifts every ข้อ ๒-๓ demand', () => {
        const result = validateCanonicalSubmission({ ...bare(), requestType: 'REPLACEMENT' }, DOCS);
        expect(result.errorsByStep).toEqual({});
        expect(result.isValid).toBe(true);
    });

    test('a replacementOf link is a replacement whatever word sits beside it', () => {
        expect(validateCanonicalSubmission({ ...bare(), requestType: 'RENEWAL', replacementOf: 'cert-1' }, DOCS).errorsByStep).toEqual({});
    });

    test('a renewal is still asked, by name', () => {
        const filing = { ...completeFiling({ farm: { coordinates: '' }, varieties: [] }), requestType: 'RENEWAL', renewalOf: 'cert-1' };
        expect(validateCanonicalSubmission(filing, DOCS).missingFields).toEqual(['step3.coordinates', 'varieties.name']);
    });

    test('a renewalOf link with no word is a renewal, and a word outside the vocabulary is NEW', () => {
        expect(validateCanonicalSubmission({ ...bare(), renewalOf: 'cert-1' }, DOCS).isValid).toBe(false);
        expect(validateCanonicalSubmission({ ...bare(), requestType: 'ใบแทน' }, DOCS).isValid).toBe(false);
    });

    test.each([
        [{ replacementOf: 'c', requestType: 'RENEWAL' }, 'REPLACEMENT'],
        [{ requestType: ' replacement ' }, 'REPLACEMENT'],
        [{ requestType: 'RENEWAL' }, 'RENEWAL'],
        [{ renewalOf: 'c' }, 'RENEWAL'],
        [{ requestType: 'RENEW', renewalOf: '' }, 'NEW'],
        [{}, 'NEW'],
        [null, 'NEW'],
    ])('requestTypeOf(%j) reads the filing the way the requirement engine does: %s', (filing, expected) => {
        expect(requestTypeOf(filing)).toBe(expected);
    });
});
