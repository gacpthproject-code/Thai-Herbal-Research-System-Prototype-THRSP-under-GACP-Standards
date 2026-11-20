'use strict';

/**
 * F-A8-15 (staging walk 2026-10-27): a juristic applicant's กทล.1 ส่วนที่ ๑ carried
 * empty rows for คำนำหน้า ชื่อ นามสกุล, เลขประจำตัวประชาชน and สัญชาติ above its company
 * rows. ส่วนที่ ๑ prints the holder record's own legal shape (order 142) and no other:
 * an organisation prints its signatory's ID and nationality under the signatory's label,
 * never an anonymous person row.
 */

const { renderKatorlor1Html } = require('../../services/pdf/katorlor1-template-service');
const { HOLDER_TYPES } = require('../../shared/holder-registry');

function filing(entity) {
    return {
        id: 'app-1',
        applicationNumber: 'GACP-2569-0001',
        status: 'DRAFT',
        entity,
        formData: {
            applicantType: entity.type,
            requestType: 'NEW',
            plantId: 'cannabis',
            farmData: { farmName: 'ไร่ทดสอบ', address: '99 หมู่ 1', province: 'เชียงใหม่', areaTypes: ['OUTDOOR'] },
        },
    };
}

function payload(holderType) {
    return {
        dims: { holderType, requestType: 'NEW', certScope: 'PLANTING', plantCode: 'cannabis', landTenure: 'OWNED', areaTypes: ['OUTDOOR'], purposes: ['EXPORT'] },
        slots: [],
        missingRequired: [],
        complete: false,
    };
}

function sectionOne(html) {
    const start = html.indexOf('ส่วนที่ ๑');
    const end = html.indexOf('ส่วนที่ ๒');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return html.slice(start, end);
}

const label = (text) => `<span class="lbl">${text}</span>`;
const PERSON_ROWS = ['คำนำหน้า ชื่อ นามสกุล', 'เลขประจำตัวประชาชน', 'สัญชาติ'].map(label);

describe('กทล.1 ส่วนที่ ๑ prints the rows of the holder\'s own type', () => {
    test('a juristic filing has the company rows and none of the individual-person rows', () => {
        const part = sectionOne(renderKatorlor1Html(
            filing({
                id: 'e-1', type: 'JURISTIC', displayName: 'บริษัท ทดสอบ จำกัด', juristicId: '0105568045932',
                payload: { holder: {
                    signatory: { title: 'นาย', firstName: 'ผู้มีอำนาจ', lastName: 'ลงนาม', idCard: '1101700207030', nationality: 'ไทย' },
                    contact: { address: '123 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10100', phone: '0812345678', email: 'test@example.test' },
                } },
            }),
            payload('JURISTIC'),
        ));
        for (const row of PERSON_ROWS) { expect(part).not.toContain(row); }
        expect(part).toContain(label('ชื่อบริษัท'));
        expect(part).toContain('บริษัท ทดสอบ จำกัด');
        expect(part).toContain(label('เลขทะเบียนนิติบุคคล'));
        expect(part).toContain('0105568045932');
        expect(part).toContain(label(HOLDER_TYPES.JURISTIC.signatoryLabelTh));
        expect(part).toContain('นาย ผู้มีอำนาจ ลงนาม');
        expect(part).toContain(label(`เลขประจำตัวประชาชน${HOLDER_TYPES.JURISTIC.signatoryLabelTh}`));
        expect(part).toContain('1101700207030');
        expect(part).toContain('123 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10100');
        expect(part).toContain('0812345678');
    });

    test('an individual filing keeps the person rows', () => {
        const part = sectionOne(renderKatorlor1Html(
            filing({
                id: 'e-2', type: 'INDIVIDUAL', displayName: 'สมชาย ใจดี', thaiCitizenId: '1234567890123',
                payload: { holder: {
                    person: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', nationality: 'ไทย' },
                    contact: { address: '1 หมู่ 1', phone: '0812345678', email: '' },
                } },
            }),
            payload('INDIVIDUAL'),
        ));
        for (const row of PERSON_ROWS) { expect(part).toContain(row); }
        expect(part).toContain('นาย สมชาย ใจดี');
        expect(part).toContain('1234567890123');
        expect(part).toContain('ไทย');
        expect(part).not.toContain(label('ชื่อบริษัท'));
        expect(part).not.toContain(label('ชื่อวิสาหกิจชุมชน'));
    });

    test('a community-enterprise filing names its president, not an anonymous person', () => {
        const ce = HOLDER_TYPES.COMMUNITY_ENTERPRISE;
        const part = sectionOne(renderKatorlor1Html(
            filing({
                id: 'e-3', type: 'COMMUNITY_ENTERPRISE', displayName: 'วิสาหกิจชุมชนทดสอบ', communityRegNo: '55001110123',
                payload: { holder: {
                    signatory: { title: 'นาง', firstName: 'ประธาน', lastName: 'กลุ่มดี', idCard: '3904150070071', nationality: 'ไทย' },
                    houseCode: '5001-012345-6',
                    contact: { address: '45 หมู่ 2 ตำบลทดสอบ อำเภอสันทราย เชียงใหม่ 50210', phone: '0898765432', email: '' },
                } },
            }),
            payload('COMMUNITY_ENTERPRISE'),
        ));
        for (const row of PERSON_ROWS) { expect(part).not.toContain(row); }
        expect(part).toContain(label(ce.signatoryLabelTh));
        expect(part).toContain('นาง ประธาน กลุ่มดี');
        expect(part).toContain(label(`เลขประจำตัวประชาชน${ce.signatoryLabelTh}`));
        expect(part).toContain('3904150070071');
        expect(part).toContain(label('ชื่อวิสาหกิจชุมชน'));
        expect(part).toContain('วิสาหกิจชุมชนทดสอบ');
        expect(part).toContain('สวช.01');
        expect(part).toContain('55001110123');
        expect(part).toContain(label('เลขรหัสประจำบ้าน'));
        expect(part).toContain('5001-012345-6');
        expect(part).toContain('45 หมู่ 2 ตำบลทดสอบ อำเภอสันทราย เชียงใหม่ 50210');
        expect(part).toContain('0898765432');
        expect(part).not.toContain(label('ชื่อบริษัท'));
    });
});
