'use strict';
/**
 * F-G4-64, fix round 2 (reviewer, minor 4) — one applicant pressing ชำระเงิน is
 * not an incident per press.
 *
 * A drifted PENDING_PAYMENT order refuses on every re-entry, and the applicant
 * has no way to know that pressing again cannot help: the copy says staff were
 * told and offers nothing else. Each press fanned out a fresh URGENT
 * notification to every ADMIN. Twenty presses buried the one row a staff member
 * had to act on under nineteen copies of itself, which is how a real alert
 * becomes noise that gets muted.
 *
 * The rule pinned here: while an UNREAD alert for the same (applicationId,
 * milestone) is still sitting in the queue, the alert has already been
 * delivered and is not re-sent. Once a human reads it, a further refusal is
 * news again and does alert. A lookup failure alerts anyway: a duplicate is a
 * nuisance, silence on a money path is not.
 *
 * Order 55(b) (operator 2026-10-09): the alert has two versions. The company finance officers of
 * the application's organization get the figures and the quotation number; the platform admins get
 * the incident without them. Each version is sent once per unread incident of its own. The
 * recipients by role, the amount-free content and the per-version dedup are proven on a real
 * Postgres in __tests__/integration/price-drift-alert-recipients-real-postgres.test.js.
 */

const mockNotificationFindFirst = jest.fn();
const mockNotificationCreateMany = jest.fn(async () => ({ count: 1 }));
const mockUserFindMany = jest.fn();
const mockApplicationFindUnique = jest.fn();
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        user: { findMany: (...a) => mockUserFindMany(...a) },
        application: { findUnique: (...a) => mockApplicationFindUnique(...a) },
        notification: {
            findFirst: (...a) => mockNotificationFindFirst(...a),
            createMany: (...a) => mockNotificationCreateMany(...a),
        },
    },
}));

const mockCreateBulk = jest.fn(async () => ({ count: 1 }));
jest.mock('../../services/notification-service', () => ({
    createNotification: jest.fn(),
    createBulkNotifications: (...a) => mockCreateBulk(...a),
    NotifyType: {
        CHECKOUT_PRICE_DRIFT: 'CHECKOUT_PRICE_DRIFT',
        QUOTATION_ISSUE_FAILED: 'QUOTATION_ISSUE_FAILED',
    },
}));

const mockAuditLog = jest.fn(async () => ({}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAuditLog(...a) },
    AuditCategory: { PAYMENT: 'PAYMENT', SYSTEM: 'SYSTEM' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' },
    ResourceType: { APPLICATION: 'APPLICATION', PAYMENT: 'PAYMENT' },
}));

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const {
    notifyAdminCheckoutPriceDrift,
    notifyAdminQuotationIssueFailed,
} = require('../../services/notification/domain-helpers');
// The REAL bulk writer, for the one question a stub cannot answer: which
// organizationId lands on the row a cross-tenant admin has to read.
const { createBulkNotifications: realCreateBulkNotifications } =
    jest.requireActual('../../services/notification-service');
// The REAL tenant scope, not a stub: the question this suite asks is what the
// prisma extension would see, and that is decided by AsyncLocalStorage.
const { runWithTenantContext, isWithoutTenantScope } = require('../../services/tenant-context');
const logger = require('../../shared/logger');

const ARGS = {
    applicationId: 'app-1',
    applicationNumber: 'APP-2026-000001',
    quotationNumber: 'QT-PRD-2026-000001',
    acceptedPhaseTotal: '17655.00',
    livePhaseTotal: '5885.00',
    milestone: 'M1',
};

beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindMany.mockResolvedValue([{ id: 'admin-1' }]);
    // The default application for these suites is a first-time submission, the
    // window in which the GET self-heal really does mint a missing quotation
    // (SELF_HEAL_STATUSES, services/quotation-issuance-on-submit.js).
    mockApplicationFindUnique.mockResolvedValue({ status: 'SUBMITTED', organizationId: 'org-applicant' });
    mockNotificationFindFirst.mockResolvedValue(null);
    mockNotificationCreateMany.mockResolvedValue({ count: 1 });
    mockCreateBulk.mockResolvedValue({ count: 1 });
    mockAuditLog.mockResolvedValue({});
});

