'use strict';

/**
 * Operator order 145 (2026-10-27), applied in the one holder-type registry:
 *
 *   - a community enterprise's registration code is text as the สวช.01 paper prints it
 *     (digits, dashes, slash; trimmed; no fixed length); staff verify it against the paper;
 *   - a registered partnership is a juristic person (ป.พ.พ. มาตรา 1015) and the DBD's
 *     13-digit number says which kind in its 4th digit: 2 ห้างหุ้นส่วนสามัญนิติบุคคล,
 *     3 ห้างหุ้นส่วนจำกัด, 5 บริษัทจำกัด, 7 บริษัทมหาชนจำกัด. PARTNERSHIP accepts 2 or 3,
 *     JURISTIC (บริษัท) accepts 5 or 7, anything else is refused naming the expected type;
 *   - the signatory label: partnership หุ้นส่วนผู้จัดการ, company กรรมการผู้มีอำนาจลงนาม.
 */

const { HOLDER_TYPES, checkRegistrationNo, requiredFieldsFor } = require('../../shared/holder-registry');
const { resolveApplicantInfo } = require('../../utils/applicant-resolver');

const ORDINARY_REGISTERED = '0102555123457';
const LIMITED_PARTNERSHIP = '0103555123458';
const COMPANY_LIMITED = '0105555123450';
const PUBLIC_COMPANY = '0107555123451';
const UNKNOWN_KIND = '0104555123459';

describe('community enterprise registration code is the text on the สวช.01 paper', () => {
    test.each([
        [' 5-50-01-11/1-0123 ', '5-50-01-11/1-0123'],
        ['12345678901', '12345678901'],
        ['5-50-01-11/1-0123456', '5-50-01-11/1-0123456'],
        ['7', '7'],
        [` ${'1-'.repeat(19)}10 `, `${'1-'.repeat(19)}10`],
    ])('%s is accepted as %s', (input, value) => {
        expect(checkRegistrationNo('COMMUNITY_ENTERPRISE', input)).toEqual({ ok: true, value });
    });

    // A code with no digit would hold the registration key for every owner who types it, and
    // '-' is how the finance documents print "no ID"; an uncapped code is an unbounded column.
    test.each([
        ['', 'กรุณากรอก'],
        ['   ', 'กรุณากรอก'],
        ['สวช 0123', 'ตัวเลข'],
        ['5-50-01-11/1-0123;drop', 'ตัวเลข'],
        ['-', 'ตัวเลขอย่างน้อย 1 หลัก'],
        ['/', 'ตัวเลขอย่างน้อย 1 หลัก'],
        ['-/-', 'ตัวเลขอย่างน้อย 1 หลัก'],
        ['-'.repeat(50), 'ตัวเลขอย่างน้อย 1 หลัก'],
        ['1'.repeat(41), 'ไม่เกิน 40 ตัวอักษร'],
        [['5'.repeat(5000), '5 x 5000'], 'ไม่เกิน 40 ตัวอักษร'],
    ])('%s is refused (%s)', (input, wording) => {
        const out = checkRegistrationNo('COMMUNITY_ENTERPRISE', Array.isArray(input) ? input[0] : input);
        expect(out.ok).toBe(false);
        expect(out.message).toContain(wording);
    });

    test('the payer block prints the code as typed', () => {
        const p = resolveApplicantInfo({
            entity: { id: 'e', type: 'COMMUNITY_ENTERPRISE', displayName: 'วิสาหกิจชุมชน ก', communityRegNo: '5-50-01-11/1-0123', payload: null },
            formData: {},
        });
        expect(p.idPrinted).toBe('5-50-01-11/1-0123');
    });
});

describe('the DBD number\'s 4th digit must match the holder type', () => {
    test.each([
        ['PARTNERSHIP', ORDINARY_REGISTERED],
        ['PARTNERSHIP', LIMITED_PARTNERSHIP],
        ['JURISTIC', COMPANY_LIMITED],
        ['JURISTIC', PUBLIC_COMPANY],
    ])('%s accepts %s', (type, no) => {
        expect(checkRegistrationNo(type, no)).toEqual({ ok: true, value: no });
    });

    test.each([
        ['JURISTIC', ORDINARY_REGISTERED, 'ห้างหุ้นส่วนสามัญนิติบุคคล', 'ห้างหุ้นส่วน'],
        ['JURISTIC', LIMITED_PARTNERSHIP, 'ห้างหุ้นส่วนจำกัด', 'ห้างหุ้นส่วน'],
        ['PARTNERSHIP', COMPANY_LIMITED, 'บริษัทจำกัด', 'บริษัท'],
        ['PARTNERSHIP', PUBLIC_COMPANY, 'บริษัทมหาชนจำกัด', 'บริษัท'],
    ])('%s refuses %s, naming the kind (%s) and the type to pick', (type, no, kind, pick) => {
        const out = checkRegistrationNo(type, no);
        expect(out.ok).toBe(false);
        expect(out.message).toContain(kind);
        expect(out.message).toContain(`"${pick}"`);
    });

    test.each(['JURISTIC', 'PARTNERSHIP'])('%s refuses a 4th digit the DBD does not use for either', (type) => {
        const out = checkRegistrationNo(type, UNKNOWN_KIND);
        expect(out.ok).toBe(false);
        expect(out.message).toContain('หลักที่ 4');
    });

    test('an unregistered ordinary partnership cannot be a holder: the registry says what to do instead', () => {
        expect(HOLDER_TYPES.PARTNERSHIP.noteTh).toContain('จดทะเบียน');
        expect(HOLDER_TYPES.PARTNERSHIP.noteTh).toContain('บุคคลธรรมดา');
    });
});

describe('signatory labels by type', () => {
    test('company = กรรมการผู้มีอำนาจลงนาม, partnership = หุ้นส่วนผู้จัดการ, on every required-field label', () => {
        expect(HOLDER_TYPES.JURISTIC.signatoryLabelTh).toBe('กรรมการผู้มีอำนาจลงนาม');
        expect(HOLDER_TYPES.PARTNERSHIP.signatoryLabelTh).toBe('หุ้นส่วนผู้จัดการ');
        const labels = (type) => requiredFieldsFor(type).map((f) => f.labelTh);
        expect(labels('JURISTIC')).toEqual(expect.arrayContaining(['ชื่อกรรมการผู้มีอำนาจลงนาม', 'เลขประจำตัวประชาชนกรรมการผู้มีอำนาจลงนาม']));
        expect(labels('PARTNERSHIP')).toEqual(expect.arrayContaining(['ชื่อหุ้นส่วนผู้จัดการ']));
        expect(labels('JURISTIC')).not.toContain('ชื่อผู้มีอำนาจลงนาม');
    });
});
