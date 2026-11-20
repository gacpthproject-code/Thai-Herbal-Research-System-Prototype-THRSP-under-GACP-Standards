'use strict';

// The upsert-increment's row lock is held until the caller's transaction commits:
// concurrent issuers queue, and a failed issuance takes its number back.

const { thaiYear } = require('../shared/harvest-identifiers');
const logger = require('../shared/logger');
const { allocateSequenceCounter } = require('./receipt-sequence-counter');
const { formatCertificateNumber } = require('@gacp/validation/certificate-number');
const {
    CERTIFICATE_SEQUENCE_BUCKET, readCertificateNumbering, firstNumberOfYear, chooseNumber,
} = require('./certificate-numbering-settings');

async function blockedFrom(db, year, from) {
    const rows = await db.blockedCertificateNumber.findMany({
        where: { year, number: { gte: from } },
        select: { number: true },
    });
    return new Set(rows.map((row) => row.number));
}

function auditWithin(row, tx) {
    const { auditLogger } = require('../middleware/audit-logger');
    return auditLogger.logWithin(row, tx);
}

async function allocateCertificateNumber({ client, issuedDate = new Date(), audit = auditWithin }) {
    const draw = async (tx) => {
        const numbering = await readCertificateNumbering(tx);
        const year = thaiYear(issuedDate);
        const counterNext = await allocateSequenceCounter(tx, CERTIFICATE_SEQUENCE_BUCKET, year);
        const firstNumber = firstNumberOfYear(numbering, year);
        const { number, skipped } = chooseNumber({
            counterNext, firstNumber, blocked: await blockedFrom(tx, year, Math.max(counterNext, firstNumber)),
        });
        if (number !== counterNext) {
            await tx.receiptSequence.update({
                where: { prefix_year: { prefix: CERTIFICATE_SEQUENCE_BUCKET, year } },
                data: { counter: number },
            });
        }
        if (skipped.length > 0) {
            logger.warn(`[certificate-number] skipped blocked ${skipped.join(', ')} of ${year}, issued ${number}/${year}`);
            await audit({
                category: 'CERTIFICATE',
                action: 'CERTIFICATE_NUMBER_SKIPPED_BLOCKED',
                severity: 'WARNING',
                actorId: 'SYSTEM',
                actorRole: 'system',
                actorType: 'SYSTEM',
                resourceType: 'CERTIFICATE_NUMBER',
                resourceId: `${number}/${year}`,
                metadata: { year, skipped, issued: number },
            }, tx);
        }
        return formatCertificateNumber(numbering.format, number, year);
    };
    return typeof client.$transaction === 'function'
        ? client.$transaction(draw, { isolationLevel: 'ReadCommitted' })
        : draw(client);
}

async function previewCertificateNumber({ db, at = new Date() }) {
    const numbering = await readCertificateNumbering(db);
    const year = thaiYear(at);
    const row = await db.receiptSequence.findUnique({
        where: { prefix_year: { prefix: CERTIFICATE_SEQUENCE_BUCKET, year } },
        select: { counter: true },
    });
    const counterNext = (row ? row.counter : 0) + 1;
    const firstNumber = firstNumberOfYear(numbering, year);
    const { number, skipped } = chooseNumber({
        counterNext, firstNumber, blocked: await blockedFrom(db, year, Math.max(counterNext, firstNumber)),
    });
    return { year, number, skipped, certificateNumber: formatCertificateNumber(numbering.format, number, year) };
}

module.exports = { allocateCertificateNumber, previewCertificateNumber };
