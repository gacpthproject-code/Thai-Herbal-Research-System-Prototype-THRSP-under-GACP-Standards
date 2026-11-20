# GACP Certification Platform - AI Coding Agent Instructions

## 🏗️ Architecture Overview

**GACP** is a full-stack agricultural certification platform for Thailand (Good Agricultural and Collection Practices).

### Tech Stack
- **Backend**: Node.js + Express + PostgreSQL (Prisma ORM) + Redis (BullMQ queues)
- **Frontend**: Next.js 15 (App Router) + TypeScript + Mantine UI + React Leaflet (maps)
- **Deployment**: Docker Compose + Nginx reverse proxy (DigitalOcean)
- **Database**: PostgreSQL 15 with soft deletes, audit trails, and 5-year legal retention
- **Queue System**: Redis + Bull for async jobs (email, PDF generation, OCR)

### Monorepo Structure
```
apps/
├── backend/          # Express API server, controllers, services, routes
├── web-app/          # Next.js frontend for browsers
└── mobile-app/       # Flutter mobile app (separate codebase)
```

---

## 🔑 Core Concepts & Patterns

### 1. **Layered Architecture (Backend)**
```
Route (HTTP + middleware only)
  ↓
Controller (input validation, format response)
  ↓
Service (business logic + Prisma queries)
  ↓
Database (PostgreSQL)
```

**Critical Rule**: Never put business logic in routes or controllers. Move all logic to `services/prisma-*.js`.

### 2. **Database - PostgreSQL with Prisma**
- **Schema**: multi-file Prisma schema in [apps/backend/prisma/schema/](apps/backend/prisma/schema/) (31 domain `.prisma` files; the datasource/generator live in `_base.prisma`). There is no `schema.prisma` — every Prisma command must pass `--schema prisma/schema`.
- **Key Features**: 
  - Soft deletes (`isDeleted`, `deletedAt`, `deletedBy`)
  - Audit trails (`createdBy`, `updatedBy`, `createdByIp`)
  - Legal retention (5-year automatic expiry)
  - UUID primary keys with unique constraints on hashes (ID card, tax ID)
- **Migrations**: Run via `docker exec -it gacp-backend sh -lc "cd /app/apps/backend && npx prisma migrate deploy --schema prisma/schema"`
- **Seeding**: `docker exec -it gacp-backend npx prisma db seed` (runs [seed-gacp.js](apps/backend/prisma/seed-gacp.js) then [seed-bank-accounts.js](apps/backend/prisma/seed-bank-accounts.js), per `prisma.seed` in apps/backend/package.json)

### 3. **Service Pattern Examples**
- **[prisma-auth-service.js](apps/backend/services/prisma-auth-service.js)**: User registration, password hashing, token generation
- **[application-service.js](apps/backend/services/application-service.js)**: GACP form (9, 10, 11) lifecycle management
- **[farm-service.js](apps/backend/services/farm-service.js)**: Farm/establishment CRUD with GPS coordinates
- **[payment-service.js](apps/backend/services/payment-service.js)**: Integration with Ksher payment gateway
- **[document-precheck/](apps/backend/services/document-precheck/)**: warn-only document pre-check (local Tesseract.js + bundled Thai/English tessdata; the officer decides)
- **[pdf-service.js](apps/backend/services/pdf-service.js)**: PDFKit for certificate generation
- **[notification-service.js](apps/backend/services/notification-service.js)**: Email via Nodemailer (queued in Redis)

### 4. **Request/Response Format**
All API responses follow this pattern:
```javascript
// Success
{
  "success": true,
  "message": "Thai message (optional)",
  "data": { /* payload */ }
}

// Error
{
  "success": false,
  "message": "User-friendly Thai message",
  "error": "Debug details (optional)"
}
```

### 5. **Authentication & Authorization**
- **Middleware**: [auth-middleware.js](apps/backend/middleware/auth-middleware.js) - extracts JWT from cookies/headers
- **User Object**: Access via `req.user.id`, `req.user.role` (standardized)
- **Roles**: Applicant, REVIEWER_AUDITOR, SCHEDULER, ACCOUNTANT, ADMIN, SUPER_ADMIN
- **Token Config**: [config/jwt-security.js](apps/backend/config/jwt-security.js)
- **Rate Limiting**: [auth-rate-limiters-middleware.js](apps/backend/middleware/auth-rate-limiters-middleware.js) prevents brute force

### 6. **Frontend - Next.js + Mantine**
- **App Router Structure**: Pages under [src/app/](apps/web-app/src/app/) (Applicant, provider, public portals)
- **UI Components**: Mantine (data tables, forms, modals, notifications)
- **State Management**: Zustand (lightweight, check [src/contexts/](apps/web-app/src) for stores)
- **API Client**: Axios calls to `/api/*` prefix (Nginx proxies to backend)
- **Maps**: React Leaflet for farm location visualization
- **i18n**: Thai as primary, English fallback (no explicit i18n library detected)

