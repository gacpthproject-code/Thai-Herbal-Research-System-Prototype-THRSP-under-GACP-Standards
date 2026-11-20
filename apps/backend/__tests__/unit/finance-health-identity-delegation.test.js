/**
 * [Sprint6] Finance health-identity guard (H8, H10)
 *
 * Sprint 6 healthId-audit:
 *   - H8: finance routes resolve the applicant through canonical applicationService.resolveHealthIdentity
 *   - H10: payments.js uses real authenticateHealth, not aliased authenticateAny
 */

const fs = require('fs');
const path = require('path');

describe('[Sprint6] Finance health-identity guard', () => {
    it('static regression: routes/api/finance/payments.js imports real `authenticateHealth` (H10)', () => {
        const filePath = path.join(__dirname, '..', '..', 'routes', 'api', 'finance', 'payments.js');
        const raw = fs.readFileSync(filePath, 'utf8');
        // Strip block comments AND line comments so the alias mention in our explanatory
        // banner doesn't trip the regression check.
        const stripped = raw
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        // The Sprint 6 H10 fix removed the alias from the import statement. Stripped
        // source must NOT contain the legacy aliased import.
        expect(stripped).not.toMatch(/authenticateAny:\s*authenticateHealth/);
        // It must import the real `authenticateHealth`.
        expect(stripped).toMatch(/\{[^}]*authenticateHealth[^}]*\}\s*=\s*require\([^)]*auth-middleware/);
    });

    it('static regression: routes/api/finance/payments.js delegates to canonical resolveHealthIdentity (H8)', () => {
        const filePath = path.join(__dirname, '..', '..', 'routes', 'api', 'finance', 'payments.js');
        const src = fs.readFileSync(filePath, 'utf8');
        expect(src).toMatch(/applicationService\.resolveHealthIdentity/);
    });

    it('static regression: routes/api/finance/invoice-helpers.js delegates to canonical resolveHealthIdentity (H8)', () => {
        const filePath = path.join(__dirname, '..', '..', 'routes', 'api', 'finance', 'invoice-helpers.js');
        const src = fs.readFileSync(filePath, 'utf8');
        expect(src).toMatch(/applicationService\.resolveHealthIdentity/);
    });
});
