/**
 * The approver who sends a file back for correction may add an instruction for the applicant
 * (spec 5.3 and 5.8, "คำสั่งเพิ่มเติมถึงผู้ยื่น"). The correction letter prints it beside the
 * findings the approver picked; a letter with no instruction has no such part.
 */

'use strict';

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../shared/logger', () => ({ ...mockLogger, createLogger: jest.fn(() => mockLogger) }));
jest.mock('../../services/tenant-context', () => ({ getTenantContext: () => null, withoutTenantScope: (fn) => fn() }));
jest.mock('../../services/notification-fanout-service', () => ({ send: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('../../services/user-lookup-service', () => ({
    findUserByHealthIdSecurely: jest.fn().mockResolvedValue({ id: 'farmer-1', organizationId: 'org-1' }),
    findUserByProviderIdSecurely: jest.fn(),
    resolveUserIdFromHealthIdSecurely: jest.fn().mockResolvedValue('farmer-1'),
}));
jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: jest.fn(async () => ({ id: 'app-1', organizationId: 'org-1', status: 'CAR_PENDING' })),
}));

const { buildCorrectionLetter } = require('../../shared/correction-letter-template');
const { requestOnsiteCorrection } = require('../../services/onsite-correction');

const FINDING = { nonConformity: 'โรงเก็บผลผลิตไม่มีประตูล็อก', correctiveAction: 'ติดตั้งประตูที่ล็อกได้' };
const INSTRUCTION = 'แนบภาพประตูที่ติดตั้งแล้วพร้อมรายชื่อผู้ถือกุญแจ';

function fakeTx() {
    return {
        notification: { create: jest.fn(async ({ data }) => ({ id: 'letter-1', ...data })) },
        correctionRound: {
            count: jest.fn(async () => 0),
            create: jest.fn(async ({ data }) => ({ id: 'round-1', ...data })),
        },
        revisionDeadline: { upsert: jest.fn(async () => ({})) },
    };
}

describe('the correction letter carries the approver\'s instruction', () => {
    const letter = (extra) => buildCorrectionLetter({
        applicationNumber: 'GACP-001', stage: 'FIELD_AUDIT_CAR', items: ['ข้อที่ต้องแก้'],
        dueAt: new Date('2026-11-13T16:59:59.999Z'), roundNo: 1, ...extra,
    });

    test('an instruction is printed as its own part, after the findings', () => {
        const { message, metadata } = letter({ instruction: `  ${INSTRUCTION}\n` });
        expect(message).toContain(`คำสั่งเพิ่มเติม\n${INSTRUCTION}`);
        expect(message.indexOf(INSTRUCTION)).toBeGreaterThan(message.indexOf('1. ข้อที่ต้องแก้'));
        expect(metadata.instruction).toBe(INSTRUCTION);
    });

    test('no instruction, no such part', () => {
        for (const instruction of [undefined, null, '', '   ']) {
            const { message, metadata } = letter({ instruction });
            expect(message).not.toContain('คำสั่งเพิ่มเติม');
            expect(metadata).not.toHaveProperty('instruction');
        }
    });

    test('the approver\'s send-back mints a letter with the picked finding and the instruction', async () => {
        const tx = fakeTx();
        await requestOnsiteCorrection(tx, {
            application: { id: 'app-1', applicationNumber: 'GACP-001', healthId: 'h-1' },
            fromStatus: 'AUDIT_NOT_PASSED', actorId: 'approver-1', actorRole: 'certificate_approver',
            reason: 'CERTIFICATION_CORRECTION_REQUESTED', findings: [FINDING], instruction: INSTRUCTION,
            at: new Date('2026-10-14T03:00:00.000Z'),
        });
        const [{ data }] = tx.notification.create.mock.calls[0];
        expect(data.message).toContain(`${FINDING.nonConformity} แนวทางแก้ไข: ${FINDING.correctiveAction}`);
        expect(data.message).toContain(INSTRUCTION);
    });
});
