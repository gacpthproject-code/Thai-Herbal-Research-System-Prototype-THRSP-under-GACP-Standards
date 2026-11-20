/**
 * Domain-specific notification helpers.
 * Extracted from notification-service.js for readability.
 *
 * Each function fetches the relevant application/users and delegates to
 * the core notification primitives (applicant-side notices go through
 * ./application-parties so the holder is told too).
 *
 * @module services/notification/domain-helpers
 */

const prisma = require('../prisma-database').prisma;
const { createLogger } = require('../../shared/logger');
const logger = createLogger('notification-domain');

const { createBulkNotifications, NotifyType } = require('../notification-service');
const { notifyApplicationParties } = require('./application-parties');
const { PAYMENT_MODES, TRIAL_RECEIPT_NOTICE } = require('../../shared/payment-mode');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { listGroupMemberUserIds } = require('../../shared/user-groups');
// Platform-wide staff lookups run outside the requester's tenant (see
// notifyAdminCheckoutPriceDrift). services/tenant-context.js owns the scope.
const { withoutTenantScope } = require('../tenant-context');
const { DEFAULT_TIME_ZONE } = require('../../utils/working-days');

// 'EXECUTIVE' was kept verbatim through the expand phase because it has no
// canonical mapping. It is a QUARANTINE_VALUE, and 20260801000000 ABORTS when a
// quarantined row exists — it ran clean, so no row holds it. A dead value left
// in an authorization filter is an invitation to copy the pattern.
const SLA_ESCALATION_ROLES = Object.freeze([CANONICAL_ROLES.SYSTEM_ADMIN_DTAM]);

// Who may read a staff alert (orders 14 and 17, operator 2026-10-06): the platform admin, the one
// role that crosses organizations, and, for an alert about one application, the DTAM admins of that
// application's own organization. A DTAM admin of any other organization, the platform's default
// one included, is not a recipient: these alerts carry the application's number and its payment
// state. This is the WHERE itself, so the no-recipient report names exactly the set that was asked.
async function staffAlertWhere(applicationId) {
    const organizationId = await applicationOrganization(applicationId);
    return {
        isDeleted: false,
        OR: [
            { role: CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM },
            ...(organizationId ? [{ role: CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, organizationId }] : []),
        ],
    };
}

// Across tenants: the alert is raised inside an applicant's or a sweep's context, and the
// application's organization decides, not the caller's. A read that fails names no organization,
// so only the platform admin is told: an alert may reach fewer staff, never another organization.
async function applicationOrganization(applicationId) {
    if (!applicationId) { return null; }
    try {
        const application = await withoutTenantScope(() => prisma.application.findUnique({
            where: { id: applicationId },
            select: { organizationId: true },
        }));
        return application?.organizationId || null;
    } catch (error) {
        logger.error('[NotificationService] could not read the organization behind a staff alert; telling the platform admin only:',
            error?.message || String(error));
        return null;
    }
}

// ── Payment ────────────────────────────────────────────────

/**
 * The money of one milestone is in and its receipt / tax invoice is issued
 * (checkout-settlement-service). Told to the applicant and the holder (order 32).
 */
/**
 * Work arrived in the dispatcher's queue (order 27; payment starts the work, 2026-10-06): every
 * dispatcher of the application's organization is told, nobody in another organization. Best
 * effort: never throws.
 *
 * @param {string} applicationId
 * @param {{ title: string, message: string, data?: object }} notice
 * @returns {Promise<{ recipients: string[], delivered: number }>}
 */
async function notifyDispatchersOfQueuedWork(applicationId, { title, message, data = {} }) {
    try {
        const application = await prisma.application.findUnique({
            where: { id: applicationId }, select: { applicationNumber: true, organizationId: true },
        });
        if (!application || !application.organizationId) { return { recipients: [], delivered: 0 }; }
        const userIds = await withoutTenantScope(() => listGroupMemberUserIds(
            prisma, application.organizationId, CANONICAL_ROLES.DISPATCHER,
        ));
        if (userIds.length === 0) {
            logger.warn(`[NotificationService] no dispatcher in organization ${application.organizationId} for ${application.applicationNumber}`);
            return { recipients: [], delivered: 0 };
        }
        await withoutTenantScope(() => createBulkNotifications({
            userIds,
            type: 'INFO',
            title,
            message,
            data: { applicationId, applicationNumber: application.applicationNumber, actionUrl: '/provider/coordinator', ...data },
            priority: 'HIGH',
        }));
        return { recipients: userIds, delivered: userIds.length };
    } catch (error) {
        logger.error('[NotificationService] Dispatcher queue notice error:', error);
        return { recipients: [], delivered: 0 };
    }
}

