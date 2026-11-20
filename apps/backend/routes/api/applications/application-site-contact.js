/**
 * The applicant keeps the person on site current until the visit (operator order 65(2), 2026-10-09).
 *
 *   PATCH /api/applications/:id/site-contact
 *   body { siteContactName, sitePhone, siteContactIsApplicant, siteContactInformed }
 *
 * - A member of the holder with SUBMIT_APPLICATION, as for filing.
 * - The same rule the wizard and the submit door run (@gacp/validation/site-contact): a name, a Thai
 *   phone, and the applicant's confirmation when the contact is someone else.
 * - Until the visit: any status after filing and before the inspection, and a booked visit only while
 *   its date is still ahead. The write lands only if that still holds when it is made.
 * - Only the four contact keys of farmData are written, so nothing else on the filing is replaced.
 * - Every change writes an audit row naming the application, never the contact itself.
 *
 * @module routes/api/applications/application-site-contact
 */

'use strict';

const express = require('express');
const { authenticateHealth } = require('../../../middleware/auth-middleware');
const { prisma } = require('../../../services/prisma-database');
const applicationService = require('../../../services/application-service');
const { holderScope, assertHolderCapability } = require('../../../services/holder-access');
const { entityPermissionDeniedBody } = require('../../../shared/entity-permission-denied');
const { lookup } = require('../../../shared/error-codes');
const { respondError } = require('../../../shared/api-response');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../../middleware/audit-logger');
const { siteContactGaps } = require('@gacp/validation/site-contact');
const { siteContactEditable } = require('../../../shared/site-contact-window');

const router = express.Router();

function refuse(res, code, data) {
    const row = lookup(code);
    return res.status(row.httpStatus).json({ success: false, code, error: row.messageTh, messageTh: row.messageTh, ...(data ? { data } : {}) });
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

router.patch('/:id/site-contact', authenticateHealth, async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const contact = {
            siteContactName: text(body.siteContactName),
            sitePhone: text(body.sitePhone),
            siteContactIsApplicant: body.siteContactIsApplicant === true,
            siteContactInformed: body.siteContactIsApplicant === true ? false : body.siteContactInformed === true,
        };

        const application = await applicationService.findOwnedApplicationForApplicant(req.params.id, { holderScope: await holderScope(req) });
        if (!application) {
            return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', error: 'APPLICATION_NOT_FOUND' });
        }
        try {
            await assertHolderCapability(req.user.id, application.entityId, 'SUBMIT_APPLICATION');
        } catch (denied) {
            return res.status(403).json(entityPermissionDeniedBody(denied.permission || 'SUBMIT_APPLICATION'));
        }

        const gaps = siteContactGaps(contact);
        if (gaps.length > 0) { return refuse(res, 'SITE_CONTACT_INVALID', { gaps }); }

        if (!siteContactEditable(application)) { return refuse(res, 'SITE_CONTACT_LOCKED'); }

        const written = await prisma.$executeRaw`
            UPDATE applications
            SET "formData" = jsonb_set("formData", '{farmData}',
                    CASE WHEN jsonb_typeof("formData"->'farmData') = 'object' THEN "formData"->'farmData' ELSE '{}'::jsonb END
                    || ${JSON.stringify(contact)}::jsonb, true),
                "updatedAt" = NOW(),
                "updatedBy" = ${req.user.id},
                "version" = "version" + 1
            WHERE id = ${application.id}
              AND status::text = ${application.status}
              AND jsonb_typeof("formData") = 'object'
              AND (status::text <> 'AUDIT_CONFIRMED' OR "scheduledDate" IS NULL OR "scheduledDate" > NOW())`;
        if (written === 0) { return refuse(res, 'SITE_CONTACT_LOCKED'); }

        await auditLogger.log({
            category: AuditCategory.APPLICATION,
            action: 'SITE_CONTACT_UPDATED',
            severity: AuditSeverity.INFO,
            actorId: req.user.id,
            actorRole: 'health',
            actorType: 'HEALTH',
            resourceType: ResourceType.APPLICATION,
            resourceId: application.id,
            organizationId: application.organizationId,
            metadata: { applicationNumber: application.applicationNumber, status: application.status, contactIsApplicant: contact.siteContactIsApplicant },
        });

        return res.json({
            success: true,
            data: {
                applicationNumber: application.applicationNumber,
                siteContactName: contact.siteContactName,
                sitePhone: contact.sitePhone,
                siteContactIsApplicant: contact.siteContactIsApplicant,
            },
        });
    } catch (error) {
        return respondError(res, req, error, { message: 'Failed to update the on-site contact' });
    }
});

module.exports = router;
