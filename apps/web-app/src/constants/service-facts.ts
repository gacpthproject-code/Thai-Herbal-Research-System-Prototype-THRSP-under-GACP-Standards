/**
 * Service facts: what the web tells applicants about who they pay, how they pay, what is refunded, and what this platform
 * is. Operator decision 6 (2026-09-17): the copy must state the truth.
 *
 * Audit 2026-09-17 (UXUI-01, UXUI-02, UXUI-X01, UXUI-X2) found the FAQ, the
 * pricing page, the Terms of Service, the onboarding tour, the footer and the
 * renewal wizard each writing their own sentence about these things, and the
 * sentences contradicted each other and the backend. A surface that states one
 * of these facts takes it from here. Every entry names the record it comes
 * from; a claim with no record behind it is not written here, it is removed
 * from the page.
 *
 * Pinned to the backend by
 * apps/backend/__tests__/unit/frontend-service-facts-mirror.test.js and
 * src/__tests__/truthful-copy/service-facts-module.test.ts.
 */

import { SUPPORT_EMAIL } from '@/constants/contact-emails';
import { PROVIDER_CANCELLATION_REASONS, REFUND_TRANSFER_WORKING_DAYS } from '@/constants/refund-kinds';

// ── Certificate ─────────────────────────────────────────────────────────────
// How long a certificate lasts is not stated here: it is dated data on the
// backend, served by GET /api/certificate-validity (lib/certificate-validity).

/**
 * Days before expiry on which the renewal reminder is sent, as an in-app
 * notification (the fan-out is IN_APP only). MIRROR of REMINDER_DAYS in
 * apps/backend/services/renewal-service.js.
 */
export const GACP_RENEWAL_REMINDER_DAYS: ReadonlyArray<number> = [60, 30, 15];

/** "60, 30 และ 15" */
export const RENEWAL_REMINDER_DAYS_TH = GACP_RENEWAL_REMINDER_DAYS.join(', ').replace(/, (\d+)$/, ' และ $1');

/**
 * renewal-service.createRenewalApplication renews only an ACTIVE certificate
 * that has not expired, and answers CERT_ALREADY_EXPIRED ("a new application is
 * required") otherwise. There is no earliest-date window.
 */
export const RENEWAL_WINDOW_TH = 'ยื่นต่ออายุได้ขณะที่ใบรับรองยังไม่หมดอายุ ใบรับรองที่หมดอายุแล้วต้องยื่นคำขอใหม่';

/**
 * W12 (operator 2026-08-22, renewal-service.js header): "ต่ออายุ 30,000
 * ครั้งเดียว และไม่ตรวจเอกสาร นัดลงพื้นที่อย่างเดียว". The 30,000 in that quote
 * is the retired state base; since the one-fee ruling (operator 2026-09-11) the
 * declared renewal ค่าบริการ is 33,000 (FEES.RENEWAL_PER_SCOPE in
 * apps/backend/config/business-rules.js). The amount a page prints is the one
 * GET /api/pricing/fees serves (renewalTotalPerScope), never a literal here.
 */
export const RENEWAL_PROCESS_TH = 'การต่ออายุไม่มีการตรวจเอกสาร มีเฉพาะการตรวจประเมินฟาร์ม และชำระค่าบริการครั้งเดียว';

// ── Corrections ─────────────────────────────────────────────────────────────

/**
 * วันทำการที่ผู้ยื่นมีเวลาแก้เอกสาร เมื่อผู้ตรวจเอกสารสั่งแก้ (คำสั่ง 28). MIRROR of
 * PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS in apps/backend/config/business-rules.js
 * (pinned by apps/backend/__tests__/unit/frontend-service-facts-mirror.test.js).
 * Counted in Bangkok working days, not calendar days.
 */
export const GACP_DOCUMENT_REVISION_DEADLINE_BUSINESS_DAYS = 5;

/** "5 วันทำการ" */
export const DOCUMENT_REVISION_DEADLINE_TH = `${GACP_DOCUMENT_REVISION_DEADLINE_BUSINESS_DAYS} วันทำการ`;

