'use strict';

/**
 * Who reads and who writes the company's books (order 29, operator 2026-10-07).
 *
 *   write     the company's finance officer (finance_officer_platform) only. DTAM-side
 *             roles, system_admin_dtam included, never write the company's books.
 *   check     an adjustment entry, a purchase invoice and a period reopen are approved by a
 *             SECOND platform finance officer: the maker is never the checker.
 *   read      both finance roles and system_admin_dtam, each inside its own organization;
 *             a caller with no organization is refused (order 17).
 *
 * Every finance service asks here instead of carrying its own role sets.
 */

const { normalizeRole, CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { organizationScope, DENY_ALL } = require('../../shared/application-visibility');

const BOOKS_WRITE_ROLES = Object.freeze(new Set([
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
]));

const BOOKS_READ_ROLES = Object.freeze(new Set([
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
]));

/**
 * Who reads a taxpayer id in full, on the tax reports, the WHT certificate list and the
 * purchase-invoice doors: the company's finance officer, who keeps the books and files the
 * returns (orders 34, 57). Every other reader gets it masked to its first digit and last four
 * (order 10).
 */
const FULL_TAX_ID_ROLES = Object.freeze(new Set([
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
]));

function booksError(code, message, statusCode) {
    return Object.assign(new Error(message), { code, statusCode });
}

function roleOf(actor) {
    return normalizeRole(actor?.canonicalRole || actor?.role);
}

function readsFullTaxIds(actor) {
    return FULL_TAX_ID_ROLES.has(roleOf(actor));
}

/**
 * Who downloads a finance document's PDF from a staff door (quotation, receipt / tax invoice,
 * credit note, debit note): the company finance officer only. The paper prints the buyer's
 * tax id in full, as a tax document must, and only that role reads it in full (order 57).
 * Every other staff role reads the same document as masked rows on the JSON doors
 * (order 64 ค6 ก, operator 2026-10-09). The payer's own doors are
 * not staff doors and do not ask here.
 */
function assertDownloadsFinancePapers(actor) {
    if (!readsFullTaxIds(actor)) {
        throw booksError(
            'FINANCE_PAPER_COMPANY_FINANCE_ONLY',
            'Only the company finance officer downloads a finance document PDF from a staff door',
            403,
        );
    }
}

function assertBooksWriter(actor) {
    if (!BOOKS_WRITE_ROLES.has(roleOf(actor))) {
        throw booksError('FORBIDDEN_ROLE', 'Only the company finance officer writes the company books', 403);
    }
}

function assertBooksReader(actor) {
    if (!BOOKS_READ_ROLES.has(roleOf(actor))) {
        throw booksError('FORBIDDEN_ROLE', 'A finance or admin role is required to read the company books', 403);
    }
}

/**
 * The organization filter of a books read: `{}` for system_admin_platform, the caller's
 * own organization otherwise. A caller with no organization is refused.
 */
function booksOrganizationWhere(actor) {
    const scope = organizationScope(actor);
    if (scope === null) { return {}; }
    if (scope === DENY_ALL) {
        throw booksError('FORBIDDEN_TENANT', 'Organization context required', 403);
    }
    return { organizationId: scope.organizationId };
}

/**
 * A row of the books is the caller's only when it carries the caller's organization;
 * system_admin_platform's reads cross organizations. A caller with no organization, and a row
 * with none, is nobody's.
 */
function isRowInCallerOrganization(actor, row) {
    const scope = organizationScope(actor);
    if (scope === null) { return true; }
    return scope !== DENY_ALL && Boolean(row?.organizationId) && row.organizationId === scope.organizationId;
}

/**
 * The row a write door acts on, or null: another organization's row answers exactly as a
 * missing one, because a 403 for a real id confirms that it exists (R2-L2, security re-review of
 * 33d8c40fe). `owner` is the row whose organization decides, the invoice for a note.
 */
function rowInCallerOrganization(actor, row, owner = row) {
    return row && isRowInCallerOrganization(actor, owner) ? row : null;
}

function assertRowInCallerOrganization(actor, row) {
    booksOrganizationWhere(actor); // a caller with no organization is refused first, in its own words
    if (!isRowInCallerOrganization(actor, row)) {
        throw booksError('FORBIDDEN_TENANT', 'Cross-tenant access denied', 403);
    }
}

/** Maker-checker: the person who made the row may not approve it. */
function assertNotMaker(actor, makerId, code) {
    if (!actor?.id || (makerId && actor.id === makerId)) {
        throw booksError(code, 'A second finance officer, not the one who made it, must approve', 403);
    }
}

module.exports = {
    BOOKS_WRITE_ROLES,
    BOOKS_READ_ROLES,
    assertBooksWriter,
    assertBooksReader,
    booksOrganizationWhere,
    isRowInCallerOrganization,
    rowInCallerOrganization,
    assertRowInCallerOrganization,
    assertNotMaker,
    readsFullTaxIds,
    assertDownloadsFinancePapers,
};
