'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(undefined) },
    AuditCategory: { SECURITY: 'SECURITY' },
}));

const { currentEditionOf } = require('@gacp/validation/legal-document-versions');

const PAGES = {
    TERMS_OF_SERVICE: path.resolve(__dirname, '../../../web-app/src/app/(marketing)/terms-of-service/page.tsx'),
    PRIVACY_POLICY: path.resolve(__dirname, '../../../web-app/src/app/(marketing)/privacy-policy/page.tsx'),
};

let ConsentVersions;
beforeAll(() => {
    process.env.CONSENT_VERSION_TERMS_OF_SERVICE = '9.9.9';
    process.env.CONSENT_VERSION_PRIVACY_POLICY = '9.9.9';
    jest.isolateModules(() => {
        ({ ConsentVersions } = require('../../middleware/consent-manager'));
    });
    delete process.env.CONSENT_VERSION_TERMS_OF_SERVICE;
    delete process.env.CONSENT_VERSION_PRIVACY_POLICY;
});

describe.each(Object.keys(PAGES))('%s', (category) => {
    test('the version recordConsent stamps is the published page version, whatever the env var says', () => {
        expect(ConsentVersions[category]).toBe(currentEditionOf(category).version);
        expect(ConsentVersions[category]).not.toBe('1.0.0');
    });

    test('the page prints the shared table, not a version of its own', () => {
        const source = fs.readFileSync(PAGES[category], 'utf8');
        expect(source).toMatch(/from '@gacp\/validation\/legal-document-versions'/);
        expect(source).toMatch(new RegExp(`currentEditionOf\\('${category}'\\)`));
        expect(source).not.toMatch(/_VERSION = '\d/);
        expect(source).not.toMatch(/_EFFECTIVE = '/);
    });
});
