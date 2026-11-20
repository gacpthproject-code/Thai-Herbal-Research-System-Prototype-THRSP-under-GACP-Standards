'use strict';

const { startOfLocalDay } = require('../../utils/working-days');
const { PUBLIC_CERTIFICATE_FACTS_SELECT } = require('./public-facts');

const CERTIFICATE_VALIDITY_SELECT = Object.freeze({
    id: true,
    status: true,
    issuedDate: true,
    expiryDate: true,
    revokedAt: true,
    suspendedAt: true,
    reinstatedAt: true,
    previousCertificateId: true,
});

const PUBLIC_LAB_APPLICATION_SELECT = Object.freeze({ labResults: true, labResultStatus: true, labName: true });

const PREDECESSOR_SELECT = Object.freeze({
    ...CERTIFICATE_VALIDITY_SELECT,
    certificateNumber: true,
    standardName: true,
    ...PUBLIC_CERTIFICATE_FACTS_SELECT,
    application: { select: PUBLIC_LAB_APPLICATION_SELECT },
});

const DATED_STATUSES = Object.freeze(new Set(['active', 'expired', 'renewed', 'suspended', 'revoked']));

const bangkokDay = (value) => startOfLocalDay(new Date(value)).getTime();

function rowSuspension(certificate) {
    if (!certificate.suspendedAt) { return []; }
    const lifted = certificate.reinstatedAt && new Date(certificate.reinstatedAt) >= new Date(certificate.suspendedAt);
    return [{ from: certificate.suspendedAt, to: lifted ? certificate.reinstatedAt : null }];
}

function certificateValidOn(certificate, date) {
    if (!certificate?.issuedDate || !certificate.expiryDate || !date) { return false; }
    if (Number.isNaN(new Date(date).getTime())) { return false; }
    const status = String(certificate.status || '').toLowerCase();
    if (!DATED_STATUSES.has(status)) { return false; }
    const day = bangkokDay(date);
    if (day < bangkokDay(certificate.issuedDate) || day > bangkokDay(certificate.expiryDate)) { return false; }
    if (status === 'revoked' && !certificate.revokedAt) { return false; }
    if (certificate.revokedAt && day >= bangkokDay(certificate.revokedAt)) { return false; }
    const windows = [...(certificate.suspensions || []), ...rowSuspension(certificate)];
    return !windows.some(({ from, to }) => day >= bangkokDay(from) && (!to || day <= bangkokDay(to)));
}

function windowsFromEvents(events) {
    const windows = [];
    for (const { action, createdAt } of events) {
        const open = windows[windows.length - 1];
        if (action === 'CERTIFICATE_SUSPENDED' && (!open || open.to)) { windows.push({ from: createdAt, to: null }); }
        if (action === 'CERTIFICATE_REINSTATED' && open && !open.to) { open.to = createdAt; }
    }
    return windows;
}

async function certificateInForceOn(certificate, date) {
    if (!certificate?.suspendedAt) { return certificateValidOn(certificate, date); }
    const events = await require('../audit-trail').certificateSuspensionEvents(certificate.id);
    return certificateValidOn({ ...certificate, suspensions: windowsFromEvents(events) }, date);
}

async function certificateProducedUnder(certificate, date, holderScope = null) {
    const seen = new Set();
    let current = certificate;
    while (current && !seen.has(current.id)) {
        if (await certificateInForceOn(current, date)) { return current; }
        seen.add(current.id);
        current = current.previousCertificateId
            ? await require('../prisma-database').prisma.certificate.findFirst({
                where: {
                    id: current.previousCertificateId,
                    isDeleted: false,
                    ...require('../holder-access').holderReadWhereIfScoped(holderScope, 'Certificate'),
                },
                select: PREDECESSOR_SELECT,
            })
            : null;
    }
    return null;
}

module.exports = { CERTIFICATE_VALIDITY_SELECT, PUBLIC_LAB_APPLICATION_SELECT, certificateValidOn, certificateInForceOn, certificateProducedUnder };
