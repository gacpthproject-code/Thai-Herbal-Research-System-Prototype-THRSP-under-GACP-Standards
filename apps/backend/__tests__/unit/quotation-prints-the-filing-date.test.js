'use strict';

const mockCapture = { html: '' };

jest.mock('../../services/pdf/pdf-generator.service', () => ({
    readTemplateCached: () => 'SUBMIT=[[{{SUBMIT_DATE}}]]',
    replaceTemplateVariables: (tpl, data) =>
        tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(data[k] === undefined ? '' : data[k])),
    generatePDF: async (html) => { mockCapture.html = html; return Buffer.from('PDF'); },
}));

const tpl = require('../../services/pdf/invoice-template-service');

const quotationRow = {
    quotationNumber: 'QT-PRD-2026-000001',
    issuerType: 'PLATFORM',
    status: 'PENDING',
    totalAmount: '35310.00',
    installments: [
        { phase: 'PHASE_1', amount: 5885, serviceFeeAmount: 5500, vatAmount: 385, scopeCount: 1 },
        { phase: 'PHASE_2', amount: 29425, serviceFeeAmount: 27500, vatAmount: 1925, scopeCount: 1 },
    ],
    acceptedSnapshot: null,
};

const render = async (formData) => {
    await tpl.generateQuotationPdf({
        application: { id: 'app-1', applicationNumber: 'APP-1', createdAt: '2026-09-27T03:00:00.000Z', formData },
        issuerSide: 'PLATFORM',
        quotationRow,
    });
    return mockCapture.html.match(/SUBMIT=\[\[(.*?)\]\]/)[1];
};

describe('quotation note: the filing date', () => {
    test('prints the stamped filing day', async () => {
        expect(await render({ submittedAt: '2026-10-06T03:00:00.000Z' })).toBe('6 ต.ค. 2569');
    });

    test('leaves the line blank when the application has no stamp', async () => {
        expect(await render({})).toBe('________');
    });
});
