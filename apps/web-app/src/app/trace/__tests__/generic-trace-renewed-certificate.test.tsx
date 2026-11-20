import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, jest } from '@jest/globals';
import type { TraceData } from '../[qr-code]/trace-page-types';

jest.mock('next/navigation', () => ({
    useParams: () => ({ 'qr-code': 'qr-lot-1' }),
}));

import TracePage from '../[qr-code]/client-view';

const RENEWED: TraceData = {
    type: 'LOT',
    data: {
        farm: { name: 'ไร่ทดสอบสาธิต', location: 'แม่ริม, เชียงใหม่' },
        plant: { nameTH: 'กัญชา' },
        certificate: {
            number: 'TH-GACP 3/2569',
            isValid: false,
            renewal: { successorCertificateNumber: 'TH-GACP 9/2569', verifyUrl: 'https://example.test/verify/TH-GACP-9-2569' },
        },
        verification: { valid: true, scannedAt: '2026-10-21T00:00:00.000Z' },
    },
};

function render(data: TraceData): HTMLDivElement {
    const div = document.createElement('div');
    div.innerHTML = renderToStaticMarkup(<TracePage initialData={data} />);
    return div;
}

describe('order 119: generic scan page, goods made under a certificate renewed since', () => {
    it('says a newer certificate replaced it and links the new one, never "not certified"', () => {
        const el = render(RENEWED);
        const text = (el.textContent || '').replace(/\s+/g, ' ');
        expect(text).toContain('ไร่ทดสอบสาธิต');
        expect(text).toContain('มีฉบับใหม่แทนแล้ว');
        expect(text).not.toMatch(/ยังไม่ได้รับการรับรอง|ยังไม่ได้รับรอง GACP|ไม่พบใบรับรอง GACP ที่ใช้งานได้|ยังไม่มีใบรับรอง GACP|ไม่มีผลแล้ว/);
        const current = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('TH-GACP 9/2569'));
        expect(current?.textContent).toContain('ตรวจสอบฉบับปัจจุบัน');
        expect(current?.getAttribute('href')).toBe('/verify/TH-GACP-9-2569');
    });
});

const LAPSED: TraceData = {
    ...RENEWED,
    data: {
        ...RENEWED.data,
        certificate: {
            number: 'TH-GACP 3/2569',
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
    },
};

const OUTSIDE: TraceData = {
    ...RENEWED,
    data: { ...RENEWED.data, certificate: { number: 'TH-GACP 9/2569', isValid: false, producedInForce: false, renewal: null } },
};

const CERTIFIED: TraceData = {
    ...RENEWED,
    data: { ...RENEWED.data, certificate: { number: 'TH-GACP 9/2569', isValid: true, producedInForce: true, renewal: null } },
};

const passShield = (el: HTMLElement) => el.querySelector('.tabler-icon-shield-check');

describe('order 126 on the generic scan page', () => {
    it('expired first, renewed later: produced while the old certificate was in force, then when it expired and from when the new one holds', () => {
        const text = (render(LAPSED).textContent || '').replace(/\s+/g, ' ');
        expect(text).toContain('ผลิตในช่วงที่ใบรับรองฉบับเดิมยังมีผล');
        expect(text).toContain('หมดอายุเมื่อ 01 ก.ย. 2569 · มีใบรับรองฉบับใหม่ TH-GACP 9/2569 มีผลตั้งแต่ 21 ต.ค. 2569');
        expect(text).not.toContain('มีฉบับใหม่แทนแล้ว');
    });

    it('a lot harvested on a day its certificate was not in force is not certified', () => {
        const text = (render(OUTSIDE).textContent || '').replace(/\s+/g, ' ');
        expect(text).toContain('ยังไม่ได้รับการรับรอง GACP');
        expect(text).toContain('เก็บเกี่ยวในวันที่ใบรับรองไม่มีผล');
        expect(text).not.toContain('ผ่านการรับรองมาตรฐาน GACP');
    });

    it('the header shows the pass shield for a certified lot only, never for a renewed or lapsed certificate (LOW-B)', () => {
        expect(passShield(render(CERTIFIED))).not.toBeNull();
        expect(passShield(render(RENEWED))).toBeNull();
        expect(passShield(render(LAPSED))).toBeNull();
    });
});
