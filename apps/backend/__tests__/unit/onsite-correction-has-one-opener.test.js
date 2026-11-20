/**
 * A correction round on site is opened in one place (spec 5.3): services/onsite-correction.js
 * writes CAR_PENDING, the FIELD_AUDIT_CAR letter and the RevisionDeadline row in the decision's
 * transaction. The inspector's doors, the generic door and the approver's door call it; no door
 * seeds the deadline after its commit, where a failure left an application in CAR_PENDING with
 * no clock to close it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', '..');

function jsFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__tests__', 'chaos-tests', 'coverage'].includes(entry.name)) { continue; }
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { jsFiles(p, out); } else if (entry.name.endsWith('.js')) { out.push(p); }
    }
    return out;
}

const sources = ['routes', 'services', 'jobs', 'controllers'].flatMap((d) => jsFiles(path.join(BACKEND, d)))
    .map((f) => ({ rel: path.relative(BACKEND, f), src: fs.readFileSync(f, 'utf8') }));

describe('one opener of an on-site correction round', () => {
    test('only services/onsite-correction.js mints the FIELD_AUDIT_CAR letter', () => {
        const minters = sources.filter(({ src }) => /CORRECTION_LETTER_STAGE\.FIELD_AUDIT_CAR/.test(src)).map(({ rel }) => rel);
        expect(minters).toEqual(['services/onsite-correction.js']);
    });

    test('no door seeds the correction deadline after its commit', () => {
        expect(sources.filter(({ src }) => /seedCarRevisionDeadline/.test(src)).map(({ rel }) => rel)).toEqual([]);
    });

    test('the inspector, the generic door and the approver open the round through it', () => {
        const callers = sources.filter(({ src }) => /requestOnsiteCorrection\(/.test(src)).map(({ rel }) => rel).sort();
        expect(callers).toEqual([
            'routes/api/provider/handlers/workflow-transitions-handler.js',
            'services/certification-decision-service.js',
            'services/inspection-result-service.js',
            'services/onsite-correction.js',
        ]);
    });
});

describe('requestOnsiteCorrection writes the round in the caller\'s transaction', () => {
    const mockWrite = jest.fn();
    const mockMint = jest.fn();
    beforeAll(() => {
        jest.doMock('../../services/application-status-writer', () => ({ writeApplicationStatus: (...a) => mockWrite(...a) }));
        jest.doMock('../../services/decision-letter-service', () => ({
            mintCorrectionLetter: (...a) => mockMint(...a), CORRECTION_LETTER_STAGE: { FIELD_AUDIT_CAR: 'FIELD_AUDIT_CAR' },
        }));
    });
    afterAll(() => { jest.dontMock('../../services/application-status-writer'); jest.dontMock('../../services/decision-letter-service'); });

    const application = { id: 'app-1', applicationNumber: 'APP-1', healthId: 'h-1' };
    const at = new Date('2026-10-14T03:00:00.000Z');
    const args = (tx) => ({
        application, fromStatus: 'AUDIT_NOT_PASSED', actorId: 'approver-1', actorRole: 'certificate_approver', reason: 'CERTIFICATION_CORRECTION_REQUESTED',
        additionalData: { formData: { keep: 'me' } }, findings: [{ nonConformity: 'ข้อที่พบ', correctiveAction: 'วิธีแก้' }], note: 'คำสั่งเพิ่มเติม', at,
    });

    beforeEach(() => {
        mockWrite.mockReset().mockResolvedValue({ id: 'app-1', organizationId: 'org-1', status: 'CAR_PENDING' });
        mockMint.mockReset().mockResolvedValue({ id: 'letter-1' });
    });

    test('status, letter and deadline go through the one tx, the deadline counted from the decision', async () => {
        const { requestOnsiteCorrection } = require('../../services/onsite-correction');
        const tx = { revisionDeadline: { upsert: jest.fn().mockResolvedValue({}) } };
        const out = await requestOnsiteCorrection(tx, args(tx));
        expect(out.carDueAt.toISOString()).toBe('2026-11-13T16:59:59.999Z');
        const [write] = mockWrite.mock.calls[0];
        expect(write).toEqual(expect.objectContaining({ prisma: tx, toStatus: 'CAR_PENDING', fromStatus: 'AUDIT_NOT_PASSED', assertTransition: true }));
        expect(write.additionalData.formData).toEqual(expect.objectContaining({ keep: 'me', carDueAt: '2026-11-13T16:59:59.999Z', carRequestedAt: at.toISOString() }));
        expect(mockMint.mock.calls[0][0]).toEqual(expect.objectContaining({ tx, stage: 'FIELD_AUDIT_CAR', items: ['ข้อที่พบ แนวทางแก้ไข: วิธีแก้'], message: 'คำสั่งเพิ่มเติม' }));
        expect(tx.revisionDeadline.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { applicationId: 'app-1' },
            create: expect.objectContaining({ organizationId: 'org-1', status: 'PENDING', revisionDue: out.carDueAt }),
        }));
    });

    test('a deadline that cannot be written fails the decision (the caller\'s tx rolls back)', async () => {
        const { requestOnsiteCorrection } = require('../../services/onsite-correction');
        const tx = { revisionDeadline: { upsert: jest.fn().mockRejectedValue(new Error('deadline write failed')) } };
        await expect(requestOnsiteCorrection(tx, args(tx))).rejects.toThrow('deadline write failed');
    });
});
