'use strict';
/**
 * generateQuotationPdf renders the STORED quotation row (F-G4-64, spec 3.2), and the whole of it.
 *
 * Order 54 (operator 2026-10-09, verbatim): "ใบเสนอราคาคือยอดเต็ม รวมสองงวด สิ่งที่ต้องต้องอ้างอิงตอนจ่าย
 * เงินคือใบแจ้งหนี้". One quotation number is one document: every instalment the row prices, each
 * with its service fee per cultivation type, its VAT and its total, and a grand total that is their
 * sum. The renderer used to print ONE instalment, picked by a `phase` argument (default 1), so the
 * same number printed 17,655 or 88,275 and never 105,930 (Jev, B0 review, finding 2). There is no
 * `phase` any more.
 *
 * Kept from the earlier rounds:
 *   - F5: a W14 row is priced whole, so the lines print that row's money, never a per-side slice.
 *   - a pre-W14 per-side row prints its own `amount`, because its service fee and VAT do not add
 *     up to it; it gets no VAT line, since the line would state a tax that row does not hold.
 *   - nothing recomputes: a row accepted at a retired rate prints that rate.
 *   - ruling 12 (N1): the document has as many lines per instalment as the ROW has scopes.
 *
 * The PDF engine is mocked (no Puppeteer); the rendered HTML is captured. The real render, read
 * back out of a real PDF through the HTTP door, is
 * __tests__/integration/quotation-states-both-instalments-real-postgres.test.js.
 */

const mockCapture = { html: '' };

jest.mock('../../services/pdf/pdf-generator.service', () => ({
    readTemplateCached: () => 'DOC=[[{{DOC_NUMBER}}]] ITEMS={{ITEMS_ROWS}} TOTAL=[[{{GRAND_TOTAL}}]] WORDS=[[{{AMOUNT_WORDS}}]]',
    replaceTemplateVariables: (tpl, data) =>
        tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(data[k] === undefined ? '' : data[k])),
    generatePDF: async (html) => { mockCapture.html = html; return Buffer.from('PDF'); },
}));

const tpl = require('../../services/pdf/invoice-template-service');
const { getMessage, lookup } = require('../../shared/error-codes');
const { vatLine, SERVICE_CATALOGUE } = require('../../shared/instalment-service-names');
const { PLATFORM_ISSUER } = require('../../config/invoice-issuers');
const { numberToThaiText } = require('../../utils/number-to-thai-text');

/** 3 cultivation methods. */
const application = {
    id: 'app-1',
    applicationNumber: 'GACP-TH-2569-000123',
    totalAreaTypes: 3,
    formData: { cultivationMethods: ['INDOOR', 'GREENHOUSE', 'OUTDOOR'], farmName: 'ฟาร์มตัวอย่าง' },
};

/** The W14 single-issuer row: ONE document, both instalments on it. */
const W14_PLATFORM_ROW = {
    quotationNumber: 'QT-PRD-2026-000001',
    issuerType: 'PLATFORM',
    status: 'PENDING',
    totalAmount: '105930.00',
    installments: [
        { phase: 'PHASE_1', amount: 17655, serviceFeeAmount: 16500, vatAmount: 1155, scopeCount: 3 },
        { phase: 'PHASE_2', amount: 88275, serviceFeeAmount: 82500, vatAmount: 5775, scopeCount: 3 },
    ],
    acceptedSnapshot: null,
};

function frozen(row) {
    return {
        ...row,
        status: 'ACCEPTED',
        acceptedSnapshot: {
            quotationNumber: row.quotationNumber,
            issuerType: row.issuerType,
            scopeCount: row.installments[0].scopeCount,
            totalAmount: row.totalAmount,
            // Mirrors buildAcceptanceSnapshot: every money field a 2-decimal string.
            installments: row.installments.map((it) => ({
                phase: it.phase,
                amount: Number(it.amount).toFixed(2),
                serviceFeeAmount: Number(it.serviceFeeAmount).toFixed(2),
                vatAmount: Number(it.vatAmount).toFixed(2),
                phaseTotal: (it.serviceFeeAmount + it.vatAmount).toFixed(2),
            })),
        },
    };
}

/** The same applicant after a revision down to a single cultivation method. */
const oneMethodApplication = {
    ...application,
    totalAreaTypes: 1,
    formData: { cultivationMethods: ['OUTDOOR'], farmName: 'ฟาร์มตัวอย่าง' },
};

