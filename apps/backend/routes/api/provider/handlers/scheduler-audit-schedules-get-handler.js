const {
    authenticateProvider,
    requireRole,
    logger,
    toInt,
    dt,
    buildSchedulerQueueItem,
    isReadyToSchedule,
    buildPaymentMap,
    invoiceService,
} = require('./scheduler-handler-deps');
const { ROLE_GROUPS } = require('../../../../shared/canonical-rbac');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');
const applicationService = require('../../../../services/application-service');
const providerUserService = require('../../../../services/provider-user-service');
const { getZonedParts } = require('../../../../utils/working-days');
const { readFilingSite } = require('../../../../services/application-service/application-farm-materialization');

const schedulerAuditSchedulesGet = [
    authenticateProvider,
    // The schedule names which inspector visits which farm, with coordinates and payment
    // state: the dispatcher's working list, not the reviewer's or the inspector's
    // (role-workflow audit 2026-10-06 R-H2). An inspector reads its own jobs on
    // /api/provider/auditor/dashboard.
    requireRole(ROLE_GROUPS.SCHEDULERS),
    async (req, res) => {
        try {
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const page = toInt(req.query.page, 1, 1, 100000);
            const limit = toInt(req.query.limit, 20);
            const status = String(req.query.status || 'all');
            const queue = String(req.query.queue || 'scheduled_upcoming').toLowerCase();
            const where = {
                isDeleted: false,
                ...organizationWhere,
                OR: [
                    { scheduledDate: { not: null } },
                    {
                        status: {
                            in: [
                                'DOC_APPROVED',
                                'AUDIT_FEE_PAID',
                                'AUDIT_CONFIRMED',
                                'AUDIT_PASSED',
                                'AUDIT_NOT_PASSED',
                                'CAR_REVIEWING',
                            ],
                        },
                    },
                ],
            };

            if (status !== 'all') { where.status = status; }
            if (req.query.auditorId) { where.auditorId = String(req.query.auditorId); }

            const start = req.query.startDate ? dt(req.query.startDate) : null;
            const end = req.query.endDate ? dt(req.query.endDate) : null;
            const apps = await applicationService.listSchedulerScheduleApplications({ where, take: 1000 });

            const auditorIds = [...new Set(apps.map((application) => application.auditorId).filter(Boolean))];
            const auditors = await providerUserService.listAuditorsByIdsForScheduler(auditorIds);
            const auditorMap = new Map(auditors.map((auditor) => [auditor.id, auditor]));
            const province = req.query.province ? String(req.query.province) : '';
            const paymentMap = await buildPaymentMap(invoiceService, apps);

            const audits = apps
                .map((app) => {
                    const queueItem = buildSchedulerQueueItem(app, auditorMap, paymentMap);
                    // The site this application is for, not the applicant's first farm.
                    const site = readFilingSite(app.formData || {});
                    const farm = { name: site.farmName || null, address: site.address || null, province: site.province || null, latitude: site.latitude, longitude: site.longitude };
                    return {
                        ...queueItem,
                        farm,
                    };
                })
                .filter((item) => !province || item.farm?.province === province)
                .filter((item) => {
                    const when = dt(item.scheduledDate);
                    if (start && (!when || when < start)) { return false; }
                    if (end && (!when || when > end)) { return false; }
                    if (queue === 'ready_to_schedule') {
                        return isReadyToSchedule(item);
                    }
                    if (queue === 'reinspection_required') {
                        return item.isReinspectionRequired;
                    }
                    return !!when;
                });

            const total = audits.length;
            const data = audits.slice((page - 1) * limit, (page - 1) * limit + limit);
            const now = new Date();
            const week = new Date(now);
            week.setTime(week.getTime() + 7 * 24 * 60 * 60 * 1000); // instant arithmetic, no calendar read

            return res.json({
                success: true,
                data,
                pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
                summary: {
                    today: audits.filter((item) => {
                        const when = dt(item.scheduledDate);
                        return when ? getZonedParts(when).isoDate === getZonedParts(now).isoDate : false; // same Bangkok day
                    }).length,
                    thisWeek: audits.filter((item) => {
                        const when = dt(item.scheduledDate);
                        return when ? when <= week : false;
                    }).length,
                    unassigned: audits.filter((item) => !item.auditorId).length,
                    withGPS: audits.filter((item) => item.farm?.latitude && item.farm?.longitude).length,
                },
            });
        } catch (error) {
            logger.error('[provider] scheduler/audits/schedules failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch audit schedule',
            });
        }
    },
];

module.exports = {
    schedulerAuditSchedulesGet,
};
