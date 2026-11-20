/**
 * The analytics page carries no emoji: a government platform labels with words (operator rule,
 * no-emoji-in-design-deliverables). Its metric strip once held four emoji icons that the summary
 * header never even drew.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/u;

describe('analytics page', () => {
    it('has no emoji anywhere in its source', () => {
        const source = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8');
        const withEmoji = source.split('\n')
            .map((line, i) => `${i + 1}: ${line.trim()}`)
            .filter((line) => EMOJI.test(line));
        expect(withEmoji).toEqual([]);
    });
});
