'use strict';

const { ERROR_CODES } = require('../../shared/error-codes');
const { plotAreaType } = require('../planting-area-type-gate');
const { asAreaWord } = require('../../validation/canonical-application-validator');

const STATUS_RENEWED = 'renewed';
const RENEWABLE_STATUSES = Object.freeze(new Set(['active', 'expired']));
const CLOSED_CYCLE_STATUSES = Object.freeze(['HARVESTED', 'COMPLETED']);

function makeError(code) {
    const { messageTh, httpStatus } = ERROR_CODES[code];
    return Object.assign(new Error(messageTh), { code, statusCode: httpStatus });
}

async function assertRenewable(client, { oldCertificateId, holderEntityId }) {
    const old = await client.certificate.findFirst({
        where: { id: oldCertificateId, isDeleted: false },
        select: { id: true, status: true, renewedCertificateId: true, application: { select: { entityId: true } } },
    });
    if (!old) { throw makeError('RENEWAL_SOURCE_NOT_IN_FORCE'); }
    const holder = old.application?.entityId || null;
    if (!holder || holder !== holderEntityId) { throw makeError('RENEWAL_SOURCE_HOLDER_MISMATCH'); }
    const status = String(old.status || '').toLowerCase();
    if (status === STATUS_RENEWED || old.renewedCertificateId) { throw makeError('RENEWAL_SOURCE_ALREADY_RENEWED'); }
    if (!RENEWABLE_STATUSES.has(status)) { throw makeError('RENEWAL_SOURCE_NOT_IN_FORCE'); }
    return { id: old.id, status: old.status };
}

/**
 * A renewal certifies the same farm as the certificate it renews: the farm of
 * `formData.renewalOf`, when that certificate belongs to this holder. Null for any other filing.
 */
async function renewedFarmId(client, { formData, holderEntityId, holderScope = null }) {
    const oldCertificateId = formData?.renewalOf;
    if (!oldCertificateId || !holderEntityId) { return null; }
    const { holderReadWhereIfScoped } = require('../holder-access');
    const old = await client.certificate.findFirst({
        where: {
            id: oldCertificateId,
            isDeleted: false,
            application: { entityId: holderEntityId },
            ...holderReadWhereIfScoped(holderScope, 'Certificate'),
        },
        select: { farmId: true },
    });
    return old?.farmId || null;
}

async function supersede(client, { oldCertificateId, newCertificateId, holderEntityId }) {
    const old = await assertRenewable(client, { oldCertificateId, holderEntityId });
    const { count } = await client.certificate.updateMany({
        where: { id: old.id, status: old.status, renewedCertificateId: null },
        data: { status: STATUS_RENEWED, renewedCertificateId: newCertificateId },
    });
    if (count !== 1) {
        await assertRenewable(client, { oldCertificateId, holderEntityId });
        throw makeError('RENEWAL_SOURCE_ALREADY_RENEWED');
    }
    await client.certificate.update({
        where: { id: newCertificateId },
        data: { previousCertificateId: old.id },
    });
    await moveOpenCycles(client, { fromCertificateId: old.id, toCertificateId: newCertificateId });
}

/** The open cycles of `fromCertificateId` whose every plot lies inside the renewal's active scope. */
async function movableOpenCycles(client, { fromCertificateId, toCertificateId }) {
    const successor = await client.certificate.findUnique({
        where: { id: toCertificateId },
        select: { scopes: { where: { status: 'active' }, select: { areaType: true } } },
    });
    const granted = new Set(successor.scopes.map((row) => asAreaWord(row.areaType)));
    const inScope = (plot) => !plot || granted.size === 0 || plotAreaType(plot) === '' || granted.has(plotAreaType(plot));
    const cycles = await client.plantingCycle.findMany({
        where: {
            certificateId: fromCertificateId,
            isDeleted: false,
            status: { notIn: CLOSED_CYCLE_STATUSES },
        },
        select: {
            id: true,
            plot: { select: { solarSystem: true } },
            cyclePlots: { select: { plot: { select: { solarSystem: true } } } },
        },
    });
    return cycles
        .filter((cycle) => inScope(cycle.plot) && cycle.cyclePlots.every((row) => inScope(row.plot)))
        .map((cycle) => cycle.id);
}

async function moveOpenCycles(client, { fromCertificateId, toCertificateId }) {
    const movable = await movableOpenCycles(client, { fromCertificateId, toCertificateId });
    await client.plantingCycle.updateMany({
        where: { id: { in: movable }, certificateId: fromCertificateId },
        data: { certificateId: toCertificateId },
    });
}

module.exports = { assertRenewable, movableOpenCycles, renewedFarmId, supersede };