/** A row priced for ONE method: 5,885 + 29,425 = 35,310. */
const ONE_SCOPE_PLATFORM_ROW = {
    quotationNumber: 'QT-PRD-2026-000102',
    issuerType: 'PLATFORM',
    status: 'PENDING',
    totalAmount: '35310.00',
    installments: [
        { phase: 'PHASE_1', amount: 5885, serviceFeeAmount: 5500, vatAmount: 385, scopeCount: 1 },
        { phase: 'PHASE_2', amount: 29425, serviceFeeAmount: 27500, vatAmount: 1925, scopeCount: 1 },
    ],
    acceptedSnapshot: null,
};

const P1_SERVICE = SERVICE_CATALOGUE.PHASE_1.name;
const P2_SERVICE = SERVICE_CATALOGUE.PHASE_2.name;
const VAT_LINE = vatLine(PLATFORM_ISSUER.vatRate).name;

const render = (quotationRow, app = application) =>
    tpl.generateQuotationPdf({ application: app, issuerSide: 'PLATFORM', quotationRow });
/** The numbered lines (one per instalment per cultivation type); VAT and total rows carry no number. */
const numberedLines = (html) => (html.match(/<td class="c">\d+\.<\/td>/g) || []).length;
/** The printed words, tags dropped, spaces collapsed. */
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html, s) => html.split(s).length - 1;

beforeEach(() => { mockCapture.html = ''; });

describe('one quotation number, one document for the whole price (order 54)', () => {
    it('prints both instalments of the accepted row and their sum as the total', async () => {
        await render(frozen(W14_PLATFORM_ROW));
        expect(mockCapture.html).toContain('TOTAL=[[105,930.00]]');
        expect(mockCapture.html).toContain(`WORDS=[[${numberToThaiText(105930)}]]`);
        const html = mockCapture.html;
        expect(html.indexOf(P1_SERVICE)).toBeGreaterThan(-1);
        expect(html.indexOf(P2_SERVICE)).toBeGreaterThan(html.lastIndexOf(P1_SERVICE));
    });

    it('prints the row BEFORE acceptance the same way, from its instalments', async () => {
        await render(W14_PLATFORM_ROW);
        expect(mockCapture.html).toContain('TOTAL=[[105,930.00]]');
    });

    it('each instalment shows its service fee per type, then its VAT, then its total', async () => {
        await render(frozen(W14_PLATFORM_ROW));
        const text = textOf(mockCapture.html);
        // 16,500 / 3 types = 5,500 before VAT; 82,500 / 3 = 27,500
        expect(count(text, '1 คำขอ 5,500.00 5,500.00')).toBe(3);
        expect(count(text, '1 คำขอ 27,500.00 27,500.00')).toBe(3);
        expect(text).toContain(`${VAT_LINE} 1,155.00`);
        expect(text).toContain('รวมงวดที่ 1 17,655.00');
        expect(text).toContain(`${VAT_LINE} 5,775.00`);
        expect(text).toContain('รวมงวดที่ 2 88,275.00');
    });

    it('numbers the lines through the whole document: three types, two instalments, six lines', async () => {
        await render(frozen(W14_PLATFORM_ROW));
        expect(numberedLines(mockCapture.html)).toBe(6);
        expect(mockCapture.html).toContain('<td class="c">6.</td>');
    });

    it('states VAT once per instalment, in the catalogue words, and never the seller`s internal split', async () => {
        await render(frozen(W14_PLATFORM_ROW));
        expect(count(mockCapture.html, VAT_LINE)).toBe(2);
        expect(mockCapture.html).not.toContain('ค่าธรรมเนียมกรม');
        expect(mockCapture.html).not.toContain('ค่าบริการแพลตฟอร์ม');
    });

    it('every line says what the money is for and which type', async () => {
        await render(frozen(W14_PLATFORM_ROW));
        expect(count(mockCapture.html, 'สำหรับขออนุญาต')).toBe(6);
        expect(mockCapture.html).toContain('รูปแบบการปลูกแบบอาคารระบบปิด');
    });

    it('a single-scope row prints one line per instalment and 35,310', async () => {
        await render(frozen(ONE_SCOPE_PLATFORM_ROW), oneMethodApplication);
        expect(numberedLines(mockCapture.html)).toBe(2);
        const text = textOf(mockCapture.html);
        expect(text).toContain('1 คำขอ 5,500.00 5,500.00');
        expect(text).toContain(`${VAT_LINE} 385.00`);
        expect(text).toContain('1 คำขอ 27,500.00 27,500.00');
        expect(text).toContain(`${VAT_LINE} 1,925.00`);
        expect(mockCapture.html).toContain('TOTAL=[[35,310.00]]');
    });
});

