'use strict';

/**
 * Columns of User and of the personal INDIVIDUAL Entity that keep their value when an account is
 * anonymized (retention sweep or confirmed erasure), each with the reason it identifies no one or
 * must stay. Every other column of either model must be written by the anonymization.
 * __tests__/unit/account-anonymization-covers-every-column.test.js enforces this against the
 * Prisma schema, so a new column fails until it is decided here or in the routine.
 */

const KEPT_USER_COLUMNS = Object.freeze({
    id: 'primary key: a random UUID that applications, invoices, memberships and audit rows point at; derived from nothing about the person',
    uuid: 'random UUID, derived from nothing about the person',
    createdAt: 'when the account was opened; §7 item 1 counts the 5 years from it; a date identifies no one',
    updatedAt: 'maintained by Prisma on every write',
    accountType: 'category HEALTH / PROVIDER / INDIVIDUAL',
    entityType: 'category, deprecated column',
    role: 'category; which side of the platform the account was on',
    status: 'account state value',
    accountTier: 'category',
    ministryVerified: 'yes/no flag',
    ministryVerifiedAt: 'a date',
    isEmailVerified: 'yes/no flag',
    lastLoginAt: 'a date',
    loginAttempts: 'a counter',
    isLocked: 'yes/no flag',
    lockedUntil: 'a date',
    createdBy: 'the id of the account that created this one (an account id, not a personal value)',
    updatedBy: 'an account id, not a personal value',
    isDeleted: 'state marker; the erasure door sets it, the sweep leaves it as found',
    deletedAt: 'a date',
    deletedBy: 'an account id',
    retainUntil: 'retention control; the sweep must never write it (legal-hold rule, jobs/pdpa-retention-job.js)',
    legalHold: 'retention control; only a person clears a hold',
    notificationSettings: 'per-notice-type on/off booleans (services/notification-preferences-service.js); no contact data',
    twoFactorMethod: 'method name TOTP',
    organizationId: 'tenancy key of the organization',
});

const KEPT_ENTITY_COLUMNS = Object.freeze({
    id: 'primary key: random UUID that applications and farms point at',
    uuid: 'random UUID',
    createdAt: 'a date',
    updatedAt: 'maintained by Prisma',
    type: 'category INDIVIDUAL',
    identitySource: 'category THAID / MORPROM / SELF_DECLARED: which kind of login vouched for the record; the record itself (payload, national ID) is cleared',
    identityVerifiedAt: 'a date',
    status: 'state value',
    isDeleted: 'state marker',
    deletedAt: 'a date',
    deletedBy: 'an account id',
    createdBy: 'the account id of the person the entity was made for',
    organizationId: 'tenancy key of the organization',
});

module.exports = { KEPT_USER_COLUMNS, KEPT_ENTITY_COLUMNS };
