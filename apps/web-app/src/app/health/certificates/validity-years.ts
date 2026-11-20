/**
 * How many years ONE certificate is valid for, read from its own dates.
 *
 * This page used to print "อายุใบรับรอง (3 ปี)" from a constant for every
 * certificate. A certificate's term is the validity rule in force on its issue
 * date (backend certificate_validity_rules; 12 months since 2026-09-11), and a
 * later rule never changes it: one issued before 2026-09-11 keeps the 3-year
 * expiry the retired path wrote. The generic copy states today's rule (GET
 * /api/certificate-validity); a page that shows one certificate states that
 * certificate's span.
 *
 * Whole years, rounded, so a leap day or a Bangkok/UTC midnight edge cannot turn
 * 1 into 0.99. null when either date is missing or unreadable, or the span is
 * under half a year: the page then names no number rather than guess one.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365.2425;

export function certificateValidityYears(
    issuedDate: string | null | undefined,
    expiryDate: string | null | undefined,
): number | null {
    if (!issuedDate || !expiryDate) return null;
    const issued = Date.parse(issuedDate);
    const expiry = Date.parse(expiryDate);
    if (!Number.isFinite(issued) || !Number.isFinite(expiry)) return null;
    const years = Math.round((expiry - issued) / DAY_MS / YEAR_DAYS);
    return years >= 1 ? years : null;
}
