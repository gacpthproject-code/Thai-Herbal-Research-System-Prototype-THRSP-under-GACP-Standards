# Repo Naming Governance Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add practical repo naming governance and clean the highest-confidence cross-platform naming issues.

**Architecture:** Use a dependency-free Node.js CI guard for blocking path hazards and keep broader naming debt as warnings. Apply one safe Next.js dynamic route rename and remove tracked local Playwright artifacts.

**Tech Stack:** Node.js, Git, Next.js App Router, Markdown

---

### Task 1: Add Naming Guard

**Files:**
- Create: `scripts/ci/check-repo-naming.js`
- Modify: `package.json`

- [ ] **Step 1: Create the guard script**

Create `scripts/ci/check-repo-naming.js` that reads `git ls-files -co --exclude-standard`, checks for cross-platform blocking naming issues, and reports uppercase/underscore debt as warnings.

- [ ] **Step 2: Add npm script**

Add `"check:repo-naming": "node scripts/ci/check-repo-naming.js"` to root `package.json`.

- [ ] **Step 3: Verify guard**

Run:

```powershell
npm run check:repo-naming
```

Expected:

- exit code `0`
- output includes `OK`
- output may include warning count for existing uppercase/underscore debt

### Task 2: Clean Local Tool Artifacts

**Files:**
- Modify: `.gitignore`
- Remove from git: `.playwright-cli/page-*.yml`

- [ ] **Step 1: Ignore root Playwright CLI artifacts**

Add `.playwright-cli/` under the Playwright section in `.gitignore`.

- [ ] **Step 2: Remove tracked local artifacts**

Run:

```powershell
git rm .playwright-cli/page-2026-03-30T12-18-35-484Z.yml .playwright-cli/page-2026-03-30T12-19-00-327Z.yml .playwright-cli/page-2026-03-30T12-19-21-649Z.yml .playwright-cli/page-2026-03-30T12-20-18-939Z.yml
```

- [ ] **Step 3: Re-run naming guard**

Run:

```powershell
npm run check:repo-naming
```

Expected: no blocking `.playwright-cli/` violations.

### Task 3: Rename Certificate Dynamic Route Param

**Files:**
- Move: `apps/web-app/src/app/(public)/verify/[certNumber]/page.tsx` to `apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx`
- Modify: `apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx`

- [ ] **Step 1: Rename the route segment**

Run:

```powershell
git mv 'apps/web-app/src/app/(public)/verify/[certNumber]' 'apps/web-app/src/app/(public)/verify/[cert-number]'
```

- [ ] **Step 2: Update the params type**

Use:

```ts
params: Promise<{ 'cert-number': string }>;
```

Then read:

```ts
const routeParams = await params;
const certNumber = routeParams['cert-number'];
```

- [ ] **Step 3: Verify no camelCase dynamic route remains**

Run:

```powershell
npm run check:repo-naming
```

Expected: no blocking dynamic route param violations.

### Task 4: Document Naming Exceptions

**Files:**
- Modify: `docs/standards/repository-naming-and-structure.md`
- Create: `docs/superpowers/specs/2026-04-22-repo-naming-governance-cleanup-design.md`
- Create: `docs/superpowers/plans/2026-04-22-repo-naming-governance-cleanup.md`

- [ ] **Step 1: Update the standard**

Document that kebab-case is the default and platform-required names such as `README.md`, `Dockerfile`, mobile platform files, generated OpenAPI output, and ADR identifiers are allowed exceptions.

- [ ] **Step 2: Record design and plan**

Save this slice's design and plan in `docs/superpowers`.

### Task 5: Final Verification

**Files:**
- Test: naming guard
- Test: git status

- [ ] **Step 1: Run naming guard**

Run:

```powershell
npm run check:repo-naming
```

- [ ] **Step 2: Inspect changed files**

Run:

```powershell
git status --short
git diff --stat
```

Expected changes only:

- `.gitignore`
- `.playwright-cli/*.yml` deleted
- `apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx`
- `docs/standards/repository-naming-and-structure.md`
- `docs/superpowers/specs/2026-04-22-repo-naming-governance-cleanup-design.md`
- `docs/superpowers/plans/2026-04-22-repo-naming-governance-cleanup.md`
- `package.json`
- `scripts/ci/check-repo-naming.js`
