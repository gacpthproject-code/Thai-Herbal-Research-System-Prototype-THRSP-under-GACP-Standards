/**
 * The lot page a buyer's QR lands on speaks the same plain language as /verify
 * (operator order 37, 2026-10-07): no emoji, no English pairs, no internal
 * workflow status, Thai units, and a link to the certificate's own status. A
 * lot whose certificate is no longer in force (the 410 gate) says so with the
 * status word instead of "not found".
 */

import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), forward: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/trace/lot/LOT-2569-000019-A',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({ 'lot-id': 'LOT-2569-000019-A' }),
}));

const mockFetchTrace = jest.fn<() => Promise<unknown>>();
jest.mock('../trace-fetch', () => ({
    fetchTraceEnvelope: () => mockFetchTrace(),
}));

import ClientView from '../lot/[lot-id]/client-view';

const LOT = {
    lotId: 'lot-1',
    lotNumber: 'LOT-2569-000019-A',
    batchId: 'batch-1',
    batchNumber: 'HB-2569-000019',
    status: 'Raw Material (GACP)',
    farm: { name: 'ฟาร์มทดสอบ', district: 'เมือง', province: 'เชียงใหม่' },
    harvestDate: '2026-08-01',
    harvestDateTH: '1 ส.ค. 2569',
    packaging: { type: 'BAG_1KG', unitWeight: 1, unitCount: 10, totalWeight: 10 },
    qrUrl: '/trace/lot/LOT-2569-000019-A',
    plant: { code: 'CANNABIS', nameTH: 'กัญชา', nameEN: 'Cannabis', scientificName: 'Cannabis sativa L.' },
    certificate: {
        reference: 'TH-GACP 1/2569',
        issuedDate: '2026-01-01',
        issuedDateTH: '1 ม.ค. 2569',
        expiryDate: '2027-01-01',
        expiryDateTH: '1 ม.ค. 2570',
        isValid: true,
        scope: { crop: 'กัญชา', cultivationTypes: [{ code: 'OUTDOOR', labelTh: 'ปลูกกลางแจ้ง' }], standard: 'GACP Thailand' },
        issuingAuthority: 'ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ',
    },
    links: { requiresAuthentication: true },
    traceabilityScope: 'RAW_MATERIAL_GACP',
};

const EMOJI = /\p{Extended_Pictographic}/u;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    mockFetchTrace.mockReset();
});

async function mount(outcome: unknown): Promise<HTMLDivElement> {
    mockFetchTrace.mockResolvedValue(outcome);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
        root = createRoot(container!);
        root.render(<ClientView />);
    });
    for (let i = 0; i < 20; i++) {
        await act(async () => { await Promise.resolve(); });
    }
    return container;
}

describe('lot scan page in plain words', () => {
    it('no emoji, no internal lot status, Thai units and package names', async () => {
        const el = await mount({ kind: 'ok', payload: { success: true, data: LOT } });
        const text = el.textContent ?? '';
        expect(text).toContain('LOT-2569-000019-A');
        expect(text).not.toMatch(EMOJI);
        expect(text).not.toContain('Raw Material');
        expect(text).not.toContain('วัตถุดิบ (GACP)');
        expect(text).not.toMatch(/\bkg\b/);
        expect(text).toContain('กก.');
        expect(text).toContain('ถุง 1 กก.');
        expect(text).not.toContain('BAG_1KG');
        expect(text).not.toContain('COA');
    });

    it('links to the certificate status on /verify, not back to its own QR page', async () => {
        const el = await mount({ kind: 'ok', payload: { success: true, data: LOT } });
        const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('ตรวจสอบสถานะใบรับรองนี้'));
        expect(link?.getAttribute('href')).toBe('/verify/TH-GACP-1-2569');
        expect(el.textContent).not.toContain('ดูหน้า QR สาธารณะ');
    });

    it('not found is Thai only, with what to do next', async () => {
        const el = await mount({ kind: 'not-found', message: null });
        const text = el.textContent ?? '';
        expect(text).toContain('ไม่พบข้อมูลสินค้า');
        expect(text).toContain('สอบถามผู้ขาย');
        expect(text).not.toMatch(/not found|Back to Home/i);
    });

    it.each([
        ['certificate_expired', 'หมดอายุ'],
        ['certificate_suspended', 'ถูกพักใช้'],
        ['certificate_revoked', 'ถูกเพิกถอน'],
    ])('a 410 gate with %s says the certificate is no longer in force: "%s"', async (reason, word) => {
        const el = await mount({
            kind: 'not-found',
            message: 'ใบรับรองไม่อยู่ในสถานะใช้งาน / Certificate is not active',
            lapsedCertificate: { reference: 'TH-GACP 3/2569', reason },
        });
        const text = el.textContent ?? '';
        expect(text).toContain('ใบรับรองของแหล่งปลูกนี้ไม่มีผลแล้ว');
        expect(text).toContain(`สถานะใบรับรอง: ${word}`);
        expect(text).not.toContain('ไม่พบข้อมูลสินค้า');
        expect(text).not.toContain('Certificate is not active');
        const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('TH-GACP 3/2569'));
        expect(link?.getAttribute('href')).toBe('/verify/TH-GACP-3-2569');
    });
});

