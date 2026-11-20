'use strict';

/**
 * Login identity → the account's own INDIVIDUAL holder (order 142, layer a).
 *
 * A verified login (ThaiD; หมอพร้อม once its citizen door exists) says who the person is.
 * When its national ID is the ID of the account's personal holder, the holder takes the
 * name, title and address from the claims, becomes THAID or MORPROM, and those fields lock.
 * A different ID changes nothing: the claims describe someone else, and the account's
 * holder stays exactly as typed.
 */

const crypto = require('crypto');
const { prisma } = require('./prisma-database');
const { computeLookupHmac } = require('../utils/field-encryption');
const { withoutTenantScope } = require('./tenant-context');
const { VERIFIED_IDENTITY_SOURCES } = require('../shared/holder-registry');
const logger = require('../shared/logger');

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** OIDC `address` is an object with `formatted`; DOPA may also answer a plain string. */
function addressOf(claim) {
    if (typeof claim === 'string') { return claim.trim(); }
    if (claim && typeof claim === 'object') { return text(claim.formatted); }
    return '';
}

/**
 * @param {{ userId: string, source: 'THAID'|'MORPROM', claims: { pid?: string, title?: string,
 *   given_name?: string, family_name?: string, address?: string|{formatted?: string} } }} args
 * @returns {Promise<{ upgraded: boolean, entityId?: string }>}
 */
async function upgradeHolderFromVerifiedLogin({ userId, source, claims }) {
    if (!VERIFIED_IDENTITY_SOURCES.includes(source)) {
        throw new TypeError(`upgradeHolderFromVerifiedLogin: ${source} is not a verified identity source`);
    }
    const pid = text(claims?.pid);
    if (!userId || !/^\d{13}$/.test(pid)) { return { upgraded: false }; }

    const membership = await withoutTenantScope(() => prisma.entityMembership.findFirst({
        where: {
            userId,
            role: 'OWNER',
            status: 'ACTIVE',
            entity: {
                type: 'INDIVIDUAL',
                isDeleted: false,
                // The keyed HMAC where it is backfilled, the legacy SHA-256 where it is not.
                OR: [
                    { thaiCitizenIdHmac: computeLookupHmac(pid) },
                    { thaiCitizenIdHash: crypto.createHash('sha256').update(pid).digest('hex') },
                ],
            },
        },
        select: { entity: true },
        orderBy: { createdAt: 'asc' },
    }));
    const entity = membership?.entity;
    if (!entity) { return { upgraded: false }; }

    const payload = entity.payload && typeof entity.payload === 'object' ? entity.payload : {};
    const stored = payload.holder && typeof payload.holder === 'object' ? payload.holder : {};
    const person = {
        title: text(claims.title) || text(stored.person?.title),
        firstName: text(claims.given_name) || text(stored.person?.firstName),
        lastName: text(claims.family_name) || text(stored.person?.lastName),
        // ThaiD issues to Thai citizens only; its claims carry no nationality field.
        nationality: 'ไทย',
    };
    const contact = {
        address: addressOf(claims.address) || text(stored.contact?.address),
        phone: text(stored.contact?.phone),
        email: text(stored.contact?.email),
    };
    const displayName = [person.firstName, person.lastName].filter(Boolean).join(' ') || entity.displayName;

    await withoutTenantScope(() => prisma.$transaction([
        prisma.entity.update({
            where: { id: entity.id },
            data: {
                identitySource: source,
                identityVerifiedAt: new Date(),
                displayName,
                payload: { ...payload, holder: { ...stored, person, contact } },
            },
        }),
        prisma.user.update({
            where: { id: userId },
            data: { firstName: person.firstName || undefined, lastName: person.lastName || undefined },
        }),
    ]));
    logger.info('[holder-identity] personal holder verified by login', { entityId: entity.id, source });
    return { upgraded: true, entityId: entity.id };
}

module.exports = { upgradeHolderFromVerifiedLogin };
