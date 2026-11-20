const { prisma } = require('../services/prisma-database');
const metricsService = require('../services/metrics-service');
const logger = require('../shared/logger');
const { getZonedParts, localMonthRange } = require('../utils/working-days');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../shared/application-visibility');
const { normalizeRole } = require('../shared/canonical-rbac');
const { BOOKS_READ_ROLES } = require('../services/finance/company-books-access');

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const totalOf = (rows) => round2(rows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0));

/**
 * Revenue of the window as the finance dashboard counts it: money received less the
 * credit notes issued (refunds and adjustments), in one organization.
 */
async function netRevenue({ from, now, orgId }) {
    try {
        const money = await metricsService.getRevenueWindow({ from, now, orgId });
        const gross = totalOf(money.paid);
        const credited = totalOf(money.credits);
        return { gross, credited, net: round2(gross - credited) };
    } catch (revenueError) {
        // A zero here would read as "no money came in", which is a statement about
        // revenue, not about a failed query: say it is unavailable instead.
        logger.error(`[reports] revenue read failed: ${revenueError?.message}`);
        return { gross: null, credited: null, net: null, unavailable: true };
    }
}

/**
 * Report Controller
 * Generates summary reports and KPI data for provider roles.
 * Used by: Admin, all roles (dashboard)
 */
