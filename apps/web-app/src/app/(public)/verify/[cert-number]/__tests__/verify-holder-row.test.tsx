/**
 * The public verify page names the company that HOLDS the certificate, and never a
 * person (operator order 68(1)): the backend sends `holderDisplayName` only for a
 * company holder, and this page reads no other name field, so even a backend that
 * still sends the old masked `applicantName` cannot put a person's name on it.
 *
 * Unlike the sibling crypto-verdict test (which renders the pure view-model),
 * this one renders the async server component itself: the label + value pair
 * IS the thing under test and it lives in page.tsx. next/headers and fetch are
 * the only two things stubbed.
 */

import { renderToStaticMarkup } from 'react-dom/server';

const mockHeaderGet = jest.fn((name: string) =>
    name === 'x-forwarded-host' ? 'staging.gacpth.com' : name === 'x-forwarded-proto' ? 'https' : null,
);

jest.mock('next/headers', () => ({
    headers: async () => ({ get: (name: string) => mockHeaderGet(name) }),
}));

import PublicCertVerifyPage from '../page';

const HOLDER_LABEL_TH = 'ผู้ถือใบรับรอง';
const OLD_LABEL_TH = 'ผู้ประกอบการ';

type CertSlice = Record<string, unknown>;

function stubVerifyResponse(certificate: CertSlice) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            success: true,
            verified: true,
            valid: true,
            data: {
                certificate,
                verifiedAt: '2026-08-15T00:00:00.000Z',
            },
        }),
    }) as unknown as typeof fetch;
}

async function renderPage(certNumber = 'GACP-TH-2569-A3F7B2') {
    const element = await PublicCertVerifyPage({
        params: Promise.resolve({ 'cert-number': certNumber }),
    });
    return renderToStaticMarkup(element);
}

const BASE_CERT = {
    farmName: 'ฟาร์มสมุนไพรบ้านนา',
    province: 'เชียงใหม่',
    scope: { crop: 'ขมิ้นชัน', cultivationTypes: [], standard: 'GACP' },
    issueDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2027-01-01T00:00:00.000Z',
};

afterEach(() => {
    jest.clearAllMocks();
});

describe('M1 — public verify page shows the certificate holder', () => {
    it('renders the juristic holder name under the label ผู้ถือใบรับรอง', async () => {
        stubVerifyResponse({
            ...BASE_CERT,
            applicantName: 'สมชาย ใ.',
            holderDisplayName: 'บริษัท สมุนไพรไทย จำกัด',
        });
        const html = await renderPage();
        expect(html).toContain(HOLDER_LABEL_TH);
        expect(html).toContain('บริษัท สมุนไพรไทย จำกัด');
        // The old label is retired — one row, one meaning.
        expect(html).not.toContain(OLD_LABEL_TH);
    });

    it('never reads applicantName, even when an older backend still sends it', async () => {
        stubVerifyResponse({ ...BASE_CERT, holderDisplayName: null, applicantName: 'สมชาย ใ.' });
        const html = await renderPage();
        expect(html).not.toContain(HOLDER_LABEL_TH);
        expect(html).not.toContain('สมชาย');
    });

    it('renders no holder row at all when neither name is present', async () => {
        stubVerifyResponse({ ...BASE_CERT });
        const html = await renderPage();
        expect(html).not.toContain(HOLDER_LABEL_TH);
        // The rest of the certificate still renders.
        expect(html).toContain('ฟาร์มสมุนไพรบ้านนา');
    });
});