/** `paymentMode` is the mode of the money event being announced, never the key of the day. */
async function notifyPaymentSuccess(applicationId, milestone, { checkoutOrderId = null, paymentMode } = {}) {
    try {
        const application = await prisma.application.findUnique({
            where: { id: applicationId }, select: { applicationNumber: true },
        });
        if (!application) {return { recipients: [], delivered: 0 };}
        const isM1 = milestone === 'M1';
        await notifyDispatchersOfQueuedWork(applicationId, {
            title: 'มีคำขอเข้าคิวผู้จัดคิว',
            message: isM1
                ? `คำขอเลขที่ ${application.applicationNumber} ชำระงวดที่ 1 แล้ว รอมอบหมายผู้ตรวจเอกสาร`
                : `คำขอเลขที่ ${application.applicationNumber} ชำระงวดที่ 2 แล้ว รอนัดตรวจพื้นที่`,
            // No checkoutOrderId: it marks the applicant's notice as sent (notifyPaymentSettledOnce),
            // so on a dispatcher's notice it would stop a retry of the applicant's (security review 2026-10-09 L1).
            data: { milestone },
        });
        const message = isM1
            ? `ได้รับชำระงวดที่ 1 ของคำขอเลขที่ ${application.applicationNumber} แล้ว ใบเสร็จรับเงิน/ใบกำกับภาษีพร้อมดาวน์โหลด คำขอเข้าคิวตรวจเอกสาร`
            : `ได้รับชำระงวดที่ 2 ของคำขอเลขที่ ${application.applicationNumber} แล้ว ใบเสร็จรับเงิน/ใบกำกับภาษีพร้อมดาวน์โหลด คำขอเข้าคิวนัดตรวจประเมินแปลง`;
        return await notifyApplicationParties(applicationId, {
            type: isM1 ? NotifyType.PAYMENT_PHASE1_SUCCESS : NotifyType.PAYMENT_PHASE2_SUCCESS,
            title: isM1 ? 'ชำระงวดที่ 1 สำเร็จ ออกใบเสร็จแล้ว' : 'ชำระงวดที่ 2 สำเร็จ ออกใบเสร็จแล้ว',
            message: paymentMode === PAYMENT_MODES.TRIAL ? `${message} ${TRIAL_RECEIPT_NOTICE}` : message,
            data: { applicationNumber: application.applicationNumber, milestone, checkoutOrderId },
            priority: 'HIGH',
            actionUrl: `/health/payments?app=${applicationId}`,
        });
    } catch (error) {
        logger.error('[NotificationService] Payment success error:', error);
        return { recipients: [], delivered: 0 };
    }
}

// ── Revision & Audit ───────────────────────────────────────

async function notifyRevisionRequired(applicationId, reason, deadline) {
    try {
        const application = await prisma.application.findUnique({
            where: { id: applicationId }, select: { applicationNumber: true },
        });
        if (!application) {return;}
        // Buddhist-era long-form Bangkok date ("16 พฤษภาคม พุทธศักราช 2569"), never an ISO string.
        let deadlineThai = 'ภายในเวลาที่กำหนด';
        if (deadline) {
            try {
                deadlineThai = new Date(deadline).toLocaleDateString('th-TH', {
                    timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric', era: 'long',
                });
            } catch (_e) {
                deadlineThai = String(deadline);
            }
        }
        await notifyApplicationParties(applicationId, {
            type: NotifyType.REVISION_REQUESTED,
            title: 'คำขอต้องแก้ไข',
            message: `คำขอเลขที่ ${application.applicationNumber} ต้องแก้ไขให้แล้วเสร็จภายในวันที่ ${deadlineThai}`,
            data: { applicationNumber: application.applicationNumber, reason, deadline },
            priority: 'URGENT',
            actionUrl: `/health/applications/${applicationId}/revision`,
        });
    } catch (error) {
        logger.error('[NotificationService] Revision required error:', error);
    }
}

