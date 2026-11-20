/**
 * Reports & Analytics Routes
 * Provides statistical data for provider Dashboard
 *
 * Batch 15 prisma-bypass cleanup (2026-05-16): every direct prisma call
 * moved into `metrics-service`. The route is now pure: parse query,
 * call service, transform numbers, cache.
 */
const express = require('express');
const router = express.Router();
const metricsService = require('../../../services/metrics-service');
const { authenticateProvider } = require('../../../middleware/auth-middleware');
const cache = require('../../../services/redis-service');
const logger = require('../../../shared/logger');
const { getZonedParts, startOfLocalDay, endOfLocalDay } = require('../../../utils/working-days');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const { normalizeRole, CANONICAL_ROLES } = require('../../../shared/canonical-rbac');

// Cache TTL in seconds (5 minutes)
const CACHE_TTL = 300;

/** The revenue part of the analytics: what finance reads (order 29). */
function revenueOnly(data) {
    return {
        period: data.period,
        financial: data.financial,
        dailyStats: data.dailyStats.map(({ date, revenue }) => ({ date, revenue })),
    };
}

/**
 * The work figures, named one by one: a field not listed here (money added later, or a payload
 * cached by another version) never reaches a role without revenue.
 */
function withoutRevenue(data) {
    return {
        period: data.period,
        applications: data.applications,
        users: data.users,
        performance: data.performance,
        dailyStats: data.dailyStats.map(({ date, applications, approved }) => ({ date, applications, approved })),
        plantTypeDistribution: data.plantTypeDistribution,
        topProvinces: data.topProvinces,
    };
}

/**
 * The organization a count door reads (order 17): the caller's own; the platform admin's
 * across organizations (null); none for a caller with no organization (answered here).
 */
function countScopeOrAnswer(req, res) {
    const scope = organizationScope(req.user);
    if (scope === DENY_ALL) {
        answerNoOrganization(res);
        return undefined;
    }
    return { orgId: scope ? scope.organizationId : null };
}

/**
 * The part of the analytics each role reads (order 29): the DTAM admin all of it, finance
 * the revenue part. Every other role, the platform admin included (order 47), reads it
 * without the money: a role not named here gets no revenue (security review 2026-10-09).
 */
const ANALYTICS_VIEW_BY_ROLE = new Map([
    [CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, (data) => data],
    [CANONICAL_ROLES.FINANCE_OFFICER_DTAM, revenueOnly],
    [CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM, revenueOnly],
]);

/**
 * GET /api/reports/dashboard
 * Summary stats for Dashboard Charts
 */
router.get('/dashboard', authenticateProvider, async (req, res) => {
    try {
        // #8 tenancy: scope the dashboard to the caller's org AND make the cache
        // key org-specific — the old global 'reports:dashboard' key served one
        // org's payload to every org, and getDashboardStats() was unscoped
        // (byStatus/monthlyTrend/etc. leaked global counts to a tenant admin).
        const scope = countScopeOrAnswer(req, res);
        if (!scope) { return undefined; }
        const { orgId } = scope;
        const cacheKey = `reports:dashboard:${orgId || 'all'}`;
        const cachedData = await cache.get(cacheKey);

        if (cachedData) {
            return res.json({ success: true, data: cachedData, cached: true });
        }

        let stats;
        try {
            stats = await metricsService.getDashboardStats(orgId);
        } catch (_metricsError) {
            console.warn('[Reports] Metrics service not available, using default stats');
            stats = {
                totalFarms: 0,
                totalApplications: 0,
                totalCertificates: 0,
                pendingApplications: 0,
                recentApplications: [],
            };
        }

        await cache.set(cacheKey, stats, CACHE_TTL);

        res.json({
            success: true,
            data: stats,
            cached: false,
        });

    } catch (error) {
        logger.error('[Reports] Dashboard error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate report' });
    }
});

/**
 * GET /api/reports/farms
 * Farm statistics
 */
router.get('/farms', authenticateProvider, async (req, res) => {
    try {
        // #8 tenancy: scope to the caller's org + org-specific cache key. count/
        // groupBy are not auto-scoped by the tenant extension — same fix class as
        // /dashboard (#382). The platform admin → null → cross-tenant totals.
        const scope = countScopeOrAnswer(req, res);
        if (!scope) { return undefined; }
        const { orgId } = scope;
        const cacheKey = `reports:farms:${orgId || 'all'}`;
        const cachedData = await cache.get(cacheKey);

        if (cachedData) {
            return res.json({ success: true, data: cachedData, cached: true });
        }

        const totalFarms = await metricsService.countActiveFarms(orgId);
        const farmsByProvince = await metricsService.groupFarmsByProvince({ orgId });

        const resultData = {
            total: totalFarms,
            byProvince: farmsByProvince.map((row) => ({
                province: row.province,
                count: row._count.province,
            })),
        };

        await cache.set(cacheKey, resultData, CACHE_TTL);

        res.json({
            success: true,
            data: resultData,
            cached: false,
        });
    } catch (error) {
        logger.error('[Reports] Farms report error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate farms report' });
    }
});

