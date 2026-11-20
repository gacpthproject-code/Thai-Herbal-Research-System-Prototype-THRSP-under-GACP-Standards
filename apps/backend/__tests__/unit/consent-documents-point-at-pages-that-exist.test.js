'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(undefined) },
    AuditCategory: { SECURITY: 'SECURITY' },
}));

const { consentManager, ConsentCategory, RequiredConsents } = require('../../middleware/consent-manager');

const WEB_APP_DIR = path.resolve(__dirname, '../../../web-app/src/app');
const PAGE_FILES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'];

function pagePaths(dir, urlPrefix) {
    const found = [];
    if (PAGE_FILES.some((file) => fs.existsSync(path.join(dir, file)))) {
        found.push(urlPrefix || '/');
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('__') || entry.name === 'api') continue;
        const isRouteGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
        const nextPrefix = isRouteGroup ? urlPrefix : `${urlPrefix}/${entry.name}`;
        found.push(...pagePaths(path.join(dir, entry.name), nextPrefix));
    }
    return found;
}

const WEB_PAGES = pagePaths(WEB_APP_DIR, '');
const LANGUAGES = ['th', 'en'];

const documents = Object.values(ConsentCategory).flatMap((category) =>
    LANGUAGES.map((language) => ({ category, language, document: consentManager.getConsentDocument(category, language) })),
);

describe('every legal url the consent document door hands out is a page the web app serves', () => {
    it.each(documents.filter(({ document }) => document?.url))(
        '$category ($language) url is a page: $document.url',
        ({ document }) => {
            expect(WEB_PAGES).toContain(document.url.replace(/[?#].*$/, ''));
        },
    );

    it.each(RequiredConsents.map((category) => [category]))(
        'required consent %s hands out a url in every language',
        (category) => {
            for (const language of LANGUAGES) {
                expect(consentManager.getConsentDocument(category, language)).toMatchObject({ url: expect.stringMatching(/^\//) });
            }
        },
    );
});
