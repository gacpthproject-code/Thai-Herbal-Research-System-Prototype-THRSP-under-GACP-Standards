'use strict';

const { ERROR_CODES } = require('../shared/error-codes');
const { lockApplicationRow } = require('./checkout/application-row-lock');
const { correctionDueAtOf } = require('./correction-windows');

const CAR_FILE_LIMITS = Object.freeze({ maxFiles: 20, maxBytes: 10 * 1024 * 1024 });
const CAR_EXTENSIONS = Object.freeze(['.pdf', '.jpg', '.jpeg', '.png']);
const CAR_MIMETYPES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);

const UNSENT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

function refusal(code, details = {}) {
    const row = ERROR_CODES[code];
    return Object.assign(new Error(row.messageTh), {
        code: row.code, statusCode: row.httpStatus, status: row.httpStatus, messageTh: row.messageTh, ...details,
    });
}

const fileIdOf = (doc) => String(doc?.id || doc?.filename || '');

const unsentSweepEnabled = () => process.env.CAR_UNSENT_SWEEP_ENABLED === 'true';

/**
 * When the sweep deletes a file uploaded but not sent: the round's deadline as the filing stamps it
 * now, or 7 days after the upload, whichever comes first (orders 129(3), 138). null when neither is known.
 */
function unsentDeletionOf(entry, formData) {
    const dueAt = correctionDueAtOf('CAR_PENDING', formData);
    const uploadedAt = Date.parse(entry?.uploadedAt);
    return [
        dueAt ? { reason: 'deadline', at: dueAt } : null,
        Number.isFinite(uploadedAt) ? { reason: '7days', at: new Date(uploadedAt + UNSENT_KEEP_MS) } : null,
    ].filter(Boolean).sort((a, b) => a.at - b.at)[0] || null;
}

/** An unsent file as the applicant sees it; `deletesAt` only while the sweep is switched on to delete. */
function stagedFileView(entry, formData) {
    const { id, findingNo, originalName, size, mimeType, uploadedAt } = entry;
    const deletion = unsentSweepEnabled() ? unsentDeletionOf(entry, formData) : null;
    return { id, findingNo, originalName, size, mimeType, uploadedAt, deletesAt: deletion ? deletion.at.toISOString() : null };
}

function defectsOfRound(formData) {
    const request = asObject(asObject(formData).carRequest);
    const items = asArray(request.items)
        .map((item, index) => ({
            no: index + 1,
            nonConformity: String(item?.nonConformity || '').trim(),
            correctiveAction: String(item?.correctiveAction || '').trim(),
        }));
    if (items.length > 0) { return items; }
    return [{ no: 1, nonConformity: String(request.message || '').trim(), correctiveAction: '' }];
}

function assertFindingNo(formData, findingNo) {
    const n = Number(findingNo);
    if (!Number.isInteger(n) || n < 1 || n > defectsOfRound(formData).length) {
        throw refusal('CAR_FILE_FINDING_INVALID');
    }
    return n;
}

function filesOfRound(formData) {
    const askedAt = Date.parse(asObject(formData).carRequestedAt);
    return asArray(asObject(formData).carDocuments)
        .filter((doc) => doc && typeof doc.path === 'string' && doc.path)
        .filter((doc) => Number.isNaN(askedAt) || Date.parse(doc.uploadedAt) > askedAt);
}

async function readLocked(tx, applicationId, scopeWhere) {
    const locked = await lockApplicationRow(tx, applicationId);
    if (!locked) { throw refusal('CAR_NOT_PENDING'); }
    const row = await tx.application.findFirst({ where: { ...scopeWhere, id: applicationId }, select: { status: true, formData: true } });
    if (row?.status !== 'CAR_PENDING') { throw refusal('CAR_NOT_PENDING'); }
    return asObject(row.formData);
}

const writeStaged = (tx, applicationId, staged) => tx.$executeRaw`
    UPDATE applications
    SET "formData" = jsonb_set(COALESCE("formData", '{}'::jsonb), '{carStagedFiles}', ${JSON.stringify(staged)}::jsonb)
    WHERE id = ${applicationId}`;

