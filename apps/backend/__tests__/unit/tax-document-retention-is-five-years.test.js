/**
 * Tax documents are kept five years, ป.รัษฎากร ม.87/3 (operator orders 64 ค9, 85(2) and 96(1)).
 * Privacy notice v1.4 §7 item 2 says "ไม่น้อยกว่า 5 ปี", and the payer name a receipt prints is
 * kept exactly that long (services/account-anonymization.js; the real-Postgres pin proves the
 * number). This pin keeps every other sentence in the code base from telling a person seven.
 *
 * Scope: every non-test source file of the backend and the web app that cites ม.87/3. One file is
 * left out: the public privacy-policy page, which fix/privacy-notice-v13 rewrites (its §7 item 2
 * already reads "ไม่น้อยกว่า 5 ปี"); edited here too, the two branches would conflict on it.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const ROOTS = [path.join(REPO, 'apps', 'backend'), path.join(REPO, 'apps', 'web-app', 'src')];
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'coverage', '.next', 'prisma']);
const LEFT_TO_PRIVACY_BRANCH = path.join(REPO, 'apps', 'web-app', 'src', 'app', '(marketing)', 'privacy-policy', 'page.tsx');
const SEVEN_YEARS = /(^|[^\d])7\s*(ปี|-?\s*years?\b)|seven[\s-]years?/i;

function sourceFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {continue;}
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {sourceFiles(full, out);} else if (/\.(js|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {out.push(full);}
    }
    return out;
}

describe('tax-document retention reads five years wherever ม.87/3 is cited', () => {
    const citing = ROOTS.flatMap((root) => sourceFiles(root))
        .filter((file) => file !== LEFT_TO_PRIVACY_BRANCH)
        .filter((file) => fs.readFileSync(file, 'utf8').includes('87/3'));

    test('the scan reaches the erasure notices, the erasure page and the anonymization rule', () => {
        const rel = citing.map((file) => path.relative(REPO, file));
        expect(rel).toEqual(expect.arrayContaining([
            'apps/backend/services/notification-fanout-service.js',
            'apps/backend/services/account-anonymization.js',
            'apps/web-app/src/app/health/account/erasure/steps/ReviewStep.tsx',
            'apps/web-app/src/app/health/account/erasure/steps/LegalFooter.tsx',
        ]));
    });

    test('no file citing ม.87/3 says seven years', () => {
        const sevens = citing.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
            .map((line, i) => (SEVEN_YEARS.test(line) ? `${path.relative(REPO, file)}:${i + 1} ${line.trim()}` : null))
            .filter(Boolean));
        expect(sevens).toEqual([]);
    });
});