describe('the price-drift alert is delivered once per unread incident', () => {
    it('sends both versions when neither queue holds an unread alert for this application and milestone', async () => {
        await notifyAdminCheckoutPriceDrift(ARGS);

        expect(mockCreateBulk).toHaveBeenCalledTimes(2);
        for (const [call] of mockCreateBulk.mock.calls) {
            expect(call).toEqual(expect.objectContaining({ type: 'CHECKOUT_PRICE_DRIFT', priority: 'URGENT' }));
        }
        const withFigures = mockCreateBulk.mock.calls.filter(([call]) => call.data.acceptedPhaseTotal !== undefined);
        expect(withFigures).toHaveLength(1);
    });

    it('does not send again while the same alert is still unread', async () => {
        mockNotificationFindFirst.mockResolvedValue({ id: 'notif-1' });

        await notifyAdminCheckoutPriceDrift(ARGS);

        expect(mockCreateBulk).not.toHaveBeenCalled();
        // The dedup asks for exactly this incident: unread, this type, this
        // application, this milestone. A query without the milestone would mute
        // an M2 drift because an M1 one is open.
        const where = mockNotificationFindFirst.mock.calls[0][0].where;
        expect(JSON.stringify(where)).toContain('CHECKOUT_PRICE_DRIFT');
        expect(JSON.stringify(where)).toContain('app-1');
        expect(JSON.stringify(where)).toContain('M1');
        expect(where.isRead).toBe(false);
    });

    it('sends again once a human has read the previous alert', async () => {
        mockNotificationFindFirst.mockResolvedValue(null);

        await notifyAdminCheckoutPriceDrift(ARGS);

        expect(mockCreateBulk).toHaveBeenCalledTimes(2);
    });

    it('a dedup lookup failure alerts anyway, because silence is the worse failure', async () => {
        mockNotificationFindFirst.mockRejectedValue(new Error('db down'));

        await notifyAdminCheckoutPriceDrift(ARGS);

        expect(mockCreateBulk).toHaveBeenCalledTimes(2);
    });
});

/**
 * Fix round 3 (reviewer r2, minor 3). The applicant is told
 * "เจ้าหน้าที่ได้รับแจ้งแล้ว" and given no other action, so this alert reaching
 * NOBODY is the same failure as not sending it - and it reached nobody silently
 * twice over: the recipient lookup is a findMany, which the tenant extension
 * narrows by organizationId whenever a context is bound
 * (tenant-prisma-extension.applyReadScopes, orgReadScopeEnabled default-ON), and
 * a checkout request always binds the APPLICANT's org
 * (middleware/tenant-context-middleware.js). Platform ADMINs who do not sit in
 * that org are not returned, `admins.length > 0` falls through, and the function
 * resolves having written nothing and logged nothing.
 */
describe('the price-drift alert reaches platform staff, or says out loud that it did not', () => {
    it('looks up recipients across tenants, not inside the applicant`s organization', async () => {
        let scopeInsideLookup = 'not-called';
        mockUserFindMany.mockImplementation(async () => {
            scopeInsideLookup = isWithoutTenantScope() ? 'WITHOUT_TENANT_SCOPE' : 'NARROWED';
            return [{ id: 'admin-1' }];
        });

        // Exactly what a checkout request looks like: the APPLICANT's org bound
        // for the whole call chain.
        await runWithTenantContext({ organizationId: 'org-of-the-applicant' },
            () => notifyAdminCheckoutPriceDrift(ARGS));

        expect(scopeInsideLookup).toBe('WITHOUT_TENANT_SCOPE');
        expect(mockCreateBulk).toHaveBeenCalledTimes(2);
    });

    it('logs an ERROR naming the application and milestone when no recipient is found', async () => {
        mockUserFindMany.mockResolvedValue([]);

        await notifyAdminCheckoutPriceDrift(ARGS);

        expect(mockCreateBulk).not.toHaveBeenCalled();
        const errorLine = JSON.stringify(logger.error.mock.calls);
        expect(errorLine).toContain('app-1');
        expect(errorLine).toContain('M1');
    });
});