async function notifyDocumentApproved(applicationId, paymentUrl) {
    try {
        const application = await prisma.application.findUnique({
            where: { id: applicationId }, select: { applicationNumber: true },
        });
        if (!application) {return;}
        await notifyApplicationParties(applicationId, {
            type: NotifyType.DOCUMENT_APPROVED,
            title: 'เอกสารผ่านการตรวจ',
            message: `คำขอเลขที่ ${application.applicationNumber} ผ่านการตรวจเอกสารแล้ว`,
            data: { applicationNumber: application.applicationNumber, paymentUrl },
            priority: 'HIGH',
            // หน้าจ่ายเงินจริงคือ /health/payments และรับ ?app= เพื่อเลือกคำขอให้เลย
            actionUrl: paymentUrl || `/health/payments?app=${applicationId}`,
        });
    } catch (error) {
        logger.error('[NotificationService] Document approved error:', error);
    }
}

/**
 * Deadline-approaching reminder to the applicant and the holder.
 *
 * `opts.unit === 'hours'` renders ชั่วโมง (the cron passes 24/48-hour buckets).
 * Returns the delivery outcome when at least one row was written and null otherwise,
 * so the caller stamps the reminder as sent ONLY on success and the next run retries.
 *
 * @param {string} applicationId
 * @param {number} remaining — days by default; hours when opts.unit==='hours'
 * @param {{ unit?: 'days'|'hours', deadlineType?: string }} [opts]
 * @returns {Promise<object|null>}
 */
async function notifyRevisionDeadlineApproaching(applicationId, remaining, opts = {}) {
    try {
        const application = await prisma.application.findUnique({
            where: { id: applicationId }, select: { applicationNumber: true },
        });
        if (!application) {return null;}
        const isHours = opts.unit === 'hours';
        const deadlineText = isHours ? `${remaining} ชั่วโมง` : `${remaining} วัน`;
        const outcome = await notifyApplicationParties(applicationId, {
            type: NotifyType.DEADLINE_REMINDER,
            title: 'ใกล้ครบกำหนดแก้ไข',
            message: `คำขอเลขที่ ${application.applicationNumber} ใกล้ครบกำหนดแก้ไขในอีก ${deadlineText} กรุณาส่งการแก้ไขก่อนครบกำหนด มิฉะนั้นคำขอจะถูกยกเลิกอัตโนมัติ`,
            data: {
                applicationNumber: application.applicationNumber,
                remaining,
                unit: isHours ? 'hours' : 'days',
                ...(opts.deadlineType ? { deadlineType: opts.deadlineType } : {}),
            },
            priority: 'HIGH',
            actionUrl: `/health/applications/${applicationId}`,
        });
        return outcome.delivered > 0 ? outcome : null;
    } catch (error) {
        logger.error('[NotificationService] Revision deadline approaching error:', error);
        return null;
    }
}

async function notifySlaBreach(applicationId, daysStuck, applicationNumber) {
    try {
        const admins = await prisma.user.findMany({
            where: { role: { in: [...SLA_ESCALATION_ROLES] }, isDeleted: false },
        });
        if (admins.length > 0) {
            await createBulkNotifications({
                userIds: admins.map(a => a.id),
                type: NotifyType.SLA_BREACH,
                title: 'ระบบแจ้งเตือน SLA เกินกำหนด (5 วัน)',
                message: `คำขอ ${applicationNumber || applicationId} ล่าช้ามาแล้ว ${daysStuck} วัน`,
                data: { applicationId, applicationNumber, daysStuck },
                priority: 'URGENT',
            });
        }
    } catch (error) {
        logger.error('[NotificationService] SLA breach error:', error);
    }
}

/**
 * The recipients of a staff alert, resolved across tenants.
 *
 * Every alert below is raised inside an APPLICANT's request or a sweep, which binds that
 * organization (middleware/tenant-context-middleware.js). `User` is tenant-scoped and org
 * read-scoping is default-ON, so a plain findMany returns only staff who happen to sit in the
 * bound organization, and the caller's `length > 0` guard then falls through silently. The escape
 * hatch is exactly what it is documented for; staffAlertWhere decides who qualifies.
 *
 * @param {object} where staffAlertWhere(...)
 * @returns {Promise<Array<{id: string}>>}
 */
function findAlertStaff(where) {
    return withoutTenantScope(() => prisma.user.findMany({ where, select: { id: true } }));
}

