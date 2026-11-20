#!/usr/bin/env node
/**
 * heal-stranded-renewal-cycles · F-A8c-08
 *
 * Before the fix, a renewal filed through the six-step wizard got a second Farm at submit, its
 * certificate named that farm, and renewal-supersede moved only cycles on the new certificate's
 * farm, so none moved. The open cycles stayed on the renewed certificate and could not be
 * harvested ("ยังไม่ผูกใบรับรองที่ใช้งานได้").
 *
 * For each renewed certificate whose successor is in force (active, not deleted, not expired)
 * and was filed for the same holder, this moves the open cycles the supersede moves today
 * (renewal-supersede.movableOpenCycles) onto the successor.
 *
 * Every planting read requires cycle.farmId = certificate.farmId, and Certificate.farmId is
 * inside the signed document hash (certificateCanonicalJson), so the certificate cannot change.
 * When the successor names a second farm, the cycle moves to that farm as well, with the plots
 * it is planted on and the harvest batches it already produced (the public trace drops a
 * certificate whose batch farm and cycle farm differ). A plot that another open cycle also uses
 * is never moved: that pair is skipped with PLOT_SHARED_WITH_OPEN_CYCLE for the operator.
 * Closed cycles stay on the renewed certificate and its farm, as history.
 *
 * Each pair is written in one transaction, only for cycles still on the renewed certificate at
 * write time, so a second run, or a stale plan applied again, moves nothing.
 *
 *   DATABASE_URL=... node scripts/heal-stranded-renewal-cycles.js            plan only (default)
 *   DATABASE_URL=... node scripts/heal-stranded-renewal-cycles.js --apply    operator only
 *
 * DATABASE_URL must be exported in the shell. A value loaded from a .env file is refused.
 * The connection string is never printed, only an 8-hex fingerprint of user@host:port/db.
 */

'use strict';

const STARTUP_ENV = Object.freeze({ DATABASE_URL: process.env.DATABASE_URL });

const crypto = require('crypto');

const CLOSED_CYCLE_STATUSES = Object.freeze(['HARVESTED', 'COMPLETED']);
const NOTHING_MOVED = Object.freeze({ cycles: 0, plots: 0, batches: 0 });

const CERTIFICATE_SELECT = Object.freeze({
    id: true, certificateNumber: true, farmId: true, status: true, isDeleted: true, expiryDate: true,
    application: { select: { entityId: true } },
    farm: { select: { entityId: true } },
});

function dbFingerprint(url) {
    const parsed = new URL(url);
    return crypto.createHash('sha256')
        .update(`${parsed.username}@${parsed.hostname}:${parsed.port}${parsed.pathname}`)
        .digest('hex').slice(0, 8);
}

function inForce(certificate, now) {
    return !certificate.isDeleted
        && String(certificate.status || '').toLowerCase() === 'active'
        && (!certificate.expiryDate || new Date(certificate.expiryDate) >= now);
}

function sameHolder(old, successor) {
    const holder = old.application?.entityId;
    return Boolean(holder)
        && successor.application?.entityId === holder
        && successor.farm?.entityId === old.farm?.entityId;
}

async function plotsOf(client, cycleIds) {
    const cycles = await client.plantingCycle.findMany({
        where: { id: { in: cycleIds } },
        select: { plotId: true, cyclePlots: { select: { plotId: true } } },
    });
    const ids = cycles.flatMap((cycle) => [cycle.plotId, ...cycle.cyclePlots.map((row) => row.plotId)]).filter(Boolean);
    return [...new Set(ids)].sort();
}

async function plotSharedWithAnotherOpenCycle(client, plotIds, cycleIds) {
    if (plotIds.length === 0) { return false; }
    const other = await client.plantingCycle.findFirst({
        where: {
            id: { notIn: cycleIds },
            isDeleted: false,
            status: { notIn: CLOSED_CYCLE_STATUSES },
            OR: [{ plotId: { in: plotIds } }, { cyclePlots: { some: { plotId: { in: plotIds } } } }],
        },
        select: { id: true },
    });
    return Boolean(other);
}

