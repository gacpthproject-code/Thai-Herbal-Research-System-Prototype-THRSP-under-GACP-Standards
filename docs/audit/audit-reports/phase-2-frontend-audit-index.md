# Phase 2 Frontend Audit Index

This index groups the route-by-route frontend audit outputs for `apps/web-app`.

Documents:
- `docs/frontend-audit-public-auth.md`
  - scope: public pages, auth pages, ThaiD callback, trace pages, verify pages
- `docs/frontend-audit-health-portal.md`
  - scope: `/health/dashboard`, `/health/applications/*`, `/health/establishments/*`, `/health/planting/*`, `/health/tracking/*`, `/health/certificates`, `/health/payments`, `/health/profile`, `/health/site-analysis`, `/health/training`
- `docs/frontend-audit-provider-portal.md`
  - scope: `/provider/dashboard`, `/provider/applications/*`, `/provider/audits/*`, `/provider/calendar`, `/provider/certificates`, `/provider/analytics`, `/provider/accounting`, `/provider/planting/*`, `/provider/management`, `/provider/settings/*`, `/provider/verification/*`
- `docs/frontend-audit-admin-portal.md`
  - scope: `/admin/dashboard`, `/admin/users`, `/admin/settings`, `/admin/planting/*`
- `docs/frontend-audit-bff-proxy.md`
  - scope: `/api/[...path]`, `/api/proxy/[...path]`, `/api/auth/health/[...path]`, `/api/auth/provider/[...path]`

Coverage status:
- requested Public/Auth scope: documented
- requested Health Portal scope: documented
- requested Provider Portal scope: documented
- requested Admin Portal scope: documented
- requested BFF / Proxy scope: documented

Notes:
- each document follows the per-item audit format requested in the prompt
- each portal document records routes checked, routes not yet checked, and portal-level risk concentration
- findings are based on runtime code and backend contract inspection, not repo documentation alone