/**
 * Write a staff alert so that each row is stamped with the RECIPIENT's own
 * organizationId.
 *
 * The write runs in the same escape hatch as the lookup: with no context bound,
 * createBulkNotifications takes its per-recipient `userOrgMap` branch, which is
 * what makes the row visible in the recipient's own org-scoped inbox. Left
 * inside the applicant's context, the extension stamped the APPLICANT's
 * organizationId onto a row whose userId is an admin in another organization,
 * and nobody could read it (whole-branch review C3/S5/S9).
 *
 * @param {{admins: Array<{id: string}>, type: string, title: string,
 *          message: string, data: object}} args
 * @returns {Promise<void>}
 */
function sendToStaff({ admins, type, title, message, data }) {
    return withoutTenantScope(() => createBulkNotifications({
        userIds: admins.map((a) => a.id),
        type,
        title,
        message,
        data,
        priority: 'URGENT',
    }));
}

/**
 * An alert that reached nobody, said out loud AND written down.
 *
 * ERROR, not info: the applicant's screen says "เจ้าหน้าที่ได้รับแจ้งแล้ว" on
 * both of these paths, so zero recipients is the same outcome as not sending
 * it. A console line disappears with the process; the audit row is what makes
 * the day an alert went nowhere findable afterwards.
 *
 * Best-effort in both directions: an audit sink that is down must not turn a
 * best-effort notification helper into a throw.
 *
 * @param {{alert: string, applicationId: string, applicationNumber: string|null,
 *          details?: object}} args
 * @returns {Promise<void>}
 */
async function reportAlertReachedNobody({ alert, applicationId, applicationNumber, recipientWhere, details = {} }) {
    logger.error(`[NotificationService] ${alert} alert has NO recipient — nobody was told`, {
        applicationId, applicationNumber: applicationNumber || null,
        // The predicate the lookup ran, not a second spelling of it: whoever
        // picks this line up has to know who was ever eligible (review r2, minor 1).
        recipientWhere, ...details,
    });
    try {
        // Lazy require: the audit chain is not on any successful path here.
        const { auditLogger, AuditCategory, AuditSeverity, ResourceType } =
            require('../../middleware/audit-logger');
        await auditLogger.log({
            category: AuditCategory.SYSTEM,
            action: 'ADMIN_ALERT_NO_RECIPIENT',
            severity: AuditSeverity.ERROR,
            actorId: 'SYSTEM',
            // NOT NULL in prisma/schema/audit.prisma, and the writer supplies no
            // default: a row without it is dropped inside log()'s own catch.
            actorRole: 'SYSTEM',
            actorType: 'SYSTEM',
            resourceType: ResourceType.APPLICATION,
            resourceId: applicationId,
            metadata: { alert, applicationNumber: applicationNumber || null, ...details },
        });
    } catch (auditErr) {
        logger.error('[NotificationService] could not record ADMIN_ALERT_NO_RECIPIENT',
            auditErr?.message || String(auditErr));
    }
}

/**
 * Will the system itself issue this application's missing quotation on the
 * applicant's next visit to the payments list?
 *
 * Only inside the mint window: `ensureQuotationForIssuedApplication` returns
 * without minting unless the status is in SELF_HEAL_STATUSES = {SUBMITTED,
 * PENDING_DOC_FEE} (services/quotation-issuance-on-submit.js), the window in
 * which nothing has been paid yet. An application past it (a renewal whose document
 * check passed, any M2-payable filing) is not re-issued by the system. Telling staff
 * that the system re-issues by itself names an act the product never performs,
 * which is the rule this alert was rewritten to obey (F-G4-64 R2), and there is no
 * staff issuance door either (ledger F-G4-71).
 *
 * A status that cannot be read answers NO: an alert may under-promise, it may
 * not promise on a fact it does not have.
 *
 * @param {string} applicationId
 * @returns {Promise<boolean>}
 */
async function willSystemReissueOnNextVisit(applicationId) {
    try {
        // Lazy require: quotation-issuance-on-submit requires THIS module to
        // raise the alert, so a top-level require would close the cycle.
        const { SELF_HEAL_STATUSES } = require('../quotation-issuance-on-submit');
        // Across tenants, like the recipient lookup: the renewal door runs
        // inside the applicant's own context, and a narrowed read that answered
        // nothing would silently downgrade to "no promise" for the wrong reason.
        const application = await withoutTenantScope(() => prisma.application.findUnique({
            where: { id: applicationId },
            select: { status: true },
        }));
        return SELF_HEAL_STATUSES.has(String(application?.status || '').toUpperCase());
    } catch (error) {
        logger.error('[NotificationService] could not read the status behind a quotation alert; promising nothing:',
            error?.message || String(error));
        return false;
    }
}

