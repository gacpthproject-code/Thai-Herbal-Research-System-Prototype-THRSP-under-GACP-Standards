/**
 * No English word or internal work code on the Thai screens of the dispatcher's tools (order 51,
 * operator 2026-10-09): the calendar's heading kicker and the staff notification-preference groups.
 * The texts are constants in these files, so the file is what the screen shows.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';

const SRC = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('the dispatcher\'s screens speak Thai', () => {
    it('the calendar kicker is Thai', () => {
        expect(read('app/provider/calendar/client-view.tsx')).not.toMatch(/eyebrow="[A-Z ]+"/);
    });

    it('the staff notification groups name no English term or design record', () => {
        const source = read('components/feature/notification-preferences.tsx');
        expect(source).not.toContain('Work Queue');
        expect(source).not.toContain('ADR-016');
        expect(source).not.toMatch(/title: '[^']*workflow[^']*'/);
    });
});
