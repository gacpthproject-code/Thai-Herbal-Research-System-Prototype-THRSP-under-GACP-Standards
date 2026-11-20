/**
 * `/` is the landing page again (operator 2026-10-06: "กู้หน้าแรกเดิมกลับมา แล้วพัฒนาให้ตรงกับ
 * ความจริงปัจจุบันนี้"). Login stays at /auth; the landing only points there.
 *
 * The landing deleted on 2026-08-14 claimed a 3-year certificate, ISO 17065, a 60-90 day
 * turnaround, a free service, department endorsement and printed fee amounts from web
 * constants. Each case below pins one of those facts to its current truth.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import LandingPage from '../page';
import { FALLBACK_PLANTS } from '@/app/health/applications/new/_steps/steps/plant-selection-config';
import { AREA_TYPE_OPTIONS } from '@/app/health/applications/new/_steps/steps/step3-site-land-config';
import { CERTIFICATION_PURPOSES } from '@/lib/certification-purposes';
import { VALIDITY_UNAVAILABLE_TH } from '@/lib/certificate-validity/certificate-validity';
import { PROJECT_STATUS } from '@/lib/project-info';
import { th } from '@/lib/i18n/dictionaries/th';

/** GET /api/certificate-validity as the backend serves it: a term no constant ever held. */
const fetchMock = jest.fn<(input: unknown, init?: unknown) => Promise<unknown>>();
const serveValidity = (months: number) => fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { months, effectiveFrom: '2027-01-01T00:00:00.000Z' } }),
});
beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    serveValidity(12);
});

async function renderLanding() {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(await LandingPage());
    const text = (container.textContent || '').replace(/\s+/g, ' ');
    return { container, text };
}

function linkNamed(root: ParentNode, name: string): HTMLAnchorElement | undefined {
    return Array.from(root.querySelectorAll('a')).find((a) => (a.textContent || '').trim() === name);
}

describe('/ landing page', () => {
    it('has exactly one h1', async () => {
        const { container } = await renderLanding();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
    });

    it('sends sign-in and sign-up to /auth, certificate checks to /verify, prices to /pricing', async () => {
        const { container } = await renderLanding();
        const hero = container.querySelector('h1')?.closest('section');
        expect(hero).toBeTruthy();
        expect(linkNamed(hero!, 'เข้าสู่ระบบ / สมัคร')?.getAttribute('href')).toBe('/auth');
        expect(linkNamed(hero!, 'ตรวจสอบใบรับรอง')?.getAttribute('href')).toBe('/verify');
        expect(linkNamed(hero!, 'ค่าบริการ')?.getAttribute('href')).toBe('/pricing');
    });

    it('never links to the temporary password sign-up', async () => {
        const { container } = await renderLanding();
        expect(container.querySelector('a[href="/register"]')).toBeNull();
    });

    it('prints no money amount; prices live on /pricing, served by the backend', async () => {
        const { text } = await renderLanding();
        expect(text).not.toMatch(/฿/);
        expect(text).not.toMatch(/\d[\d,.]*\s*บาท/);
    });

    it('names no payment provider and no medical purpose', async () => {
        const { text } = await renderLanding();
        expect(text).not.toMatch(/stripe/i);
        expect(text.split(th.common.ministryName).join('')).not.toContain('การแพทย์');
    });

    it('carries no emoji', async () => {
        const { text } = await renderLanding();
        expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('makes none of the retired claims', async () => {
        const { text } = await renderLanding();
        for (const retired of ['17065', 'ISO', '60–90', '60-90', '3 ปี', 'ใช้งานฟรี', 'รับรองโดย', 'เว็บไซต์ของรัฐบาล', 'ใช้งานจริง', 'ค่าธรรมเนียม']) {
            expect(`${retired}:${text.includes(retired)}`).toBe(`${retired}:false`);
        }
    });

    it('says the platform is not live yet', async () => {
        const { text } = await renderLanding();
        expect(text).toContain(PROJECT_STATUS);
    });

    it('states the certificate term the backend serves', async () => {
        const { text } = await renderLanding();
        expect(text).toContain('ใบรับรองมีอายุ 1 ปี นับจากวันที่ออก');
        serveValidity(24);
        expect((await renderLanding()).text).toContain('ใบรับรองมีอายุ 2 ปี นับจากวันที่ออก');
        serveValidity(18);
        expect((await renderLanding()).text).toContain('ใบรับรองมีอายุ 18 เดือน นับจากวันที่ออก');
    });

    it('names no term when the backend cannot say one', async () => {
        fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
        const { text } = await renderLanding();
        expect(text).not.toMatch(/มีอายุ\s*\d/);
        expect(text).toContain(VALIDITY_UNAVAILABLE_TH);
    });

    it('lists every herb the wizard offers, every licensed purpose and every area type', async () => {
        const { text } = await renderLanding();
        for (const plant of FALLBACK_PLANTS.filter((p) => p.enabled)) {
            expect(text).toContain(plant.nameTH);
        }
        for (const purpose of CERTIFICATION_PURPOSES) {
            expect(text).toContain(purpose.label);
        }
        for (const area of AREA_TYPE_OPTIONS) {
            expect(text).toContain(area.labelTH);
        }
    });

    it('does not present ThaiD or หมอพร้อม as working today, and never advertises password sign-in', async () => {
        const { text } = await renderLanding();
        expect(text).toContain('เมื่อเปิดให้บริการ ยืนยันตัวตนด้วย ThaiD หรือหมอพร้อม');
        expect(text).not.toMatch(/รหัสผ่าน/);
    });

    it('says the approver decides before a certificate is issued, never that it is instant', async () => {
        const { text } = await renderLanding();
        expect(text).not.toContain('ได้ใบรับรองทันที');
        expect(text).toContain('แบบที่ได้รับอนุมัติแล้วออกใบรับรองได้');
    });

    it('says instalment 2 is paid before the inspection is scheduled (shared/phase2-schedule-gate.js)', async () => {
        const { text } = await renderLanding();
        expect(text).toContain('เมื่อชำระงวดที่ 2 แล้ว เจ้าหน้าที่จึงนัดวันตรวจ');
        expect(text).not.toContain('ก่อนวันนัด');
    });
});