/**
 * Tell the admin queue that an application was submitted with no quotation.
 * F-G4-64 R3: with the acceptance gate fail-closed, this applicant cannot pay
 * until somebody acts, so this is an operational alert, not a log line.
 *
 * Best-effort, like every other helper in this file: a notification sink that
 * is down must not cost an applicant their submission.
 *
 * @param {{applicationId: string, applicationNumber: string|null, reason: string}} args
 * @returns {Promise<void>}
 */
async function notifyAdminQuotationIssueFailed({ applicationId, applicationNumber, reason }) {
    try {
        const recipientWhere = await staffAlertWhere(applicationId);
        const admins = await findAlertStaff(recipientWhere);
        if (admins.length === 0) {
            await reportAlertReachedNobody({
                alert: 'QUOTATION_ISSUE_FAILED',
                applicationId,
                applicationNumber,
                recipientWhere,
                details: { reason: reason || null },
            });
            return;
        }
        // What the product really does next, for THIS application. Inside the
        // mint window the applicant's own GET on the payments list re-issues,
        // once, under control (ensureQuotationForIssuedApplication); outside it
        // nothing re-issues at all, and the retired wording promised every
        // reader the first case. The wording staff cannot act on either way is
        // "issue it yourself": there is no quotation route under
        // routes/api/admin, /provider or /platform-admin and no screen for one.
        const systemWillReissue = await willSystemReissueOnNextVisit(applicationId);
        const nextStep = systemWillReissue
            ? 'ระบบจะออกใบให้อัตโนมัติเมื่อผู้ยื่นคำขอเปิดหน้ารายการชำระเงินครั้งต่อไป'
            : 'คำขออยู่นอกช่วงที่ระบบออกใบเสนอราคาให้อัตโนมัติได้ ผู้ยื่นคำขอจะชำระเงินไม่ได้จนกว่าจะมีใบเสนอราคาของคำขอนี้';
        await sendToStaff({
            admins,
            type: NotifyType.QUOTATION_ISSUE_FAILED,
            title: 'ออกใบเสนอราคาไม่สำเร็จ',
            message: `คำขอ ${applicationNumber || applicationId} ยังไม่มีใบเสนอราคา ผู้ยื่นคำขอจึงชำระเงินไม่ได้ `
                + `กรุณาตรวจสอบสถานะคำขอและตารางค่าธรรมเนียมที่ใช้กับคำขอนี้ ${nextStep}`,
            data: { applicationId, applicationNumber, reason, systemWillReissue },
        });
    } catch (error) {
        logger.error('[NotificationService] quotation issue-failed alert error:', error);
    }
}

/**
 * Is an URGENT price-drift alert of this version for this (application, milestone) still
 * sitting unread? A lookup that throws answers `false`, because a duplicate alert is a nuisance
 * and silence on a money path is not.
 *
 * @param {{applicationId: string, milestone?: string, audience: string}} args
 * @returns {Promise<boolean>}
 */
async function isCheckoutPriceDriftAlertPending({ applicationId, milestone, audience }) {
    try {
        // Across tenants, because that is where the rows are. sendToStaff
        // writes inside withoutTenantScope, so createBulkNotifications takes its
        // per-recipient branch and every alert row carries the RECIPIENT's
        // organizationId (notification-service.js) — never the applicant's, on
        // either path. This helper runs inside the applicant's checkout request,
        // and Notification is tenant-scoped, so a plain read here would be
        // narrowed to the applicant's organization (applyReadScopes in
        // tenant-prisma-extension.js, org read scope default-ON) and could never
        // match the rows it is looking for: the alert would fan out again on
        // every press, which is exactly what this lookup exists to prevent.
        const open = await withoutTenantScope(() => prisma.notification.findFirst({
            where: {
                type: NotifyType.CHECKOUT_PRICE_DRIFT,
                isRead: false,
                // metadata is the `data` block createBulkNotifications stores
                // verbatim (notification-service.js), so the incident and its
                // version are identified by the keys the alert carries.
                AND: [
                    { metadata: { path: ['applicationId'], equals: applicationId } },
                    { metadata: { path: ['milestone'], equals: milestone || null } },
                    { metadata: { path: ['audience'], equals: audience } },
                ],
            },
            select: { id: true },
        }));
        return Boolean(open);
    } catch (error) {
        logger.error('[NotificationService] price-drift dedup lookup failed; alerting anyway:', error);
        return false;
    }
}

