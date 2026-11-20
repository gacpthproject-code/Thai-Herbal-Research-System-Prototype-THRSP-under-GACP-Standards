/**
 * Who issues the certificate, as the public site may say it until the official
 * arrangement with the department is complete (operator order 56(0), 2026-10-09).
 *
 * The department's own GACP page says this site is not authorised by it. Until
 * the arrangement is complete, no public or pre-login surface says in the present
 * tense that the department issues the certificates. A surface that states the
 * issuer says CERTIFICATE_ISSUER_TH, the one sentence in constants/service-facts.ts.
 *
 * Not covered here: the certificate PDF, e-mails and notifications, and the
 * logged-in screens. The two verify pages print the constant under a found
 * certificate, so they follow it (platform-status-claims.test.tsx).
 */

import * as fs from 'fs';
import * as path from 'path';
import type * as React from 'react';
import { afterEach, describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import LandingPage from '@/app/(marketing)/page';
import PrivacyPolicyPage from '@/app/(marketing)/privacy-policy/page';
import TermsOfServicePage, { metadata as termsMetadata } from '@/app/(marketing)/terms-of-service/page';
import { Footer } from '@/components/layout/Footer';
import { buildOnboardingSteps, OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { CERTIFICATE_ISSUER_TH } from '@/constants/service-facts';
import { en } from '@/lib/i18n/dictionaries/en';

const ISSUER_SENTENCE =
    'ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ';

const SRC = path.join(__dirname, '..', '..');

const PRESENT_TENSE_ISSUER: ReadonlyArray<RegExp> = [
    /ใบรับรองออกโดย/,
    /หน่วยงานผู้ออกใบรับรอง/,
    /กรมฯ\s*ออกให้/,
    /Certificates? (?:are|is) issued by/i,
    /โดย DTAM/,
    /ผู้รับผิดชอบระบบรับรอง/,
    /ออกใบรับรองตามอำนาจหน้าที่/,
    /มีอำนาจหน้าที่[^'"`]*ออกใบรับรอง/,
];

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            sourceFiles(full, out);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function presentTenseIssuerLines(): string[] {
    const found: string[] = [];
    for (const file of sourceFiles(SRC)) {
        fs.readFileSync(file, 'utf8')
            .split('\n')
            .forEach((line, index) => {
                if (PRESENT_TENSE_ISSUER.some((pattern) => pattern.test(line))) {
                    found.push(`${path.relative(SRC, file)}:${index + 1}`);
                }
            });
    }
    return found;
}

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

function textOf(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\s+/g, ' ');
}

async function serverPageText(Page: () => Promise<React.ReactElement>): Promise<string> {
    globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    return textOf(renderToStaticMarkup(await Page()));
}

const SURFACES: ReadonlyArray<{ name: string; text: () => Promise<string> | string }> = [
    { name: 'landing page', text: () => serverPageText(LandingPage) },
    { name: 'terms of service', text: () => serverPageText(TermsOfServicePage) },
    { name: 'privacy notice', text: () => textOf(renderToStaticMarkup(<PrivacyPolicyPage />)) },
    {
        name: 'footer',
        text: () => textOf(renderToStaticMarkup(<Footer buildDate="2026-10-09" version="abc1234" />)),
    },
    {
        name: 'onboarding welcome step',
        text: () =>
            textOf(
                renderToStaticMarkup(
                    <OnboardingModal
                        initialStep={0}
                        persist={false}
                        steps={buildOnboardingSteps({ status: 'unavailable' }, { status: 'unavailable' })}
                    />,
                ),
            ),
    },
];

describe('the issuer sentence', () => {
    it('is the future-tense sentence the operator approved, word for word', () => {
        expect(CERTIFICATE_ISSUER_TH).toBe(ISSUER_SENTENCE);
    });

    it('is spelled in no present tense anywhere under src/', () => {
        expect(presentTenseIssuerLines()).toEqual([]);
    });
});

describe('every surface that states the issuer says the constant', () => {
    it.each(SURFACES)('$name', async ({ text }) => {
        expect(await text()).toContain(CERTIFICATE_ISSUER_TH);
    });

    it('the terms of service say it in the search description too', () => {
        expect(String(termsMetadata.description)).toContain(CERTIFICATE_ISSUER_TH);
    });

    it('the footer heading over the department block is not "ผู้ออกใบรับรอง"', () => {
        const container = document.createElement('div');
        container.innerHTML = renderToStaticMarkup(<Footer buildDate="2026-10-09" version="abc1234" />);
        const heading = container.querySelector('[aria-labelledby="footer-issuer"] h2');
        expect(heading?.textContent).toBeTruthy();
        expect(heading?.textContent).not.toContain('ผู้ออกใบรับรอง');
    });

    it('the English footer says certificates will be issued, never that they are, and has no Thai', () => {
        const footerEn = Object.values(en.footer)
            .filter((value): value is string => typeof value === 'string')
            .join('\n');
        expect(footerEn).toMatch(/Certificates will be issued by the \{ministry\} once the system officially opens/);
        expect(footerEn).not.toMatch(/(?:are|is) issued by/i);
        expect(footerEn).not.toMatch(/[฀-๿]/);
    });
});
