# Phase 4 Database Audit Index

This phase audits the database layer from runtime truth, not from schema comments alone.

Primary document:

- `docs/phase-4-database-audit.md`

Coverage model:

- Active runtime evidence is counted only when it can be traced from `server.js` or `routes/api/index.js` into mounted routes, middleware/auth wiring, imported handlers/services, and Prisma model usage.
- Drift or inconsistency is counted as an issue even if the affected flow still runs via compatibility behavior, fallback logic, or permissive string/status handling.
- Prisma schema duplication and cross-app drift
- Backend migration history and migration fragility
- Runtime fallback behavior when schema/table assumptions fail
- Relation integrity, FK consistency, unique constraints, nullable-key risks, and indexing gaps
- Audit/history coverage, soft delete coverage, and workflow-model mismatches

Main clusters surfaced by this phase:

- duplicated schema ownership between backend and web
- late-added or fallback-backed tables
- natural-key ownership and dangling scalar references
- status dialect drift across workflow and billing entities
- trust/audit surfaces that are only partially enforced by the database