const PRICE_DRIFT_TITLE = 'ยอดเรียกเก็บไม่ตรงกับใบเสนอราคาที่ยอมรับไว้';
// No promise of an automatic re-issue in either version: the row exists and is ACCEPTED, and the
// self-heal only issues where there is no usable row. What is true is the check, and that the
// charge is refused until the two figures agree.
const PRICE_DRIFT_CHECK = 'กรุณาตรวจสอบว่าคำขอถูกแก้ไขหลังยอมรับใบเสนอราคาหรือไม่ และตรวจตารางค่าธรรมเนียมที่ใช้กับคำขอนี้ '
    + 'ผู้ยื่นคำขอชำระเงินไม่ได้จนกว่ายอดทั้งสองจะตรงกัน';

/**
 * The two versions of the price-drift alert (order 55(b), operator 2026-10-09).
 *
 * The company finance officers of the application's organization reconcile the money, so they get
 * the figures and the document number. The platform admin crosses organizations but reads no
 * finance data (order 47), so it gets the incident without them. No other role gets either, and an
 * application whose organization cannot be read reaches no finance officer (order 17).
 *
 * The full version cites the quotation, whose accepted figure the charge was checked against, and
 * the instalment's invoice when the refused charge already has one (a re-entered order, minted with
 * its invoice). A fresh mint is refused before its invoice exists, until order 55(a) issues every
 * instalment's invoice when it becomes payable.
 */
const PRICE_DRIFT_VERSIONS = Object.freeze([
    Object.freeze({
        audience: 'COMPANY_FINANCE',
        recipientWhere: (organizationId) => (organizationId
            ? { isDeleted: false, role: CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM, organizationId }
            : null),
        content: ({
            applicationId, applicationNumber, quotationNumber, invoiceNumber, acceptedPhaseTotal, livePhaseTotal, milestone,
        }) => ({
            message: `คำขอ ${applicationNumber || applicationId} ยอดที่ระบบจะเรียกเก็บ`
                + `${invoiceNumber ? `ตามใบแจ้งหนี้ ${invoiceNumber}` : ''} ${livePhaseTotal} บาท `
                + `ไม่ตรงกับยอดของงวดนี้ในใบเสนอราคา ${quotationNumber || 'ที่ยังไม่มีเลขที่'} ที่ผู้ยื่นคำขอยอมรับไว้ `
                + `${acceptedPhaseTotal} บาท ระบบจึงไม่สร้างรายการชำระเงิน ${PRICE_DRIFT_CHECK}`,
            data: {
                applicationId,
                applicationNumber,
                quotationNumber,
                invoiceNumber: invoiceNumber || null,
                acceptedPhaseTotal: String(acceptedPhaseTotal),
                livePhaseTotal: String(livePhaseTotal),
                milestone: milestone || null,
            },
        }),
    }),
    Object.freeze({
        audience: 'PLATFORM_ADMIN',
        recipientWhere: () => ({ isDeleted: false, role: CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM }),
        content: ({ applicationId, applicationNumber, milestone }) => ({
            message: `คำขอ ${applicationNumber || applicationId} ระบบไม่สร้างรายการชำระเงิน `
                + `เพราะยอดที่จะเรียกเก็บไม่ตรงกับใบเสนอราคาที่ผู้ยื่นคำขอยอมรับไว้ ${PRICE_DRIFT_CHECK}`,
            data: { applicationId, applicationNumber, milestone: milestone || null },
        }),
    }),
]);

/**
 * One version of the price-drift alert, once per unread incident of that version. Best-effort:
 * a failure here is logged and never reaches the other version or the refusal.
 */
async function sendPriceDriftVersion(version, incident, organizationId) {
    const { applicationId, applicationNumber, milestone } = incident;
    try {
        if (await isCheckoutPriceDriftAlertPending({ applicationId, milestone, audience: version.audience })) {
            logger.info(`[NotificationService] price-drift alert (${version.audience}) already unread for this application and milestone; not repeating`);
            return;
        }
        const recipientWhere = version.recipientWhere(organizationId);
        const staff = recipientWhere ? await findAlertStaff(recipientWhere) : [];
        if (staff.length === 0) {
            await reportAlertReachedNobody({
                alert: 'CHECKOUT_PRICE_DRIFT',
                applicationId,
                applicationNumber,
                recipientWhere,
                details: { milestone: milestone || null, audience: version.audience },
            });
            return;
        }
        const { message, data } = version.content(incident);
        await sendToStaff({
            admins: staff,
            type: NotifyType.CHECKOUT_PRICE_DRIFT,
            title: PRICE_DRIFT_TITLE,
            message,
            data: { ...data, audience: version.audience },
        });
    } catch (error) {
        logger.error(`[NotificationService] checkout price-drift alert (${version.audience}) error:`, error);
    }
}