/**
 * Whole-branch review C3/C10/S1/S5/S8/S9/S20 — the fix round-3 patch moved the
 * recipient LOOKUP out of the applicant's tenant and left the WRITE inside it.
 * With the applicant's organization bound, createBulkNotifications skips its
 * per-recipient organizationId branch and the tenant extension stamps the
 * APPLICANT's org onto a row whose userId is an admin in another org — and the
 * admin's own inbox read is org-scoped, so the row they are told about is
 * invisible to them. A log line is not a recipient: when the lookup returns
 * nobody the outcome is also written to the audit trail, because
 * "เจ้าหน้าที่ได้รับแจ้งแล้ว" is on the applicant's screen either way.
 */
describe('an admin alert is stamped with the RECIPIENT`s organization', () => {
    /** An admin who does not sit in the applicant's organization. */
    const PLATFORM_ADMIN = { id: 'admin-1', organizationId: 'org-platform' };

    beforeEach(() => {
        // Both lookups answer from the same mock: the helper's recipient query
        // (by role) and createBulkNotifications' own per-recipient org read.
        mockUserFindMany.mockResolvedValue([PLATFORM_ADMIN]);
        // The real writer, so the row that would reach the database is the row
        // this suite asserts on.
        mockCreateBulk.mockImplementation((...a) => realCreateBulkNotifications(...a));
    });

    it.each([
        ['price drift', () => notifyAdminCheckoutPriceDrift(ARGS), 2],
        ['quotation issue failed', () => notifyAdminQuotationIssueFailed({
            applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
        }), 1],
    ])('%s: every row carries org-platform, not the applicant`s org', async (_name, send, writes) => {
        await runWithTenantContext({ organizationId: 'org-applicant' }, send);

        expect(mockNotificationCreateMany).toHaveBeenCalledTimes(writes);
        for (const [{ data: rows }] of mockNotificationCreateMany.mock.calls) {
            expect(rows).toHaveLength(1);
            expect(rows[0].userId).toBe('admin-1');
            expect(rows[0].organizationId).toBe('org-platform');
        }
    });

    it('the quotation-issue-failed lookup crosses tenants too', async () => {
        let scopeInsideLookup = 'not-called';
        mockUserFindMany.mockImplementation(async () => {
            scopeInsideLookup = isWithoutTenantScope() ? 'WITHOUT_TENANT_SCOPE' : 'NARROWED';
            return [PLATFORM_ADMIN];
        });

        await runWithTenantContext({ organizationId: 'org-applicant' },
            () => notifyAdminQuotationIssueFailed({
                applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
            }));

        expect(scopeInsideLookup).toBe('WITHOUT_TENANT_SCOPE');
        expect(mockNotificationCreateMany).toHaveBeenCalledTimes(1);
    });
});

/**
 * Review r0 finding 1 (major) — the dedup READ has to look where the rows now
 * LIVE. Moving the write cross-tenant put every alert row in the RECIPIENT's
 * organization; the "is one already unread?" lookup is a findFirst on the
 * extended client, and the tenant extension injects the bound organizationId
 * into every tenant-scoped read (tenant-prisma-extension.applyReadScopes,
 * Notification is in TENANT_SCOPED_MODELS, org read scope default-ON). This
 * helper runs inside the APPLICANT's checkout request, so the read would ask
 * the applicant's organization for rows that are stamped with the admins' one
 * and never find them: the drift alert would fan out again on every press,
 * which is the exact flood the dedup exists to stop.
 */
describe('the dedup read looks where the alert rows actually live', () => {
    const PLATFORM_ADMIN = { id: 'admin-1', organizationId: 'org-platform' };

    beforeEach(() => {
        mockUserFindMany.mockResolvedValue([PLATFORM_ADMIN]);
    });

    it('asks across tenants, like the write that produced the rows', async () => {
        let scopeInsideDedup = 'not-called';
        mockNotificationFindFirst.mockImplementation(async () => {
            scopeInsideDedup = isWithoutTenantScope() ? 'WITHOUT_TENANT_SCOPE' : 'NARROWED';
            return null;
        });

        await runWithTenantContext({ organizationId: 'org-applicant' },
            () => notifyAdminCheckoutPriceDrift(ARGS));

        expect(scopeInsideDedup).toBe('WITHOUT_TENANT_SCOPE');
    });

    it('a second press inside the applicant`s organization finds the admins` unread row and stays quiet', async () => {
        // What the extension really does: a narrowed read is a read of the
        // applicant's organization, where no alert row exists.
        mockNotificationFindFirst.mockImplementation(async () => (
            isWithoutTenantScope() ? { id: 'notif-1' } : null
        ));

        await runWithTenantContext({ organizationId: 'org-applicant' },
            () => notifyAdminCheckoutPriceDrift(ARGS));

        expect(mockCreateBulk).not.toHaveBeenCalled();
    });
});

