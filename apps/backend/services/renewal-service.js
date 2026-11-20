/**
 * Renewal Service — the certificate side of a renewal.
 *
 * A renewal is FILED through the wizard like any application (requestType RENEWAL, checked
 * by services/application-law-dimensions.js) and walks the document check before it is
 * priced (operator order 25(11), 2026-10-06: a renewal does not skip document review — a
 * short check of the licences, the land right and a statement of what changed). The old
 * POST /api/applications/renewals door, which created a priced application at
 * PENDING_AUDIT_FEE the moment the renewal page opened, is gone.
 *
 * What stays here:
 *   - the reminder cadence (60 / 30 / 15 days before expiry): getApplicationsForRenewalReminder
 *     (read) + markRenewalReminderSent (idempotent write, stored on the owning application's
 *     formData.renewalReminders[]); the cron is apps/backend/cron/renewal-reminder-cron.js;
 *   - supersession of the old certificate when its renewal is certified;
 *   - the provider listing of certificates approaching expiry.
 *
 * @module services/renewal-service
 */

'use strict';

const logger = require('../shared/logger');

let prismaModule;
try {
    prismaModule = require('./prisma-database');
} catch (_e) {
    prismaModule = { prisma: null };
}

const certificateService = require('./certificate-service');
const { getZonedParts, startOfLocalCalendarDay, startOfLocalDay } = require('../utils/working-days');

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Reminder cadence — 60 / 30 / 15 days before expiry. The cron evaluates
 * each tier daily and skips already-sent tiers (idempotent).
 */
const REMINDER_DAYS = Object.freeze([60, 30, 15]);

/** Each tier reaches down to the next shorter tier, so a missed day is caught up once. */
const REMINDER_WINDOW_FLOOR_BY_DAYS = Object.freeze(
    Object.fromEntries(REMINDER_DAYS.map((days, i) => [days, REMINDER_DAYS[i + 1] ?? 0])),
);

const DAY_MS = 24 * 60 * 60 * 1000;

const REMINDER_TYPES = Object.freeze({
    D60: 'D60',
    D30: 'D30',
    D15: 'D15',
});

const REMINDER_TYPE_BY_DAYS = Object.freeze({
    60: REMINDER_TYPES.D60,
    30: REMINDER_TYPES.D30,
    15: REMINDER_TYPES.D15,
});

/**
 * Certificate status values per certification.prisma comment on line 47:
 *   active, expired, revoked, renewed
 * "renewed" is the supersession marker we set when a new cert takes over.
 */
const CERT_STATUS = Object.freeze({
    ACTIVE: 'active',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
    RENEWED: 'renewed', // = SUPERSEDED in business language
});

// ── Errors ─────────────────────────────────────────────────────────────────

function makeError(code, message, statusCode = 400, extra) {
    const err = new Error(message);
    err.code = code;
    err.statusCode = statusCode;
    if (extra) {err.data = extra;}
    return err;
}

function resolvePrisma(injected) {
    if (injected) {return injected;}
    return prismaModule && prismaModule.prisma ? prismaModule.prisma : null;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

function _safeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {return {};}
    return value;
}

function _safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function _expiryWindow(now, daysBeforeExpiry) {
    const { year, month, day } = getZonedParts(now);
    const floor = REMINDER_WINDOW_FLOOR_BY_DAYS[daysBeforeExpiry];
    return {
        start: startOfLocalCalendarDay(year, month, day + floor + 1),
        end: startOfLocalCalendarDay(year, month, day + daysBeforeExpiry + 1),
    };
}

function _bangkokDaysUntil(now, expiryDate) {
    return (startOfLocalDay(expiryDate).getTime() - startOfLocalDay(now).getTime()) / DAY_MS;
}

/**
 * @param {object} args
 * @param {number} args.daysBeforeExpiry  — 60 / 30 / 15
 * @param {Date}   [args.now]             — clock injection (tests)
 * @param {number} [args.take]            — cap, default 500
 * @param {object} [args.prisma]
 * @returns {Promise<Array<{ id: string, userId: string, applicationId: string, certificateNumber: string,
 *   farmName: string, expiryDate: Date, daysLeft: number }>>} daysLeft in Bangkok calendar days
 */
async function getApplicationsForRenewalReminder({ daysBeforeExpiry, now, take = 500, prisma: injectedPrisma } = {}) {
    const days = Number.parseInt(daysBeforeExpiry, 10);
    if (!(days in REMINDER_WINDOW_FLOOR_BY_DAYS)) {
        throw makeError('VALIDATION_ERROR', `daysBeforeExpiry must be one of ${REMINDER_DAYS.join(' / ')}`);
    }

    const prisma = resolvePrisma(injectedPrisma);
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }

    const clock = now instanceof Date ? now : new Date();
    const { start, end } = _expiryWindow(clock, days);

    const rows = await prisma.certificate.findMany({
        where: {
            isDeleted: false,
            status: CERT_STATUS.ACTIVE,
            expiryDate: { gte: start, lt: end },
        },
        select: {
            id: true,
            userId: true,
            applicationId: true,
            certificateNumber: true,
            farmName: true,
            expiryDate: true,
        },
        orderBy: { expiryDate: 'asc' },
        take,
    });

    return rows.map((row) => ({ ...row, daysLeft: _bangkokDaysUntil(clock, row.expiryDate) }));
}