/**
 * Tell staff that a checkout was refused because the amount it would charge disagrees with the
 * figures the applicant accepted (F-G4-64 R2): the company finance officers of the application's
 * organization in full, the platform admins without the figures (PRICE_DRIFT_VERSIONS).
 *
 * Why a notification and not only an audit row: CHECKOUT_PRICE_DRIFT's
 * applicant-facing copy ends "เจ้าหน้าที่ได้รับแจ้งแล้ว" and offers no other
 * action, so the applicant waits. The audit row alone could not honour that
 * sentence, and an instruction the system cannot honour is worse than no
 * instruction (the same rule the coordinator applied to QUOTATION_NOT_ISSUED).
 * The applicant cannot pay until somebody re-issues or corrects the quotation.
 *
 * Best-effort, like every other helper in this file: a notification sink that
 * is down must never turn a fail-closed 409 into a 500.
 *
 * ONE alert per unread incident, per version. A drifted order refuses on EVERY
 * re-entry and the applicant is given no other action, so they press again; each
 * press used to fan a fresh URGENT row out to every recipient, and twenty of them
 * bury the one row a staff member has to act on under nineteen copies of itself.
 * While an unread alert of a version for the same (applicationId, milestone) is
 * still in the queue, that version has already been delivered. Once its readers
 * have read it, a further refusal is news again and does alert. A dedup lookup
 * that fails alerts anyway: a duplicate is a nuisance, silence on a money path is not.
 *
 * Lookup AND write cross tenants (whole-branch review C3/C10/S5/S9): the recipients
 * are staff, not the applicant's colleagues, and each row has to carry the
 * RECIPIENT's organizationId or their own org-scoped inbox never returns it.
 *
 * @param {{applicationId: string, applicationNumber: string|null,
 *          quotationNumber: string|null, invoiceNumber?: string|null,
 *          acceptedPhaseTotal: string|number, livePhaseTotal: string|number,
 *          milestone?: string}} incident
 * @returns {Promise<void>}
 */
async function notifyAdminCheckoutPriceDrift(incident) {
    const organizationId = await applicationOrganization(incident.applicationId);
    for (const version of PRICE_DRIFT_VERSIONS) {
        await sendPriceDriftVersion(version, incident, organizationId);
    }
}

/**
 * A payment was taken and recorded, but the application could not move on
 * because an earlier milestone stands unpaid (fully refunded). The applicant has
 * paid and sees nothing happen, so staff must act: once per settled order.
 */
async function notifyAdminSettlementStatusRefused({
    applicationId, applicationNumber, checkoutOrderId, milestone, unpaidMilestones,
}) {
    try {
        const recipientWhere = await staffAlertWhere(applicationId);
        const admins = await findAlertStaff(recipientWhere);
        if (admins.length === 0) {
            await reportAlertReachedNobody({
                alert: 'SETTLEMENT_STATUS_REFUSED',
                applicationId,
                applicationNumber,
                recipientWhere,
                details: { checkoutOrderId, milestone, unpaidMilestones },
            });
            return;
        }
        await sendToStaff({
            admins,
            type: NotifyType.SETTLEMENT_STATUS_REFUSED,
            title: 'รับชำระเงินแล้ว แต่คำขอไปขั้นถัดไปไม่ได้',
            message: `คำขอ ${applicationNumber || applicationId} ชำระค่าบริการงวด ${milestone} แล้ว `
                + 'และระบบบันทึกการรับเงินกับออกใบกำกับภาษีแล้ว '
                + `แต่งวด ${unpaidMilestones.join(', ')} ถูกคืนเงินไปก่อนหน้า คำขอจึงยังอยู่ที่ขั้นเดิม `
                + 'กรุณาตรวจสอบและติดต่อผู้ยื่นคำขอผ่านการแจ้งเตือนในระบบ',
            data: { applicationId, applicationNumber, checkoutOrderId, milestone, unpaidMilestones },
        });
    } catch (error) {
        logger.error('[NotificationService] settlement status-refused alert error:', error);
    }
}