describe('an alert that reaches nobody is recorded, not only logged', () => {
    beforeEach(() => { mockUserFindMany.mockResolvedValue([]); });

    it.each([
        ['price drift', () => notifyAdminCheckoutPriceDrift(ARGS)],
        ['quotation issue failed', () => notifyAdminQuotationIssueFailed({
            applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
        })],
    ])('%s writes ADMIN_ALERT_NO_RECIPIENT', async (_name, send) => {
        await send();

        expect(mockCreateBulk).not.toHaveBeenCalled();
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'ADMIN_ALERT_NO_RECIPIENT',
            severity: 'ERROR',
            resourceId: 'app-1',
        }));
        // NOT NULL in prisma/schema/audit.prisma — a row without it is dropped.
        expect(mockAuditLog.mock.calls[0][0].actorRole).toBeTruthy();
    });

    it('an audit sink that is down does not turn a best-effort alert into a throw', async () => {
        mockAuditLog.mockRejectedValue(new Error('audit down'));

        await expect(notifyAdminCheckoutPriceDrift(ARGS)).resolves.toBeUndefined();
    });

    /**
     * Review r2, minor 1 — the log must report the set that was actually asked
     * for. It used to print `roles: ['platform_admin','admin']` from a constant
     * no query reads, so whoever picked the line up was sent to check every
     * `admin` row in the database when only the platform's own ops tenant's
     * admins were ever eligible; and a role added to that constant changed
     * nothing about who is alerted. One spelling of the rule: the predicate the
     * lookup ran is the predicate the failure reports.
     */
    it('the no-recipient log reports the predicate the lookup actually used', async () => {
        await notifyAdminQuotationIssueFailed({
            applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
        });

        const queried = mockUserFindMany.mock.calls[0][0].where;
        const line = logger.error.mock.calls.find(([msg]) => String(msg).includes('NO recipient'));
        expect(line).toBeDefined();
        expect(line[1].recipientWhere).toEqual(queried);
        // Non-vacuous: the predicate qualifies the organization-bound DTAM admin by the
        // application's own organization (orders 14, 17), so the reported set is narrow.
        expect(line[1].recipientWhere.OR).toEqual(expect.arrayContaining([
            { role: 'system_admin_dtam', organizationId: 'org-applicant' },
        ]));
    });

    it('the price-drift alert reports each version`s own predicate: finance of the application`s organization, and the platform admin', async () => {
        await notifyAdminCheckoutPriceDrift(ARGS);

        const queried = mockUserFindMany.mock.calls.map(([{ where }]) => where);
        const reported = logger.error.mock.calls
            .filter(([msg]) => String(msg).includes('NO recipient'))
            .map(([, details]) => details.recipientWhere);
        expect(reported).toEqual(queried);
        expect(reported).toEqual(expect.arrayContaining([
            { isDeleted: false, role: 'finance_officer_platform', organizationId: 'org-applicant' },
            { isDeleted: false, role: 'system_admin_platform' },
        ]));
    });
});