describe('a pre-W14 pair keeps its per-side figures', () => {
    const DTAM_ROW = {
        quotationNumber: 'QT-DTAM-2026-000007',
        issuerType: 'DTAM',
        totalAmount: '90000.00',
        installments: [
            { phase: 'PHASE_1', amount: 15000, serviceFeeAmount: 16500, vatAmount: 105, scopeCount: 3 },
            { phase: 'PHASE_2', amount: 75000, serviceFeeAmount: 82500, vatAmount: 525, scopeCount: 3 },
        ],
    };
    const PLATFORM_ROW = {
        ...DTAM_ROW,
        quotationNumber: 'QT-PRD-2026-000007',
        issuerType: 'PLATFORM',
        totalAmount: '9630.00',
        installments: [
            { phase: 'PHASE_1', amount: 1605, serviceFeeAmount: 16500, vatAmount: 105, scopeCount: 3 },
            { phase: 'PHASE_2', amount: 8025, serviceFeeAmount: 82500, vatAmount: 525, scopeCount: 3 },
        ],
    };

    it('the ministry-side document is refused outright, not printed', async () => {
        // operator 2026-09-11 retired the second issuer, so the renderer refuses any issuerSide
        // but PLATFORM. The legacy row keeps its stored figures in the table; the document is gone.
        await expect(tpl.generateQuotationPdf({
            application, issuerSide: 'DTAM', quotationRow: frozen(DTAM_ROW),
        })).rejects.toMatchObject({ code: 'INVALID_ISSUER_SIDE' });
        expect(mockCapture.html).toBe('');
    });

    it('the platform document prints each instalment`s own money and their sum, 9,630', async () => {
        await render(frozen(PLATFORM_ROW));
        expect(mockCapture.html).toContain('TOTAL=[[9,630.00]]');
        const text = textOf(mockCapture.html);
        expect(count(text, '1 คำขอ 535.00 535.00')).toBe(3);
        expect(count(text, '1 คำขอ 2,675.00 2,675.00')).toBe(3);
        expect(text).toContain('รวมงวดที่ 1 1,605.00');
        expect(text).toContain('รวมงวดที่ 2 8,025.00');
    });

    it('prints no VAT line: the row`s service fee and VAT do not add up to the money it holds', async () => {
        await render(frozen(PLATFORM_ROW));
        expect(mockCapture.html).not.toContain(VAT_LINE);
        expect(mockCapture.html).not.toContain('ค่าบริการและภาษีมูลค่าเพิ่ม (');
        expect(mockCapture.html).not.toContain('ค่าบริการแพลตฟอร์ม');
        expect(mockCapture.html).not.toContain('ค่าธรรมเนียมกรม (ตรวจประเมิน)');
    });

    it('and there is no ministry caption left to print', async () => {
        // The ministry line read 'ค่าตรวจสอบและประเมินคำขอการรับรองมาตรฐานเบื้องต้น'. Pinned gone from
        // the builder, so it cannot return by accident.
        const svc = require('fs').readFileSync(
            require('path').resolve(__dirname, '../../services/pdf/invoice-template-service.js'), 'utf8',
        );
        expect(svc).not.toContain('ค่าตรวจสอบและประเมินคำขอการรับรองมาตรฐานเบื้องต้น');
    });
});