---

## 🛠️ Critical Development Workflows

### **Local Development**
```bash
# Backend
cd apps/backend
npm install
cp .env.example .env
node server.js        # Runs on port 5000 (configure PORT in .env)

# Frontend
cd apps/web-app
npm install
next dev              # Runs on port 3000

# Both (via root)
npm run dev          # Uses cross-env to set PORT=5000 for backend
```

### **Testing**
```bash
# Backend unit tests
cd apps/backend
npm run test              # Jest (testEnvironment: 'node', maxWorkers: 1)
npm run test:coverage     # With coverage report

# Backend E2E tests
npm run test:e2e         # Playwright tests from e2e/ directory

# Frontend tests
cd apps/web-app
npm run test            # Jest with Next.js transpilation
npm run test:e2e        # Playwright in e2e/ directory
```

**Test Config**:
- Jest runs serially (`maxWorkers: 1`) to prevent database conflicts
- Coverage thresholds: 80% lines/statements, 70% functions/branches
- Setup/teardown files: [jest.setup.js](apps/backend/jest.setup.js), [jest.teardown.js](apps/backend/jest.teardown.js)

### **Docker Deployment**
```bash
# Full stack (local/staging)
docker-compose up -d --build

# Services
# Frontend: http://localhost:3000
# Backend: http://localhost:8000 (via Nginx at :80 in production)
# Database: postgres:5432 (internal), pgAdmin available
# Redis: redis:6379 (internal)

# Check logs
docker logs -f gacp-backend
docker logs -f gacp-postgres
```

### **Production Deployment Workflow** (MUST FOLLOW)

