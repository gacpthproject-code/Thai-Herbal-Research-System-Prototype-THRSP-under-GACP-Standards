'use strict';
/**
 * fix/fee-line-descriptions round 2 (operator 2026-10-03) — ใบลดหนี้/ใบเพิ่มหนี้ ตั้งชื่อบรรทัด
 * และบอกความครอบคลุมจากแค็ตตาล็อกเดียวกับใบที่มันปรับปรุง · ใบของการต่ออายุคือ
 * "ค่าบริการต่ออายุใบรับรอง" ไม่ใช่ "งวดที่ 2" · ใบของงวดคงชื่องวด · ยอดไม่เปลี่ยน
 *
 * ทางเรนเดอร์จริง: routes/api/finance/{credit,debit}-notes.js อ่านผ่าน
 * find{Credit,Debit}NoteForDocument ซึ่งขอ originalInvoice.application ด้วย PAYER_APPLICATION_SELECT
 * (= formData + entity) — เทสต์ล่างสุดตรึงว่ายังเลือก formData อยู่ ไม่งั้นการต่ออายุจะมองไม่เห็น
 */

const mockCapture = { html: '' };
jest.mock('../../services/pdf/pdf-generator.service', () => {
    const actual = jest.requireActual('../../services/pdf/pdf-generator.service');
    actual.generatePDF = async (html) => { mockCapture.html = html; return Buffer.from('PDF'); };
    return actual;
});

const tpl = require('../../services/pdf/invoice-template-service');
const { SERVICE_CATALOGUE } = require('../../shared/instalment-service-names');

jest.setTimeout(30000);

const NEW_APP = { applicationNumber: 'APP-NOTE-NEW', formData: { plantId: 'cannabis', applicantType: 'INDIVIDUAL', applicantData: { firstName: 'ก', lastName: 'ข' } } };
const RENEWAL_APP = { applicationNumber: 'APP-NOTE-REN', formData: { ...NEW_APP.formData, renewalOf: 'cert-old-1' } };

const note = (milestone, application, kind) => ({
    id: `${kind}-1`,
    [kind === 'credit' ? 'creditNoteNumber' : 'debitNoteNumber']: `${kind === 'credit' ? 'CN' : 'DN'}-PRD-2569-000001`,
    subtotal: 1000, vat: 70, totalAmount: 1070,
    reason: 'ปรับปรุงยอดตามที่ตกลง',
    issuedAt: new Date('2026-10-03T05:00:00Z'),
    originalInvoice: {
        invoiceNumber: `INV-CO-NOTE-${milestone}`,
        receiptNumber: `TAX-PRD-CO-NOTE-${milestone}`,
        serviceType: `CERTIFICATION_CHECKOUT_${milestone}`,
        subtotal: 33000, vat: 2310, totalAmount: 35310,
        paidAt: new Date('2026-10-02T05:00:00Z'),
        application,
    },
});

const esc = (s) => s.replace(/&/g, '&amp;');

describe.each([
    ['credit', (n) => tpl.generateCreditNotePdf(n)],
    ['debit', (n) => tpl.generateDebitNotePdf(n)],
])('%s note', (kind, render) => {
    beforeEach(() => { mockCapture.html = ''; });

    test.each([
        ['renewal M2', 'M2', RENEWAL_APP, SERVICE_CATALOGUE.RENEWAL],
        ['new filing M2', 'M2', NEW_APP, SERVICE_CATALOGUE.PHASE_2],
        ['new filing M1', 'M1', NEW_APP, SERVICE_CATALOGUE.PHASE_1],
    ])('%s: the line is the catalogue name with its coverage; amounts unchanged', async (_l, m, app, entry) => {
        await render(note(m, app, kind));
        const html = mockCapture.html;
        expect(html).toContain(esc(entry.name));
        expect(html).toContain(esc(entry.coverage));
        for (const other of Object.values(SERVICE_CATALOGUE).filter((e) => e !== entry)) {
            expect(html).not.toContain(esc(other.coverage));
        }
        // amounts: the note's own figures, in the line (Arabic) and the Thai-digit totals
        expect(html).toContain('1,000.00');
        expect(html).toContain('70.00');
        expect(html).toContain('1,070.00');
        expect(html).toContain('๑,๐๗๐.๐๐');
    });
});

describe('the document read selects what the renewal test needs', () => {
    const { PAYER_APPLICATION_SELECT } = require('../../utils/applicant-resolver');
    const actor = { canonicalRole: 'finance_officer_platform', organizationId: 'org-1' };

    test.each([
        ['credit-note-service', 'creditNote', 'findCreditNoteForDocument'],
        ['debit-note-service', 'debitNote', 'findDebitNoteForDocument'],
    ])('%s ForDocument asks for the application with PAYER_APPLICATION_SELECT and the invoice metadata', async (file, model, fn) => {
        const findUnique = jest.fn(async () => ({ id: 'n-1', organizationId: 'org-1', originalInvoice: {} }));
        let service;
        jest.isolateModules(() => {
            jest.doMock('../../services/prisma-database', () => ({
                prisma: { [model]: { create: jest.fn(), findUnique } },
            }));
            service = require(`../../services/${file}`);
        });
        await expect(service[fn]('n-1', { actor })).resolves.toMatchObject({ id: 'n-1' });
        const select = findUnique.mock.calls[0][0].include.originalInvoice.select;
        expect(select.application).toEqual({ select: PAYER_APPLICATION_SELECT });
        expect(select.metadata).toBe(true);
        expect(PAYER_APPLICATION_SELECT.formData).toBe(true);
    });
});
