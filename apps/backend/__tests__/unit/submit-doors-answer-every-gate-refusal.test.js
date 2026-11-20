'use strict';

const fs = require('fs');
const path = require('path');

const FILING_DOORS = [
    'routes/api/applications/applications.js',
    'routes/api/applications/revision-resubmit.js',
    'routes/api/applications/applications-car.js',
];
const GATE_LIST = 'services/application-filing-gates.js';
const GATES = /assertRequiredDocumentsPresent|validateFilingCompleteness|resolveDeclarationsAcceptance|resolveRenewalChangeDeclaration|instanceof DocumentRequirementError/;

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const routeFiles = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) { return routeFiles(rel); }
    return entry.name.endsWith('.js') ? [rel] : [];
});

describe('every filing door runs the one gate list', () => {
    FILING_DOORS.forEach((door) => {
        it(`${door} runs the gate list behind the consent gate`, () => {
            const source = read(door);
            expect(source).toContain('judgeFiling(');
            expect(source).toContain('requireConsent');
        });
    });

    it('no route file runs a gate of the list by itself', () => {
        expect(routeFiles('routes').filter((rel) => GATES.test(read(rel)))).toEqual([]);
    });

    it('the gate list recognises a document refusal by its kind and answers with the shared body', () => {
        const source = read(GATE_LIST);
        expect(source).toContain('isSubmitGateRefusal');
        expect(source).toContain('submitGateRefusalBody');
        expect(source).not.toContain('instanceof DocumentRequirementError');
    });
});

describe('the shared answer to a document-gate refusal', () => {
    it('the responder speaks the error’s own code and carries its reason', () => {
        const {
            respondSubmitGateRefusal,
            DocumentRequirementError,
            ApplicationNotJudgeableError,
        } = require('../../services/application-document-requirements');

        const captured = [];
        const res = {
            status(code) { captured.push(['status', code]); return this; },
            json(body) { captured.push(['json', body]); return this; },
        };

        respondSubmitGateRefusal(res, new DocumentRequirementError([{ slotId: 'land_rights', labelTH: 'เอกสารสิทธิ์' }]));
        expect(captured).toEqual([
            ['status', 422],
            ['json', expect.objectContaining({
                success: false,
                error: 'APPLICATION_INCOMPLETE',
                code: 'APPLICATION_INCOMPLETE',
                missingSlots: [{ slotId: 'land_rights', labelTH: 'เอกสารสิทธิ์' }],
            })],
        ]);

        captured.length = 0;
        const issues = [{ code: 'PLANT_LAW_NOT_FILED', messageTH: 'ยังไม่มีประกาศข้อกำหนด', detail: {} }];
        respondSubmitGateRefusal(res, new ApplicationNotJudgeableError(issues));
        const [, [, body]] = captured;
        expect(body).toMatchObject({
            success: false,
            error: 'APPLICATION_NOT_JUDGEABLE',
            code: 'APPLICATION_NOT_JUDGEABLE',
            message: 'ยังไม่มีประกาศข้อกำหนด',
            blockingIssues: issues,
        });
        // Not a missing-document refusal, so it must not pretend to name papers.
        expect(body.missingSlots).toEqual([]);
    });

    /**
     * Review layer 2, finding C1/C2/C7. The refusal reached the door in Thai and died
     * there: the browser's envelope (apps/web-app/src/lib/api/api-client.ts:75) treats
     * `message` as a RESERVED key and strips it from a non-2xx body, keeping only
     * `success`/`data`/`error`/`code` plus whatever else it harvests into `.meta`. So the
     * Thai sentence this gate authors was dropped on the way to the screen and the farmer
     * read the bare enum APPLICATION_NOT_JUDGEABLE.
     *
     * `messageTh` is not a reserved key, so it survives into `.meta.messageTh` — the field
     * the preview door already reads for the older refusal. Sending it HERE fixes every
     * door at once, which is the whole reason this responder exists.
     */
    it('carries the Thai refusal in a field the browser envelope does not strip', () => {
        const {
            respondSubmitGateRefusal,
            DocumentRequirementError,
            ApplicationNotJudgeableError,
        } = require('../../services/application-document-requirements');

        const bodies = [];
        const res = { status() { return this; }, json(body) { bodies.push(body); return this; } };

        respondSubmitGateRefusal(res, new ApplicationNotJudgeableError(
            [{ code: 'PLANT_LAW_NOT_FILED', messageTH: 'ยังไม่มีประกาศข้อกำหนดสำหรับพืชที่คุณเลือก', detail: {} }],
        ));
        respondSubmitGateRefusal(res, new DocumentRequirementError([{ slotId: 'land_rights' }]));

        bodies.forEach((body) => {
            // Same sentence, in the field that survives the trip.
            expect(body.messageTh).toBe(body.message);
            expect(body.messageTh).toMatch(/[ก-๙]/);
        });
    });

    it('the browser envelope would keep messageTh and drop message', () => {
        // Pinned against the real reserved-key list rather than a copy of it: if the
        // browser ever reserves `messageTh` too, this fails instead of the farmer's screen.
        const clientSource = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'web-app', 'src', 'lib', 'api', 'api-client.ts'),
            'utf8',
        );
        const reserved = clientSource.match(/ENVELOPE_RESERVED_KEYS = new Set\(\[([^\]]*)\]\)/);
        expect(reserved).not.toBeNull();
        expect(reserved[1]).toContain("'message'");
        expect(reserved[1]).not.toContain("'messageTh'");
    });

    it('isSubmitGateRefusal recognises both refusals and nothing else', () => {
        const {
            isSubmitGateRefusal,
            DocumentRequirementError,
            ApplicationNotJudgeableError,
        } = require('../../services/application-document-requirements');
        expect(isSubmitGateRefusal(new DocumentRequirementError([]))).toBe(true);
        expect(isSubmitGateRefusal(new ApplicationNotJudgeableError([]))).toBe(true);
        expect(isSubmitGateRefusal(new Error('boom'))).toBe(false);
        expect(isSubmitGateRefusal(null)).toBe(false);
    });
});
