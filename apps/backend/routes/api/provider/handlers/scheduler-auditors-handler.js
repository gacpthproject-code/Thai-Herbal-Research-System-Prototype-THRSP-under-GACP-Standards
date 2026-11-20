const {
    authenticateProvider,
    logger,
    PERMISSIONS,
    normalizeRole,
    requireCanonicalPermission,
    getApplicantName,
} = require('./scheduler-handler-deps');
const providerUserService = require('../../../../services/provider-user-service');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');

const schedulerAuditors = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_SCHEDULE),
    async (req, res) => {
        try {
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const auditors = await providerUserService.listAuditorsForScheduler(organizationWhere);

            return res.json({
                success: true,
                data: auditors.map((auditor) => ({
                    id: auditor.id,
                    role: auditor.role,
                    canonicalRole: normalizeRole(auditor.role),
                    firstName: auditor.firstName || '',
                    lastName: auditor.lastName || '',
                    fullName: getApplicantName(auditor),
                })),
            });
        } catch (error) {
            logger.error('[provider] scheduler/auditors failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch auditors',
            });
        }
    },
];

module.exports = {
    schedulerAuditors,
};
