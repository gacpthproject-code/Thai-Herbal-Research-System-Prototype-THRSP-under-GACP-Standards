# Repo Naming Governance Cleanup Design

## Summary

This slice tightens repository naming governance without broad mass-renaming. It addresses the highest-confidence cross-platform risks from the naming audit: tracked local Playwright CLI artifacts, a camelCase Next.js dynamic route parameter, and missing automated enforcement for future file additions.

The slice intentionally avoids renaming platform-required files such as `Dockerfile`, `README.md`, Android/iOS project files, Xcode assets, generated OpenAPI output, and ADR identifiers.

## Goals

- Keep local Playwright CLI artifacts out of git.
- Add an automated repository naming guard that catches cross-platform blockers.
- Rename the public certificate verification dynamic route from `[certNumber]` to `[cert-number]`.
- Document allowed uppercase/platform exceptions so the naming policy is professional but practical.

## Non-Goals

- Do not rename the active health wizard `new-legacy` implementation in this slice.
- Do not mass-rename generated Flutter/OpenAPI/mobile platform files.
- Do not change public URLs or API contracts.
- Do not touch the dirty main workspace.

## Design

Add `scripts/ci/check-repo-naming.js` as a dependency-free Node.js guard. It scans `git ls-files -co --exclude-standard` and fails only on blocking issues:

- tracked `.playwright-cli/` artifacts
- whitespace in paths
- Windows-unsafe characters
- trailing dot or space path segments
- Windows reserved device names
- case-insensitive path collisions
- camelCase Next.js dynamic route params
- parentheses outside Next.js route groups

The same guard reports uppercase and underscore naming debt as warnings because the repo still contains legitimate framework/tooling exceptions.

Update `.gitignore` to ignore root `.playwright-cli/`. Remove existing tracked `.playwright-cli/*.yml` files from git.

Rename `apps/web-app/src/app/(public)/verify/[certNumber]` to `apps/web-app/src/app/(public)/verify/[cert-number]` and update the page params type to read `routeParams['cert-number']`.

Update `docs/standards/repository-naming-and-structure.md` with explicit exception rules for platform-required names.

## Testing

- Run `npm run check:repo-naming`.
- Run `git status --short` and inspect only intended files.
- If dependencies are available, run a web typecheck. If the isolated worktree does not have dependencies, rely on syntax-level inspection for the route param rename and report the limitation.

## Future Work

The active wizard can be renamed in a follow-up slice from `new-legacy` to a domain-owned private module such as `_application-flow` after the existing autosave and wizard smoke checks are green.
