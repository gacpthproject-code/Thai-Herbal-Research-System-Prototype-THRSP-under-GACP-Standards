/**
 * Pin from the independent re-review of b99e0b4eb (item 3): on the erasure door, a legal hold placed
 * after executeErasure's pre-check read must win inside the transaction, and nothing else of the
 * account may be written once anonymizeAccount's conditional users write hit no row.
 */

jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue({}) },
    AuditCategory: { SECURITY: 'SECURITY' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { USER: 'USER' },
}));
jest.mock('../../services/notification-fanout-service', () => ({ send: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('../../services/user-lookup-service', () => ({ findUserByHealthIdSecurely: jest.fn() }));

jest.mock('../../services/prisma-database', () => {
    const user = { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() };
    const counted = () => jest.fn(async () => ({ count: 0 }));
    const tx = {
        user,
        application: { findMany: jest.fn(async () => []), update: jest.fn() },
        certificate: { findMany: jest.fn(async () => []), update: jest.fn() },
        entityMembership: { findMany: jest.fn(async () => []) },
        entity: { update: jest.fn() },
        applicationDraft: { deleteMany: counted() },
        notification: { deleteMany: counted() },
        documentPrecheck: { updateMany: counted(), findMany: jest.fn(async () => []) },
        documentPrecheckFlag: { updateMany: counted(), create: jest.fn() },
        surveyResponse: { findMany: jest.fn(async () => []), updateMany: counted() },
        surveyAnswer: { updateMany: counted() },
        identityLink: { deleteMany: counted() },
        invoice: { count: jest.fn(async () => 0) },
        userConsent: { updateMany: counted() },
        entityMembershipEvent: { updateMany: counted() },
        entityContextSwitch: { updateMany: counted() },
    };
    return { prisma: { user, $transaction: jest.fn(async (cb) => cb(tx)), __tx: tx } };
});

const { prisma } = require('../../services/prisma-database');
const { auditLogger } = require('../../middleware/audit-logger');
const service = require('../../services/pdpa-erasure-service');

const USER_ID = 'user-race';

function nothingElseWritten() {
    const tx = prisma.__tx;
    expect(prisma.user.update).not.toHaveBeenCalled();
    for (const m of ['applicationDraft', 'notification', 'identityLink']) {
        expect(tx[m].deleteMany).not.toHaveBeenCalled();
    }
    for (const m of ['userConsent', 'entityMembershipEvent', 'entityContextSwitch', 'surveyResponse', 'surveyAnswer', 'documentPrecheck', 'documentPrecheckFlag']) {
        expect(tx[m].updateMany).not.toHaveBeenCalled();
    }
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(tx.certificate.update).not.toHaveBeenCalled();
    expect(tx.entity.update).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'PDPA_ERASURE_EXECUTED' }));
}

describe('erasure door: a hold placed after the pre-check read wins inside the transaction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        prisma.user.updateMany.mockResolvedValue({ count: 0 });
    });

    test('hold set mid-run: PDPA_LEGAL_HOLD, and no row of the account is written', async () => {
        prisma.user.findUnique
            .mockResolvedValueOnce({ canonicalId: 'c', organizationId: 'org', legalHold: false }) // pre-check
            .mockResolvedValueOnce({ privacySettings: { avatar: '/uploads/x.png' } }) // anonymizeAccount's read
            .mockResolvedValueOnce({ legalHold: true }); // the re-read after count 0

        await expect(service.executeErasure({ userId: USER_ID, actorId: USER_ID, actorRole: 'health' }))
            .rejects.toMatchObject({ code: 'PDPA_LEGAL_HOLD' });

        expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: USER_ID, legalHold: false, isAnonymized: false },
        }));
        nothingElseWritten();
    });

    test('sweep got there first: PDPA_ALREADY_DELETED, and nothing is written', async () => {
        prisma.user.findUnique
            .mockResolvedValueOnce({ canonicalId: 'c', organizationId: 'org', legalHold: false })
            .mockResolvedValueOnce({ privacySettings: null })
            .mockResolvedValueOnce({ legalHold: false });

        await expect(service.executeErasure({ userId: USER_ID, actorId: USER_ID, actorRole: 'health' }))
            .rejects.toMatchObject({ code: 'PDPA_ALREADY_DELETED' });
        nothingElseWritten();
    });
});
