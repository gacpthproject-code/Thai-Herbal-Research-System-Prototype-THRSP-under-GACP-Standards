/**
 * F-A8c-06: CAR evidence is a correction on site for a filing whose form was already accepted
 * at review. The holder record is กทล.1 ส่วนที่ ๑, part of that form, so the CAR door does not
 * ask for it again; the doors that file the form (first submit, revision resubmit) still do.
 */
'use strict';

const { validateFilingCompleteness } = require('../../validation/application-submission-validator');
const { filedFormData } = require('../../test-support/filed-application');

const legacyHolder = { id: 'entity-legacy', type: 'JURISTIC', displayName: 'บริษัท ก่อนทะเบียนผู้ถือ จำกัด', payload: null };

describe('the holder record at each filing door', () => {
    test('the CAR door accepts evidence for a filing whose holder record predates the registry', () => {
        const result = validateFilingCompleteness({
            formData: filedFormData(), application: {}, entity: legacyHolder, refilesTheForm: false,
        });
        expect(result).toEqual({ isValid: true });
    });

    test('a door that files the form still names every missing holder field', () => {
        const result = validateFilingCompleteness({
            formData: filedFormData(), application: {}, entity: legacyHolder, refilesTheForm: true,
        });
        expect(result.isValid).toBe(false);
        expect(result.missingFields).toEqual([
            'holder.registrationNo', 'holder.signatory.title', 'holder.signatory.firstName', 'holder.signatory.lastName',
            'holder.signatory.idCard', 'holder.signatory.nationality', 'holder.contact.address', 'holder.contact.phone',
        ]);
        expect(result.errorsByStep.holder[0]).toEqual({ path: 'registrationNo', message: 'เลขทะเบียนนิติบุคคล จำเป็น', code: 'HOLDER_INCOMPLETE' });
    });
});