/**
 * วันที่ผู้ยื่นมีเวลาส่งหลักฐานการแก้ไขข้อบกพร่องที่พบจากการตรวจพื้นที่ (คำสั่ง 56(2a)) นับตามปฏิทิน
 * MIRROR of the entry in force of CORRECTIVE_ACTION.ONSITE_WINDOW in
 * apps/backend/config/business-rules.js (pinned by frontend-service-facts-mirror.test.js).
 */
export const GACP_ONSITE_CORRECTION_DEADLINE_CALENDAR_DAYS = 30;

/** "30 วัน" */
export const ONSITE_CORRECTION_DEADLINE_TH = `${GACP_ONSITE_CORRECTION_DEADLINE_CALENDAR_DAYS} วัน`;

// ── Who is paid ─────────────────────────────────────────────────────────────

/**
 * W14 (operator 2026-08-22, HARNESS_LOG.md c28355ea; business-rules.js FEES
 * header) and docs/legal/payment-terms-th-v1.3.md §1: one issuer. The applicant
 * pays the platform company, which issues every quotation, invoice, receipt and
 * tax invoice. The retired two-payee model (state fee to the Comptroller
 * General, platform fee to the company) is not current.
 *
 * One ค่าบริการ (operator 2026-09-11): "ไม่มีการแยก
 * ค่าธรรมเนียมรัฐ ค่าบริการ จะเป็นค่าบริการทั้งหมด". So no sentence here says a
 * state fee sits inside the price, or that the company remits one to the
 * department: whatever the company pays the department is an agreement outside
 * this system (payment-terms v1.3 §2.6; the in-system monthly
 * remittance was ordered removed 2026-09-11). This file's first version
 * (2026-09-17) still said both; they became false with the one-fee ruling.
 */
export const PAYEE_TH = 'บริษัทผู้ให้บริการแพลตฟอร์ม';

export const PLATFORM_COMPANY_TH = 'บริษัท พรีดิกทีฟ เอไอ โซลูชัน จำกัด';
export const PLATFORM_ADDRESS_TH = '429/69 หมู่บ้าน พรีเมี่ยมเพลส ถนนสุคนธสวัสดิ์ แขวงลาดพร้าว เขตลาดพร้าว กรุงเทพมหานคร 10230';

export const PAYEE_STATEMENT_TH =
  'ค่าบริการทุกงวดชำระให้บริษัทผู้ให้บริการแพลตฟอร์มเพียงรายเดียว บริษัทเป็นผู้ออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษีทั้งหมด ไม่มียอดใดที่ต้องชำระแยกให้กรมการแพทย์แผนไทยและการแพทย์ทางเลือกหรือกรมบัญชีกลาง';

// ── How ─────────────────────────────────────────────────────────────────────

/**
 * The one payment rail. Operator ruling 2026-09-27: user-facing text never
 * names the payment provider (Stripe) — it says "ผู้ให้บริการรับชำระเงิน" /
 * "the payment provider". Code identifiers and comments may name it. Pinned by
 * apps/backend/__tests__/unit/frontend-service-facts-mirror.test.js and
 * src/__tests__/truthful-copy/service-facts-module.test.ts.
 *
 *   - Stripe only: operator 2026-09-06 "เราจ่ายเงินผ่าน strip เท่านั้น".
 *   - PromptPay only: mandate D3 2026-08-04, paymentMethodTypes ['promptpay']
 *     in services/checkout/stripe-checkout-service.js; the card path is
 *     deliberately not offered.
 *   - No transfer, no slip: the bank-slip rail was retired 2026-09-06/09-11
 *     (services/workflow-transition-service.js); only the verified Stripe
 *     webhook moves an application past a fee state.
 * Kept as ONE single-quoted literal: the backend mirror test reads it as text.
 */
export const PAYMENT_CHANNEL_TH = 'ชำระผ่านระบบด้วยการสแกน QR พร้อมเพย์ ผ่านผู้ให้บริการรับชำระเงิน เป็นช่องทางเดียว ไม่รับโอนเข้าบัญชีธนาคาร ไม่รับแนบสลิป และไม่รับบัตร';

