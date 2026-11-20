'use strict';

const fs = require('fs');
const path = require('path');
const { prisma: defaultPrisma } = require('./prisma-database');
const { withoutTenantScope } = require('./tenant-context');
const { BASE_UPLOAD_DIR } = require('./uploads-root');
const { lockApplicationRow } = require('./checkout/application-row-lock');
const { correctionRoundOf } = require('./correction-windows');
const { fileIdOf, unsentDeletionOf, unsentSweepEnabled } = require('./car-evidence-files');
const { auditLogger, AuditCategory, ResourceType } = require('../middleware/audit-logger');
const logger = require('../shared/logger');

const CAR_DIR = path.join(path.resolve(BASE_UPLOAD_DIR), 'car');
const UNREFERENCED_REPORT_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_ACTOR = 'cron-car-unsent-sweep';

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

function unsentFilePath(entry) {
    const name = typeof entry?.filename === 'string' ? entry.filename : '';
    if (!name || name !== path.basename(name) || name === '.' || name === '..') { return null; }
    return path.join(CAR_DIR, name);
}

function expiryOf(entry, formData, now) {
    const deletion = unsentDeletionOf(entry, formData);
    return deletion && now.getTime() >= deletion.at.getTime() ? deletion.reason : null;
}

async function expireRound(db, applicationId, now, dryRun) {
    if (!dryRun && !(await lockApplicationRow(db, applicationId))) { return []; }
    const [row] = await db.$queryRaw`SELECT "organizationId", "formData" FROM applications WHERE id = ${applicationId}`;
    const formData = asObject(row?.formData);
    const staged = asArray(formData.carStagedFiles);
    const roundId = correctionRoundOf('CAR_PENDING', formData);
    const expired = staged
        .map((entry) => ({ entry, reason: expiryOf(entry, formData, now) }))
        .filter(({ reason }) => reason)
        .map(({ entry, reason }) => ({ entry, record: { fileId: fileIdOf(entry), applicationId, roundId, reason, deletedAt: now.toISOString() } }));
    if (dryRun || expired.length === 0) { return expired; }
    const kept = staged.filter((entry) => !expired.some((item) => item.entry === entry));
    await db.$executeRaw`
        UPDATE applications SET "formData" = jsonb_set("formData", '{carStagedFiles}', ${JSON.stringify(kept)}::jsonb)
        WHERE id = ${applicationId}`;
    for (const { entry, record } of expired) {
        await auditLogger.logWithin({
            category: AuditCategory.APPLICATION,
            action: 'CAR_UNSENT_FILE_DELETED',
            severity: 'INFO',
            actorId: SWEEP_ACTOR,
            actorType: 'SYSTEM',
            actorRole: 'system',
            resourceType: ResourceType.DOCUMENT,
            resourceId: record.fileId,
            organizationId: row.organizationId,
            metadata: { applicationId, roundId: record.roundId, reason: record.reason, deletedAt: record.deletedAt },
        }, db);
        const target = unsentFilePath(entry);
        if (target) { await fs.promises.unlink(target).catch((error) => { if (error?.code !== 'ENOENT') { throw error; } }); }
    }
    return expired;
}

async function deleteExpiredUnsent(prisma, now, dryRun) {
    const rows = await prisma.$queryRaw`
        SELECT id FROM applications
        WHERE jsonb_typeof("formData"->'carStagedFiles') = 'array'
          AND jsonb_array_length("formData"->'carStagedFiles') > 0`;
    let deleted = 0;
    let failed = 0;
    for (const { id } of rows) {
        try {
            const expired = dryRun
                ? await expireRound(prisma, id, now, true)
                : await prisma.$transaction((tx) => expireRound(tx, id, now, false));
            deleted += expired.length;
            if (dryRun) { continue; }
            for (const { record } of expired) {
                logger.info(`[CAR sweep] deleted unsent file ${record.fileId} round ${record.roundId} reason ${record.reason} at ${record.deletedAt}`);
            }
        } catch (error) {
            failed += 1;
            logger.error(`[CAR sweep] application ${id} not swept: ${error?.message}`);
        }
    }
    return { unsentDeleted: deleted, failed };
}

async function namedCarFiles(prisma) {
    const rows = await prisma.$queryRaw`
        SELECT elem->>'path' AS path, elem->>'filename' AS filename FROM applications a,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(a."formData"->'carDocuments') = 'array' THEN a."formData"->'carDocuments' ELSE '[]'::jsonb END
            || CASE WHEN jsonb_typeof(a."formData"->'carStagedFiles') = 'array' THEN a."formData"->'carStagedFiles' ELSE '[]'::jsonb END
          ) elem
        UNION
        SELECT elem->>'path', elem->>'filename' FROM correction_submission_versions v,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(v."attachmentsSnapshot") = 'array' THEN v."attachmentsSnapshot" ELSE '[]'::jsonb END
          ) elem`;
    return new Set(rows.map((doc) => path.basename(String(doc?.filename || doc?.path || ''))).filter(Boolean));
}

async function reportUnreferenced(prisma, now) {
    let names;
    try {
        names = await fs.promises.readdir(CAR_DIR);
    } catch (error) {
        if (error?.code === 'ENOENT') { return { unreferenced: 0, unreferencedPaths: [] }; }
        throw error;
    }
    const named = await namedCarFiles(prisma);
    const unreferencedPaths = [];
    for (const name of names.sort()) {
        if (named.has(name)) { continue; }
        const stat = await fs.promises.stat(path.join(CAR_DIR, name)).catch(() => null);
        if (stat?.isFile() && now.getTime() - stat.mtimeMs >= UNREFERENCED_REPORT_MIN_AGE_MS) {
            unreferencedPaths.push(`/uploads/car/${name}`);
        }
    }
    if (unreferencedPaths.length > 0) {
        logger.warn(`[CAR sweep] ${unreferencedPaths.length} file(s) in uploads/car are named by no application; reported, not deleted: ${unreferencedPaths.join(' ')}`);
    }
    return { unreferenced: unreferencedPaths.length, unreferencedPaths };
}

async function runCarStagedFilesSweep({ prisma = defaultPrisma, now = new Date(), dryRun = false } = {}) {
    const disabled = !dryRun && !unsentSweepEnabled();
    return withoutTenantScope(async () => ({
        ...(await deleteExpiredUnsent(prisma, now, dryRun || disabled)),
        ...(await reportUnreferenced(prisma, now)),
        ...(disabled ? { disabled: 1 } : {}),
    }));
}

module.exports = { runCarStagedFilesSweep, unsentFilePath };
