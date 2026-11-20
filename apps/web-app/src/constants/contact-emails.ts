/**
 * The platform's contact mailboxes: ONE source for every page that names them.
 *
 * Operator 2026-09-26: support@, privacy@ and finance@gacpth.com stay as
 * contact addresses (email is out of 2FA and password reset only, and stays as
 * contact information); the operator sets up MX for gacpth.com. Before this
 * file each address was typed out in 8+ places (help centre, contact page and
 * its mailto helper, onboarding tour, renewal advisory, wizard dictionary, FAQ),
 * so moving a mailbox meant finding every copy.
 *
 * contact@gacpth.com is the platform's general contact line (CONTACT_EMAIL). It used to
 * sit in lib/ministry-contact.ts, which made the footer present our mailbox as the
 * department's.
 *
 * Pinned by src/__tests__/truthful-copy/contact-emails-one-source.test.ts: no
 * other file under src/ may spell these addresses.
 */

/** The platform's general contact line, printed in the footer as ours. */
export const CONTACT_EMAIL = 'contact@gacpth.com';

/** General questions and help (help centre "อีเมลทั่วไป"). */
export const SUPPORT_EMAIL = 'support@gacpth.com';

/** PDPA requests: erasure, data-subject rights. */
export const PRIVACY_EMAIL = 'privacy@gacpth.com';

/** Receipts, refunds, payments. */
export const FINANCE_EMAIL = 'finance@gacpth.com';

export function mailtoHref(address: string): string {
    return `mailto:${address}`;
}
