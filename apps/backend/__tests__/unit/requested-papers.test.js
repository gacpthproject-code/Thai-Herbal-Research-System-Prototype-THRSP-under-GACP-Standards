'use strict';

const mockHolderReadWhere = jest.fn(() => ({ entityId: { in: ['ent-1'] } }));
jest.mock('../../services/holder-access', () => ({ holderReadWhere: (...a) => mockHolderReadWhere(...a) }));

const { refusalForPapersNotReplaced } = require('../../services/application-service/requested-papers');

const ASKED_AT = new Date('2026-09-05T10:00:00.000Z');
const BEFORE = new Date('2026-09-04T10:00:00.000Z');
const AFTER = new Date('2026-09-06T10:00:00.000Z');
const application = { id: 'app-1', status: 'REVISION_REQUESTED' };
const scope = { entityIds: ['ent-1'] };

function prismaWith({ reviews = [], documents = [] } = {}) {
    return {
        applicationDocumentReview: { findMany: jest.fn(async () => reviews) },
        applicationDocument: { findMany: jest.fn(async () => documents) },
    };
}

const requested = (slotId, round = 1, createdAt = ASKED_AT) => ({ slotId, verdict: 'MORE_REQUESTED', round, createdAt });
const accepted = (slotId, round = 1) => ({ slotId, verdict: 'ACCEPTED', round, createdAt: ASKED_AT });

beforeEach(() => { mockHolderReadWhere.mockClear(); });

test('a round that asked for answers and no paper has nothing to replace: no refusal, the papers are not even read', async () => {
    for (const reviews of [[], [accepted('land_rights')]]) {
        const prisma = prismaWith({ reviews });
        expect(await refusalForPapersNotReplaced({ prisma, application, holderScope: scope })).toBeNull();
        expect(prisma.applicationDocument.findMany).not.toHaveBeenCalled();
    }
});

test('every requested paper replaced after the request: no refusal', async () => {
    const prisma = prismaWith({ reviews: [requested('land_rights')], documents: [{ slotId: 'land_rights', documentType: 'LAND_RIGHTS', createdAt: AFTER }] });
    expect(await refusalForPapersNotReplaced({ prisma, application, holderScope: scope })).toBeNull();
});

test('a requested paper not replaced since the request: the 409 every door answers, naming the paper', async () => {
    const prisma = prismaWith({ reviews: [requested('land_rights'), requested('sop_manual')], documents: [
        { slotId: 'land_rights', documentType: 'LAND_RIGHTS', createdAt: BEFORE },
        { slotId: 'sop_manual', documentType: 'SOP_MANUAL', createdAt: AFTER },
    ] });
    const refusal = await refusalForPapersNotReplaced({ prisma, application, holderScope: scope });
    expect(refusal.httpStatus).toBe(409);
    expect(refusal.body).toMatchObject({ success: false, error: 'REVISION_INCOMPLETE', code: 'REVISION_INCOMPLETE', slotIds: ['land_rights'] });
    expect(refusal.body.messageTh).toContain('อัปโหลด');
    expect(typeof refusal.body.message).toBe('string');
});

test('a row that carries only the derived documentType is matched to the slot the officer named', async () => {
    const prisma = prismaWith({ reviews: [requested('land_rights')], documents: [{ slotId: null, documentType: 'LAND_RIGHTS', createdAt: AFTER }] });
    expect(await refusalForPapersNotReplaced({ prisma, application, holderScope: scope })).toBeNull();
});

test('only the current round counts, and the papers are read within the holder scope under both spellings', async () => {
    const prisma = prismaWith({ reviews: [requested('land_rights', 1), accepted('land_rights', 2), requested('water_test', 2)], documents: [
        { slotId: 'water_test', documentType: 'WATER_TEST', createdAt: AFTER },
    ] });
    expect(await refusalForPapersNotReplaced({ prisma, application, holderScope: scope })).toBeNull();
    expect(mockHolderReadWhere).toHaveBeenCalledWith(scope, 'ApplicationDocument');
    const where = prisma.applicationDocument.findMany.mock.calls[0][0].where;
    expect(where.entityId).toEqual({ in: ['ent-1'] });
    expect(where.AND[0].applicationId).toBe('app-1');
    expect(where.AND[0].OR[0]).toEqual({ slotId: { in: ['water_test'] } });
    expect(where.AND[0].OR[1].documentType.in).toEqual(expect.arrayContaining(['WATER_TEST']));
});
