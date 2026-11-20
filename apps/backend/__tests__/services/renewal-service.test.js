/**
 * renewal-service unit tests — Iter 26 (2026-05-16).
 *
 * Verifies the renewal contract end-to-end with an in-memory prisma
 * stub (no real DB needed):
 *   - getApplicationsForRenewalReminder: per-tier catch-up window, Bangkok days
 *   - markRenewalReminderSent: idempotency on (certId, reminderType)
 *   - listUpcomingExpiry: delegates to certificate-service
 */

'use strict';

const path = require('path');

// --- Mock collaborators ----------------------------------------------------

const mockCertificateService = {
    listExpiringActiveCertificates: jest.fn(async () => []),
};
jest.mock('../../services/certificate-service', () => mockCertificateService);

jest.mock('../../shared/logger', () => {
    // F-G4-64 fix round 1: the renewal door now routes issuance through
    // services/quotation-issuance-on-submit, which calls createLogger at module
    // load. A logger stub without it throws 'createLogger is not a function'
    // the moment that require runs.
    const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...l, createLogger: () => l, stream: { write: jest.fn() } };
});

// prisma-database is consulted lazily; we inject prisma explicitly via the
// service args so the lazy require path can stay tolerant.
jest.mock('../../services/prisma-database', () => ({ prisma: null }));

// The submit guard's answer for the case under test (null = allowed).
const mockSubmitRefusal = { current: null };

const servicePath = path.resolve(__dirname, '../../services/renewal-service.js');
function loadService() {
    jest.resetModules();
    jest.doMock('../../services/certificate-service', () => mockCertificateService);
    jest.doMock('../../services/prisma-database', () => ({ prisma: null }));
    // The holder-capability gate (operator ruling 2026-10-03) reads memberships on
    // the real client; this stub-prisma suite is not about who may renew. The gate
    // is proven on a real Postgres in
    // __tests__/integration/renewal-requires-submit-capability-real-postgres.test.js.
    jest.doMock('../../services/application-submit-guard', () => ({
        // One renewal per certificate (RENEWAL_ALREADY_IN_PROGRESS): none in flight here.
        findInFlightSuccession: async () => null,
        lockCertificateSuccessions: async () => {},
        RENEWAL_ALREADY_IN_PROGRESS: 'RENEWAL_ALREADY_IN_PROGRESS',
        assertSubmitAllowed: async ({ application }) => {
            if (mockSubmitRefusal.current) { throw mockSubmitRefusal.current; }
            return { entityId: application.entityId };
        },
        recordSubmitDenial: async () => {},
    }));
    jest.doMock('../../services/holder-access', () => ({
        holderReadWhereIfScoped: () => ({}),
    }));
    jest.doMock('../../shared/logger', () => {
        const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
        return { ...l, createLogger: () => l, stream: { write: jest.fn() } };
    });
    return require(servicePath);
}

// --- Prisma stub factory ---------------------------------------------------

function makePrismaStub(seed = {}) {
    const certificates = new Map(Object.entries(seed.certificates || {}));
    const applications = new Map(Object.entries(seed.applications || {}));

    const stub = {
        // The renewal is filed by the acting user (operator ruling 2026-10-03).
        user: { findUnique: jest.fn(async ({ where }) => ({ canonicalId: `canon-${where.id}` })) },
        certificate: {
            findFirst: jest.fn(async ({ where }) => {
                for (const cert of certificates.values()) {
                    if (cert.id !== where.id) {continue;}
                    if (where.isDeleted === false && cert.isDeleted) {continue;}
                    // The certificate's own application relation carries the holder.
                    return { ...cert, application: { entityId: applications.get(cert.applicationId)?.entityId ?? null } };
                }
                return null;
            }),
            findMany: jest.fn(async ({ where, take }) => {
                const out = [];
                for (const cert of certificates.values()) {
                    if (where.isDeleted === false && cert.isDeleted) {continue;}
                    if (where.status && cert.status !== where.status) {continue;}
                    if (where.expiryDate) {
                        const ts = cert.expiryDate ? new Date(cert.expiryDate).getTime() : null;
                        if (where.expiryDate.gte && ts < new Date(where.expiryDate.gte).getTime()) {continue;}
                        if (where.expiryDate.lt && ts >= new Date(where.expiryDate.lt).getTime()) {continue;}
                    }
                    out.push(cert);
                }
                return out.slice(0, take || out.length);
            }),
            update: jest.fn(async ({ where, data }) => {
                const cur = certificates.get(where.id);
                if (!cur) {throw new Error(`Certificate ${where.id} not found`);}
                const next = { ...cur, ...data };
                certificates.set(where.id, next);
                return next;
            }),
        },
        application: {
            findFirst: jest.fn(async ({ where }) => {
                const cur = applications.get(where.id);
                if (!cur) {return null;}
                if (where.isDeleted === false && cur.isDeleted) {return null;}
                return cur;
            }),
            create: jest.fn(async ({ data }) => {
                const id = data.id || `app-${applications.size + 1}`;
                const row = { id, isDeleted: false, ...data };
                applications.set(id, row);
                return row;
            }),
            update: jest.fn(async ({ where, data }) => {
                const cur = applications.get(where.id);
                if (!cur) {throw new Error(`Application ${where.id} not found`);}
                const next = { ...cur, ...data };
                applications.set(where.id, next);
                return next;
            }),
        },
    };
    return { stub, certificates, applications };
}