/**
 * GET /api/reports/applications
 * Application statistics
 */
router.get('/applications', authenticateProvider, async (req, res) => {
    try {
        // #8 tenancy: scope to the caller's org + org-specific cache key (groupBy
        // not auto-scoped) — same fix class as /dashboard (#382).
        const scope = countScopeOrAnswer(req, res);
        if (!scope) { return undefined; }
        const { orgId } = scope;
        const cacheKey = `reports:applications:${orgId || 'all'}`;
        const cachedData = await cache.get(cacheKey);

        if (cachedData) {
            return res.json({ success: true, data: cachedData, cached: true });
        }

        const statusCounts = await metricsService.groupApplicationsByStatus(orgId);

        await cache.set(cacheKey, statusCounts, CACHE_TTL);

        res.json({
            success: true,
            data: statusCounts,
            cached: false,
        });
    } catch (error) {
        logger.error('[Reports] Applications report error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate applications report' });
    }
});

/**
 * GET /api/reports/analytics
 * Consolidated BI payload for provider analytics dashboard
 */
router.get('/analytics', authenticateProvider, async (req, res) => {
    try {
        const requestedPeriod = Number.parseInt(String(req.query.period || '30'), 10);
        const periodDays = Number.isFinite(requestedPeriod) ? Math.min(Math.max(requestedPeriod, 1), 365) : 30;

        // #8 tenancy: org-scope the cache key AND the aggregates — this sibling was
        // missed by #382/#394 (which fixed /dashboard, /farms, /applications). The old
        // global key served org-A's analytics (revenue/provinces/applicant counts) to
        // org-B. groupBy/aggregate are not auto-scoped by the tenant extension.
        // Order 17: the caller's own organization; no organization, no analytics.
        const scope = countScopeOrAnswer(req, res);
        if (!scope) { return undefined; }
        const { orgId } = scope;
        const view = ANALYTICS_VIEW_BY_ROLE.get(normalizeRole(req.user?.canonicalRole || req.user?.role)) || withoutRevenue;
        const cacheKey = `reports:analytics:${orgId || 'all'}:period:${periodDays}`;
        const cachedData = await cache.get(cacheKey);

        if (cachedData) {
            return res.json({ success: true, data: view(cachedData), cached: true });
        }

        const now = new Date();
        const periodMs = periodDays * 24 * 60 * 60 * 1000;
        const start = new Date(now.getTime() - periodMs);
        const prevStart = new Date(start.getTime() - periodMs);

        const {
            applicationsWindow,
            applicantsWindow: ApplicantsWindow,
            activeCertificates,
            farmsByProvince,
        } = await metricsService.getAnalyticsAggregates({ prevStart, now, orgId });
        const money = await metricsService.getRevenueWindow({ from: prevStart, now, orgId });

        const isCurrent = (dateValue) => dateValue >= start;
        const isPrevious = (dateValue) => dateValue >= prevStart && dateValue < start;
        const toTrend = (currentValue, previousValue) => {
            if (previousValue === 0) {
                return currentValue > 0 ? 100 : 0;
            }
            return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
        };

        const applicationsCurrent = applicationsWindow.filter((app) => isCurrent(app.createdAt));
        const applicationsPrevious = applicationsWindow.filter((app) => isPrevious(app.createdAt));

        const approvedCurrent = applicationsCurrent.filter((app) => String(app.status).toUpperCase() === 'APPROVED').length;
        const rejectedCurrent = applicationsCurrent.filter((app) => String(app.status).toUpperCase() === 'REJECTED').length;
        const pendingCurrent = applicationsCurrent.filter((app) => !['APPROVED', 'REJECTED'].includes(String(app.status).toUpperCase())).length;
        const newCurrent = applicationsCurrent.filter((app) => String(app.serviceType).toLowerCase() === 'new_application').length;
        const renewalCurrent = applicationsCurrent.filter((app) => String(app.serviceType).toLowerCase() === 'renewal').length;

        // Revenue is money received net of credit notes (refunds and adjustments):
        // paid invoices by payment date, credit notes by issue date.
        const total = (rows) => Math.round(rows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0) * 100) / 100;
        const inWindow = (rows, field, test) => rows.filter((r) => test(r[field]));
        const paidCurrent = total(inWindow(money.paid, 'paidAt', isCurrent));
        const paidPrevious = total(inWindow(money.paid, 'paidAt', isPrevious));
        const creditedCurrent = total(inWindow(money.credits, 'issuedAt', isCurrent));
        const creditedPrevious = total(inWindow(money.credits, 'issuedAt', isPrevious));
        const revenueCurrent = Math.round((paidCurrent - creditedCurrent) * 100) / 100;
        const revenuePrevious = Math.round((paidPrevious - creditedPrevious) * 100) / 100;
        const pendingCurrentRevenue = total(inWindow(money.pending, 'createdAt', isCurrent));
        const refundedCurrentRevenue = creditedCurrent;

        const ApplicantsCurrent = ApplicantsWindow.filter((user) => isCurrent(user.createdAt)).length;
        const ApplicantsPrevious = ApplicantsWindow.filter((user) => isPrevious(user.createdAt)).length;

        const totalApplicants = await metricsService.countActiveHealthApplicants(orgId);

        const processingDurations = applicationsCurrent
            .filter((app) => ['APPROVED', 'REJECTED', 'CERTIFIED'].includes(String(app.status).toUpperCase()))
            .map((app) => (new Date(app.updatedAt).getTime() - new Date(app.createdAt).getTime()) / (24 * 60 * 60 * 1000))
            .filter((value) => Number.isFinite(value) && value >= 0);
        const auditDurations = applicationsCurrent
            .filter((app) => app.scheduledDate)
            .map((app) => (new Date(app.scheduledDate).getTime() - new Date(app.createdAt).getTime()) / (24 * 60 * 60 * 1000))
            .filter((value) => Number.isFinite(value) && value >= 0);

        const avg = (arr) => (arr.length > 0 ? Number((arr.reduce((sum, val) => sum + val, 0) / arr.length).toFixed(1)) : 0);
        const totalCurrent = applicationsCurrent.length;
        const satisfactionRate = totalCurrent > 0 ? Number(((approvedCurrent / totalCurrent) * 5).toFixed(1)) : 0;

        const areaTypeLabel = {
            OUTDOOR: 'Outdoor',
            INDOOR: 'Indoor',
            GREENHOUSE: 'Greenhouse',
        };
        const areaTypeColor = {
            OUTDOOR: '#22c55e',
            INDOOR: '#3b82f6',
            GREENHOUSE: '#f59e0b',
            OTHER: '#6b7280',
        };
        const areaTypeMap = {};
        for (const app of applicationsCurrent) {
            const type = String(app.areaType || 'OTHER').toUpperCase();
            areaTypeMap[type] = (areaTypeMap[type] || 0) + 1;
        }
        const plantTypeDistribution = Object.entries(areaTypeMap).map(([type, value]) => ({
            name: areaTypeLabel[type] || type,
            value,
            color: areaTypeColor[type] || areaTypeColor.OTHER,
        }));

        const totalProvinceFarms = farmsByProvince.reduce((sum, item) => sum + Number(item._count.province || 0), 0);
        const topProvinces = farmsByProvince.map((item) => ({
            province: item.province || 'Unknown',
            count: Number(item._count.province || 0),
            percentage: totalProvinceFarms > 0 ? Number(((Number(item._count.province || 0) / totalProvinceFarms) * 100).toFixed(1)) : 0,
        }));

        const dailyStats = [];
        for (let day = periodDays - 1; day >= 0; day -= 1) {
            // Each bucket is a Bangkok day: 00:00 to 23:59:59.999 in Bangkok.
            const dayStart = startOfLocalDay(new Date(now.getTime() - day * 24 * 60 * 60 * 1000));
            const dayEnd = endOfLocalDay(dayStart);

            const appsInDay = applicationsCurrent.filter((app) => app.createdAt >= dayStart && app.createdAt <= dayEnd);
            const inDay = (value) => value >= dayStart && value <= dayEnd;

            dailyStats.push({
                date: getZonedParts(dayStart).isoDate,
                applications: appsInDay.length,
                approved: appsInDay.filter((app) => String(app.status).toUpperCase() === 'APPROVED').length,
                revenue: Math.round((total(inWindow(money.paid, 'paidAt', inDay))
                    - total(inWindow(money.credits, 'issuedAt', inDay))) * 100) / 100,
            });
        }

        const resultData = {
            period: String(periodDays),
            applications: {
                total: totalCurrent,
                new: newCurrent,
                renewal: renewalCurrent,
                approved: approvedCurrent,
                rejected: rejectedCurrent,
                pending: pendingCurrent,
                trend: toTrend(applicationsCurrent.length, applicationsPrevious.length),
            },
            financial: {
                revenue: revenueCurrent,
                pending: pendingCurrentRevenue,
                refunded: refundedCurrentRevenue,
                trend: toTrend(revenueCurrent, revenuePrevious),
            },
            users: {
                totalApplicants,
                newApplicants: ApplicantsCurrent,
                activeCertificates,
                trend: toTrend(ApplicantsCurrent, ApplicantsPrevious),
            },
            performance: {
                avgProcessingDays: avg(processingDurations),
                avgAuditDays: avg(auditDurations),
                satisfactionRate,
            },
            dailyStats,
            plantTypeDistribution,
            topProvinces,
        };

        await cache.set(cacheKey, resultData, CACHE_TTL);

        res.json({
            success: true,
            data: view(resultData),
            cached: false,
        });
    } catch (error) {
        logger.error('[Reports] Analytics report error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate analytics report' });
    }
});

module.exports = router;
