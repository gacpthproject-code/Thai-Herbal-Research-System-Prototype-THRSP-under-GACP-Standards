'use strict';

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const { buildApplicationDetailPayload } = require('../../routes/api/helpers/application-payload-builders');

const FINDINGS = [
    { nonConformity: 'ป้ายแปลงไม่ครบ', correctiveAction: 'ติดป้าย' },
    { nonConformity: 'ไม่มีบันทึกปุ๋ย', correctiveAction: 'จัดทำบันทึก' },
];
const STAGED = {
    id: 'CAR-1.pdf', filename: 'CAR-1.pdf', path: '/uploads/car/CAR-1.pdf', findingNo: 2, originalName: 'สมุด.pdf',
    size: 2048, mimeType: 'application/pdf', uploadedAt: '2026-10-21T08:00:00.000Z', uploadedBy: 'user-1',
};
const row = (status, formData) => ({ id: 'app-1', applicationNumber: 'A-1', status, formData, workflowHistory: [], comments: [] });
const flagBefore = process.env.CAR_UNSENT_SWEEP_ENABLED;
afterEach(() => {
    if (flagBefore === undefined) { delete process.env.CAR_UNSENT_SWEEP_ENABLED; } else { process.env.CAR_UNSENT_SWEEP_ENABLED = flagBefore; }
});

describe('the applicant reads the corrective-action round from GET /applications/:id (order 127(1))', () => {
    it('lists the defects of the round and the files already uploaded for it, without who uploaded them', () => {
        process.env.CAR_UNSENT_SWEEP_ENABLED = '';
        const payload = buildApplicationDetailPayload(row('CAR_PENDING', { carRequest: { items: FINDINGS }, carStagedFiles: [STAGED] }));
        expect(payload.carRound).toEqual({
            defects: [
                { no: 1, nonConformity: 'ป้ายแปลงไม่ครบ', correctiveAction: 'ติดป้าย' },
                { no: 2, nonConformity: 'ไม่มีบันทึกปุ๋ย', correctiveAction: 'จัดทำบันทึก' },
            ],
            stagedFiles: [{ id: 'CAR-1.pdf', findingNo: 2, originalName: 'สมุด.pdf', size: 2048, mimeType: 'application/pdf', uploadedAt: '2026-10-21T08:00:00.000Z', deletesAt: null }],
        });
    });

    it('tells when the sweep deletes each unsent file: the round deadline or 7 days after upload, whichever is first (order 138)', () => {
        process.env.CAR_UNSENT_SWEEP_ENABLED = 'true';
        const later = { ...STAGED, id: 'CAR-2.pdf', filename: 'CAR-2.pdf', uploadedAt: '2026-10-25T08:00:00.000Z' };
        const deletesAt = (formData) => buildApplicationDetailPayload(row('CAR_PENDING', { carRequest: { items: FINDINGS }, carStagedFiles: [STAGED, later], ...formData }))
            .carRound.stagedFiles.map((file) => file.deletesAt);
        expect(deletesAt({ carDueAt: '2026-11-20T16:59:59.999Z' })).toEqual(['2026-10-28T08:00:00.000Z', '2026-11-01T08:00:00.000Z']);
        expect(deletesAt({ carDueAt: '2026-10-29T16:59:59.999Z' })).toEqual(['2026-10-28T08:00:00.000Z', '2026-10-29T16:59:59.999Z']);
    });

    it('carries no round outside CAR_PENDING', () => {
        expect(buildApplicationDetailPayload(row('CAR_REVIEWING', { carRequest: { items: FINDINGS } })).carRound).toBeNull();
    });
});