async function stageCarFile(tx, { applicationId, scopeWhere, entry }) {
    const formData = await readLocked(tx, applicationId, scopeWhere);
    const findingNo = assertFindingNo(formData, entry.findingNo);
    const staged = asArray(formData.carStagedFiles);
    const sameFile = entry.sha256 && staged.find((doc) => doc.sha256 === entry.sha256 && doc.findingNo === findingNo);
    if (sameFile) { return stagedFileView(sameFile, formData); }
    if (staged.length >= CAR_FILE_LIMITS.maxFiles) { throw refusal('CAR_FILES_LIMIT'); }
    const stored = { ...entry, findingNo };
    await writeStaged(tx, applicationId, [...staged, stored]);
    return stagedFileView(stored, formData);
}

async function unstageCarFile(tx, { applicationId, scopeWhere, fileId }) {
    const formData = await readLocked(tx, applicationId, scopeWhere);
    const staged = asArray(formData.carStagedFiles);
    const removed = staged.find((doc) => fileIdOf(doc) === fileId);
    if (!removed) { throw refusal('CAR_FILE_NOT_STAGED'); }
    await writeStaged(tx, applicationId, staged.filter((doc) => doc !== removed));
    return removed;
}

async function releaseStagedOfClosedRound(tx, { applicationId, scopeWhere }) {
    if (!(await lockApplicationRow(tx, applicationId))) { return []; }
    const row = await tx.application.findFirst({ where: { ...scopeWhere, id: applicationId }, select: { status: true, formData: true } });
    const staged = asArray(asObject(row?.formData).carStagedFiles);
    if (!row || row.status === 'CAR_PENDING' || staged.length === 0) { return []; }
    await writeStaged(tx, applicationId, []);
    return staged;
}

function chooseStagedFiles(formData, picks) {
    const list = asArray(picks);
    if (list.length === 0) { throw refusal('CAR_FILES_REQUIRED'); }
    if (list.length > CAR_FILE_LIMITS.maxFiles) { throw refusal('CAR_FILES_LIMIT'); }
    const staged = new Map(asArray(formData.carStagedFiles).map((doc) => [fileIdOf(doc), doc]));
    const seen = new Set();
    const chosen = list.map((pick) => {
        const id = String(pick?.id || '');
        const doc = staged.get(id);
        if (!doc || seen.has(id)) { throw refusal('CAR_FILE_NOT_STAGED', { fileId: id }); }
        seen.add(id);
        return { ...doc, findingNo: assertFindingNo(formData, pick?.findingNo) };
    });
    const leftover = [...staged.values()].filter((doc) => !seen.has(fileIdOf(doc)));
    return { chosen, leftover };
}

function markCarEvidenceViewed({ prisma, applicationId, fileId, inspectorId, at = new Date() }) {
    return prisma.$executeRaw`
        UPDATE applications
        SET "formData" = jsonb_set(
            jsonb_set(COALESCE("formData", '{}'::jsonb), '{carEvidenceViews}', COALESCE("formData"->'carEvidenceViews', '{}'::jsonb)),
            ARRAY['carEvidenceViews', ${fileId}::text],
            COALESCE("formData"->'carEvidenceViews'->${fileId}::text, '{}'::jsonb) || jsonb_build_object(${String(inspectorId)}::text, ${at.toISOString()}::text)
        )
        WHERE id = ${applicationId} AND status = 'CAR_REVIEWING'`;
}

function unopenedFilesOfRound(formData, inspectorId) {
    const views = asObject(asObject(formData).carEvidenceViews);
    return filesOfRound(formData).filter((doc) => !asObject(views[fileIdOf(doc)])[inspectorId]);
}

module.exports = {
    CAR_FILE_LIMITS,
    CAR_EXTENSIONS,
    CAR_MIMETYPES,
    fileIdOf,
    unsentSweepEnabled,
    unsentDeletionOf,
    stagedFileView,
    defectsOfRound,
    filesOfRound,
    stageCarFile,
    unstageCarFile,
    releaseStagedOfClosedRound,
    chooseStagedFiles,
    markCarEvidenceViewed,
    unopenedFilesOfRound,
};
