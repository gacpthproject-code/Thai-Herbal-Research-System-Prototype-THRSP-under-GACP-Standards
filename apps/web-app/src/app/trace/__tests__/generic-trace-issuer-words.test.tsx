/**
 * The generic trace page (/trace/<qr>) is a public scan surface. It names no retired issuer
 * ("ระบบรับรองมาตรฐาน GACP สมุนไพร") and never says in the present tense that the department
 * certifies or signs (operator order 56(0)); it states the issuer with the approved
 * future-tense sentence, as /verify does.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, jest } from '@jest/globals';
import { CERTIFICATE_ISSUER_TH } from '@/constants/service-facts';
import type { TraceData } from '../[qr-code]/trace-page-types';

jest.mock('next/navigation', () => ({
    useParams: () => ({ 'qr-code': 'HB-2569-000001' }),
}));

import TracePage from '../[qr-code]/client-view';

const CERTIFIED: TraceData = {
    type: 'HARVEST_BATCH',
    data: {
        farm: { name: 'ไร่ทดสอบสาธิต', location: 'แม่ริม, เชียงใหม่' },
        plant: { nameTH: 'กัญชา' },
        certificate: { number: 'TH-GACP 1/2569', isValid: true },
        verification: { valid: true, scannedAt: '2026-10-09T00:00:00.000Z' },
    },
};

function pageText(data: TraceData): string {
    const div = document.createElement('div');
    div.innerHTML = renderToStaticMarkup(<TracePage initialData={data} />);
    return (div.textContent || '').replace(/\s+/g, ' ');
}

describe('issuer words on the generic trace page', () => {
    it.each([
        ['a certified scan with a sealed QR', CERTIFIED],
        ['a certified scan without a seal verdict', { ...CERTIFIED, data: { ...CERTIFIED.data, verification: { valid: null, scannedAt: '2026-10-09T00:00:00.000Z' } } }],
    ])('%s: no retired issuer name, no present-tense department claim, the future-tense sentence', (_label, data) => {
        const text = pageText(data as TraceData);
        expect(text).not.toContain('ระบบรับรองมาตรฐาน GACP สมุนไพร');
        expect(text).not.toMatch(/โดย DTAM/);
        expect(text).toContain(CERTIFICATE_ISSUER_TH);
    });
});