function _normaliseReminderType(reminderType) {
    const normalisedType = String(reminderType || '').toUpperCase();
    if (!REMINDER_TYPES[normalisedType]) {
        throw makeError(
            'VALIDATION_ERROR',
            `Invalid reminderType "${reminderType}". Expected one of D60 / D30 / D15.`,
        );
    }
    return normalisedType;
}

async function _reminderLedger({ certificateId, prisma: injectedPrisma }) {
    if (!certificateId) {
        throw makeError('VALIDATION_ERROR', 'certificateId is required');
    }
    const prisma = resolvePrisma(injectedPrisma);
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }

    const cert = await prisma.certificate.findFirst({
        where: { id: certificateId, isDeleted: false },
        select: { id: true, applicationId: true },
    });
    if (!cert) {
        throw makeError('CERT_NOT_FOUND', 'Certificate not found', 404);
    }

    const app = await prisma.application.findFirst({
        where: { id: cert.applicationId, isDeleted: false },
        select: { id: true, formData: true },
    });
    if (!app) {
        throw makeError('SOURCE_APP_NOT_FOUND', 'Application for certificate not found', 500);
    }

    const formData = _safeObject(app.formData);
    return { app, formData, existing: _safeArray(formData.renewalReminders) };
}

const _findReminder = (existing, normalisedType, certificateId) => existing.find(
    (row) => row && row.type === normalisedType && row.certId === certificateId,
);

/** Read-only: has this tier's reminder been recorded for the certificate? */
async function hasRenewalReminderBeenSent({ certificateId, reminderType, prisma } = {}) {
    const normalisedType = _normaliseReminderType(reminderType);
    const { existing } = await _reminderLedger({ certificateId, prisma });
    return Boolean(_findReminder(existing, normalisedType, certificateId));
}

/**
 * Idempotent marker that records a reminder dispatch on the certificate's
 * owning Application. Subsequent calls with the same (certificateId,
 * reminderType) pair return `{ alreadySent: true }` without writing.
 *
 * @param {object} args
 * @param {string} args.certificateId
 * @param {'D60'|'D30'|'D15'} args.reminderType
 * @param {string} [args.dispatchId]     — fanout dedupeKey or messageId
 * @param {Date}   [args.sentAt]
 * @param {object} [args.prisma]
 * @returns {Promise<{ alreadySent: boolean, reminderType: string, applicationId: string }>}
 */
async function markRenewalReminderSent({
    certificateId,
    reminderType,
    dispatchId,
    sentAt,
    prisma: injectedPrisma,
} = {}) {
    const normalisedType = _normaliseReminderType(reminderType);
    const { app, formData, existing } = await _reminderLedger({ certificateId, prisma: injectedPrisma });
    const prisma = resolvePrisma(injectedPrisma);

    const alreadyMatch = _findReminder(existing, normalisedType, certificateId);
    if (alreadyMatch) {
        return {
            alreadySent: true,
            reminderType: normalisedType,
            applicationId: app.id,
            sentAt: alreadyMatch.sentAt,
        };
    }

    const sentAtIso = (sentAt instanceof Date ? sentAt : new Date()).toISOString();
    const nextEntry = {
        type: normalisedType,
        certId: certificateId,
        sentAt: sentAtIso,
        ...(dispatchId ? { dispatchId } : {}),
    };
    const nextReminders = [...existing, nextEntry];

    await prisma.application.update({
        where: { id: app.id },
        data: {
            formData: {
                ...formData,
                renewalReminders: nextReminders,
            },
        },
    });

    logger.info('[renewal-service] Renewal reminder marked', {
        certificateId,
        reminderType: normalisedType,
        applicationId: app.id,
        dispatchId: dispatchId || null,
    });

    return {
        alreadySent: false,
        reminderType: normalisedType,
        applicationId: app.id,
        sentAt: sentAtIso,
    };
}

/**
 * Provider-facing read: list certificates expiring inside a window.
 * Delegates to certificate-service.listExpiringActiveCertificates so the
 * "active + expiring" predicate stays single-sourced.
 *
 * @param {object} args
 * @param {number} [args.days]   — default 60
 * @param {number} [args.take]   — default 200
 * @returns {Promise<Array>}
 */
async function listUpcomingExpiry({ days = 60, take = 200 } = {}) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + Number.parseInt(days, 10) * 24 * 60 * 60 * 1000); // instant arithmetic
    return certificateService.listExpiringActiveCertificates({ now, cutoff, take });
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    REMINDER_DAYS,
    REMINDER_TYPES,
    REMINDER_TYPE_BY_DAYS,
    REMINDER_WINDOW_FLOOR_BY_DAYS,
    CERT_STATUS,
    getApplicationsForRenewalReminder,
    hasRenewalReminderBeenSent,
    markRenewalReminderSent,
    listUpcomingExpiry,
    // Pure helpers — exported for testability.
    _internals: {
        _expiryWindow,
        _safeObject,
        _safeArray,
    },
};
