/**
 * The result page answers in plain words (operator order 37, 2026-10-07): each
 * status has its own word on the page, in text, not just a colour. Signature,
 * fingerprint and the page QR sit below a small "รายละเอียดทางเทคนิค" disclosure
 * at the bottom, after the answer.
 */

import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/headers', () => ({
    headers: async () => ({
        get: (name: string) =>
            name === 'x-forwarded-host' ? 'staging.gacpth.com' : name === 'x-forwarded-proto' ? 'https' : null,
    }),
}));

import PublicCertVerifyPage from '../page';

function stub(body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch;
}

async function render(certNumber = 'TH-GACP-1-2569') {
    const el = await PublicCertVerifyPage({ params: Promise.resolve({ 'cert-number': certNumber }) });
    return renderToStaticMarkup(el);
}

const ACTIVE = {
    success: true,
    verified: true,
    valid: true,
    data: {
        certificateNumber: 'TH-GACP 1/2569',
        status: 'active',
        integrity: 'VALID',
        signatureValid: true,
        publicKeyFingerprint: 'abcdef0123456789abcdef',
        certificate: {
            holderDisplayName: 'บริษัท สมุนไพรไทย จำกัด',
            province: 'เชียงใหม่',
            scope: { crop: 'กัญชา', cultivationTypes: [], standard: 'GACP' },
            issueDate: '2026-09-17T00:00:00.000Z',
            expiryDate: '2027-09-17T00:00:00.000Z',
        },
    },
};

function notValid(reasonCode: string) {
    return {
        success: true,
        verified: false,
        valid: false,
        data: { certificateNumber: 'TH-GACP 1/2569', status: reasonCode.toLowerCase(), reasonCode, certificate: null },
    };
}

/** The word inside the status chip, read from the markup the citizen sees. */
function statusWord(html: string): string | undefined {
    return html.match(/สถานะใบรับรอง<\/p><p class="inline-block[^"]*">([^<]+)<\/p>/)?.[1];
}

afterEach(() => jest.clearAllMocks());

describe('result page says the status in words', () => {
    it.each([
        ['EXPIRED', 'หมดอายุ'],
        ['SUSPENDED', 'ถูกพักใช้'],
        ['REVOKED', 'ถูกเพิกถอน'],
        ['NOT_FOUND', 'ไม่พบเลขนี้'],
        ['RENEWED', 'มีฉบับใหม่แทนแล้ว'],
    ])('%s reads "%s"', async (code, word) => {
        stub(notValid(code));
        const html = await render();
        expect(statusWord(html)).toBe(word);
        expect(html).not.toContain('ใบรับรองถูกต้องและยังมีผลบังคับใช้');
    });

    it('a valid certificate reads "ใช้ได้" with holder, scope and dates', async () => {
        stub(ACTIVE);
        const html = await render();
        expect(statusWord(html)).toBe('ใช้ได้');
        expect(html).toContain('บริษัท สมุนไพรไทย จำกัด');
        expect(html).toContain('ขอบเขตการรับรอง');
        expect(html).toContain('กัญชา · GACP');
        expect(html).toContain('วันที่ออก');
        expect(html).toContain('วันหมดอายุ');
    });

    it('a status-valid certificate whose content was altered reads as not matching, never "ใช้ได้"', async () => {
        stub({ ...ACTIVE, data: { ...ACTIVE.data, integrity: 'TAMPERED', signatureValid: false } });
        const html = await render();
        expect(statusWord(html)).toBe('ข้อมูลไม่ตรงต้นฉบับ');
    });

    it('a backend outage is "cannot check now", never a verdict word', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
        const html = await render();
        expect(html).toContain('ไม่สามารถตรวจสอบได้ในขณะนี้');
        expect(statusWord(html)).toBeUndefined();
    });
});

describe('technical details stay below the answer', () => {
    it('signature verdict, fingerprint and page QR come after the disclosure, which comes after the dates', async () => {
        stub(ACTIVE);
        const html = await render();
        const summary = html.indexOf('<summary');
        expect(summary).toBeGreaterThan(-1);
        expect(html.slice(summary)).toContain('รายละเอียดทางเทคนิค');
        expect(html.indexOf('วันหมดอายุ')).toBeLessThan(summary);
        for (const technical of ['ลายนิ้วมือกุญแจสาธารณะ', 'abcdef0123456789', 'href="/verify/technical"']) {
            expect(html.indexOf(technical)).toBeGreaterThan(summary);
        }
    });

    it('the page carries no developer input', async () => {
        stub(ACTIVE);
        const html = await render();
        expect(html).not.toContain('<textarea');
        expect(html).not.toContain('<select');
        expect(html).not.toContain('PLANT_UNIT');
    });
});
