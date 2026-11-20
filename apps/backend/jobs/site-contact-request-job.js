'use strict';

/**
 * Ask for the person on site where a filed application names no one (operator order 65(2),
 * 2026-10-09). The wizard and the submit door require a name and a Thai phone for every filing made
 * since; this reaches the filings made before, and any other that lacks one, while the applicant can
 * still add it (shared/site-contact-window.js: after filing and before the visit). The applicant and
 * the holder get an in-app notice, the channel the system uses for every ask, once per application.
 *
 * The ask lives under the server-owned formData.siteContactRequest. A run claims it ({ claimedAt })
 * before the notice goes out, so overlapping runs send one notice, and records { claimedAt, sentAt }
 * only after the notice reached somebody: the dispatcher's queues show sentAt as when the applicant
 * was asked, so nothing says asked when nobody was told (review of rounds 5-6, M-1). A notice that
 * reached nobody or threw gives the claim back and the next run asks again; asking twice after a
 * notice that threw midway is the lesser harm. A claim still without sentAt after
 * CLAIM_EXPIRES_AFTER_MS was left by a run that died, and a later run takes it over. Which
 * applications are asked is shared/applicant-contact.js siteContactStateOf, the rule the dispatcher's
 * card reads, so the card promises an ask only where this job makes one.
 *
 * Runs hourly in jobs/scheduler.js.
 *
 * @module jobs/site-contact-request-job
 */

const { prisma } = require('../services/prisma-database');
const { withoutTenantScope, runWithTenantContext } = require('../services/tenant-context');
const { NotifyType } = require('../services/notification-service');
const { notifyApplicationParties } = require('../services/notification/application-parties');
const { siteContactStateOf } = require('../shared/applicant-contact');
const { EDITABLE_BEFORE_THE_VISIT } = require('../shared/site-contact-window');
const logger = require('../shared/logger');

const CLAIM_EXPIRES_AFTER_MS = 30 * 60 * 1000;

async function claim(applicationId, claimedAt, expiredBefore) {
    const written = await prisma.$executeRaw`
        UPDATE applications
        SET "formData" = jsonb_set("formData", '{siteContactRequest}', jsonb_build_object('claimedAt', ${claimedAt}::text), true)
        WHERE id = ${applicationId}
          AND jsonb_typeof("formData") = 'object'
          AND NOT COALESCE(("formData"->'siteContactRequest') ? 'sentAt', false)
          AND COALESCE(("formData"->'siteContactRequest'->>'claimedAt')::timestamptz < ${expiredBefore}::timestamptz, true)`;
    return written > 0;
}

async function recordSent(applicationId, claimedAt) {
    await prisma.$executeRaw`
        UPDATE applications
        SET "formData" = jsonb_set("formData", '{siteContactRequest}',
            jsonb_build_object('claimedAt', ${claimedAt}::text, 'sentAt', ${new Date().toISOString()}::text), true)
        WHERE id = ${applicationId} AND jsonb_typeof("formData") = 'object'`;
}

async function release(applicationId, claimedAt) {
    await prisma.$executeRaw`
        UPDATE applications SET "formData" = "formData" - 'siteContactRequest'
        WHERE id = ${applicationId} AND "formData"->'siteContactRequest'->>'claimedAt' = ${claimedAt}`;
}

/**
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ checked: number, asked: number, skipped: number }>} skipped = filings that are not
 *   an object, which nothing can be asked on
 */
async function runSiteContactRequests({ now = new Date() } = {}) {
    const candidates = await withoutTenantScope(() => prisma.application.findMany({
        where: { isDeleted: false, status: { in: [...EDITABLE_BEFORE_THE_VISIT] } },
        select: { id: true, applicationNumber: true, organizationId: true, status: true, scheduledDate: true, formData: true },
    }));

    const expiredBefore = new Date(now.getTime() - CLAIM_EXPIRES_AFTER_MS).toISOString();
    let asked = 0;
    let skipped = 0;
    for (const application of candidates) {
        const filing = application.formData;
        if (!filing || typeof filing !== 'object' || Array.isArray(filing)) { skipped += 1; continue; }
        if (!siteContactStateOf(application, now).siteContactRequestPending) { continue; }

        const claimedAt = new Date().toISOString();
        try {
            if (!(await claim(application.id, claimedAt, expiredBefore))) { continue; }
            let delivered = 0;
            try {
                const told = await runWithTenantContext({ organizationId: application.organizationId }, () => notifyApplicationParties(application.id, {
                    type: NotifyType.SITE_CONTACT_REQUESTED,
                    data: { applicationNumber: application.applicationNumber },
                }));
                delivered = told?.delivered ?? 0;
            } catch (error) {
                logger.error(`[site-contact-request] notice for ${application.applicationNumber} threw: ${error?.message}`);
            }
            if (delivered === 0) {
                logger.warn(`[site-contact-request] ask for ${application.applicationNumber} reached nobody; released for the next run`);
                await release(application.id, claimedAt);
                continue;
            }
            await recordSent(application.id, claimedAt);
            asked += 1;
        } catch (error) {
            logger.error(`[site-contact-request] ask for ${application.applicationNumber} failed: ${error?.message}`);
        }
    }
    if (skipped > 0) {
        logger.warn(`[site-contact-request] ${skipped} filed application(s) not asked: the filing is not an object`);
    }
    return { checked: candidates.length, asked, skipped };
}

module.exports = { runSiteContactRequests };
