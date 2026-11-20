/**
 * Operator order 68(1) on the public certificate result page: one "ขอบเขตการรับรอง" row made
 * of the crop, the cultivation type in Thai and the standard, as the register sends it, and no
 * retired issuer name. The holder row is pinned in verify-holder-row.test.tsx.
 */

import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/headers', () => ({
    headers: async () => ({
        get: (name: string) => (name === 'x-forwarded-host' ? 'staging.gacpth.com' : name === 'x-forwarded-proto' ? 'https' : null),
    }),
}));

import PublicCertVerifyPage from '../page';
import PublicCertRevisionPage from '../revision/[n]/page';

const IN_FORCE = {
    farmName: 'ไร่ทดสอบสาธิต',
    holderDisplayName: 'บริษัท สมุนไพรทดสอบ จำกัด',
    province: 'เชียงใหม่',
    issueDate: '2026-09-09T03:00:00.000Z',
    expiryDate: '2027-09-09T03:00:00.000Z',
    scope: {
        crop: 'กัญชา',
        cultivationTypes: [{ code: 'INDOOR', labelTh: 'ปลูกในอาคาร' }],
        standard: 'GACP Thailand',
    },
    issuingAuthority: 'ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ',
};

function answer(body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch;
}

async function resultPage(certificate: Record<string, unknown>) {
    answer({ success: true, verified: true, valid: true, data: { status: 'active', certificate, verifiedAt: '2026-10-09T00:00:00.000Z' } });
    const element = await PublicCertVerifyPage({ params: Promise.resolve({ 'cert-number': 'TH-GACP-3-2569' }) });
    const div = document.createElement('div');
    div.innerHTML = renderToStaticMarkup(element);
    return div;
}

/** The value shown beside a row label, or null when the page draws no such row. */
function row(page: HTMLElement, label: string): string | null {
    const term = Array.from(page.querySelectorAll('dt')).find((dt) => dt.textContent === label);
    return term?.nextElementSibling?.textContent ?? null;
}

afterEach(() => jest.clearAllMocks());

describe('the scope line', () => {
    it.each([
        ['OUTDOOR', 'ปลูกกลางแจ้ง'],
        ['GREENHOUSE', 'ปลูกในโรงเรือน'],
        ['INDOOR', 'ปลูกในอาคาร'],
    ])('%s reads "กัญชา · %s · GACP Thailand" under ขอบเขตการรับรอง', async (code, labelTh) => {
        const page = await resultPage({ ...IN_FORCE, scope: { ...IN_FORCE.scope, cultivationTypes: [{ code, labelTh }] } });
        expect(row(page, 'ขอบเขตการรับรอง')).toBe(`กัญชา · ${labelTh} · GACP Thailand`);
    });

    it('replaces the separate crop and standard rows', async () => {
        const page = await resultPage(IN_FORCE);
        expect(row(page, 'พืชที่ได้รับรอง')).toBeNull();
        expect(row(page, 'มาตรฐานที่รับรอง')).toBeNull();
    });

    it('a certificate with no recorded cultivation type shows what it records: crop and standard', async () => {
        const page = await resultPage({ ...IN_FORCE, scope: { ...IN_FORCE.scope, cultivationTypes: [] } });
        expect(row(page, 'ขอบเขตการรับรอง')).toBe('กัญชา · GACP Thailand');
    });
});

describe('no retired issuer name on the public verify pages', () => {
    it('the revision page footer is gone; the future-tense issuer sentence stays', async () => {
        answer({
            success: true,
            data: {
                certificateNumber: 'TH-GACP 3/2569', revisionNo: 1, superseded: true, supersededAt: '2026-09-20T00:00:00.000Z',
                certificateStatus: 'active', integrity: 'VALID', signatureValid: true,
                snapshot: { province: 'เชียงใหม่', district: 'แม่ริม', subDistrict: 'ริมใต้', farmName: 'ไร่ทดสอบสาธิต' },
            },
        });
        const element = await PublicCertRevisionPage({ params: Promise.resolve({ 'cert-number': 'TH-GACP-3-2569', n: '1' }) });
        const html = renderToStaticMarkup(element);
        expect(html).not.toContain('ระบบรับรองมาตรฐาน GACP สมุนไพร');
        expect(html).toContain('ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก');
    });
});
