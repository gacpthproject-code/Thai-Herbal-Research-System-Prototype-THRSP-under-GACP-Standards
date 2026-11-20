import { describe, expect, it } from '@jest/globals';
import {
    HOLDER_TYPES,
    fieldErrorsOf,
    holderInputFrom,
    holderPlaceholders,
    holderValues,
    isUnverifiedPerson,
    registrationNoProblem,
    type HolderRecord,
} from '../holder-registry';

describe('the holder page sends the shape the server parses', () => {
    it('an organisation: legalName at the top, signatory and contact grouped', () => {
        const values = {
            legalName: ' ห้างหุ้นส่วนจำกัด สองพี่น้อง ',
            'signatory.title': 'นาง', 'signatory.firstName': 'มาลี', 'signatory.lastName': 'ศรีสุข',
            'signatory.idCard': '3100600123450', 'signatory.nationality': 'ไทย',
            'contact.address': '1 หมู่ 2', 'contact.phone': '0812345678',
        };
        expect(holderInputFrom('PARTNERSHIP', values)).toEqual({
            legalName: 'ห้างหุ้นส่วนจำกัด สองพี่น้อง',
            signatory: { title: 'นาง', firstName: 'มาลี', lastName: 'ศรีสุข', idCard: '3100600123450', nationality: 'ไทย' },
            contact: { address: '1 หมู่ 2', phone: '0812345678', email: '' },
        });
    });

    it('a person: no legalName and no signatory, only the person and contact', () => {
        const input = holderInputFrom('INDIVIDUAL', { 'person.firstName': 'สมชาย' });
        expect(Object.keys(input).sort()).toEqual(['contact', 'person']);
    });

    it('a community enterprise also sends its house code', () => {
        expect(holderInputFrom('COMMUNITY_ENTERPRISE', { houseCode: '50180-001' })).toMatchObject({ houseCode: '50180-001' });
    });

    it('a saved record fills the form by the same paths', () => {
        const record = { legalName: 'บริษัท ก จำกัด', contact: { address: 'x', phone: '', email: '' } } as unknown as HolderRecord;
        expect(holderValues(record, 'JURISTIC')).toMatchObject({ legalName: 'บริษัท ก จำกัด', 'contact.address': 'x', 'signatory.firstName': '' });
    });
});

describe('a masked national ID is never sent back', () => {
    it('the ID field starts empty and shows the masked value on record as its placeholder', () => {
        const record = { signatory: { idCard: '3-XXXX-XXXX-X-3450', firstName: 'มาลี' } } as unknown as HolderRecord;
        expect(holderValues(record, 'PARTNERSHIP')['signatory.idCard']).toBe('');
        expect(holderValues(record, 'PARTNERSHIP')['signatory.firstName']).toBe('มาลี');
        expect(holderPlaceholders(record, 'PARTNERSHIP')).toEqual({ 'signatory.idCard': '3-XXXX-XXXX-X-3450' });
    });
});

describe('the four holder types', () => {
    it('partnership is a type of its own, with its own signatory label', () => {
        expect(HOLDER_TYPES.PARTNERSHIP.labelTh).toBe('ห้างหุ้นส่วน');
        expect(HOLDER_TYPES.PARTNERSHIP.signatoryLabelTh).toBe('หุ้นส่วนผู้จัดการ');
        expect(HOLDER_TYPES.JURISTIC.signatoryLabelTh).toBe('กรรมการผู้มีอำนาจลงนาม');
    });

    it('a partnership must be registered to be a holder; the create page says so (order 145)', () => {
        expect(HOLDER_TYPES.PARTNERSHIP.noteTh).toContain('จดทะเบียน');
        expect(HOLDER_TYPES.PARTNERSHIP.noteTh).toContain('บุคคลธรรมดา');
        expect(HOLDER_TYPES.JURISTIC.noteTh).toBeUndefined();
    });

    it('the create page checks the registration number by the same rules as the server (order 145)', () => {
        expect(registrationNoProblem('COMMUNITY_ENTERPRISE', ' 5-50-01-11/1-0123 ')).toBeNull();
        expect(registrationNoProblem('COMMUNITY_ENTERPRISE', 'สวช 0123')).toContain('ตัวเลข');
        expect(registrationNoProblem('COMMUNITY_ENTERPRISE', '')).toContain('กรุณากรอก');
        expect(registrationNoProblem('COMMUNITY_ENTERPRISE', '7')).toBeNull();
        expect(registrationNoProblem('COMMUNITY_ENTERPRISE', ` ${'1-'.repeat(19)}10 `)).toBeNull();
        for (const noDigit of ['-', '/', '-/-', '-'.repeat(50)]) {
            expect(registrationNoProblem('COMMUNITY_ENTERPRISE', noDigit)).toContain('ตัวเลขอย่างน้อย 1 หลัก');
        }
        expect(registrationNoProblem('COMMUNITY_ENTERPRISE', '1'.repeat(41))).toContain('ไม่เกิน 40 ตัวอักษร');
        expect(registrationNoProblem('COMMUNITY_ENTERPRISE', '5'.repeat(5000))).toContain('ไม่เกิน 40 ตัวอักษร');
        expect(registrationNoProblem('PARTNERSHIP', '0103555123458')).toBeNull();
        expect(registrationNoProblem('PARTNERSHIP', '0105555123450')).toContain('บริษัทจำกัด');
        expect(registrationNoProblem('JURISTIC', '0107555123451')).toBeNull();
        expect(registrationNoProblem('JURISTIC', '0102555123457')).toContain('ห้างหุ้นส่วนสามัญนิติบุคคล');
        expect(registrationNoProblem('JURISTIC', '0104555123459')).toContain('หลักที่ 4');
        expect(registrationNoProblem('JURISTIC', '0105555123451')).toContain('13 หลัก');
        expect(HOLDER_TYPES.COMMUNITY_ENTERPRISE.registrationDigits).toBeNull();
    });

    it('every organisation asks its signatory\'s first and last name in separate fields', () => {
        for (const type of ['JURISTIC', 'PARTNERSHIP', 'COMMUNITY_ENTERPRISE'] as const) {
            const paths = HOLDER_TYPES[type].fields.map((f) => f.path);
            expect(paths).toEqual(expect.arrayContaining(['signatory.firstName', 'signatory.lastName']));
        }
    });
});

describe('staff read an individual typed in after a password registration as not verified', () => {
    it.each([
        [{ type: 'INDIVIDUAL', identitySource: 'SELF_DECLARED' }, true],
        [{ type: 'INDIVIDUAL', identitySource: 'THAID' }, false],
        [{ type: 'JURISTIC', identitySource: 'SELF_DECLARED' }, false],
        [null, false],
    ])('%j → %s', (holder, expected) => {
        expect(isUnverifiedPerson(holder)).toBe(expected);
    });
});

describe('a refused save names its fields', () => {
    it('reads meta.validationErrors by path', () => {
        expect(fieldErrorsOf({ validationErrors: [{ path: 'registrationNo', message: 'ผิด' }, { nope: 1 }] }))
            .toEqual({ registrationNo: 'ผิด' });
        expect(fieldErrorsOf(undefined)).toEqual({});
    });
});