// --- Seed helpers ----------------------------------------------------------

const HOLDER_SCOPE = Object.freeze({ userId: 'user-1', readIds: ['entity-1'], editIds: ['entity-1'] }); // R2 Task 8 fix round 1

function seedCertificate(partial = {}) {
    return {
        id: 'cert-1',
        userId: 'user-1',
        applicationId: 'app-1',
        status: 'active',
        isDeleted: false,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        certificateNumber: 'GACP-TH-2569-ABC123',
        farmName: 'Wonderful Herb Farm',
        farmId: 'farm-1',
        organizationId: 'org-1',
        renewedCertificateId: null,
        previousCertificateId: null,
        // R2 Task 8 fix round 1: the holder, read through the certificate's relation.
        application: { entityId: 'entity-1' },
        ...partial,
    };
}

function seedApplication(partial = {}) {
    return {
        id: 'app-1',
        healthId: 'user-1',
        entityId: 'entity-1',
        organizationId: 'org-1',
        areaType: 'OUTDOOR',
        applicationNumber: 'GACP-2026-001',
        isDeleted: false,
        formData: {
            farmData: { farmName: 'Wonderful Herb Farm' },
            locationData: { province: 'Chiang Mai' },
            plantName: 'กระชาย',
            cultivation_methods: ['ORGANIC'],
            plots: [{ name: 'Plot A', areaSize: 5, areaUnit: 'rai' }],
        },
        ...partial,
    };
}

// --- Tests -----------------------------------------------------------------

