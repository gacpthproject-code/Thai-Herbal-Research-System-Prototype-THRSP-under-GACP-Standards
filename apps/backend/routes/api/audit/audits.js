const express = require('express');
const { respondError } = require('../../../shared/api-response');
const router = express.Router();
const authModule = require('../../../middleware/auth-middleware');
const applicationService = require('../../../services/application-service');
const logger = require('../../../shared/logger');
const { withVisibility, organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const { ROLE_GROUPS } = require('../../../shared/canonical-rbac');
const { formatLocalTime } = require('../../../utils/working-days');

const authenticateProvider = authModule.authenticateProvider;
const { requireRole } = authModule;

// T-002: per canonical contract §5.2, every /api/audits/* handler must
// be limited to AUDIT_STAFF (admin, document_reviewer, auditor, scheduler).
// `account` users hold a `provider_token` for finance flows but must not
// reach audit reads.
router.use(authenticateProvider, requireRole(ROLE_GROUPS.AUDIT_STAFF));

/**
 * ชื่อผู้ยื่นบนหน้ารายละเอียดงานตรวจ
 *
 * นิติบุคคลถือใบรับรองในชื่อของตัวเอง (คำสั่ง operator 2026-09-07) ชื่อองค์กรจึงมาก่อน
 * ชื่อบุคคล · ถ้าไม่รู้จริง ๆ ให้เป็น null ไม่ใช่สตริง 'N/A' — หน้าจอเขียน `|| '-'` ไว้แล้ว
 * และ null บอกความจริงว่า "ไม่มีข้อมูล" ส่วน 'N/A' อ่านเหมือนเป็นชื่อ
 */
function applicantNameOf(app) {
    const entityName = app?.entity?.displayName;
    if (entityName) { return String(entityName).trim() || null; }
    const person = [app?.applicant?.firstName, app?.applicant?.lastName]
        .filter((part) => typeof part === 'string' && part.trim())
        .join(' ')
        .trim();
    return person || null;
}

/**
 * @swagger
 * /api/audits/{id}:
 *   get:
 *     summary: Get Audit Detail (Provider only)
 *     tags: [Audits]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Audit ID or Application ID
 *     responses:
 *       200:
 *         description: Audit details
 *       404:
 *         description: Audit not found
 */
router.get('/:id', authenticateProvider, async (req, res) => {
    try {
        const { id } = req.params;
        // Inside the caller's organization (order 17) and its visibility: an inspector
        // reads only the audits assigned to it.
        const organizationWhere = organizationScope(req.user);
        if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
        const application = await applicationService.findAuditDetail({
            where: withVisibility({ id, ...organizationWhere }, req.user),
        });

        if (!application) {
            return res.status(404).json({ success: false, error: 'Audit not found' });
        }

        // Map to AuditDetail interface
        const auditDetail = {
            id: application.id,
            auditNumber: application.applicationNumber,
            applicationNumber: application.applicationNumber,
            applicantName: applicantNameOf(application),
            plantType: application.formData?.plantId || application.areaType || '-',
            auditMode: application.formData?.auditMode || 'ONSITE',
            status: application.status,
            scheduledDate: application.scheduledDate,
            scheduledTime: application.scheduledDate ? formatLocalTime(new Date(application.scheduledDate)) : '', // Bangkok HH:mm
            responses: application.formData?.auditChecklist || [], // Use existing checklist if any
            // Mock Template Code if not present
            templateCode: 'GAP-001',
        };

        res.json({ success: true, data: auditDetail });
    } catch (error) {
        logger.error('[Audit] getDetail error:', error);
        return respondError(res, req, error);
    }
});

module.exports = router;