/**
 * English mirror of PAYMENT_CHANNEL_TH — same facts, same record (one-fee
 * residue sweep 2026-09-26). Before this, en-health.ts `methodTransfer` hand-
 * wrote its own English sentence with no backend-pinned source; the Thai
 * dictionary already reads PAYMENT_CHANNEL_TH the same way this one is read.
 * Kept as ONE single-quoted literal: the backend mirror test reads it as text.
 */
export const PAYMENT_CHANNEL_EN = 'Pay in the system by scanning a PromptPay QR code, through the payment provider, the only channel. Bank transfers, slip uploads and card payments are not accepted.';

/**
 * How an applicant pays, true whether or not this environment can take the
 * payment right now (PromptPay QR step, operator ruling 2026-09-27). POST
 * /payments/checkout creates the order and a Stripe PromptPay PaymentIntent and
 * returns the publishable key with it; the checkout screen then opens Stripe's
 * own QR modal (stripe.confirmPromptPayPayment). Only the verified Stripe
 * webhook marks a fee paid (checkout-settlement-service.js, probe
 * settle-webhook-only). The backend refuses a checkout before minting anything
 * when its publishable key is missing or of the wrong mode, and the screen then
 * says so (ONLINE_PAYMENT_NOT_READY_TH). Surfaces that cannot ask the backend
 * (pricing, FAQ, the payments list) state this sentence, which holds in both
 * states. No staff member can take the payment instead: the finance roles hold
 * no workflow transition.
 */
export const ONLINE_PAYMENT_STEP_TH = 'ชำระด้วยการสแกน QR พร้อมเพย์ที่ผู้ให้บริการรับชำระเงินแสดงบนหน้าชำระเงินของระบบ การชำระเงินจะถูกบันทึกเข้าระบบก็ต่อเมื่อได้รับการยืนยันจากผู้ให้บริการรับชำระเงิน หากระบบรับชำระเงินยังไม่พร้อม หน้าชำระเงินจะแจ้งไว้และไม่มีการเรียกเก็บเงิน';

/**
 * Said only where the backend has just answered that the QR cannot be shown:
 * a checkout response with no publishable key (the mock adapter), or one of the
 * fail-closed refusals STRIPE_PUBLISHABLE_KEY_NOT_CONFIGURED /
 * STRIPE_KEY_MODE_MISMATCH / STRIPE_NOT_CONFIGURED. Never printed on a surface
 * that did not ask.
 */
export const ONLINE_PAYMENT_NOT_READY_TH = 'ระบบรับชำระเงินยังไม่พร้อมในขณะนี้ หน้านี้จึงยังแสดง QR พร้อมเพย์ให้สแกนไม่ได้ และยังชำระค่าบริการผ่านระบบไม่ได้';

/** True while nothing can be confirmed: an order may exist, a charge does not. */
export const NOT_CHARGED_TH = 'ระบบยังไม่ได้เรียกเก็บเงินจากคุณ';

/**
 * When each milestone of a new application is paid. Record: payment terms v1.3 §5.4
 * (docs/legal/payment-terms-th-v1.3.md) — งวดที่ 2 after the documents pass review, and it
 * must be paid before the farm inspection can be scheduled (order 32: its window counts
 * from the day the documents passed).
 */
export const MILESTONE_PAY_WHEN_TH = Object.freeze({
    M1: 'ชำระหลังยื่นคำขอและยอมรับใบเสนอราคา',
    M2: 'ชำระหลังเอกสารผ่านการตรวจ ก่อนวันตรวจประเมินแปลง',
});

/**
 * The receipt is written when the Stripe settlement lands (HARNESS_LOG.md G4
 * walk a03: "settlement เขียน receiptNumber ... ลง invoice ทันที";
 * services/pdf/invoice-template-service.js "ใบเสร็จรับเงินออกอัตโนมัติเมื่อ
 * ชำระเงินสำเร็จ"). No working-day timetable and no Revenue Department e-Tax
 * registration is on record, so neither is claimed.
 */
export const RECEIPT_TH = 'เมื่อระบบยืนยันการชำระเงินแล้ว ใบเสร็จรับเงินและใบกำกับภาษีในนามบริษัทจะออกให้อัตโนมัติ';

