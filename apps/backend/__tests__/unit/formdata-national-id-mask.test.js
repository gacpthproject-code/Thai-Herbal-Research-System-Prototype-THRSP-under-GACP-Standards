'use strict';

/**
 * Order 10 on staff screens (security re-review 2026-10-09 N2/R4): every national ID in a filing
 * leaves the server masked, first digit and last four, and nothing that only looks like digits is
 * mangled on the way.
 */

const {
    VERSION_PREFIX,
    encryptFormDataPii,
    maskFormDataNationalIds,
    maskApplicationForStaff,
    isMaskedEchoOfStored,
    isTypedOverMaskedValue,
} = require('../../utils/formdata-pii');

/** A 13-digit number whose last digit is the Mod-11 check digit. */
const thaiId = (first12) => {
    const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (13 - i), 0);
    return `${first12}${(11 - (sum % 11)) % 10}`;
};
const ID = thaiId('110370012345');
const MASKED = `1-XXXX-XXXX-X-${ID.slice(9)}`;
const STAFF_UUID = 'c82d4715-4c75-4994-8945-880ab07c5ded';

describe('maskFormDataNationalIds', () => {
    test('masks every national-ID key, bare, formatted or a number, at any depth', () => {
        const shown = maskFormDataNationalIds({
            applicantData: { idCard: ID, presidentIdCard: `${ID.slice(0, 1)}-${ID.slice(1, 5)}-${ID.slice(5, 10)}-${ID.slice(10, 12)}-${ID.slice(12)}` },
            steps: { 4: { id_card: Number(ID) } },
            history: [{ reviewedBy: ID }],
        });
        expect(shown).toEqual({
            applicantData: { idCard: MASKED, presidentIdCard: MASKED },
            steps: { 4: { id_card: MASKED } },
            history: [{ reviewedBy: MASKED }],
        });
    });

    test('masks a Mod-11 national ID under any key, and leaves a 13-digit string that fails Mod-11', () => {
        const failsMod11 = `${ID.slice(0, 12)}${(Number(ID[12]) + 1) % 10}`;
        expect(maskFormDataNationalIds({ witness: { witnessId: ID, ref: failsMod11 } }))
            .toEqual({ witness: { witnessId: MASKED, ref: failsMod11 } });
    });

    test('keeps what only looks like digits: a staff UUID, an epoch in a stored file name, a numeric timestamp, a registration code', () => {
        const filing = {
            auditDecisions: [{ decidedBy: STAFF_UUID }],
            uploadedDocuments: { idCardDoc: { filePath: `/uploads/1728450000000-${STAFF_UUID}.pdf` } },
            workflowStateUpdatedAt: 1728450000000,
            applicantData: { communityRegNumber: '1-23-45-67/1-0001' },
        };
        expect(maskFormDataNationalIds(filing)).toEqual(filing);
    });

    test('a staff key that holds text keeps the text and masks only the 13-digit run in it', () => {
        expect(maskFormDataNationalIds({ by: `ผู้ตรวจ ${ID}` })).toEqual({ by: `ผู้ตรวจ ${MASKED}` });
    });

    test('does not touch the stored blob', () => {
        const filing = { applicantData: { idCard: ID } };
        maskFormDataNationalIds(filing);
        expect(filing.applicantData.idCard).toBe(ID);
    });

    // Security re-review 2026-10-09 I1: a key the staff mask treats as a national ID is also one the
    // filing encrypts at rest. A value that fails Mod-11 reaches neither rule by its value alone.
    test.each(['nationalId', 'authorisedIdCard'])('%s is encrypted at rest as well as masked on a staff screen', (key) => {
        const failsMod11 = `${ID.slice(0, 12)}${(Number(ID[12]) + 1) % 10}`;
        expect(maskFormDataNationalIds({ applicantData: { [key]: failsMod11 } }).applicantData[key]).toBe(`1-XXXX-XXXX-X-${failsMod11.slice(9)}`);
        expect(encryptFormDataPii({ applicantData: { [key]: failsMod11 } }).applicantData[key].startsWith(VERSION_PREFIX)).toBe(true);
    });
});

describe('maskApplicationForStaff', () => {
    test('masks the filing and its history and leaves out healthId', () => {
        expect(maskApplicationForStaff({
            id: 'app-1', status: 'AUDIT_CONFIRMED', healthId: ID, formData: { applicantData: { idCard: ID } }, workflowHistory: [{ by: ID }],
        })).toEqual({
            id: 'app-1', status: 'AUDIT_CONFIRMED', formData: { applicantData: { idCard: MASKED } }, workflowHistory: [{ by: MASKED }],
        });
    });
});

describe('isMaskedEchoOfStored', () => {
    test('the masked value a screen showed is an echo; a newly typed number and other keys are not', () => {
        expect(isMaskedEchoOfStored('idCard', ID, MASKED)).toBe(true);
        expect(isMaskedEchoOfStored('idCard', ID, thaiId('110370099999'))).toBe(false);
        expect(isMaskedEchoOfStored('phone', '0812345678', '0812345678')).toBe(false);
        expect(isMaskedEchoOfStored('idCard', undefined, MASKED)).toBe(false);
    });
});

describe('isTypedOverMaskedValue', () => {
    test('the mask letter over a value the screen showed masked is refused, whatever the key', () => {
        expect(isTypedOverMaskedValue('idCard', ID, '1-XXXX-XXXX-X-9990')).toBe(true);
        expect(isTypedOverMaskedValue('taxId', ID, 'xxxx')).toBe(true);
        expect(isTypedOverMaskedValue('registrationNumber', ID, `${MASKED.slice(0, -1)}9`)).toBe(true);
    });

    test('a full number, a value the screen never masked, and a stored value that itself carries an X are not', () => {
        expect(isTypedOverMaskedValue('idCard', ID, thaiId('110370099999'))).toBe(false);
        expect(isTypedOverMaskedValue('idCard', 'AX1234567', 'AX1234567')).toBe(false);
        expect(isTypedOverMaskedValue('idCard', 'AX1234567', 'AX1234568')).toBe(false);
        expect(isTypedOverMaskedValue('fullName', 'Xavier', 'Xavier Doe')).toBe(false);
        expect(isTypedOverMaskedValue('idCard', undefined, '1-XXXX-XXXX-X-9990')).toBe(false);
    });
});
