/**
 * BUG C (PDPA): the workspace members list never shows a co-member's full
 * 13-digit national ID.
 *
 * The server masks it before sending (entity-service.listMembersForEntity →
 * maskThaiId, e.g. 8-XXXX-XXXX-X-4072, the format the operator approved on
 * 2026-10-06), so the 13 digits never reach the browser; that is pinned on the
 * real door in apps/backend/__tests__/integration/holder-scope-real-postgres.test.js.
 * The page's maskHealthIdCard call is a second layer: it leaves an already
 * masked value unchanged and only matters if a full ID ever arrived.
 *
 * Convention: repo fs source-scan pin (no @testing-library/react; the page
 * fetches in a useEffect) + a pure-logic assertion on the mask helper.
 */

import fs from 'fs';
import path from 'path';
import { maskHealthIdCard } from '@/utils/validation';

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');

describe('BUG C — member national ID is masked in the members list', () => {
  it('maskHealthIdCard hides the last 3 digits of a 13-digit id', () => {
    // e.g. 1101700230711 → 1-1017-00230-**-* (birth-order + check digit hidden)
    const masked = maskHealthIdCard('1101700230711');
    expect(masked).toBe('1-1017-00230-**-*');
    // the full plaintext must NOT survive the mask
    expect(masked).not.toContain('230711');
    expect(masked).not.toBe('1101700230711');
  });

  it('the members page masks healthId (uses maskHealthIdCard, not the raw value)', () => {
    expect(PAGE).toMatch(/maskHealthIdCard\s*\(\s*m\.healthId\s*\)/);
    expect(PAGE).toMatch(/from ['"]@\/utils\/validation['"]/);
  });

  it('the members page does NOT render the raw {m.healthId} in the row copy', () => {
    // the pre-fix bug: `เลขบัตร: <span ...>{m.healthId}</span>`
    expect(PAGE).not.toMatch(/\{\s*m\.healthId\s*\}/);
  });
});
