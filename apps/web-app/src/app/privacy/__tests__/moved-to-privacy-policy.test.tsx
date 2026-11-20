import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { permanentRedirect } from 'next/navigation';

jest.mock('next/navigation', () => ({ ...(jest.requireActual('next/navigation') as Record<string, unknown>) }));

import PrivacyPage from '../page';
import HealthPrivacyPage from '../../auth/health/privacy/page';

const WEB_SRC = resolve(__dirname, '../../..');
const MOBILE_LIB = resolve(__dirname, '../../../../../mobile-app/lib');
const RETIRED_CONTACT_SENTENCE = 'หน่วยงานเจ้าของระบบผ่านช่องทางราชการที่ประกาศ';
const LINK_TO_OLD_ADDRESS = /(?:["'`]|https?:\/\/[^\s"'`/]+)\/privacy(?:[?#][^"'`]*)?["'`]/;

function redirectOf(render: () => unknown): string {
  try {
    render();
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === 'string') return digest;
    throw err;
  }
  return 'rendered a page instead of redirecting';
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules') return [];
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? sourceFiles(full) : [full];
  });
}

function filesContaining(test: (text: string) => boolean): string[] {
  return [...sourceFiles(WEB_SRC), ...sourceFiles(MOBILE_LIB)]
    .filter((file) => file !== __filename && test(readFileSync(file, 'utf8')))
    .map((file) => relative(resolve(WEB_SRC, '../..'), file));
}

describe('/privacy is the old address of /privacy-policy, not a second policy (order 12)', () => {
  const movedForGood = redirectOf(() => permanentRedirect('/privacy-policy'));

  it('answers /privacy with a permanent redirect to /privacy-policy', () => {
    expect(redirectOf(PrivacyPage)).toBe(movedForGood);
  });

  it('answers /auth/health/privacy with the same redirect', () => {
    expect(redirectOf(HealthPrivacyPage)).toBe(movedForGood);
  });

  it('keeps the retired contact sentence out of every web and mobile source file (it contradicts §11 of v1.4)', () => {
    expect(filesContaining((text) => text.includes(RETIRED_CONTACT_SENTENCE))).toEqual([]);
  });

  it('links nothing to /privacy: every link goes straight to /privacy-policy', () => {
    expect(filesContaining((text) => LINK_TO_OLD_ADDRESS.test(text))).toEqual([]);
  });
});