// ── Refunds ─────────────────────────────────────────────────────────────────

/**
 * docs/legal/payment-terms-th-v1.3.md §7 (operator 2026-10-06; in force from
 * 7 ตุลาคม 2569), the text the applicant ticks before every payment. Every rule
 * is shown before payment (owner ruling 2026-07-08: disclosure before payment
 * is what makes the no-refund rule hold), in the document's own words: each
 * row below is a row of the §7 summary table, and each reason is a §7.2.1
 * item. src/__tests__/truthful-copy/service-facts-module.test.ts compares them
 * cell by cell. The cells carry no pronoun, so the คุณ pages and the ท่าน legal
 * surfaces quote the same strings.
 */
export interface RefundCase {
  /** กรณี */
  situation: string;
  /** ผลต่อคำขอ */
  application: string;
  /** เงินคืน, with its reason */
  refund: string;
  /** สิ่งที่ต้องทำ */
  nextStep: string;
}

export const REFUND_CASES: ReadonlyArray<RefundCase> = [
  {
    situation: 'ขอยกเลิกคำขอเอง',
    application: 'คำขอถูกยกเลิก',
    refund:
      'ไม่คืนเงิน ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจากบริษัทเริ่มเตรียมการให้บริการตั้งแต่ได้รับชำระค่าบริการ',
    nextStep: 'ไม่ต้องดำเนินการเพิ่ม',
  },
  {
    situation: 'บริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการ',
    application: 'บริษัทขออภัยในความไม่สะดวก คำขอถูกปิดเป็นยกเลิก',
    refund: 'คืนเงินเต็มจำนวนเฉพาะงวดที่ยังไม่ได้เริ่มดำเนินการตรวจ พร้อมออกใบลดหนี้',
    nextStep: 'แจ้งข้อมูลบัญชีสำหรับรับเงินคืน',
  },
  {
    situation: 'คำขอถูกยกเลิกเพราะความผิดพลาดของระบบ',
    application: 'บริษัทขออภัยและคืนสถานะคำขอให้ดำเนินการต่อในคำขอเดิม',
    refund:
      'ไม่คืนเงิน ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจากค่าบริการที่ชำระแล้วใช้ต่อในคำขอเดิมได้ทั้งหมดโดยไม่มีค่าใช้จ่ายเพิ่ม',
    nextStep: 'ไม่ต้องดำเนินการเพิ่ม',
  },
  {
    situation: 'ระบบเรียกเก็บเงินซ้ำหรือเกิน',
    application: 'สถานะคำขอไม่เปลี่ยน และงวดนั้นยังถือว่าชำระแล้ว',
    refund: 'คืนเงินเฉพาะส่วนที่เก็บซ้ำหรือเกิน พร้อมออกใบลดหนี้',
    nextStep: 'แจ้งบริษัท และแจ้งข้อมูลบัญชีสำหรับรับเงินคืน',
  },
];

/** The sentence under the §7 table (every other ending is §7.1), without the clause number. */
export const REFUND_OTHER_CASES_TH =
  'กรณีอื่น เช่น ผลการตรวจไม่ผ่าน หรือคำขอถูกยกเลิกเพราะพ้นกำหนดแก้ไขหรือไม่ชำระค่าบริการ ค่าบริการที่ชำระแล้วไม่อยู่ในเงื่อนไขการคืนเงิน';

/**
 * §7.2.1: the only reasons that count as the company or the state cancelling.
 * The same words finance picks from when it records the refund
 * (constants/refund-kinds.ts, mirrored from the backend's shared/refund-kinds.js).
 */
export const PROVIDER_CANCEL_REASONS_TH: ReadonlyArray<string> = Object.values(PROVIDER_CANCELLATION_REASONS);

/** §7.1 first sentence, without its clause numbers. */
export const REFUND_SUMMARY_TH =
  'ค่าบริการที่ชำระแล้วไม่อยู่ในเงื่อนไขการคืนเงิน ยกเว้นสองกรณี คือ บริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการ และระบบเรียกเก็บเงินซ้ำหรือเกิน';

