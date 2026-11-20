'use strict';

const { ERROR_CODES } = require('../../shared/error-codes');
const { startOfLocalDay } = require('../../utils/working-days');
const { certificateInForceOn, certificateProducedUnder } = require('./valid-on');

const DAY_MS = 24 * 60 * 60 * 1000;
const LATEST_BACKDATING_DAYS = 30;

function refusal(code) {
    const { httpStatus, messageTh } = ERROR_CODES[code];
    return { status: httpStatus, body: { success: false, code, message: messageTh } };
}

function harvestDateRefusal(harvestDate, plantingStart, now) {
    if (!Number.isFinite(harvestDate.getTime())) {
        return refusal('HARVEST_DATE_INVALID');
    }
    const day = startOfLocalDay(harvestDate).getTime();
    const today = startOfLocalDay(now).getTime();
    if (day > today) {
        return refusal('HARVEST_DATE_IN_FUTURE');
    }
    if (plantingStart && day < startOfLocalDay(new Date(plantingStart)).getTime()) {
        return refusal('HARVEST_DATE_BEFORE_PLANTING');
    }
    return null;
}

function daysSinceHarvest(harvestDate, now) {
    return Math.round((startOfLocalDay(now).getTime() - startOfLocalDay(harvestDate).getTime()) / DAY_MS);
}

async function certificateRefusal(certificate) {
    const status = String(certificate.status || '').toLowerCase();
    if (status === 'renewed') {
        return refusal('HARVEST_CERTIFICATE_RENEWED');
    }
    if (status !== 'active' || !(await certificateInForceOn(certificate, new Date()))) {
        return refusal('HARVEST_CERTIFICATE_NOT_IN_FORCE');
    }
    return null;
}

async function judgeHarvestRecord({ harvestDate, cycle = null, holderScope = null }) {
    const date = new Date(harvestDate);
    const dateRefusal = harvestDateRefusal(date, cycle?.startDate, new Date());
    if (dateRefusal) {
        return { refusal: dateRefusal };
    }
    const certificate = cycle?.certificate;
    if (!certificate) {
        return { refusal: null, recorded: { harvestDate: date, backdatedCertificateId: null } };
    }
    const statusRefusal = await certificateRefusal(certificate);
    if (statusRefusal) {
        return { refusal: statusRefusal };
    }
    const producedUnder = await certificateProducedUnder(certificate, date, holderScope);
    if (!producedUnder) {
        return { refusal: refusal('HARVEST_DATE_OUTSIDE_CERTIFICATE') };
    }
    const backdatedCertificateId = producedUnder.id === certificate.id ? null : producedUnder.id;
    if (backdatedCertificateId && daysSinceHarvest(date, new Date()) > LATEST_BACKDATING_DAYS) {
        return { refusal: refusal('HARVEST_BACKDATED_TOO_LATE') };
    }
    return { refusal: null, recorded: { harvestDate: date, backdatedCertificateId } };
}

module.exports = { judgeHarvestRecord };
