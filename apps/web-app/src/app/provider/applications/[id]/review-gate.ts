// Review-action gate helpers for /provider/applications/[id].
//
// These were originally exported from page.tsx, but Next.js forbids a page
// module from exporting anything other than the default component + the route
// segment config (metadata, dynamic, …) — `next build` fails with
// "<name> is not a valid Page export field". They live here so both the page
// and the V2-A test suite can import them without breaking the build.

import { CANONICAL_ROLES, normalizeRole } from '@/lib/constants/canonical-roles';

// The roles that open the per-document check (requireCanonicalPermission
// APPLICATION_DOC_REVIEW on the backend). The field inspector is not one of them:
// document review is the document reviewer's alone (operator 2026-10-06, order 27).
export const REVIEW_ACTION_ROLES: ReadonlySet<string> = new Set<string>([
  CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
  CANONICAL_ROLES.DOCUMENT_REVIEWER,
]);

/**
 * Whether the action panel offers the link to the per-document check. Roles
 * outside the set see the read-only notice instead.
 */
export function viewerCanActOnReview(role: string | null | undefined): boolean {
  const canonical = normalizeRole(role);
  return canonical ? REVIEW_ACTION_ROLES.has(canonical) : false;
}
