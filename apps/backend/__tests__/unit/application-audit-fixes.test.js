/**
 * [AppAudit] Application/Submission System Audit — Phase A regression tests
 *
 * Covers the 6 Phase A fixes from the application audit (2026-05-15):
 *   - AC3: healthId masked in trace/lots workflowHistory metadata
 *   - AC4: raw error.message suppressed in applications.js + workflow-handlers.js
 *   - AC5: phantom userId query replaced with canonical healthId lookup
 *   - AM2: CAR upload uses strict MIME + ext allowlist (not regex substring)
 *   - AH2: revision-deadline-checker routes through canonical buildTransitionUpdate
 */

const fs = require('fs');
const path = require('path');

jest.mock('../../shared/logger', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...log, createLogger: jest.fn(() => log), stream: { write: jest.fn() } };
});

describe('[AppAudit] Phase A fixes — static regressions', () => {
    it('AC3: trace/lots.js no longer writes raw req.user.healthId into workflowHistory metadata', () => {
        const filePath = path.join(__dirname, '..', '..', 'routes', 'api', 'trace', 'lots.js');
        const src = fs.readFileSync(filePath, 'utf8');
        // Strip comments to ignore audit notes that mention the legacy code.
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        // Must NOT contain the raw `actorIdentity: req.user?.healthId` write.
        expect(stripped).not.toMatch(/actorIdentity:\s*req\.user\?\.healthId/);
        // Must import maskThaiId.
        expect(src).toMatch(/maskThaiId/);
        // Should reference the masked variant.
        expect(stripped).toMatch(/actorIdentityMasked:\s*maskThaiId/);
    });

    it('AC4: applications.js does not echo raw error.message in 5xx responses', () => {
        const filePath = path.join(__dirname, '..', '..', 'routes', 'api', 'applications', 'applications.js');
        const src = fs.readFileSync(filePath, 'utf8');
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        // No `details: error.message` in catch-block responses.
        expect(stripped).not.toMatch(/details:\s*error\.message/);
        // Should route 5xx through a sanitizing wrapper. applications.js was
        // migrated (commit 3e8f9b01 + the 741→480 split) from direct
        // `safeErrorMessage(error)` calls to the centralized `respondError(...)`
        // helper, which itself calls `safeErrorMessage` internally
        // (shared/api-response.js:262/275/289). Either path satisfies the AC4
        // intent — raw error.message is never echoed to the client.
        expect(src).toMatch(/respondError\(\s*res\s*,\s*req\s*,\s*error|safeErrorMessage\(error\)/);
    });

    it('AC4: application-workflow-handlers.js PDF + reject use safeErrorMessage', () => {
        const filePath = path.join(__dirname, '..', '..', 'routes', 'api', 'applications', 'application-workflow-handlers.js');
        const src = fs.readFileSync(filePath, 'utf8');
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        // The PDF handler previously had `error: error.message || 'Failed to generate PDF'`.
        // It must now route through a sanitizing wrapper with that fallback —
        // either a direct `safeErrorMessage(error, 'Failed to generate PDF')`
        // or the centralized `respondError(res, req, error, { message: 'Failed
        // to generate PDF' })` (respondError calls safeErrorMessage internally,
        // shared/api-response.js:262/275/289). Both satisfy AC4.
        expect(stripped).toMatch(
            /safeErrorMessage\(error,\s*['"]Failed to generate PDF['"]\)|respondError\([^)]*['"]Failed to generate PDF['"]/,
        );
        // Reject handler also.
        expect(stripped).not.toMatch(/error: 'Failed to reject application', details:\s*error\.message/);
    });

    it('AC5: applications.js readiness endpoint queries healthId, not phantom userId', () => {
        const filePath = path.join(__dirname, '..', '..', 'routes', 'api', 'applications', 'applications.js');
        const src = fs.readFileSync(filePath, 'utf8');
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        // The phantom `where: { userId, status: { not: 'EXPIRED' } }` must be gone from
        // the readiness route's application query.
        expect(stripped).not.toMatch(/prisma\.application\.findMany\(\{\s*where:\s*\{\s*userId,\s*status:/);
        // Must use applicationService.resolveHealthIdentity for the lookup.
        expect(stripped).toMatch(/resolveHealthIdentity/);
    });

    it('AM2: CAR upload compares MIME type and extension to exact allowlists (not regex substring)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'api', 'applications', 'applications-car.js'), 'utf8');
        expect(src).not.toMatch(/allowedTypes\s*=\s*\/jpeg/);
        expect(src).toMatch(/CAR_EXTENSIONS\.includes\(ext\) && CAR_MIMETYPES\.includes\(file\.mimetype\)/);
    });

    it('AH2: revision-deadline-checker routes the EXPIRED transition through canonical', () => {
        const filePath = path.join(__dirname, '..', '..', 'jobs', 'revision-deadline-checker.js');
        const src = fs.readFileSync(filePath, 'utf8');
        // Imports the canonical helper.
        expect(src).toMatch(/buildTransitionUpdate.*require.*workflow-transition-service/s);
        // Uses it inside the transaction.
        expect(src).toMatch(/buildTransitionUpdate\(\{[^)]*toState:\s*['"]EXPIRED['"]/s);
    });
});

describe('[AppAudit] AM2 — CAR upload allowlists', () => {
    const { CAR_MIMETYPES, CAR_EXTENSIONS } = require('../../services/car-evidence-files');

    it('holds exactly the three accepted MIME types, so image/jpeg-exploit is not one of them', () => {
        expect([...CAR_MIMETYPES].sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
        expect(CAR_MIMETYPES.includes('image/jpeg-exploit')).toBe(false);
    });

    it('holds exactly the lowercase dot-prefixed extensions', () => {
        expect([...CAR_EXTENSIONS].sort()).toEqual(['.jpeg', '.jpg', '.pdf', '.png']);
        expect(CAR_EXTENSIONS.includes('.pdf.exe')).toBe(false);
    });
});
