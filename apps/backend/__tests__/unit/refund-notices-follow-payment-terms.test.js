'use strict';

/**
 * The applicant's refund notices say what payment terms v1.3 promise, and the
 * refund constants are the document's own numbers and words.
 *
 * The in-app row takes subjectTH and bodyTHText from these templates
 * (notification-fanout-service.js, in-app leg), so this is the text the
 * applicant reads in the bell. The old single notice said "ภายใน 7 วันทำการ"
 * while the terms printed 15, and cited a tax-code section to the customer.
 */

const fs = require('fs');
const path = require('path');

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const { getTemplateForType } = require('../../services/notification-fanout-service');
const {
    PROVIDER_CANCELLATION_REASONS,
    REFUND_TRANSFER_WORKING_DAYS,
    REFUND_CONTACT_EMAIL,
} = require('../../shared/refund-kinds');

const TERMS = fs.readFileSync(path.resolve(__dirname, '../../../../docs/legal/payment-terms-th-v1.3.md'), 'utf8');

function clause(n) {
    const at = TERMS.search(new RegExp(`^${n.replace(/\./g, '\\.')} `, 'm'));
    if (at < 0) { throw new Error(`payment terms v1.3 clause ${n} not found`); }
    return TERMS.slice(at);
}

const PAYLOAD = {
    applicationNumber: 'GACP-2569-000123',
    invoiceNumber: 'TAX-PRD-2026-000001',
    creditNoteNumber: 'CN-PRD-2026-000001',
    amount: 5885,
};

describe('the refund constants are the terms document', () => {
    it('the transfer timetable is the number §7.4 prints', () => {
        const days = clause('7.4').split('\n')[0].match(/ภายใน (\d+) วันทำการ/);
        expect(Number(days[1])).toBe(REFUND_TRANSFER_WORKING_DAYS);
    });

    it('the contact address is the one §11.1 prints', () => {
        expect(clause('11.1').split('\n').slice(0, 3).join('\n')).toContain(`อีเมล ${REFUND_CONTACT_EMAIL}`);
    });

    it('the reasons finance picks from are §7.2.1, word for word and in order', () => {
        const items = clause('7.2.1').split(/^7\.2\.2 /m)[0].split('\n')
            .filter((l) => /^- \(/.test(l))
            .map((l) => l.replace(/^- \([ก-ฮ]\) /, ''));
        expect(items).toEqual(Object.values(PROVIDER_CANCELLATION_REASONS));
    });
});

describe.each([
    ['REFUND_PROVIDER_CANCELLED', { ...PAYLOAD, reasonCode: 'COMPANY_CANNOT_INSPECT' }],
    ['REFUND_DUPLICATE_CHARGE', PAYLOAD],
])('%s', (type, payload) => {
    const notice = getTemplateForType(type, payload);

    it('apologises first', () => {
        expect(notice.bodyTHText.startsWith('บริษัทขออภัย')).toBe(true);
    });

    it('names the amount, the tax invoice and the credit note', () => {
        expect(notice.bodyTHText).toContain('5,885.00 บาท');
        expect(notice.bodyTHText).toContain(payload.invoiceNumber);
        expect(notice.bodyTHText).toContain(payload.creditNoteNumber);
    });

    it('states the terms timetable and where to send account details', () => {
        expect(notice.bodyTHText).toContain(`ภายใน ${REFUND_TRANSFER_WORKING_DAYS} วันทำการ`);
        expect(notice.bodyTHText).toContain(REFUND_CONTACT_EMAIL);
    });

    it('reads as polite service Thai: ท่าน, no คุณ, no em dash, no section number, no status code, no provider name', () => {
        for (const text of [notice.subjectTH, notice.bodyTHText, notice.smsTH]) {
            expect(text).not.toContain('คุณ');
            expect(text).not.toMatch(/[–—]/);
            expect(text).not.toMatch(/ม\.\s?86|ข้อ 7|§/);
            expect(text).not.toMatch(/stripe|webhook|CANCELLED|DUPLICATE/i);
        }
        expect(notice.bodyTHText).toContain('ท่าน');
    });
});

describe('the cancellation notice', () => {
    it('gives the reason in the terms words and says the application is closed', () => {
        const notice = getTemplateForType('REFUND_PROVIDER_CANCELLED', { ...PAYLOAD, reasonCode: 'BARRED_BY_LAW_OR_ORDER' });
        expect(notice.subjectTH).toContain(PAYLOAD.applicationNumber);
        expect(notice.bodyTHText).toContain(`เนื่องจาก${PROVIDER_CANCELLATION_REASONS.BARRED_BY_LAW_OR_ORDER}`);
        expect(notice.bodyTHText).toContain('คำขอนี้จึงถูกปิดเป็นยกเลิก');
        expect(notice.bodyTHText).toContain('งวดที่ยังไม่ได้เริ่มดำเนินการตรวจ');
    });
});

describe('the duplicate-charge notice', () => {
    it('says the application carries on and the instalment needs no second payment', () => {
        const notice = getTemplateForType('REFUND_DUPLICATE_CHARGE', PAYLOAD);
        expect(notice.bodyTHText).toContain('คำขอของท่านดำเนินการต่อตามปกติ');
        expect(notice.bodyTHText).toContain('ไม่ต้องชำระค่าบริการงวดนี้อีก');
    });
});

it('the retired single notice is gone', () => {
    expect(getTemplateForType('REFUND_INITIATED', PAYLOAD)).toBeNull();
});