describe('the row is the document, and nothing recomputes', () => {
    /** A row accepted under a RETIRED rate: 4,000/scope where today's is 5,500. */
    const RETIRED_RATE_ROW = frozen({
        quotationNumber: 'QT-PRD-2026-000009',
        issuerType: 'PLATFORM',
        totalAmount: '12000.00',
        installments: [
            { phase: 'PHASE_1', amount: 12000, serviceFeeAmount: 13200, vatAmount: 924, scopeCount: 3 },
        ],
    });

    it('renders the frozen rate, never the live rate table', async () => {
        await render(RETIRED_RATE_ROW);
        expect(mockCapture.html).toContain('TOTAL=[[12,000.00]]');
        expect(mockCapture.html).not.toContain('15,000.00');
        expect(mockCapture.html).not.toContain('5,500.00');
    });

    it('prints the row`s own quotation number', async () => {
        await render(RETIRED_RATE_ROW);
        expect(mockCapture.html).toContain('DOC=[[QT-PRD-2026-000009]]');
    });

    it('with NO quotation row there is nothing to print, and the refusal is catalogued', async () => {
        // The legacy caller that handed over no row was priced from the live rate table: a second
        // source for a document the row already holds. The only caller (the PDF door) always has a row.
        await expect(tpl.generateQuotationPdf({ application, issuerSide: 'PLATFORM' })).rejects.toMatchObject({
            code: 'QUOTATION_NOT_PRICED',
            status: lookup('QUOTATION_NOT_PRICED').httpStatus,
            message: getMessage('QUOTATION_NOT_PRICED', 'th'),
        });
        expect(mockCapture.html).toBe('');
    });

    it('still rejects a missing/invalid issuerSide (ม.86 guard preserved)', async () => {
        await expect(
            tpl.generateQuotationPdf({ application, issuerSide: undefined, quotationRow: W14_PLATFORM_ROW }),
        ).rejects.toMatchObject({ code: 'INVALID_ISSUER_SIDE' });
    });
});

describe('a row that prices one instalment, and a row that prices none', () => {
    /** A renewal's shape: PHASE_2 only, because there is no document review to pay for. */
    const PHASE_2_ONLY = frozen({
        quotationNumber: 'QT-PRD-2026-000042',
        issuerType: 'PLATFORM',
        totalAmount: '88275.00',
        installments: [
            { phase: 'PHASE_2', amount: 88275, serviceFeeAmount: 82500, vatAmount: 5775, scopeCount: 3 },
        ],
    });

    it('prints the one instalment it prices, and that is the total', async () => {
        await render(PHASE_2_ONLY);
        expect(mockCapture.html).toContain('TOTAL=[[88,275.00]]');
        expect(numberedLines(mockCapture.html)).toBe(3);
        expect(mockCapture.html).not.toContain(P1_SERVICE);
        expect(textOf(mockCapture.html)).toContain(`${VAT_LINE} 5,775.00`);
    });

    it('prints it before acceptance too', async () => {
        await render({ ...PHASE_2_ONLY, status: 'PENDING', acceptedSnapshot: null });
        expect(mockCapture.html).toContain('TOTAL=[[88,275.00]]');
    });

    it('REFUSES a row that prices no instalment instead of printing a numbered 0.00 document', async () => {
        await expect(render({ ...W14_PLATFORM_ROW, installments: [] })).rejects.toMatchObject({
            code: 'QUOTATION_NOT_PRICED',
        });
        expect(mockCapture.html).toBe('');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ruling 12 (2026-08-28) — the document has as many lines as the ROW.
//
// Re-review N1: the per-scope divisor came from the row while the printed LIST
// came from the application's CURRENT cultivation methods. A quotation accepted
// at three methods, whose application was later revised to one, printed one line
// on a row priced for three; the reverse printed three lines on a row priced for one.
// ─────────────────────────────────────────────────────────────────────────────
describe('the application was revised after the quotation was priced (N1)', () => {
    it('a 3-scope row under a 1-method application still prints three scopes per instalment and 105,930', async () => {
        await render(frozen(W14_PLATFORM_ROW), oneMethodApplication);
        expect(mockCapture.html).toContain('TOTAL=[[105,930.00]]');
        expect(numberedLines(mockCapture.html)).toBe(6);
    });

    it('names the lines it can no longer attribute generically, and never by a method', async () => {
        await render(frozen(W14_PLATFORM_ROW), oneMethodApplication);
        expect(mockCapture.html).toContain('รูปแบบการปลูกที่ 1');
        expect(mockCapture.html).toContain('รูปแบบการปลูกที่ 3');
        expect(mockCapture.html).not.toContain('แบบกลางแจ้ง');
    });

    it('a 1-scope row under a 3-method application prints ONE scope per instalment and 35,310', async () => {
        await render(frozen(ONE_SCOPE_PLATFORM_ROW));
        expect(mockCapture.html).toContain('TOTAL=[[35,310.00]]');
        expect(numberedLines(mockCapture.html)).toBe(2);
        expect(mockCapture.html).not.toContain('TOTAL=[[105,930.00]]');
    });

    it('keeps the per-method wording while the counts agree', async () => {
        await render(frozen(W14_PLATFORM_ROW));
        expect(mockCapture.html).toContain('แบบอาคารระบบปิด');
        expect(mockCapture.html).not.toContain('รูปแบบการปลูกที่ 1');
    });
});
