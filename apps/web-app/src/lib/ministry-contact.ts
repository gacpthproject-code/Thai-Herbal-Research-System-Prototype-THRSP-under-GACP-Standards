/**
 * contact@gacpth.com is not here: gacpth.com is the platform's domain, so that
 * mailbox is ours, not the department's (constants/contact-emails.ts CONTACT_EMAIL).
 *
 * Phone confirmed 2026-04-28 by reading the footer of the official
 * DTAM site (https://dtam.moph.go.th).
 */

export const MINISTRY_CONTACT = Object.freeze({
  phone: '0-2591-7007',
  ministry: 'กรมการแพทย์แผนไทยและการแพทย์ทางเลือก',
  ministryEn:
    'Department of Thai Traditional and Alternative Medicine, Ministry of Public Health',
  address: '88/23 หมู่ 4 ตำบลตลาดขวัญ อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000',
  website: 'https://dtam.moph.go.th',
} as const);

export type MinistryContact = typeof MINISTRY_CONTACT;

/**
 * Build a tel: URL from the dashed local format we render in the UI.
 * `0-2591-7007` → `tel:+6625917007`.
 */
export function ministryTelHref(): string {
  const digitsOnly = MINISTRY_CONTACT.phone.replace(/\D/g, '');
  // Drop leading 0 and prepend +66 (Thailand country code).
  const national = digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly;
  return `tel:+66${national}`;
}

