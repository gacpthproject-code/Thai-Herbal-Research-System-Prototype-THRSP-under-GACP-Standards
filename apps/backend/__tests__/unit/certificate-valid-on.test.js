'use strict';

jest.mock('../../services/audit-trail', () => ({ certificateSuspensionEvents: jest.fn() }));

const auditTrail = require('../../services/audit-trail');
const { certificateValidOn, certificateInForceOn } = require('../../services/certificate/valid-on');

const bkk = (isoLocal) => new Date(`${isoLocal}+07:00`);

const inForce = {
    id: 'c1',
    status: 'active',
    issuedDate: bkk('2026-01-10T10:00:00'),
    expiryDate: bkk('2027-01-09T10:00:00'),
    revokedAt: null,
    suspendedAt: null,
    reinstatedAt: null,
};

describe('certificateValidOn: was the certificate in force on this Bangkok date', () => {
    test.each([
        ['the day before issue', '2026-01-09T23:59:00', false],
        ['the issue day, before the issue hour', '2026-01-10T00:30:00', true],
        ['inside the term', '2026-06-01T12:00:00', true],
        ['the expiry day, after the expiry hour', '2027-01-09T23:00:00', true],
        ['the day after expiry', '2027-01-10T00:01:00', false],
    ])('%s', (_label, when, expected) => {
        expect(certificateValidOn(inForce, bkk(when))).toBe(expected);
    });

    test('a renewed or expired certificate is judged by its dates, not by its status today', () => {
        expect(certificateValidOn({ ...inForce, status: 'renewed' }, bkk('2026-06-01T12:00:00'))).toBe(true);
        expect(certificateValidOn({ ...inForce, status: 'expired' }, bkk('2026-06-01T12:00:00'))).toBe(true);
    });

    test('a revoked certificate is out of force from the revocation day on', () => {
        const revoked = { ...inForce, status: 'revoked', revokedAt: bkk('2026-06-01T09:00:00') };
        expect(certificateValidOn(revoked, bkk('2026-05-31T23:00:00'))).toBe(true);
        expect(certificateValidOn(revoked, bkk('2026-06-01T08:00:00'))).toBe(false);
        expect(certificateValidOn(revoked, bkk('2026-08-01T08:00:00'))).toBe(false);
    });

    test('a revoked certificate without a revocation date is never in force', () => {
        expect(certificateValidOn({ ...inForce, status: 'revoked' }, bkk('2026-06-01T12:00:00'))).toBe(false);
    });

    test('a suspension on the row covers its days, both ends included', () => {
        const reinstated = { ...inForce, suspendedAt: bkk('2026-03-01T15:00:00'), reinstatedAt: bkk('2026-03-10T09:00:00') };
        expect(certificateValidOn(reinstated, bkk('2026-02-28T12:00:00'))).toBe(true);
        expect(certificateValidOn(reinstated, bkk('2026-03-01T08:00:00'))).toBe(false);
        expect(certificateValidOn(reinstated, bkk('2026-03-10T20:00:00'))).toBe(false);
        expect(certificateValidOn(reinstated, bkk('2026-03-11T00:10:00'))).toBe(true);
    });

    test('a suspension not yet lifted covers every day from its start', () => {
        const suspended = { ...inForce, status: 'suspended', suspendedAt: bkk('2026-03-01T15:00:00') };
        expect(certificateValidOn(suspended, bkk('2026-02-28T12:00:00'))).toBe(true);
        expect(certificateValidOn(suspended, bkk('2026-09-01T12:00:00'))).toBe(false);
    });

    test('earlier suspension windows passed in are counted too', () => {
        const twice = {
            ...inForce,
            suspendedAt: bkk('2026-03-01T15:00:00'),
            reinstatedAt: bkk('2026-03-10T09:00:00'),
            suspensions: [{ from: bkk('2026-02-01T10:00:00'), to: bkk('2026-02-05T10:00:00') }],
        };
        expect(certificateValidOn(twice, bkk('2026-02-03T12:00:00'))).toBe(false);
        expect(certificateValidOn(twice, bkk('2026-02-06T12:00:00'))).toBe(true);
    });

    test('an unknown status, a missing date or a missing term is never in force', () => {
        expect(certificateValidOn({ ...inForce, status: 'pending' }, bkk('2026-06-01T12:00:00'))).toBe(false);
        expect(certificateValidOn(inForce, null)).toBe(false);
        expect(certificateValidOn(inForce, new Date('not a date'))).toBe(false);
        expect(certificateValidOn({ ...inForce, issuedDate: null }, bkk('2026-06-01T12:00:00'))).toBe(false);
        expect(certificateValidOn(null, bkk('2026-06-01T12:00:00'))).toBe(false);
    });
});

describe('certificateInForceOn: reads the suspension history only for a certificate that was ever suspended', () => {
    beforeEach(() => auditTrail.certificateSuspensionEvents.mockReset());

    test('a never-suspended certificate reads nothing', async () => {
        expect(await certificateInForceOn(inForce, bkk('2026-06-01T12:00:00'))).toBe(true);
        expect(auditTrail.certificateSuspensionEvents).not.toHaveBeenCalled();
    });

    test('an earlier suspension recorded only in the audit trail takes the lot out of force', async () => {
        auditTrail.certificateSuspensionEvents.mockResolvedValue([
            { action: 'CERTIFICATE_SUSPENDED', createdAt: bkk('2026-02-01T10:00:00') },
            { action: 'CERTIFICATE_REINSTATED', createdAt: bkk('2026-02-05T10:00:00') },
            { action: 'CERTIFICATE_SUSPENDED', createdAt: bkk('2026-03-01T15:00:00') },
            { action: 'CERTIFICATE_REINSTATED', createdAt: bkk('2026-03-10T09:00:00') },
        ]);
        const cert = { ...inForce, suspendedAt: bkk('2026-03-01T15:00:00'), reinstatedAt: bkk('2026-03-10T09:00:00') };
        expect(await certificateInForceOn(cert, bkk('2026-02-03T12:00:00'))).toBe(false);
        expect(await certificateInForceOn(cert, bkk('2026-02-20T12:00:00'))).toBe(true);
        expect(auditTrail.certificateSuspensionEvents).toHaveBeenCalledWith('c1');
    });
});
