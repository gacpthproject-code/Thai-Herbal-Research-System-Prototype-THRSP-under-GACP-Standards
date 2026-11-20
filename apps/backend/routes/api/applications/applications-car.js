/**
 * CAR (Corrective Action Request) Routes
 */

const express = require('express');
const { safeErrorMessage, respondError } = require('../../../shared/api-response');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { multipartLimits } = require('../../../shared/multipart-limits');
// รากของโฟลเดอร์อัปโหลด ประกาศไว้ที่เดียวใน storage-service.js — ห้ามนับ '../' เองอีก
const { BASE_UPLOAD_DIR, decodeMultipartFilename } = require('../../../services/storage-service');
const { authenticateHealth } = require('../../../middleware/auth-middleware');
// The Prisma client is still imported, but only as the transaction handle we
// pass into writeApplicationStatus (which requires it by contract). All direct
// model access (application.findFirst, user.findMany) was moved into the
// services below so this route no longer queries the database itself.
// See docs/tech-debt/prisma-bypass-routes.md.
const { prisma } = require('../../../services/prisma-database');
const { sendNotification, NotifyType } = require('../../../services/notification-service');
const { buildWorkflowEvent } = require('../../../shared/workflow-event-builder');
const workflowTransitionService = require('../../../services/workflow-transition-service');
const { writeApplicationStatus } = require('../../../services/application-status-writer');
// R2 M7 (D-6) — append-only per-round snapshot of the submitted formData. The
// CAR resubmit is a FIELD_AUDIT correction submission (CAR_PENDING → CAR_REVIEWING).
const { snapshotCorrectionSubmission } = require('../../../services/correction-submission-version-service');
const applicationService = require('../../../services/application-service');
const { holderScope, holderReadWhere } = require('../../../services/holder-access');
const { discardRejectedUpload, inspectStoredUpload } = require('../../../services/upload-content-guard');
const { lockApplicationRow } = require('../../../services/checkout/application-row-lock');
const { ERROR_CODES } = require('../../../shared/error-codes');
const {
  CAR_FILE_LIMITS, CAR_EXTENSIONS, CAR_MIMETYPES, stageCarFile, unstageCarFile, chooseStagedFiles, releaseStagedOfClosedRound,
} = require('../../../services/car-evidence-files');
const logger = require('../../../shared/logger');
// M1 (2026-08-15) — the fourth submit door (plan D4). Ownership ("is this my
// application") is not the same question as authority ("may I act for the
// entity that holds it"), so the guard runs here too.
const { assertSubmitAllowed, SubmitGuardError } = require('../../../services/application-submit-guard');
const { requireConsent } = require('../../../middleware/consent-manager');
const { judgeFiling } = require('../../../services/application-filing-gates');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../../middleware/audit-logger');