const reportController = {
    /**
     * GET /api/provider/reports/summary
     * Monthly/quarterly summary of applications, audits, certificates, inside the caller's
     * organization (order 17). Revenue is in it only for a role that reads the company's
     * books (order 29): the dispatcher reads the counts without it.
     */
    summary: async (req, res) => {
        try {
            const scope = organizationScope(req.user);
            if (scope === DENY_ALL) { return answerNoOrganization(res); }
            const inOrganization = scope ? { organizationId: scope.organizationId } : {};
            const period = String(req.query.period || 'month').toLowerCase();
            const now = new Date();
            let startDate;

            // Bangkok month / quarter starts, not the process clock's.
            const nowBkk = getZonedParts(now);
            if (period === 'quarter') {
                const quarter = Math.floor((nowBkk.month - 1) / 3);
                startDate = localMonthRange(nowBkk.year, quarter * 3 + 1).start;
            } else {
                startDate = localMonthRange(nowBkk.year, nowBkk.month).start;
            }

            const [
                totalApplications,
                pendingReview,
                approvedCount,
                certifiedCount,
                rejectedCount,
            ] = await Promise.all([
                prisma.application.count({
                    where: { createdAt: { gte: startDate }, isDeleted: false, ...inOrganization },
                }),
                prisma.application.count({
                    where: {
                        status: { in: ['SUBMITTED', 'ASSIGNED_FOR_REVIEW'] },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
                prisma.application.count({
                    where: {
                        status: 'APPROVED',
                        updatedAt: { gte: startDate },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
                prisma.application.count({
                    where: {
                        status: 'CERTIFIED',
                        updatedAt: { gte: startDate },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
                prisma.application.count({
                    where: {
                        status: 'REJECTED',
                        updatedAt: { gte: startDate },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
            ]);

            const readsRevenue = BOOKS_READ_ROLES.has(normalizeRole(req.user?.canonicalRole || req.user?.role));
            const revenue = readsRevenue
                ? await netRevenue({ from: startDate, now, orgId: scope ? scope.organizationId : null })
                : null;

            return res.json({
                success: true,
                data: {
                    period,
                    startDate: startDate.toISOString(),
                    endDate: now.toISOString(),
                    applications: {
                        total: totalApplications,
                        pendingReview,
                        approved: approvedCount,
                        certified: certifiedCount,
                        rejected: rejectedCount,
                    },
                    ...(revenue ? { revenue } : {}),
                },
            });
        } catch (error) {
            logger.error('[Report Summary] Error:', error);
            return res.status(500).json({ success: false, error: 'Failed to generate summary report' });
        }
    },

    /**
     * GET /api/provider/reports/kpi
     * KPI metrics per role — calculates real averages from workflow data, inside the
     * caller's organization (order 17); a caller with no organization reads none.
     */
    kpi: async (req, res) => {
        try {
            const scope = organizationScope(req.user);
            if (scope === DENY_ALL) { return answerNoOrganization(res); }
            const inOrganization = scope ? { organizationId: scope.organizationId } : {};
            const now = new Date();
            const nowBkk = getZonedParts(now);
            const monthStart = localMonthRange(nowBkk.year, nowBkk.month).start; // Bangkok month

            const [
                reviewedThisMonth,
                auditsScheduled,
                auditsCompleted,
                certificatesIssued,
            ] = await Promise.all([
                prisma.application.count({
                    where: {
                        status: { in: ['DOC_APPROVED', 'APPROVED', 'CERTIFIED'] },
                        updatedAt: { gte: monthStart },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
                prisma.application.count({
                    where: {
                        status: { in: ['AUDIT_CONFIRMED', 'AUDIT_FEE_PAID'] },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
                prisma.application.count({
                    where: {
                        status: 'AUDIT_PASSED',
                        updatedAt: { gte: monthStart },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
                prisma.application.count({
                    where: {
                        status: 'CERTIFIED',
                        updatedAt: { gte: monthStart },
                        isDeleted: false,
                        ...inOrganization,
                    },
                }),
            ]);

            // Calculate average review days from actual data
            //
            // 2026-09-27 (class guard, fix round 1): `submittedAt` is not a column
            // on Application — only `healthId`/`applicant`, `createdAt`, `updatedAt`,
            // etc. (prisma/schema/application.prisma). The `try/catch` below always
            // hit the catch (Prisma rejects the `select`/`where` before any row is
            // read), so `avgReviewDays` was silently ALWAYS 0 — the same "select gap"
            // class as the reported bug, just swallowed instead of 500ing. The sibling
            // `avgAuditDays` block right below already uses `createdAt` as the
            // reference instant, and every serializer elsewhere in this codebase maps
            // `submittedAt: application.createdAt` for the same reason (Application has
            // no real submission timestamp column) — matching that convention here.
            let avgReviewDays = 0;
            try {
                const reviewedApps = await prisma.application.findMany({
                    where: {
                        status: { in: ['DOC_APPROVED', 'APPROVED', 'CERTIFIED'] },
                        updatedAt: { gte: monthStart },
                        isDeleted: false,
                        ...inOrganization,
                    },
                    select: { createdAt: true, updatedAt: true },
                    take: 100,
                });
                if (reviewedApps.length > 0) {
                    const totalDays = reviewedApps.reduce((sum, app) => {
                        const diff = (app.updatedAt.getTime() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                        return sum + diff;
                    }, 0);
                    avgReviewDays = Math.round((totalDays / reviewedApps.length) * 10) / 10;
                }
            } catch {
                // fallback to 0
            }

            // Calculate average audit days from actual data
            let avgAuditDays = 0;
            try {
                const auditedApps = await prisma.application.findMany({
                    where: {
                        status: 'AUDIT_PASSED',
                        updatedAt: { gte: monthStart },
                        isDeleted: false,
                        ...inOrganization,
                    },
                    select: { createdAt: true, updatedAt: true },
                    take: 100,
                });
                if (auditedApps.length > 0) {
                    const totalDays = auditedApps.reduce((sum, app) => {
                        const diff = (app.updatedAt.getTime() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                        return sum + diff;
                    }, 0);
                    avgAuditDays = Math.round((totalDays / auditedApps.length) * 10) / 10;
                }
            } catch {
                // fallback to 0
            }

            return res.json({
                success: true,
                data: {
                    month: nowBkk.isoDate.slice(0, 7),
                    reviewer: {
                        reviewedThisMonth,
                        avgReviewDays,
                    },
                    auditor: {
                        auditsScheduled,
                        auditsCompleted,
                        avgAuditDays,
                    },
                    overall: {
                        certificatesIssued,
                        approvalRate: reviewedThisMonth > 0
                            ? Math.round((certificatesIssued / reviewedThisMonth) * 100)
                            : 0,
                    },
                },
            });
        } catch (error) {
            logger.error('[Report KPI] Error:', error);
            return res.status(500).json({ success: false, error: 'Failed to generate KPI report' });
        }
    },
};

module.exports = reportController;
