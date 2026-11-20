/**
 * F21 (live walk 2026-10-07) + D1 (approver/finance audit 2026-10-06): the batch-11 Quote
 * door let finance type its own prices, accept a quote for the applicant, mint an invoice
 * outside checkout and REWRITE the number of an issued invoice (ป.รัษฎากร ม.86/4). No page
 * called it; the applicant's real quotation is the Quotation on the checkout rail.
 * Pre-production: a superseded design leaves no trace (order 12). This pins that the module,
 * the doors, the orphan /api/accounting dashboard that counted Quote rows, and the schema
 * model are gone. The table drop is pinned on real Postgres in
 * __tests__/integration/legacy-quotes-table-dropped-real-postgres.test.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_' + 'x'.repeat(24);
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(24);

const BACKEND = path.resolve(__dirname, '../..');

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
mockLogger.createLogger = jest.fn(() => mockLogger);
mockLogger.stream = { write: jest.fn() };

describe('the legacy Quote modules are gone', () => {
    test.each([
        'routes/api/finance/quotes',
        'routes/api/helpers/quotes-provider-routes',
        'services/quote-service',
        'routes/api/finance/accounting',
        'services/accounting-service',
    ])('require(%s) throws MODULE_NOT_FOUND', (rel) => {
        let caught = null;
        jest.isolateModules(() => {
            try { require(path.join(BACKEND, rel)); } catch (err) { caught = err; }
        });
        expect(caught && caught.code).toBe('MODULE_NOT_FOUND');
    });
});

describe('the doors answer 404 to the roles that used to pass them', () => {
    function buildApiApp(role) {
        let router;
        jest.isolateModules(() => {
            jest.doMock('../../middleware/auth-middleware', () => {
                const pass = (req, _res, next) => {
                    req.user = { id: 'user-1', role, canonicalRole: role, organizationId: 'org-1' };
                    next();
                };
                return {
                    authenticate: pass, authenticateHealth: pass, authenticateProvider: pass,
                    authenticateAny: pass, authenticateDTAM: pass, optionalAuth: pass,
                    requireVerification: pass, authorizeRoles: () => pass, authorize: () => pass,
                    requireRole: () => pass, checkPermission: () => pass, rateLimitSensitive: () => pass,
                };
            });
            jest.doMock('../../shared/logger', () => mockLogger);
            jest.doMock('../../server', () => ({ prisma: null }));
            router = require('../../routes/api/index');
        });
        const app = express();
        app.use(express.json());
        app.use('/api', router);
        return app;
    }

    test.each([
        ['finance_officer_platform', 'get', '/api/quotes'],
        ['finance_officer_platform', 'post', '/api/quotes'],
        ['finance_officer_platform', 'put', '/api/quotes/q-1/status'],
        ['finance_officer_platform', 'put', '/api/quotes/q-1/number'],
        ['finance_officer_platform', 'post', '/api/quotes/q-1/invoice'],
        ['system_admin_dtam', 'put', '/api/quotes/q-1/number'],
        ['health', 'get', '/api/quotes/my'],
        ['health', 'post', '/api/quotes/q-1/accept'],
        ['health', 'post', '/api/quotes/q-1/reject'],
        ['finance_officer_platform', 'get', '/api/accounting'],
        ['finance_officer_platform', 'get', '/api/accounting/dashboard'],
    ])('%s %s %s → 404', async (role, method, url) => {
        const res = await request(buildApiApp(role))[method](url)
            .send({ type: 'invoice', number: 'INV-REWRITE', status: 'accepted', items: [] });
        expect(res.status).toBe(404);
        // Express's own "no such route" answer, not a handler that looked the quote up.
        expect(res.text).toMatch(/Cannot (GET|POST|PUT)/);
    });
});

describe('the schema no longer declares Quote', () => {
    const schemaDir = path.join(BACKEND, 'prisma/schema');
    const schema = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.prisma'))
        .map((f) => fs.readFileSync(path.join(schemaDir, f), 'utf8')).join('\n');

    test('no model Quote, no Quote[] back-relation, no Invoice.quoteId', () => {
        expect(schema).not.toMatch(/^model Quote \{/m);
        expect(schema).not.toMatch(/\bQuote(\[\]|\?)?\s*(@relation|$)/m);
        expect(schema).not.toMatch(/^\s+quoteId\s/m);
    });
});
