import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from '@jest/globals';

const SRC = path.join(__dirname, '..', '..');
const CARD_PAYMENT = /บัตรเครดิต|บัตรเดบิต|credit card|debit card|PCI-DSS/i;

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return ['__tests__', '__fixtures__', 'node_modules'].includes(entry.name) ? [] : sourceFiles(full);
        }
        return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
}

describe('no copy offers card payment (order 21)', () => {
    it('no source file under src/ mentions credit or debit cards or PCI-DSS', () => {
        const hits = sourceFiles(SRC).flatMap((file) =>
            fs
                .readFileSync(file, 'utf8')
                .split('\n')
                .flatMap((line, index) =>
                    CARD_PAYMENT.test(line) ? [`${path.relative(SRC, file)}:${index + 1}: ${line.trim().slice(0, 80)}`] : [],
                ),
        );
        expect(hits).toEqual([]);
    });
});