describe('renewal-service', () => {
    let svc;

    beforeEach(() => {
        mockCertificateService.listExpiringActiveCertificates.mockClear();
        svc = loadService();
    });

    // ── getApplicationsForRenewalReminder ─────────────────────────────────

    describe('getApplicationsForRenewalReminder', () => {
        const now = new Date('2026-05-16T03:00:00.000Z');
        const { getZonedParts, startOfLocalCalendarDay } = require('../../utils/working-days');
        const bangkokMidnightInDays = (d) => {
            const { year, month, day } = getZonedParts(now);
            return startOfLocalCalendarDay(year, month, day + d);
        };
        const expiring = (d, partial = {}) => seedCertificate({ id: `c-${d}`, userId: `u-${d}`, applicationId: `app-${d}`, expiryDate: bangkokMidnightInDays(d), ...partial });

        function buildExpiringSeed() {
            return {
                certificates: Object.fromEntries([
                    expiring(60), expiring(45), expiring(31), expiring(30), expiring(16), expiring(15), expiring(14), expiring(1),
                    expiring(0), expiring(-1),
                    expiring(45, { id: 'c-revoked-45', status: 'revoked' }),
                    expiring(45, { id: 'c-deleted-45', isDeleted: true }),
                ].map((c) => [c.id, c])),
            };
        }

        const select = async (days, stub) => (await svc.getApplicationsForRenewalReminder({ daysBeforeExpiry: days, now, prisma: stub }))
            .sort((a, b) => a.daysLeft - b.daysLeft).map((r) => `${r.id}:${r.daysLeft}`);

        test('a tier covers every day from the next shorter tier (exclusive) up to its own day, so a missed run still sends it', async () => {
            const { stub } = makePrismaStub(buildExpiringSeed());

            expect(await select(60, stub)).toEqual(['c-31:31', 'c-45:45', 'c-60:60']);
            expect(await select(30, stub)).toEqual(['c-16:16', 'c-30:30']);
            expect(await select(15, stub)).toEqual(['c-1:1', 'c-14:14', 'c-15:15']);
        });

        test('a certificate that expires today or already expired, a revoked one and a soft-deleted one are never selected', async () => {
            const { stub } = makePrismaStub(buildExpiringSeed());

            const all = [...await select(60, stub), ...await select(30, stub), ...await select(15, stub)].map((s) => s.split(':')[0]);
            expect(all).not.toEqual(expect.arrayContaining(['c-0']));
            expect(all).not.toEqual(expect.arrayContaining(['c--1']));
            expect(all).not.toEqual(expect.arrayContaining(['c-revoked-45']));
            expect(all).not.toEqual(expect.arrayContaining(['c-deleted-45']));
        });

        test('daysLeft counts Bangkok calendar days: 00:30 Bangkok is already the next day', async () => {
            const lateEvening = new Date('2026-05-15T17:30:00.000Z');
            const { stub } = makePrismaStub({ certificates: { 'c-30': expiring(30) } });

            const [row] = await svc.getApplicationsForRenewalReminder({ daysBeforeExpiry: 30, now: lateEvening, prisma: stub });
            expect(row).toMatchObject({ id: 'c-30', daysLeft: 30 });
        });

        test('rejects a day count that is not a tier', async () => {
            const { stub } = makePrismaStub();
            for (const daysBeforeExpiry of [-5, 'foo', 45]) {
                await expect(svc.getApplicationsForRenewalReminder({ daysBeforeExpiry, prisma: stub }))
                    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
            }
        });
    });

    // ── markRenewalReminderSent ───────────────────────────────────────────

    describe('markRenewalReminderSent', () => {
        test('writes a new reminder entry on first call', async () => {
            const cert = seedCertificate();
            const app = seedApplication();
            const { stub, applications } = makePrismaStub({
                certificates: { [cert.id]: cert },
                applications: { [app.id]: app },
            });

            const out = await svc.markRenewalReminderSent({
                certificateId: cert.id,
                reminderType: 'D60',
                dispatchId: 'fanout-key-1',
                holderScope: HOLDER_SCOPE,
                prisma: stub,
            });
            expect(out.alreadySent).toBe(false);
            expect(out.reminderType).toBe('D60');
            expect(out.applicationId).toBe(app.id);

            const updated = applications.get(app.id);
            expect(updated.formData.renewalReminders).toHaveLength(1);
            expect(updated.formData.renewalReminders[0]).toMatchObject({
                type: 'D60',
                certId: cert.id,
                dispatchId: 'fanout-key-1',
            });
        });

        test('is idempotent on (certId, reminderType)', async () => {
            const cert = seedCertificate();
            const app = seedApplication();
            const { stub, applications } = makePrismaStub({
                certificates: { [cert.id]: cert },
                applications: { [app.id]: app },
            });

            const first = await svc.markRenewalReminderSent({
                certificateId: cert.id,
                reminderType: 'D30',
                holderScope: HOLDER_SCOPE,
                prisma: stub,
            });
            expect(first.alreadySent).toBe(false);

            const second = await svc.markRenewalReminderSent({
                certificateId: cert.id,
                reminderType: 'D30',
                holderScope: HOLDER_SCOPE,
                prisma: stub,
            });
            expect(second.alreadySent).toBe(true);
            expect(second.sentAt).toBe(first.sentAt);

            const updated = applications.get(app.id);
            // The second call must NOT add another entry.
            expect(updated.formData.renewalReminders).toHaveLength(1);
        });

        test('different reminderTypes for same cert stack independently', async () => {
            const cert = seedCertificate();
            const app = seedApplication();
            const { stub, applications } = makePrismaStub({
                certificates: { [cert.id]: cert },
                applications: { [app.id]: app },
            });

            await svc.markRenewalReminderSent({ certificateId: cert.id, reminderType: 'D60', prisma: stub });
            await svc.markRenewalReminderSent({ certificateId: cert.id, reminderType: 'D30', prisma: stub });
            await svc.markRenewalReminderSent({ certificateId: cert.id, reminderType: 'D15', prisma: stub });

            const updated = applications.get(app.id);
            const types = updated.formData.renewalReminders.map((r) => r.type).sort();
            expect(types).toEqual(['D15', 'D30', 'D60']);
        });

        test('rejects unknown reminderType', async () => {
            const cert = seedCertificate();
            const app = seedApplication();
            const { stub } = makePrismaStub({
                certificates: { [cert.id]: cert },
                applications: { [app.id]: app },
            });
            await expect(svc.markRenewalReminderSent({
                certificateId: cert.id,
                reminderType: 'D7',
                holderScope: HOLDER_SCOPE,
                prisma: stub,
            })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        });

        test('rejects when certificate is missing', async () => {
            const { stub } = makePrismaStub();
            await expect(svc.markRenewalReminderSent({
                certificateId: 'cert-missing',
                reminderType: 'D60',
                holderScope: HOLDER_SCOPE,
                prisma: stub,
            })).rejects.toMatchObject({ code: 'CERT_NOT_FOUND' });
        });
    });

    // ── hasRenewalReminderBeenSent ────────────────────────────────────────

    describe('hasRenewalReminderBeenSent', () => {
        test('answers from the ledger without writing: false before the mark, true for that tier after it', async () => {
            const cert = seedCertificate();
            const app = seedApplication();
            const { stub } = makePrismaStub({
                certificates: { [cert.id]: cert },
                applications: { [app.id]: app },
            });

            await expect(svc.hasRenewalReminderBeenSent({ certificateId: cert.id, reminderType: 'D30', prisma: stub })).resolves.toBe(false);
            expect(stub.application.update).not.toHaveBeenCalled();

            await svc.markRenewalReminderSent({ certificateId: cert.id, reminderType: 'D30', holderScope: HOLDER_SCOPE, prisma: stub });
            stub.application.update.mockClear();

            await expect(svc.hasRenewalReminderBeenSent({ certificateId: cert.id, reminderType: 'D30', prisma: stub })).resolves.toBe(true);
            await expect(svc.hasRenewalReminderBeenSent({ certificateId: cert.id, reminderType: 'D15', prisma: stub })).resolves.toBe(false);
            expect(stub.application.update).not.toHaveBeenCalled();
        });

        test('rejects an unknown tier and a missing certificate the same way the mark does', async () => {
            const cert = seedCertificate();
            const app = seedApplication();
            const { stub } = makePrismaStub({
                certificates: { [cert.id]: cert },
                applications: { [app.id]: app },
            });
            await expect(svc.hasRenewalReminderBeenSent({ certificateId: cert.id, reminderType: 'D7', prisma: stub }))
                .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
            await expect(svc.hasRenewalReminderBeenSent({ certificateId: 'cert-missing', reminderType: 'D60', prisma: stub }))
                .rejects.toMatchObject({ code: 'CERT_NOT_FOUND' });
        });
    });

    // ── listUpcomingExpiry ────────────────────────────────────────────────

    describe('listUpcomingExpiry', () => {
        test('delegates to certificate-service.listExpiringActiveCertificates', async () => {
            mockCertificateService.listExpiringActiveCertificates.mockResolvedValueOnce([
                { id: 'c-1', certificateNumber: 'GACP-TH-2569-AAA111' },
            ]);
            const result = await svc.listUpcomingExpiry({ days: 30, take: 50 });
            expect(result).toEqual([{ id: 'c-1', certificateNumber: 'GACP-TH-2569-AAA111' }]);
            expect(mockCertificateService.listExpiringActiveCertificates).toHaveBeenCalledTimes(1);
            const args = mockCertificateService.listExpiringActiveCertificates.mock.calls[0][0];
            expect(args.take).toBe(50);
            expect(args.now).toBeInstanceOf(Date);
            expect(args.cutoff).toBeInstanceOf(Date);
            const diffMs = args.cutoff.getTime() - args.now.getTime();
            // 30 days ± 1ms wiggle for setDate semantics across month boundaries
            expect(diffMs).toBeGreaterThan(29.5 * 24 * 60 * 60 * 1000);
            expect(diffMs).toBeLessThan(30.5 * 24 * 60 * 60 * 1000);
        });
    });

    // ── REMINDER_DAYS public constant ────────────────────────────────────

    describe('exposed constants', () => {
        test('REMINDER_DAYS is [60, 30, 15]', () => {
            expect(svc.REMINDER_DAYS).toEqual([60, 30, 15]);
        });
        test('REMINDER_TYPE_BY_DAYS maps each tier', () => {
            expect(svc.REMINDER_TYPE_BY_DAYS[60]).toBe('D60');
            expect(svc.REMINDER_TYPE_BY_DAYS[30]).toBe('D30');
            expect(svc.REMINDER_TYPE_BY_DAYS[15]).toBe('D15');
        });
    });
});