describe('the admin alerts do not name a staff door that does not exist', () => {
    beforeEach(() => {
        mockUserFindMany.mockResolvedValue([{ id: 'admin-1', organizationId: 'org-platform' }]);
    });

    it.each([
        ['price drift', () => notifyAdminCheckoutPriceDrift(ARGS)],
        ['quotation issue failed', () => notifyAdminQuotationIssueFailed({
            applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
        })],
    ])('%s asks staff to CHECK, never to issue a document no screen can issue', async (_name, send) => {
        await send();

        const { message } = mockCreateBulk.mock.calls[0][0];
        // There is no quotation route under routes/api/admin, /provider or
        // /platform-admin, and no staff screen for one.
        expect(message).not.toContain('ออกใบเสนอราคาใหม่');
        expect(message).not.toContain('กรุณาตรวจสอบและออกใบเสนอราคา');
        expect(message).toContain('กรุณาตรวจสอบ');
    });

    it('the missing-quotation alert names the door that really re-issues: the applicant`s next visit', async () => {
        await notifyAdminQuotationIssueFailed({
            applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
        });

        expect(mockCreateBulk.mock.calls[0][0].message)
            .toContain('ระบบจะออกใบให้อัตโนมัติเมื่อผู้ยื่นคำขอเปิดหน้ารายการชำระเงินครั้งต่อไป');
    });

    it('the drift alert promises no automatic re-issue, because an accepted row is not re-issued', async () => {
        await notifyAdminCheckoutPriceDrift(ARGS);

        expect(mockCreateBulk).toHaveBeenCalledTimes(2);
        for (const [{ message }] of mockCreateBulk.mock.calls) {
            expect(message).not.toContain('อัตโนมัติ');
        }
    });
});

/**
 * Review r1 finding 4 (major) — the automatic-re-issue sentence is true only
 * inside the window the GET self-heal mints in.
 *
 * `ensureQuotationForIssuedApplication` returns without minting unless the
 * application's status is in SELF_HEAL_STATUSES = {SUBMITTED, PENDING_DOC_FEE}
 * (services/quotation-issuance-on-submit.js), and one of the three doors that
 * raise this alert is a RENEWAL, whose application is created at
 * RENEWAL_ENTRY_STATE 'PENDING_AUDIT_FEE' (services/renewal-service.js). On
 * that door the retired wording told staff the system would issue the document
 * on the applicant's next visit; it never would, there is no staff issuance
 * door (ledger F-G4-71), and the queue that could have escalated the renewal
 * was told to wait. That is the same defect R2 rewrote this alert to remove.
 */
describe('the missing-quotation alert promises an automatic re-issue only where one really happens', () => {
    const ISSUE_FAILED = {
        applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
    };
    const PROMISE = 'ระบบจะออกใบให้อัตโนมัติ';

    beforeEach(() => {
        mockUserFindMany.mockResolvedValue([{ id: 'admin-1', organizationId: 'org-platform' }]);
    });

    it.each(['SUBMITTED', 'PENDING_DOC_FEE'])(
        '%s: the applicant`s next visit really mints, so the alert says so', async (status) => {
            mockApplicationFindUnique.mockResolvedValue({ status });

            await notifyAdminQuotationIssueFailed(ISSUE_FAILED);

            expect(mockCreateBulk.mock.calls[0][0].message)
                .toContain('ระบบจะออกใบให้อัตโนมัติเมื่อผู้ยื่นคำขอเปิดหน้ารายการชำระเงินครั้งต่อไป');
        });

    it('PENDING_AUDIT_FEE (the state a renewal is created in): promises nothing, and says the applicant cannot pay', async () => {
        mockApplicationFindUnique.mockResolvedValue({ status: 'PENDING_AUDIT_FEE' });

        await notifyAdminQuotationIssueFailed(ISSUE_FAILED);

        const { message } = mockCreateBulk.mock.calls[0][0];
        expect(message).not.toContain(PROMISE);
        // What is true instead: nobody re-quotes this one by itself, and the
        // applicant is stuck until a quotation exists.
        expect(message).toContain('ชำระเงินไม่ได้จนกว่าจะมีใบเสนอราคา');
        // The alert still names the check staff CAN perform.
        expect(message).toContain('กรุณาตรวจสอบ');
    });

    it('a status that could not be read promises nothing: an alert must not guess on a money path', async () => {
        mockApplicationFindUnique.mockRejectedValue(new Error('db down'));

        await notifyAdminQuotationIssueFailed(ISSUE_FAILED);

        expect(mockCreateBulk).toHaveBeenCalledTimes(1);
        expect(mockCreateBulk.mock.calls[0][0].message).not.toContain(PROMISE);
    });
});

