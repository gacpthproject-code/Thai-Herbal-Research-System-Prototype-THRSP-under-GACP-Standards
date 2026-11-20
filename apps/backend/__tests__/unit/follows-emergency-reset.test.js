'use strict';

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));
jest.mock('../../services/tenant-context', () => ({ withoutTenantScope: (fn) => fn() }));

const { followsEmergencyReset } = require('../../services/identity-service');

const USER = 'user-1';
const RESET_AT = new Date('2026-10-20T10:00:00Z');

function fakeDb({ reset, enrolmentsAfter }) {
    const asked = [];
    return {
        asked,
        auditLog: {
            findFirst: jest.fn(async (query) => { asked.push(['findFirst', query]); return reset ? { createdAt: RESET_AT } : null; }),
            count: jest.fn(async (query) => { asked.push(['count', query]); return enrolmentsAfter; }),
        },
    };
}

describe('followsEmergencyReset', () => {
    test('no emergency clear on record: false, and no enrolment count is even asked', async () => {
        const db = fakeDb({ reset: false, enrolmentsAfter: 0 });
        await expect(followsEmergencyReset(db, USER)).resolves.toBe(false);
        expect(db.asked.map(([what]) => what)).toEqual(['findFirst']);
        expect(db.asked[0][1].where).toEqual({ resourceId: USER, action: 'MFA_EMERGENCY_RESET' });
    });

    test('the latest clear already has an enrolment or move after it: false (the second enrolment after a clear tells no admin)', async () => {
        const db = fakeDb({ reset: true, enrolmentsAfter: 1 });
        await expect(followsEmergencyReset(db, USER)).resolves.toBe(false);
        expect(db.asked[1][1].where).toEqual({ resourceId: USER, action: { in: ['MFA_ENABLED', 'MFA_REENROLLED'] }, createdAt: { gt: RESET_AT } });
    });

    test('the latest clear has nothing after it: true', async () => {
        await expect(followsEmergencyReset(fakeDb({ reset: true, enrolmentsAfter: 0 }), USER)).resolves.toBe(true);
    });
});