async function planHeal(prisma, { now = new Date() } = {}) {
    const { movableOpenCycles } = require('../services/certificate/renewal-supersede');
    const renewed = await prisma.certificate.findMany({
        where: { status: 'renewed', renewedCertificateId: { not: null }, isDeleted: false },
        select: { ...CERTIFICATE_SELECT, renewedCertificateId: true },
        orderBy: { createdAt: 'asc' },
    });
    const moves = [];
    const skipped = [];
    const secondFarms = [];
    for (const old of renewed) {
        const successor = await prisma.certificate.findUnique({ where: { id: old.renewedCertificateId }, select: CERTIFICATE_SELECT });
        const skip = (reason) => skipped.push({
            renewedCertificate: old.certificateNumber, renewalCertificate: successor?.certificateNumber ?? null, reason,
        });
        if (!successor || !inForce(successor, now)) { skip('SUCCESSOR_NOT_ACTIVE'); continue; }
        if (!sameHolder(old, successor)) { skip('HOLDER_MISMATCH'); continue; }
        const secondFarm = successor.farmId !== old.farmId;
        if (secondFarm) {
            secondFarms.push({
                renewedCertificate: old.certificateNumber, renewedFarmId: old.farmId,
                renewalCertificate: successor.certificateNumber, renewalFarmId: successor.farmId,
            });
        }
        const cycleIds = await movableOpenCycles(prisma, { fromCertificateId: old.id, toCertificateId: successor.id });
        if (cycleIds.length === 0) { continue; }
        const plotIds = secondFarm ? await plotsOf(prisma, cycleIds) : [];
        if (await plotSharedWithAnotherOpenCycle(prisma, plotIds, cycleIds)) { skip('PLOT_SHARED_WITH_OPEN_CYCLE'); continue; }
        moves.push({
            from: { id: old.id, number: old.certificateNumber, farmId: old.farmId },
            to: { id: successor.id, number: successor.certificateNumber, farmId: successor.farmId },
            cycleIds,
            plotIds,
        });
    }
    return { moves, skipped, secondFarms };
}

async function applyMove(tx, move) {
    const still = await tx.plantingCycle.findMany({
        where: { id: { in: move.cycleIds }, certificateId: move.from.id, isDeleted: false },
        select: { id: true },
    });
    const cycleIds = still.map((row) => row.id);
    if (cycleIds.length === 0) { return NOTHING_MOVED; }
    const secondFarm = move.to.farmId !== move.from.farmId;
    const plotIds = secondFarm ? await plotsOf(tx, cycleIds) : [];
    if (await plotSharedWithAnotherOpenCycle(tx, plotIds, cycleIds)) { return NOTHING_MOVED; }
    const cycles = await tx.plantingCycle.updateMany({
        where: { id: { in: cycleIds } },
        data: { certificateId: move.to.id, farmId: move.to.farmId },
    });
    if (!secondFarm) { return { ...NOTHING_MOVED, cycles: cycles.count }; }
    const plots = await tx.plot.updateMany({
        where: { id: { in: plotIds }, farmId: move.from.farmId },
        data: { farmId: move.to.farmId },
    });
    const batches = await tx.harvestBatch.updateMany({
        where: { cycleId: { in: cycleIds }, farmId: move.from.farmId },
        data: { farmId: move.to.farmId },
    });
    return { cycles: cycles.count, plots: plots.count, batches: batches.count };
}

async function applyHeal(prisma, plan) {
    const applied = [];
    for (const move of plan.moves) {
        const counts = await prisma.$transaction((tx) => applyMove(tx, move));
        applied.push({ from: move.from.number, to: move.to.number, ...counts });
    }
    return applied;
}

async function main(argv, { env = STARTUP_ENV, out = console } = {}) {
    const apply = argv.includes('--apply');
    const url = env.DATABASE_URL;
    if (!url) {
        out.error('refused: export DATABASE_URL in this shell (a .env value is not accepted)');
        return 2;
    }
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
        const plan = await planHeal(prisma);
        out.log(JSON.stringify({ db: dbFingerprint(url), mode: apply ? 'apply' : 'plan', ...plan }, null, 2));
        if (apply) {
            out.log(JSON.stringify({ applied: await applyHeal(prisma, plan) }, null, 2));
        }
        return 0;
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
        console.error(error && error.message ? error.message : error);
        process.exitCode = 1;
    });
}

module.exports = { planHeal, applyHeal, main };