describe('order 119: a lot made under a certificate that has since been renewed', () => {
    const RENEWED_LOT = {
        ...LOT,
        certificate: {
            ...LOT.certificate,
            reference: 'TH-GACP 3/2569',
            isValid: false,
            renewal: { successorCertificateNumber: 'TH-GACP 9/2569', verifyUrl: 'https://example.test/verify/TH-GACP-9-2569' },
        },
    };

    it('shows the provenance as normal, says a newer certificate replaced it, and links the new one', async () => {
        const el = await mount({ kind: 'ok', payload: { success: true, data: RENEWED_LOT } });
        const text = el.textContent ?? '';
        expect(text).toContain('ฟาร์มทดสอบ');
        expect(text).toContain('1 ส.ค. 2569');
        expect(text).toContain('เลขที่ใบรับรอง: TH-GACP 3/2569');
        expect(text).toContain('มีฉบับใหม่แทนแล้ว');
        expect(text).not.toMatch(/ไม่มีผลแล้ว|หมดอายุหรือไม่มีผล|ถูกเพิกถอน|ใช้งานได้ ยังไม่หมดอายุ/);
        const current = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('TH-GACP 9/2569'));
        expect(current?.textContent).toContain('ตรวจสอบฉบับปัจจุบัน');
        expect(current?.getAttribute('href')).toBe('/verify/TH-GACP-9-2569');
    });
});

describe('order 126 on the lot scan page', () => {
    it('a lot under a certificate that expired before its renewal: produced while it was in force, then the dates and the new number', async () => {
        const el = await mount({ kind: 'ok', payload: { success: true, data: {
            ...LOT,
            certificate: {
                ...LOT.certificate,
                reference: 'TH-GACP 3/2569',
                isValid: false,
                producedInForce: true,
                renewal: {
                    successorCertificateNumber: 'TH-GACP 9/2569',
                    verifyUrl: 'https://example.test/verify/TH-GACP-9-2569',
                    successorIssuedDate: '2026-10-21T03:00:00.000Z',
                    lapsedBeforeRenewal: true,
                    expiredOn: '2026-09-01T03:00:00.000Z',
                },
            },
        } } });
        const text = el.textContent ?? '';
        expect(text).toContain('ล็อตนี้ผลิตในช่วงที่ใบรับรองฉบับนี้ยังมีผล หมดอายุเมื่อ 01 ก.ย. 2569 · มีใบรับรองฉบับใหม่ TH-GACP 9/2569 มีผลตั้งแต่ 21 ต.ค. 2569');
        const current = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('TH-GACP 9/2569'));
        expect(current?.getAttribute('href')).toBe('/verify/TH-GACP-9-2569');
        expect(el.querySelector('.lucide-shield-check')).toBeNull();
    });

    it('the pass shield stays for a certified lot', async () => {
        const el = await mount({ kind: 'ok', payload: { success: true, data: LOT } });
        expect(el.querySelector('.lucide-shield-check')).not.toBeNull();
    });

    it('a lot harvested on a day its certificate was not in force says it is not certified', async () => {
        const el = await mount({ kind: 'ok', payload: { success: true, data: {
            ...LOT,
            certificate: { ...LOT.certificate, isValid: false, producedInForce: false, renewal: null },
        } } });
        const text = el.textContent ?? '';
        expect(text).toContain('เก็บเกี่ยวนอกช่วงที่ใบรับรองมีผล');
        expect(text).not.toContain('ใช้งานได้ ยังไม่หมดอายุ');
        expect(text).not.toContain('ขอบเขตการรับรอง');
        expect(el.querySelector('.lucide-shield-check')).toBeNull();
    });
});

describe('order 68(1) on the lot scan page', () => {
    it('a lot under a certificate in force shows the same scope line as /verify, and the issuer sentence', async () => {
        const el = await mount({ kind: 'ok', payload: { success: true, data: LOT } });
        const text = el.textContent ?? '';
        expect(text).toContain('ขอบเขตการรับรอง: กัญชา · ปลูกกลางแจ้ง · GACP Thailand');
        expect(text).toContain('ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ');
    });

    it.each(['certificate_suspended', 'certificate_revoked', 'certificate_expired'])(
        'a 410 gate (%s) shows no scope that implies the certificate is valid',
        async (reason) => {
            const el = await mount({
                kind: 'not-found',
                message: 'ใบรับรองไม่อยู่ในสถานะใช้งาน / Certificate is not active',
                lapsedCertificate: { reference: 'TH-GACP 5/2569', reason },
            });
            const text = el.textContent ?? '';
            expect(text).not.toContain('ขอบเขตการรับรอง');
            expect(text).not.toMatch(/ปลูกกลางแจ้ง|ปลูกในโรงเรือน|ปลูกในอาคาร/);
        },
    );
});
