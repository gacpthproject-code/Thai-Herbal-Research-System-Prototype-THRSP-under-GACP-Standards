'use strict';

/**
 * Source guard (workflow audit 2026-06-11) for the auditor audit-decision
 * handler — same convention as auditor-no-scoring-gate.test.js (the handler
 * pulls too many DB deps to instantiate in a unit test, so we pin the
 * behaviour at the source level).
 *
 * Two pinned behaviours:
 *  - HIGH: a CAR (MINOR/MAJOR → CAR_PENDING) starts the corrective-action clock so the
 *    auto-expiry crons fire. The round is opened by services/onsite-correction.js, which stamps
 *    formData.carDueAt and seeds the RevisionDeadline row in the decision's transaction
 *    (onsite-correction-has-one-opener.test.js pins the opener itself).
 *  - MEDIUM: MINOR/MAJOR (→ CAR_PENDING, a mandatory-comment target) must
 *    require a justification (notes / reasonCode / findings).
 */
const fs = require('fs');
const path = require('path');

const HANDLER = fs.readFileSync(
    path.resolve(__dirname, '../../routes/api/provider/handlers/auditor-audit-decision-handler.js'),
    'utf8',
);
// Both inspector doors record through one writer (order 56(2)); the clock and the comment gate live there.
const WRITER = fs.readFileSync(
    path.resolve(__dirname, '../../services/inspection-result-service.js'),
    'utf8',
);

describe('auditor audit-decision handler — CAR SLA clock + comment gate', () => {
    it('opens a CAR round through the one opener, in the decision\'s transaction', () => {
        expect(WRITER).toMatch(/require\(.*\.\/onsite-correction.*\)/);
        expect(WRITER).toMatch(/if \(toStatus === 'CAR_PENDING'\) \{\s*const opened = await requestOnsiteCorrection\(tx,/);
        expect(HANDLER).not.toMatch(/car-deadline-service|seedCarRevisionDeadline/);
    });

    it('requires a justification for a MINOR/MAJOR corrective-action request', () => {
        expect(WRITER).toMatch(/verdict === 'MINOR' \|\| verdict === 'MAJOR'\)\s*&&\s*!notes\s*&&\s*!reasonCode\s*&&\s*findings\.length === 0/);
    });
});
