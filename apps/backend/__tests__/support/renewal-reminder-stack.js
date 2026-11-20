'use strict';

const path = require('path');

const BACKEND = path.resolve(__dirname, '..', '..');

const member = ({ id, userId, entityId, role = 'OWNER', permissions = [], status = 'ACTIVE', user = {} }) => ({
    id, userId, entityId, role, permissions, status,
    user: { status: 'ACTIVE', isDeleted: false, role: 'health', ...user },
});

const applicant = (id, user = {}) => ({ id, status: 'ACTIVE', isDeleted: false, role: 'health', ...user });

function makeDb({ certificates = [], applications = [], memberships = [] } = {}) {
    const certs = new Map(certificates.map((c) => [c.id, { status: 'active', isDeleted: false, ...c }]));
    const apps = new Map(applications.map((a) => [a.id, { isDeleted: false, formData: {}, ...a }]));
    const inWindow = (cert, range) => {
        const ts = new Date(cert.expiryDate).getTime();
        return (!range.gte || ts >= range.gte.getTime()) && (!range.lt || ts < range.lt.getTime());
    };
    return {
        certificate: {
            findMany: jest.fn(async ({ where, take }) => [...certs.values()]
                .filter((c) => c.isDeleted === where.isDeleted && c.status === where.status && inWindow(c, where.expiryDate))
                .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
                .slice(0, take)),
            findFirst: jest.fn(async ({ where }) => {
                const cert = certs.get(where.id);
                return cert && !cert.isDeleted ? cert : null;
            }),
        },
        application: {
            findFirst: jest.fn(async ({ where }) => {
                const app = apps.get(where.id);
                return app && !app.isDeleted ? app : null;
            }),
            findUnique: jest.fn(async ({ where }) => {
                const app = apps.get(where.id);
                return app ? { entityId: app.entityId ?? null, applicant: app.applicant ?? null } : null;
            }),
            update: jest.fn(async ({ where, data }) => {
                const next = { ...apps.get(where.id), ...data };
                apps.set(where.id, next);
                return next;
            }),
        },
        entityMembership: {
            findMany: jest.fn(async ({ where }) => memberships
                .filter((m) => m.entityId === where.entityId && m.status === where.status)
                .map(({ id, userId, role, permissions, user }) => ({ id, userId, role, permissions, user }))),
        },
        entityMemberPermissionGrant: { findMany: jest.fn(async () => []) },
        reminders: (applicationId) => apps.get(applicationId).formData.renewalReminders || [],
    };
}

const delivered = async () => ({ dedupeKey: 'k', deduped: false, inApp: { ok: true, id: 'row-1' } });

/** @param {{ db: object, send?: Function }} opts */
function loadStack({ db, send = delivered }) {
    jest.resetModules();
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const logger = { ...log, createLogger: () => log, stream: { write: jest.fn() } };
    jest.doMock(path.join(BACKEND, 'shared/logger'), () => logger);
    jest.doMock(path.join(BACKEND, 'services/prisma-database'), () => ({ prisma: db }));
    jest.doMock(path.join(BACKEND, 'services/certificate-service'), () => ({ listExpiringActiveCertificates: jest.fn(async () => []) }));
    const { getTemplateForType, isOutcomeRetriable } = jest.requireActual(path.join(BACKEND, 'services/notification-fanout-service'));
    const fanout = { send: jest.fn(send), getTemplateForType, isOutcomeRetriable };
    jest.doMock(path.join(BACKEND, 'services/notification-fanout-service'), () => fanout);
    const cron = require(path.join(BACKEND, 'cron/renewal-reminder-cron'));
    return { run: cron.run, processTier: cron._internals._processTier, send: fanout.send, logger, db };
}

module.exports = { makeDb, loadStack, member, applicant };