/** §7.2.2 in one line: what is not a company/state cancellation. */
export const PROVIDER_CANCEL_EXCLUDES_TH =
  'เหตุที่มาจากคำขอเอง เช่น เอกสารไม่ครบ ผลการตรวจไม่ผ่าน พ้นกำหนดแก้ไข หรือการขอเลื่อนการตรวจ ไม่นับเป็นการยกเลิกโดยบริษัทหรือหน่วยงานของรัฐ';

/** §7.4: how a refund is paid and the timetable. */
export const REFUND_TRANSFER_TH = `บริษัทออกใบลดหนี้ และโอนเงินคืนเข้าบัญชีที่แจ้งไว้ภายใน ${REFUND_TRANSFER_WORKING_DAYS} วันทำการ นับจากวันที่อนุมัติการคืนเงินและได้รับข้อมูลบัญชีครบถ้วน`;

/** The rules as sentences, for surfaces that print prose (terms of service, FAQ). */
export const REFUND_POLICY_TH: ReadonlyArray<string> = [
  REFUND_SUMMARY_TH,
  ...REFUND_CASES.map((c) => `กรณี${c.situation}: ${c.application} ${c.refund}`),
  REFUND_OTHER_CASES_TH,
  `เหตุที่นับว่าบริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการมีเพียง ${PROVIDER_CANCEL_REASONS_TH.map((r, i) => `(${i + 1}) ${r}`).join(' ')}`,
  PROVIDER_CANCEL_EXCLUDES_TH,
  REFUND_TRANSFER_TH,
];

/**
 * payment-terms v1.3 §7.4 + §11.1: a duplicate charge is reported to the
 * company at its support address; a company/state cancellation is started by
 * the company itself (§7.2.4). Refunds are executed by staff only
 * (routes/api/finance/refunds.js: every endpoint is authenticateProvider); an
 * applicant has no refund request of their own in the system.
 */
export const REFUND_REQUEST_TH = `หากพบว่าถูกเรียกเก็บเงินซ้ำหรือเกิน โปรดแจ้งบริษัททางอีเมล ${SUPPORT_EMAIL} กรณีบริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการ บริษัทจะติดต่อเพื่อเริ่มเรื่องคืนเงินให้เอง`;

/** One line per fee row: what happens to a paid instalment. */
export const REFUND_PAID_FEE_TH =
  'ชำระแล้วไม่อยู่ในเงื่อนไขการคืนเงิน ยกเว้นบริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการก่อนเริ่มตรวจ หรือเรียกเก็บเงินซ้ำ';

// ── What this platform is ───────────────────────────────────────────────────

/**
 * No record in the repository shows a government authorisation for this site,
 * a .go.th domain, the official Garuda emblem (the login page says it is still
 * awaiting approval), or an ISO/IEC 17065 accreditation, so no page claims to
 * be a government website, to be certified or endorsed by the department, or
 * to issue under ISO/IEC 17065 (audit UXUI-02). What the records do show: the
 * platform company provides and bills the service (payment-terms v1.3 §1), and
 * the certificate is the department's (Terms of Service §1-§2; the certificate
 * PDF template, apps/backend/services/pdf/templates/certificate.html, names the
 * department as issuer).
 *
 * Future tense (operator order 56(0), 2026-10-09): the department's own GACP
 * page says this site is not authorised by it, so until the official arrangement
 * with the department is complete a public page says the certificate WILL be
 * issued, never that it is. The sentence is the operator's, word for word.
 * certificate-issuer-is-future-tense.test.tsx pins it and fails on the old
 * present-tense forms anywhere under src/. Change it back only on the
 * operator's word that the arrangement is complete.
 */
export const CERTIFICATE_ISSUER_TH =
  'ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ';

/** The search-result and link-preview description of the site (root and marketing layouts). */
export const SITE_DESCRIPTION_TH = `ยื่นขอใบรับรองมาตรฐาน GACP สมุนไพรออนไลน์ ให้บริการโดย${PAYEE_TH} ${CERTIFICATE_ISSUER_TH}`;
