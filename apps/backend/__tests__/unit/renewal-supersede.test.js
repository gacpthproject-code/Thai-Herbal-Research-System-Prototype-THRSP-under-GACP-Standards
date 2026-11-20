'use strict';

const { assertRenewable, supersede } = require('../../services/certificate/renewal-supersede');
const { ERROR_CODES } = require('../../shared/error-codes');

function clientWith(rows) {
    const certificates = new Map(rows.map((row) => [row.id, { renewedCertificateId: null, previousCertificateId: null, isDeleted: false, ...row }]));
    return {
        certificates,
        certificate: {
            findFirst: async ({ where }) => {
                const row = certificates.get(where.id);
                return row && !row.isDeleted ? row : null;
            },
            updateMany: async ({ where, data }) => {
                const row = certificates.get(where.id);
                if (!row || row.status !== where.status || row.renewedCertificateId !== where.renewedCertificateId) { return { count: 0 }; }
                Object.assign(row, data);
                return { count: 1 };
            },
            update: async ({ where, data }) => Object.assign(certificates.get(where.id), data),
            findUnique: async ({ where }) => ({ farmId: 'farm-1', scopes: [], ...certificates.get(where.id) }),
        },
        plantingCycle: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    };
}

const old = (extra = {}) => ({ id: 'old', status: 'active', application: { entityId: 'holder-1' }, ...extra });
const args = { oldCertificateId: 'old', holderEntityId: 'holder-1' };

describe('assertRenewable', () => {
    test.each([
        ['active', old()],
        ['expired by status', old({ status: 'expired' })],
        ['stored in capitals', old({ status: 'ACTIVE' })],
    ])('a certificate of the same holder that is %s may be renewed', async (_case, row) => {
        await expect(assertRenewable(clientWith([row]), args)).resolves.toEqual({ id: 'old', status: row.status });
    });

    test.each([
        ['another holder', old({ application: { entityId: 'holder-2' } }), 'RENEWAL_SOURCE_HOLDER_MISMATCH'],
        ['no recorded holder', old({ application: { entityId: null } }), 'RENEWAL_SOURCE_HOLDER_MISMATCH'],
        ['revoked', old({ status: 'revoked' }), 'RENEWAL_SOURCE_NOT_IN_FORCE'],
        ['suspended', old({ status: 'suspended' }), 'RENEWAL_SOURCE_NOT_IN_FORCE'],
        ['deleted', old({ isDeleted: true }), 'RENEWAL_SOURCE_NOT_IN_FORCE'],
        ['already renewed', old({ status: 'renewed', renewedCertificateId: 'other' }), 'RENEWAL_SOURCE_ALREADY_RENEWED'],
        ['active but pointing at a successor', old({ renewedCertificateId: 'other' }), 'RENEWAL_SOURCE_ALREADY_RENEWED'],
    ])('%s: refused with its catalogued Thai message', async (_case, row, code) => {
        await expect(assertRenewable(clientWith([row]), args)).rejects.toMatchObject({
            code, statusCode: ERROR_CODES[code].httpStatus, message: ERROR_CODES[code].messageTh,
        });
    });

    test('a holder id of null never matches a certificate with no holder', async () => {
        await expect(assertRenewable(clientWith([old({ application: { entityId: null } })]), { ...args, holderEntityId: null }))
            .rejects.toMatchObject({ code: 'RENEWAL_SOURCE_HOLDER_MISMATCH' });
    });
});

describe('supersede', () => {
    test('marks the old certificate renewed and links both ways', async () => {
        const client = clientWith([old(), { id: 'new', status: 'active' }]);
        await supersede(client, { ...args, newCertificateId: 'new' });
        expect(client.certificates.get('old')).toMatchObject({ status: 'renewed', renewedCertificateId: 'new' });
        expect(client.certificates.get('new')).toMatchObject({ previousCertificateId: 'old' });
    });

    test('a row changed between the read and the write refuses and links nothing', async () => {
        const client = clientWith([old(), { id: 'new', status: 'active' }]);
        const read = client.certificate.findFirst;
        let reads = 0;
        client.certificate.findFirst = async (q) => {
            reads += 1;
            const row = await read(q);
            if (reads === 1) { client.certificates.get('old').status = 'revoked'; return { ...row, status: 'active' }; }
            return row;
        };
        await expect(supersede(client, { ...args, newCertificateId: 'new' })).rejects.toMatchObject({ code: 'RENEWAL_SOURCE_NOT_IN_FORCE' });
        expect(client.certificates.get('old')).toMatchObject({ status: 'revoked', renewedCertificateId: null });
        expect(client.certificates.get('new').previousCertificateId).toBeNull();
    });
});
