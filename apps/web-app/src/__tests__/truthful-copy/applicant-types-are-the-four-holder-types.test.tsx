/**
 * The public FAQ names every holder type the system issues to, and no other.
 *
 * Order 134 task 2 made four holder types (บุคคลธรรมดา บริษัท ห้างหุ้นส่วน วิสาหกิจชุมชน),
 * declared once in lib/holder/holder-registry.ts. Before this suite the landing page FAQ
 * listed three (no ห้างหุ้นส่วน) and the help-centre FAQ listed สหกรณ์, which no holder
 * record can be. A contract video quotes these answers, so they must be the registry's.
 */

import type * as React from 'react';
import { afterEach, describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import LandingPage from '@/app/(marketing)/page';
import { buildFaqTopics } from '@/components/help/faq-data';
import { HOLDER_TYPES } from '@/lib/holder/holder-registry';

const HOLDER_TYPE_LABELS = Object.values(HOLDER_TYPES).map((t) => t.labelTh);
const NOT_A_HOLDER_TYPE = ['สหกรณ์', 'บริษัทจำกัด'];

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

function textOf(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\s+/g, ' ');
}

async function landingFaqAnswer(): Promise<string> {
    globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const text = textOf(renderToStaticMarkup(await (LandingPage as unknown as () => Promise<React.ReactElement>)()));
    const start = text.indexOf('ใครยื่นคำขอได้บ้าง');
    const end = text.indexOf('ปลูกหลายแบบในฟาร์มเดียว', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return text.slice(start, end);
}

function helpFaqAnswer(): string {
    const items = buildFaqTopics({ status: 'unavailable' }, { status: 'unavailable' }).flatMap((t) => t.items);
    const item = items.find((i) => i.id === 'app-entity');
    expect(item).toBeDefined();
    return item!.answer;
}

describe('the FAQ answer "who may apply" is the holder registry', () => {
    it('declares four holder types, partnership among them', () => {
        expect(HOLDER_TYPE_LABELS).toHaveLength(4);
        expect(HOLDER_TYPE_LABELS).toContain('ห้างหุ้นส่วน');
    });

    it('the landing page names every holder type and nothing else', async () => {
        const answer = await landingFaqAnswer();
        for (const label of HOLDER_TYPE_LABELS) { expect(answer).toContain(label); }
        for (const word of NOT_A_HOLDER_TYPE) { expect(answer).not.toContain(word); }
    });

    it('the help centre names every holder type and nothing else', () => {
        const answer = helpFaqAnswer();
        for (const label of HOLDER_TYPE_LABELS) { expect(answer).toContain(label); }
        for (const word of NOT_A_HOLDER_TYPE) { expect(answer).not.toContain(word); }
    });
});