/**
 * The payment-closure sweep refused to run because a dated rule it needs has no entry in
 * force (order 39). Nothing is closed until someone adds it, and every unpaid application waits
 * at its payment gate meanwhile, so staff are told, not only a log line. Once per day at most:
 * the sweep runs daily.
 */
async function notifyAdminPaymentClosureHalted({ cause }) {
    try {
        const recipientWhere = await staffAlertWhere(null);
        const admins = await findAlertStaff(recipientWhere);
        if (admins.length === 0) {
            await reportAlertReachedNobody({ alert: 'PAYMENT_CLOSURE_HALTED', applicationId: null, applicationNumber: null, recipientWhere, details: { cause } });
            return;
        }
        await sendToStaff({
            admins,
            type: NotifyType.PAYMENT_CLOSURE_HALTED,
            title: 'ระบบปิดคำขอที่ไม่ชำระหยุดทำงาน',
            message: 'ระบบปิดคำขอที่ไม่ชำระค่าบริการภายในกำหนดไม่ได้ทำงานรอบนี้ เพราะไม่มีค่าตั้งที่มีผลอยู่ '
                + 'คำขอที่ค้างชำระจะยังไม่ถูกปิดจนกว่าจะเพิ่มค่าตั้งนั้น กรุณาแจ้งทีมพัฒนา',
            data: { cause },
        });
    } catch (error) {
        logger.error('[NotificationService] payment-closure-halted alert error:', error);
    }
}

/**
 * A payment reminder of this application had no eligible recipient (no applicant still in the
 * holder company and no member with SUBMIT_APPLICATION). Without a delivered third reminder the
 * closure sweep never closes it, so staff are told. Per recipient, per application and milestone:
 * a staff member who still holds an unread copy is not told again (the daily sweep does not repeat
 * it), and one who has read theirs is told again while the reminder still reaches nobody, whatever
 * another recipient left unread.
 */
async function notifyAdminPaymentReminderReachedNobody({ applicationId, applicationNumber, milestone }) {
    try {
        const recipientWhere = await staffAlertWhere(applicationId);
        const staff = await findAlertStaff(recipientWhere);
        if (staff.length === 0) {
            await reportAlertReachedNobody({ alert: 'PAYMENT_REMINDER_REACHED_NOBODY', applicationId, applicationNumber, recipientWhere, details: { milestone } });
            return;
        }
        const unread = await withoutTenantScope(() => prisma.notification.findMany({
            where: {
                type: NotifyType.PAYMENT_REMINDER_REACHED_NOBODY,
                isRead: false,
                userId: { in: staff.map((s) => s.id) },
                AND: [
                    { metadata: { path: ['applicationId'], equals: applicationId } },
                    { metadata: { path: ['milestone'], equals: milestone } },
                ],
            },
            select: { userId: true },
        }));
        const holding = new Set(unread.map((n) => n.userId));
        const due = staff.filter((s) => !holding.has(s.id));
        if (due.length === 0) { return; }
        await sendToStaff({
            admins: due,
            type: NotifyType.PAYMENT_REMINDER_REACHED_NOBODY,
            title: 'การเตือนชำระค่าบริการไม่ถึงผู้รับ',
            message: `คำขอเลขที่ ${applicationNumber} ไม่มีผู้รับการเตือนชำระค่าบริการที่ใช้งานได้ `
                + '(ทั้งผู้ยื่นและสมาชิกบริษัทผู้ถือที่มีสิทธิ์ยื่นคำขอ) ระบบจึงปิดคำขอเพราะไม่ชำระไม่ได้ '
                + 'กรุณาตรวจสอบสมาชิกของบริษัทผู้ถือ',
            data: { applicationId, applicationNumber, milestone },
        });
    } catch (error) {
        logger.error('[NotificationService] payment-reminder-reached-nobody alert error:', error);
    }
}

module.exports = {
    notifyAdminPaymentClosureHalted,
    notifyAdminPaymentReminderReachedNobody,
    notifyAdminSettlementStatusRefused,
    notifyAdminCheckoutPriceDrift,
    notifyAdminQuotationIssueFailed,
    notifyPaymentSuccess,
    notifyDispatchersOfQueuedWork,
    notifyRevisionRequired,
    notifyDocumentApproved,
    notifyRevisionDeadlineApproaching,
    notifySlaBreach,
};