> **Agents do not deploy, and do not open an SSH session to any server.**
> This section used to print a root SSH command against the production host, followed
> by a compose down/up rebuild. That contradicted `CLAUDE.md` Law 3.1
> (NO AUTO-DEPLOY) and `HARNESS.md`'s permission matrix, where `merge / deploy /
> keys` is operator-only, and it predated the harness by months. Removed
> 2026-08-06; see `HARNESS_LOG.md` and `docs/adr/ADR-017-deploy-pipeline-manual-gated.md`.

1. **Make changes locally** -> PR -> operator merges to `main`
2. **Image build** happens on push to `main` (`Build & Push Container Images`)
3. **Deploy is operator-initiated only**, from the Actions tab:
   - staging: run the `Deploy to Staging (manual)` workflow (`workflow_dispatch`)
   - production: `Production Release Workflow`
   The credential lives in GitHub Secrets (`PRODUCTION_SSH_KEY`); no human and no
   agent needs a copy of it locally.
4. **Verify** from the repo side: the workflow run log, then `/api/health`.
   Reading container state on the host is an operator action.

**⚠️ CRITICAL RESTRICTIONS**:
- ❌ Never edit files directly on production server
- ❌ Never hardcode secrets (use environment variables)
- ❌ Never expose Docker ports to external networks (use Nginx)
- ❌ Always use `docker-compose` for production, never PM2

---

## 📋 Project-Specific Patterns & Conventions

### **1. Thai Language & Localization**
- UI text defaults to Thai with English fallbacks
- All forms accept Thai input (ID cards, province names)
- Date formatting uses dayjs with Thai locale
- Font imports: Kanit, Sarabun (Google Fonts) for Thai rendering
- Example: [src/app/layout.tsx](apps/web-app/src/app/layout.tsx) shows font setup

### **2. Identity Verification (eKYC)**
- Users provide Thai national ID, company tax ID, or community registration number
- **Hash Storage**: Sensitive IDs are hashed and stored separately (`idCardHash`, `taxIdHash`)
- **Encryption**: Encrypted copies stored in `verificationDocuments` JSON field
- **Document pre-check**: uploaded papers are read locally (Tesseract.js) and flagged for the officer — warnings only, never a block
- **Service**: [identity-service.js](apps/backend/services/identity-service.js) and [document-precheck/](apps/backend/services/document-precheck/)

### **3. GACP Forms (Forms 9, 10, 11)**
- **Form 9**: Production/cultivation data
- **Form 10**: Sales/harvest data
- **Form 11**: Import/export data
- **State Management**: Form wizard with multi-step transitions
- **Service**: [application-service.js](apps/backend/services/application-service.js)
- **Validation**: Complex nested schema validation (Joi or Zod in controllers)

### **4. Payment Processing**
- **Gateway**: Ksher (Thai payment service)
- **Service**: [ksher-service.js](apps/backend/services/ksher-service.js)
- **Fee Calculation**: [fee-service.js](apps/backend/services/fee-service.js)
- **Flow**: User submits → system generates QR code → payment webhook updates status

### **5. QR Codes & Certificates**
- **QR Code Generation**: Uses `qrcode` npm package
- **Certificate PDF**: PDFKit generates certificates with farm details
- **Storage**: S3-compatible storage (check [storage-service.js](apps/backend/services/storage-service.js))
- **Public Verification**: Anonymous endpoint `/api/v1/public/verify/:n` verifies authenticity

### **6. Audit & Logging**
- **Audit Logger**: [audit-logger.js](apps/backend/middleware/audit-logger.js) tracks all user actions
- **ISO 27799 Compliance**: eKYC, auth events, form submissions logged with IP & user agent
- **Logger**: Winston (see [shared/logger.js](apps/backend/shared/logger.js))
- **Log Levels**: `info`, `warn`, `error`, `debug` (avoid `console.log` in production)

### **7. Async Jobs & Queues**
- **Engine**: Bull queue with Redis backend
- **Queue Service**: [queue-service.js](apps/backend/services/queue-service.js)
- **Job Types**: Email notifications, PDF generation, OCR processing
- **Scheduler**: node-cron for periodic tasks (check [scheduler/](apps/backend/services/scheduler/))

### **8. Performance & Caching**
- **Redis Cache**: [redis-service.js](apps/backend/services/redis-service.js) for frequently accessed data
- **Cache Middleware**: [cache-middleware.js](apps/backend/middleware/cache-middleware.js) for GET responses
- **Compression**: Enabled for all responses (gzip)

---

## 🔒 Security & Compliance

### **Key Security Patterns**
1. **Input Validation**: Use middleware [request-validator-middleware.js](apps/backend/middleware/request-validator-middleware.js) before controllers
2. **Rate Limiting**: Auth endpoints have stricter limits (5 attempts then lockout)
3. **CORS**: Configured per environment (check [cors-config-middleware.js](apps/backend/middleware/cors-config-middleware.js))
4. **Helmet**: Enables security headers for all responses
5. **Password Hashing**: bcryptjs with salt rounds (check [prisma-auth-service.js](apps/backend/services/prisma-auth-service.js))
6. **JWT Expiry**: Short-lived access tokens + refresh token rotation

### **Database Security**
- Soft deletes prevent accidental data loss
- Audit trails for compliance
- Encrypted sensitive fields (ID cards, laser codes)
- Role-based data filtering in services

---

## 🚨 Common Pitfalls & Anti-Patterns

| ❌ Don't | ✅ Do |
|---------|-------|
| Put logic in routes | Use services with Prisma |
| Expose ports in docker-compose | Use `expose:` and reverse proxy |
| Hardcode URLs/credentials | Use `process.env.*` |
| Use PM2 in production | Use Docker containers |
| Direct file edits on server | Local → git push → docker rebuild |
| Log with `console.log` | Use Winston logger |
| Return raw database errors | Format with success/message/error JSON |
| Skip middleware chains | Apply auth, validation, caching in order |

---

## 📚 Key Files to Reference

**Backend Architecture**:
- [server.js](apps/backend/server.js) - Express app setup, middleware chain
- [routes/api/](apps/backend/routes/api/) - All API endpoint definitions
- [controllers/auth-controller.js](apps/backend/controllers/auth-controller.js) - Auth flow example
- [services/prisma-database.js](apps/backend/services/prisma-database.js) - Prisma client singleton
- [config/jwt-security.js](apps/backend/config/jwt-security.js) - JWT configuration

**Frontend Structure**:
- [src/app/layout.tsx](apps/web-app/src/app/layout.tsx) - Global layout, fonts, theme
- [src/theme.ts](apps/web-app/src/theme.ts) - Mantine theme customization
- [src/contexts/](apps/web-app/src/contexts/) - Zustand stores and context
- [src/components/](apps/web-app/src/components/) - Reusable Mantine-based components

**Configuration**:
- [docker-compose.yml](docker-compose.yml) - Service definitions, environment setup
- [coding-rules.md](coding-rules.md) - Deployment checklist, server architecture
- [architecture-legacy.md](architecture-legacy.md) - System design decisions

---

## 🆘 Debugging Tips

1. **Backend Startup Issues**: Check logs with `docker logs gacp-backend` for database connection errors
2. **Prisma Errors**: Run migrations manually: `docker exec gacp-backend npx prisma migrate reset` (⚠️ for dev only)
3. **Frontend API Calls**: Verify `/api/*` routes proxy correctly through Nginx (check docker-compose reverse proxy config)
4. **Database Locks**: Backend uses `maxWorkers: 1` in Jest to avoid concurrent test conflicts
5. **Environment Variables**: Verify `.env` is loaded with `console.error` redacted database URL on startup

---

**Last Updated**: Feb 2026 | **Node**: 18.0.0+ | **PostgreSQL**: 15+ | **Next.js**: 15.1.0