// ปลายทางต้องเป็นโฟลเดอร์เดียวกับที่ express.static เสิร์ฟเป็น /uploads เพราะ handler ข้างล่าง
// เก็บที่อยู่ไฟล์ไว้เป็น `/uploads/car/<filename>` · เดิมนับ '../' เอง แล้วนับพลาดไปหนึ่งชั้น
// (routes/public/uploads/car — โฟลเดอร์ที่ไม่มีอยู่จริง ไม่มีใครเสิร์ฟ และไม่มี volume รองรับ)
// ⇒ อัปโหลดทุกครั้งตายด้วย ENOENT · storage-service.js เจอบั๊กเดียวกันนี้เมื่อ 2026-06-25 และ
// แก้ด้วยการประกาศรากไว้ที่เดียว จึงถามรากจากที่นั่นแทนการนับเอง
const CAR_UPLOAD_DIR = path.join(BASE_UPLOAD_DIR, 'car');
const CAR_EVIDENCE_SLOT = 'car_evidence';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // สร้างโฟลเดอร์ถ้ายังไม่มี — โฟลเดอร์ว่างไม่ถูกเก็บใน git และ volume ที่เพิ่ง mount ใหม่ก็ว่าง
    // การอัปโหลดครั้งแรกของเครื่องใหม่ทุกเครื่องจึงเคยล้มเสมอ
    fs.mkdirSync(CAR_UPLOAD_DIR, { recursive: true });
    cb(null, CAR_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomInt(1_000_000_000)}`;
    cb(null, 'CAR-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const carFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (CAR_EXTENSIONS.includes(ext) && CAR_MIMETYPES.includes(file.mimetype)) {
    return cb(null, true);
  }
  req.carUploadRefusal = 'CAR_FILE_TYPE';
  return cb(null, false);
};

const carFileUpload = multer({
  storage,
  limits: multipartLimits({ fileSize: CAR_FILE_LIMITS.maxBytes, files: 1, fields: 4 }),
  fileFilter: carFileFilter,
}).single('file');

function refuse(res, error) {
  const status = Number(error?.status || error?.statusCode) || 400;
  const messageTh = error?.messageTh || error?.message;
  return res.status(status).json({ success: false, error: messageTh, code: error?.code, message: messageTh, messageTh });
}

const refusalOf = (code) => {
  const row = ERROR_CODES[code];
  return { status: row.httpStatus, code: row.code, messageTh: row.messageTh };
};

function receiveCarFile(req, res, next) {
  carFileUpload(req, res, (err) => {
    if (!err) { return next(); }
    if (err.code === 'LIMIT_FILE_SIZE') { return refuse(res, refusalOf('CAR_FILE_TOO_LARGE')); }
    return refuse(res, { status: 400, code: 'UPLOAD_REJECTED', messageTh: 'อัปโหลดไม่สำเร็จ กรุณาเลือกไฟล์ทีละไฟล์ แล้วลองอีกครั้ง' });
  });
}

// M1 AC3 — record the accepted act and the entity it was made for. A null
// holder is refused by the submit guard, never healed (spec 2026-09-30 §3.2 + C3: a null holder is never healed to the caller's personal entity; heal-null-holders.js places legacy rows).
// `auditLogger.log()` opens its own transaction and takes its own advisory lock
// (audit-logger.js:479,505-506), so it is called outside every business
// transaction, and it is best-effort by design (log() swallows its own errors,
// :526-541).
async function logCarSubmitAccepted({ req, applicationId, entityId }) {
    try {
        await auditLogger.log({
            category: AuditCategory.APPLICATION,
            action: 'APPLICATION_CAR_SUBMIT_ACCEPTED',
            severity: AuditSeverity.INFO,
            actorId: req.user?.id || 'UNKNOWN',
            actorType: 'USER',
            actorRole: req.user?.canonicalRole || req.user?.role || 'UNKNOWN',
            resourceType: ResourceType.APPLICATION,
            resourceId: applicationId,
            ipAddress: req.ip || null,
            userAgent: typeof req.get === 'function' ? req.get('user-agent') : null,
            organizationId: req.user?.organizationId || null,
            result: 'SUCCESS',
            metadata: {
                onBehalfOfEntityId: entityId || null,
                permission: 'SUBMIT_APPLICATION',
                applicationId,
                route: `${req.method} ${req.baseUrl || ''}${req.path || ''}`,
            },
        });
    } catch (auditErr) {
        logger.warn(`[CAR Upload] accepted-audit write failed (non-fatal): ${auditErr?.message}`);
    }
}

const storedPathOf = (doc) => ({ path: path.join(CAR_UPLOAD_DIR, path.basename(String(doc?.filename || ''))) });

async function discardStoredFiles(docs) {
  for (const doc of docs) {
    if (doc?.filename) { await discardRejectedUpload(storedPathOf(doc)); }
  }
}

async function loadForSubmitter(req) {
  const scope = await holderScope(req);
  const application = await applicationService.findOwnedApplicationForApplicant(req.params.id, { holderScope: scope });
  if (!application) {
    throw Object.assign(new Error('Application not found'), { status: 404, messageTh: 'ไม่พบคำขอนี้ในบัญชีของคุณ' });
  }
  const { entityId } = await assertSubmitAllowed({
    userId: req.user.id,
    application,
    holderScope: scope,
    auditContext: {
      actorType: 'USER',
      actorRole: req.user?.canonicalRole || req.user?.role || null,
      ipAddress: req.ip || null,
      userAgent: typeof req.get === 'function' ? req.get('user-agent') : null,
      organizationId: req.user?.organizationId || null,
      route: `${req.method} ${req.baseUrl || ''}${req.path || ''}`,
    },
  });
  return { application, entityId, scope, scopeWhere: holderReadWhere(scope, 'Application') };
}

const isRefusal = (error) => {
  const status = Number(error?.status || error?.statusCode);
  return error instanceof SubmitGuardError || (status >= 400 && status < 500);
};

function answerRefusal(req, res, error) {
  if (error instanceof SubmitGuardError) { return respondError(res, req, error, { message: error.message }); }
  return refuse(res, error);
}

const publicEntry = ({ uploadedBy: _by, sha256: _sha256, ...entry }) => entry;

router.post('/:id/car/files', authenticateHealth, requireConsent, receiveCarFile, async (req, res) => {
  const file = req.file;
  if (!file) {
    return refuse(res, refusalOf(req.carUploadRefusal || 'CAR_FILES_REQUIRED'));
  }
  try {
    const verdict = await inspectStoredUpload(file, CAR_EVIDENCE_SLOT);
    if (!verdict.ok) {
      await discardRejectedUpload(file);
      return refuse(res, { status: 400, code: verdict.code, messageTh: verdict.message });
    }
    const { application, scopeWhere } = await loadForSubmitter(req);
    const sha256 = crypto.createHash('sha256').update(await fs.promises.readFile(file.path)).digest('hex');
    const staged = await prisma.$transaction((tx) => stageCarFile(tx, {
      applicationId: application.id,
      scopeWhere,
      entry: {
        id: file.filename,
        filename: file.filename,
        findingNo: req.body?.findingNo,
        originalName: decodeMultipartFilename(file.originalname),
        path: `/uploads/car/${file.filename}`,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user.id,
        sha256,
      },
    }));
    if (staged.id !== file.filename) { await discardRejectedUpload(file); }
    return res.json({ success: true, data: { file: staged } });
  } catch (error) {
    await discardRejectedUpload(file);
    if (isRefusal(error)) { return answerRefusal(req, res, error); }
    logger.error('[CAR File Upload] Error:', error);
    return res.status(500).json({ success: false, error: 'อัปโหลดไม่สำเร็จเพราะระบบขัดข้อง กรุณากดลองใหม่อีกครั้ง' });
  }
});

router.delete('/:id/car/files/:fileId', authenticateHealth, async (req, res) => {
  try {
    const { application, scopeWhere } = await loadForSubmitter(req);
    const removed = await prisma.$transaction((tx) => unstageCarFile(tx, {
      applicationId: application.id, scopeWhere, fileId: String(req.params.fileId || ''),
    }));
    await discardStoredFiles([removed]);
    return res.json({ success: true });
  } catch (error) {
    if (isRefusal(error)) { return answerRefusal(req, res, error); }
    logger.error('[CAR File Delete] Error:', error);
    return res.status(500).json({ success: false, error: 'ลบไฟล์ไม่สำเร็จเพราะระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' });
  }
});

async function assertStillStored(docs) {
  for (const doc of docs) {
    try {
      await fs.promises.access(storedPathOf(doc).path);
    } catch {
      throw Object.assign(new Error('CAR file missing'), { ...refusalOf('CAR_FILE_MISSING'), fileId: doc.id });
    }
  }
}

router.post('/:id/car', authenticateHealth, requireConsent, async (req, res) => {
  try {
    const { id } = req.params;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';
    const { application, entityId: onBehalfOfEntityId, scope, scopeWhere } = await loadForSubmitter(req);

    const currentState = workflowTransitionService.resolveStateFromApplication(application);
    if (currentState !== 'CAR_PENDING') {
      return refuse(res, refusalOf('CAR_NOT_PENDING'));
    }

    const verdict = await judgeFiling({
      prisma, application, fromStatus: currentState, payload: req.body, holderScope: scope,
    });
    if (verdict.refusal) {
      await discardStoredFiles(await prisma.$transaction((tx) => releaseStagedOfClosedRound(tx, { applicationId: application.id, scopeWhere })));
      return res.status(verdict.refusal.httpStatus).json(verdict.refusal.body);
    }

    const sentAt = new Date().toISOString();
    const { chosen, leftover } = await prisma.$transaction(async (tx) => {
      const locked = await lockApplicationRow(tx, application.id);
      const row = await tx.application.findFirst({
        where: { ...scopeWhere, id: application.id }, select: { status: true, formData: true, workflowHistory: true },
      });
      if (!locked || row?.status !== application.status) { throw Object.assign(new Error('moved'), refusalOf('CAR_NOT_PENDING')); }
      const currentFormData = row.formData && typeof row.formData === 'object' ? row.formData : {};
      const picked = chooseStagedFiles(currentFormData, req.body?.files);
      await assertStillStored(picked.chosen);
      const carResubmitFormData = {
        ...currentFormData,
        carDocuments: [
          ...(Array.isArray(currentFormData.carDocuments) ? currentFormData.carDocuments : []),
          ...picked.chosen.map((doc) => ({ ...publicEntry(doc), submittedAt: sentAt })),
        ],
        carStagedFiles: [],
        carNotes: notes,
        carSubmittedAt: sentAt,
        workflowState: 'CAR_REVIEWING',
        workflowStateUpdatedAt: sentAt,
      };
      await writeApplicationStatus({
        prisma: tx,
        applicationId: id,
        fromStatus: application.status,
        toStatus: 'CAR_REVIEWING',
        actorId: req.user.id,
        actorRole: req.user.canonicalRole || req.user.role || null,
        reason: 'CAR_EVIDENCE_SUBMITTED',
        additionalData: {
          formData: carResubmitFormData,
          workflowHistory: [
            ...(Array.isArray(row.workflowHistory) ? row.workflowHistory : []),
            buildWorkflowEvent({
              action: 'CAR_EVIDENCE_SUBMITTED',
              fromState: currentState,
              toState: 'CAR_REVIEWING',
              actorId: req.user.id,
              actorRole: req.user.canonicalRole || req.user.role || null,
              metadata: { fileCount: picked.chosen.length },
            }),
          ],
        },
      });
      await snapshotCorrectionSubmission({
        prisma: tx,
        applicationId: id,
        fromStatus: currentState,
        formDataSnapshot: carResubmitFormData,
        attachmentsSnapshot: carResubmitFormData.carDocuments,
      });
      return picked;
    });
    await discardStoredFiles(leftover);

    await logCarSubmitAccepted({ req, applicationId: id, entityId: onBehalfOfEntityId });

    // The evidence is judged by the field inspector who decided the visit (order 29),
    // inside their own organization (order 17): tell that one person, nobody else.
    if (application.auditorId) {
      await sendNotification(application.auditorId, NotifyType.CAR_REVIEWING, {
        applicationNumber: application.applicationNumber,
        applicationId: application.id,
      });
    } else {
      logger.warn(`[CAR Upload] ${application.applicationNumber} has no field inspector; CAR evidence notice not sent`);
    }

    logger.info(`[CAR Upload] Application ${application.applicationNumber} - ${chosen.length} files sent`);

    return res.json({
      success: true,
      message: 'CAR documents submitted successfully',
      data: { filesUploaded: chosen.length, status: 'CAR_REVIEWING' },
    });
  } catch (error) {
    if (isRefusal(error)) { return answerRefusal(req, res, error); }
    logger.error('[CAR Upload] Error:', error);
    return res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

module.exports = router;
