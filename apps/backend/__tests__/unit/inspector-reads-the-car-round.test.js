'use strict';

const { formDataWithoutContact } = require('../../shared/applicant-contact');

describe('the field inspector reads the corrective-action round with contact withheld (order 127(1))', () => {
    it('keeps the defect list, the applicant note and who opened which file', () => {
        const filing = formDataWithoutContact({
            carRequest: { items: [{ nonConformity: 'ป้ายไม่ครบ', correctiveAction: 'ติดป้าย' }] },
            carNotes: 'แก้ครบแล้ว',
            carEvidenceViews: { 'CAR-1.pdf': { 'inspector-1': '2026-10-21T08:00:00.000Z' } },
            carDocuments: [{ id: 'CAR-1.pdf', findingNo: 1 }],
            applicantData: { phone: '0800000000' },
        });
        expect(filing).toMatchObject({
            carRequest: { items: [{ nonConformity: 'ป้ายไม่ครบ', correctiveAction: 'ติดป้าย' }] },
            carNotes: 'แก้ครบแล้ว',
            carEvidenceViews: { 'CAR-1.pdf': { 'inspector-1': '2026-10-21T08:00:00.000Z' } },
        });
        expect(filing.applicantData?.phone).toBeUndefined();
    });
});