/**
 * Who a staff alert may reach (review r1 finding 6, re-ruled by orders 14 and 17, operator
 * 2026-10-06): these alerts carry another party's application number and its money figures. The
 * DTAM admin is bound to its own organization, so only the DTAM admins of the APPLICATION's
 * organization qualify; the platform's default (INTERNAL) organization is no exception. The
 * platform admin is the one role that crosses organizations, wherever its user row sits.
 */
describe('a staff alert reaches the application`s own organization and the platform admin, never another organization`s admin', () => {
    const PLATFORM_ORG = { type: 'INTERNAL', slug: 'default' };
    const TENANT_ORG = { type: 'PRIVATE_CERTIFIER', slug: 'org-b' };
    const USERS = [
        { id: 'admin-of-org-b', role: 'system_admin_dtam', isDeleted: false, organizationId: 'org-b', organization: TENANT_ORG },
        { id: 'admin-of-platform', role: 'system_admin_dtam', isDeleted: false, organizationId: 'org-platform', organization: PLATFORM_ORG },
        { id: 'admin-of-applicant-org', role: 'system_admin_dtam', isDeleted: false, organizationId: 'org-applicant', organization: TENANT_ORG },
        { id: 'platform-operator', role: 'system_admin_platform', isDeleted: false, organizationId: 'org-b', organization: TENANT_ORG },
    ];

    /**
     * The slice of Prisma's where grammar these two lookups use: equality,
     * `in`, `OR`, and a to-one relation filter. Enough that the assertion is
     * about WHICH USERS come back, not about the shape of a query object.
     */
    function matchesWhere(row, where) {
        return Object.entries(where).every(([key, cond]) => {
            if (key === 'OR') { return cond.some((c) => matchesWhere(row, c)); }
            const value = row[key];
            if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
                if (Array.isArray(cond.in)) { return cond.in.includes(value); }
                return (value && typeof value === 'object') ? matchesWhere(value, cond) : false;
            }
            return value === cond;
        });
    }

    beforeEach(() => {
        mockUserFindMany.mockImplementation(async ({ where }) => USERS.filter((u) => matchesWhere(u, where)));
    });

    it('quotation issue failed: no admin of another organization, the default one included, is a recipient', async () => {
        await runWithTenantContext({ organizationId: 'org-applicant' }, () => notifyAdminQuotationIssueFailed({
            applicationId: 'app-1', applicationNumber: 'APP-2026-000001', reason: 'RATE_TABLE',
        }));

        expect(mockCreateBulk).toHaveBeenCalledTimes(1);
        const { userIds } = mockCreateBulk.mock.calls[0][0];
        expect(userIds.filter((id) => ['admin-of-org-b', 'admin-of-platform'].includes(id))).toEqual([]);
        expect([...userIds].sort()).toEqual(['admin-of-applicant-org', 'platform-operator']);
    });

    it('price drift (order 55(b)): the figures to the application`s company finance, the incident without them to the platform admin, nothing to a DTAM admin', async () => {
        USERS.push(
            { id: 'finance-of-applicant-org', role: 'finance_officer_platform', isDeleted: false, organizationId: 'org-applicant', organization: TENANT_ORG },
            { id: 'finance-of-org-b', role: 'finance_officer_platform', isDeleted: false, organizationId: 'org-b', organization: TENANT_ORG },
        );
        try {
            await runWithTenantContext({ organizationId: 'org-applicant' }, () => notifyAdminCheckoutPriceDrift(ARGS));
        } finally {
            USERS.splice(-2, 2);
        }

        const sent = mockCreateBulk.mock.calls.map(([call]) => ({ userIds: call.userIds, figures: 'acceptedPhaseTotal' in call.data }));
        expect(sent).toEqual(expect.arrayContaining([
            { userIds: ['finance-of-applicant-org'], figures: true },
            { userIds: ['platform-operator'], figures: false },
        ]));
        expect(sent).toHaveLength(2);
    });

    it('no platform admin and no admin of the application`s organization is the no-recipient case, not a quiet fanout to other organizations', async () => {
        mockUserFindMany.mockImplementation(async ({ where }) => (
            [USERS[0]].filter((u) => matchesWhere(u, where))
        ));

        await notifyAdminCheckoutPriceDrift(ARGS);

        expect(mockCreateBulk).not.toHaveBeenCalled();
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'ADMIN_ALERT_NO_RECIPIENT',
        }));
    });
});
