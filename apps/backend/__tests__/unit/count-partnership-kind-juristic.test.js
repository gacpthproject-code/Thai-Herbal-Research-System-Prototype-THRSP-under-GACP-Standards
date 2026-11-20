'use strict';

const { count } = require('../../scripts/holder/count-partnership-kind-juristic');

const fakePrisma = (rows) => ({
    entity: {
        findMany: jest.fn(async (args) => {
            expect(args).toEqual({ where: { type: 'JURISTIC', isDeleted: false }, select: { id: true, juristicId: true } });
            return rows;
        }),
    },
});
const withoutTenantScope = (fn) => fn();

describe('runbook count of legacy company holders carrying a partnership-kind number', () => {
    test('counts by the 4th digit, lists only the partnership-kind ids, never a number', async () => {
        const out = await count({
            prisma: fakePrisma([
                { id: 'a', juristicId: '0103555123458' },
                { id: 'b', juristicId: '0102555123457' },
                { id: 'c', juristicId: '0105555123450' },
                { id: 'd', juristicId: '0107555123451' },
                { id: 'e', juristicId: '0104555123459' },
                { id: 'f', juristicId: null },
                { id: 'g', juristicId: 'enc:v1:unreadable' },
            ]),
            withoutTenantScope,
        });
        expect(out).toEqual({
            total: 7,
            byKind: { 2: 1, 3: 1, 5: 1, 7: 1 },
            other: 1,
            unreadable: 2,
            partnershipKind: 2,
            partnershipKindIds: ['a', 'b'],
        });
        expect(JSON.stringify(out)).not.toContain('555123');
    });

    test('an empty register counts zero everywhere', async () => {
        const out = await count({ prisma: fakePrisma([]), withoutTenantScope });
        expect(out).toEqual({ total: 0, byKind: { 2: 0, 3: 0, 5: 0, 7: 0 }, other: 0, unreadable: 0, partnershipKind: 0, partnershipKindIds: [] });
    });
});
