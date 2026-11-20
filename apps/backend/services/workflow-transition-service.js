const { normalizeRole, CANONICAL_ROLES } = require('../shared/canonical-rbac');
const { mayWriteDecisionState, DECISION_QUEUE_STATES } = require('../shared/decision-states');

/**
 * Master Workflow States (15 canonical states + terminal states)
 *
 * DRAFT → SUBMITTED → PENDING_DOC_FEE
 *       → DOC_FEE_PAID → ASSIGNED_FOR_REVIEW
 *       → (DOC_APPROVED | REVISION_REQUESTED ↔ ASSIGNED_FOR_REVIEW)
 *       → PENDING_AUDIT_FEE
 *       → AUDIT_FEE_PAID → AUDIT_CONFIRMED
 *       → (AUDIT_PASSED | AUDIT_NOT_PASSED | CAR_PENDING → CAR_REVIEWING ↔ AUDIT_CONFIRMED)
 *       → the certificate approver decides: APPROVED → CERTIFIED, or REJECTED
 *         (or CAR_PENDING for a file that did not pass)
 *
 * Retired 2026-09-11: payment is Stripe-only and the verified webhook settles
 * straight to the paid state, so the interlude where an officer looked at a bank
 * slip has no owner. Rows holding either value: 0 on all three databases,
 * checked before removal. The words are now in the eslint denylist
 * (eslint-rules/no-legacy-status-vocabulary.js) so they cannot come back by
 * being copied from an old branch.
 */
const WORKFLOW_STATES = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'PENDING_DOC_FEE',
  'DOC_FEE_PAID',
  'ASSIGNED_FOR_REVIEW',
  'REVISION_REQUESTED',
  'DOC_APPROVED',
  'PENDING_AUDIT_FEE',
  'AUDIT_FEE_PAID',
  'AUDIT_CONFIRMED',
  'CAR_PENDING',
  'CAR_REVIEWING',
  'AUDIT_PASSED',
  'AUDIT_NOT_PASSED',
  'APPROVED',
  'CERTIFIED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);


/**
 * Strict allowed transitions (Master Workflow).
 *
 * Each fee state has exactly ONE forward edge — the settled webhook. There is no
 * human-approval edge beside it any more: nobody approves a payment.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  DRAFT: new Set(['SUBMITTED']),
  // A renewal owes no document fee (its one charge is billed as M2 after the documents
  // pass), so it goes straight to the reviewer-assignment queue; the status writer
  // refuses this edge for any filing that is not a stored renewal (order 25(11), 2026-10-06:
  // a renewal does not skip document review).
  SUBMITTED: new Set(['PENDING_DOC_FEE', 'DOC_FEE_PAID']),
  // Wave 2 (Stripe-only mandate): the DIRECT edge to the paid state — the
  // verified payment_intent.succeeded webhook settles it. The slip edge that
  // sat beside this one for the drain window retired with the slip pipeline
  // (2026-09-11), so this is now the only way in.
  // R2 M5 (payment-abandonment cron): an unpaid Phase-1 checkout that sits past
  // its dueDate long enough (config threshold) AND has been fully reminded is
  // auto-closed to EXPIRED. SYSTEM-only edge (see ROLE_TRANSITIONS) — the cron
  // is the sole walker; no human role owns it. Mirrors the deadline-cron
  // EXPIRED edges (REVISION_REQUESTED/CAR_PENDING) established for M4/WF-F4.
  // CANCELLED: the applicant withdraws before document review starts (order 32, no refund).
  PENDING_DOC_FEE: new Set(['DOC_FEE_PAID', 'EXPIRED', 'CANCELLED']),
  DOC_FEE_PAID: new Set(['ASSIGNED_FOR_REVIEW', 'CANCELLED']),
  // Allow reviewer to approve or request revision directly
  ASSIGNED_FOR_REVIEW: new Set(['DOC_APPROVED', 'REVISION_REQUESTED']),
  REVISION_REQUESTED: new Set(['ASSIGNED_FOR_REVIEW', 'EXPIRED']),
  DOC_APPROVED: new Set(['PENDING_AUDIT_FEE']),
  // Wave 2: direct Stripe-settle edge; slip edge stays for the drain window.
  // R2 M5: the Phase-2 payment-gate twin of the PENDING_DOC_FEE->EXPIRED edge
  // above. SYSTEM-only; same payment-abandonment auto-close.
  PENDING_AUDIT_FEE: new Set(['AUDIT_FEE_PAID', 'EXPIRED']),
  AUDIT_FEE_PAID: new Set(['AUDIT_CONFIRMED', 'CANCELLED']),
  // The field inspector records the visit; a visit that did not pass waits for the
  // certificate approver at AUDIT_NOT_PASSED and never closes the application (order 56(2)).
  AUDIT_CONFIRMED: new Set(['AUDIT_PASSED', 'AUDIT_NOT_PASSED', 'CAR_PENDING', 'CANCELLED']),
  CAR_PENDING: new Set(['CAR_REVIEWING', 'EXPIRED']),
  // AUDIT_CONFIRMED: the second visit the field inspector asked for after reviewing the corrective
  // evidence of a major finding, booked by the dispatcher (order 27, 2026-10-06).
  CAR_REVIEWING: new Set(['AUDIT_PASSED', 'CAR_PENDING', 'AUDIT_CONFIRMED']),
  AUDIT_PASSED: new Set(['APPROVED', 'CAR_REVIEWING', 'REJECTED']),
  // The approver refuses with a reason, or sends the applicant to correct (CAR, ISO/IEC 17065 7.6.2).
  AUDIT_NOT_PASSED: new Set(['REJECTED', 'CAR_PENDING']),
  APPROVED: new Set(['CERTIFIED']),
  CERTIFIED: new Set(),
  REJECTED: new Set(),
  // Waiver-reopen (owner ruling 2026-07-08): EXPIRED is no longer a dead end.
  // A once-per-application, DTAM-side-accountant-approved special case reopens
  // the application BACK to the exact state it expired from (server-derived
  // snapshot — never caller-chosen: revision-expired → CAR_PENDING would skip
  // the unpaid Phase-2 gate straight toward cert issuance). The edges are
  // owned by SYSTEM only (see ROLE_TRANSITIONS) — no human role can walk them
  // directly; execution happens inside waiver-reopen-service after the
  // DTAM-side approval. docs/handoffs/waiver-reopen-decision-2026-07-08.md.
  EXPIRED: new Set(['REVISION_REQUESTED', 'CAR_PENDING']),
  // The company or the state cancelled the service before the paid milestone's
  // service started, and the milestone was refunded (order 22, terms v1.3
  // §7.2). Terminal: to continue, the applicant files a new application.
  CANCELLED: new Set(),
});

/**
 * Role-based transition permissions
 * Format: "FROM_STATE->TO_STATE"
 * Admin can do anything (checked separately).
 * System/webhook transitions are also checked separately.
 */
const ROLE_TRANSITIONS = Object.freeze({
  [CANONICAL_ROLES.HEALTH]: new Set([
    'DRAFT->SUBMITTED',
    'REVISION_REQUESTED->ASSIGNED_FOR_REVIEW',
    'CAR_PENDING->CAR_REVIEWING',
    // Withdraw before the document reviewer starts (order 32; no refund, terms 7.1).
    'PENDING_DOC_FEE->CANCELLED',
    'DOC_FEE_PAID->CANCELLED',
  ]),
  // ── การเงินทั้งสองฝั่ง: ไม่มีขาเดินสถานะเลย และต้องมีแถวไว้ ──────────────
  //
  // เดิมสองบทบาทนี้ถือขาอนุมัติสลิป (PHASE_*_SLIP_UNDER_REVIEW → *_FEE_PAID)
  // เป็นขาเดียวที่มี · สลิปถูกปลดระวาง 2026-09-11 การจ่ายเป็น Stripe และ
  // webhook ที่ยืนยันลายเซ็นแล้วเป็นผู้ตัดสถานะ ⇒ **ไม่มีมนุษย์คนใดอนุมัติการชำระเงิน**
  // ชุดว่างจึงเป็นความจริงของงาน ไม่ใช่ของที่ลืมเติม
  //
  // **ห้ามลบสองคีย์นี้ทิ้ง** ทั้งที่ชุดมันว่าง: บทบาทที่ไม่มีแถวในตารางนี้จะตกไป
  // ทางผ่อนปรน (edge-only เหมือน admin) คือผ่านด่านบทบาทได้ทุกขาที่ตารางขาอนุญาต
  // — ลบคีย์ = เปิดอำนาจ ไม่ใช่ปิด (บทเรียน P0-E / Tier-16 drift closure)
  //
  // และตอนลบขาสลิปพบว่า FINANCE_OFFICER_PLATFORM ถูกประกาศ **ซ้ำสองครั้ง**
  // ในอ็อบเจกต์เดียว (คีย์หลังทับคีย์หน้าเงียบ ๆ) · ไม่เคยมีผลเพราะทั้งสองถือ
  // ชุดเดียวกัน แต่เป็นรูปที่เงียบเกินไปจะเจอ — เหลือแถวละหนึ่งแล้ว
  [CANONICAL_ROLES.FINANCE_OFFICER_DTAM]: new Set([]),
  [CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM]: new Set([]),
  [CANONICAL_ROLES.DOCUMENT_REVIEWER]: new Set([
    'ASSIGNED_FOR_REVIEW->DOC_APPROVED',
    'ASSIGNED_FOR_REVIEW->REVISION_REQUESTED',
  ]),
  [CANONICAL_ROLES.DISPATCHER]: new Set([
    'DOC_FEE_PAID->ASSIGNED_FOR_REVIEW',
    'AUDIT_FEE_PAID->AUDIT_CONFIRMED',
    // Books the second visit only after the field inspector asked for it (formData.reinspection,
    // checked by the calendar door): evidence first, a visit only when the inspector must see it.
    'CAR_REVIEWING->AUDIT_CONFIRMED',
  ]),
  [CANONICAL_ROLES.FIELD_INSPECTOR]: new Set([
    'AUDIT_CONFIRMED->AUDIT_PASSED',
    'AUDIT_CONFIRMED->CAR_PENDING',
    // "ไม่ผ่าน" at any visit, a second one included; the approver decides (order 56(2)).
    'AUDIT_CONFIRMED->AUDIT_NOT_PASSED',
    'CAR_REVIEWING->AUDIT_PASSED',
    'CAR_REVIEWING->CAR_PENDING',
    'AUDIT_PASSED->CAR_REVIEWING', // ผู้ตรวจย้อนผลที่ตัวเองเพิ่งให้ผ่าน
    // ── สองขาที่ถูกย้ายออกจากผู้ตรวจ (F-CERT-SOD, 2026-09-10) ──
    //
    // 'AUDIT_PASSED->APPROVED' และ 'APPROVED->CERTIFIED' เคยอยู่ตรงนี้ ตามมติ
    // 2026-06-05 ที่ให้ผู้ตรวจหน้างานคนเดียวออกใบเอง · operator กลับมติเมื่อ
    // 2026-09-10 · ทั้งสองขาย้ายไปอยู่กับ CERTIFICATE_APPROVER ข้างล่าง
    //
    // นี่คือด่านที่สอง ที่เสริมด่านแรก (ผู้อนุมัติ ≠ ผู้ประเมิน) ให้ครบตาม
    // ISO/IEC 17065 §7.6: ด่านแรกบอกว่า "ต้องคนละคน" ด่านนี้บอกว่า
    // "และต้องเป็นคนที่มีอำนาจตัดสิน ไม่ใช่ผู้ตรวจคนไหนก็ได้"
  ]),
  // ผู้ตัดสินให้การรับรอง — ถืออำนาจตัดสินอย่างเดียว ไม่มีขาบันทึกผลตรวจเลย
  // จงใจ: ถึงจะมีคนถือสองบทบาทพร้อมกัน เขาก็ยังติดด่านแรกที่เทียบตัวตนอยู่ดี
  [CANONICAL_ROLES.CERTIFICATE_APPROVER]: new Set([
    'AUDIT_PASSED->APPROVED',
    'APPROVED->CERTIFIED',
    // ไม่ให้การรับรอง (คำสั่ง 29, operator 2026-10-07) — เหตุจากรายการตายตัว
    // (shared/certification-decision-reasons.js) ผ่านประตู certification-refusals เท่านั้น
    'AUDIT_PASSED->REJECTED',
    // แฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน (คำสั่ง 56(2)): ไม่ให้การรับรอง หรือส่งกลับให้ผู้ยื่นแก้ไขข้อบกพร่อง
    'AUDIT_NOT_PASSED->REJECTED',
    'AUDIT_NOT_PASSED->CAR_PENDING',
    // การตัดสินที่ปฏิเสธไม่ได้ ไม่ใช่การตัดสิน · ผู้ตัดสินต้องส่งกลับไปให้ทบทวนได้
    // เมื่อหลักฐานไม่พอ ไม่งั้นทางเลือกเดียวที่เขามีคือ "อนุมัติ" (ประตู reject-to-auditor
    // ที่ routes/api/provider/auditor.js เดินขานี้ และคืนใบรับรองที่ออกไปแล้วในทรานแซกชัน
    // เดียวกัน) · ขานี้ยังอยู่กับผู้ตรวจหน้างานด้วย — คนละเหตุผล: เขาย้อนผลของตัวเอง
    'AUDIT_PASSED->CAR_REVIEWING',
  ]),
  // HEAD_AUDITOR transitions removed — consolidated into AUDITOR above
  //
  // WF-F4: SYSTEM is the non-human actor for automatic advances (post-submit
  // billing chain) and cron-driven expiry. The canonical workflow dictionary
  // (docs/architecture/workflow-state-machine.md, generated from this file)
  // documents these as system-owned. Encoding them here makes ROLE_TRANSITIONS
  // the single source of truth for EVERY actor — so strict-mode validation
  // (assertTransition / buildTransitionUpdate) narrows system to exactly these
  // edges instead of either rejecting it or letting it perform any edge-legal
  // move. APPROVED->CERTIFIED is the CERTIFICATE_APPROVER's (F-CERT-SOD,
  // 2026-09-10); admin is not part of the workflow. SYSTEM writes a decision
  // state only along these edges (shared/decision-states.js).
  [CANONICAL_ROLES.SYSTEM]: new Set([
    'SUBMITTED->PENDING_DOC_FEE',       // submit hop-2 auto-advance (phase-1 billing)
    'SUBMITTED->DOC_FEE_PAID',          // submit hop-2 of a renewal (no document fee; review queue)
    'DOC_APPROVED->PENDING_AUDIT_FEE',  // auto-chain after doc approval (phase-2 billing)
    // Wave 2 (Stripe-only mandate): the two payment gates are exited ONLY by
    // the cryptographically verified payment_intent.succeeded webhook, which
    // settles as SYSTEM. No human role holds these edges.
    'PENDING_DOC_FEE->DOC_FEE_PAID',    // M1 settle (Stripe webhook)
    'PENDING_AUDIT_FEE->AUDIT_FEE_PAID', // M2 settle (Stripe webhook)
    'REVISION_REQUESTED->EXPIRED',      // revision-deadline cron expiry
    'CAR_PENDING->EXPIRED',             // CAR-deadline cron expiry
    // R2 M5 — payment-abandonment cron (jobs/payment-closure-job.js). SYSTEM
    // auto-closes an unpaid checkout that is >config-threshold calendar days
    // past due AND fully reminded (3 PaymentReminderLog types). Marker
    // closedReason=PAYMENT_ABANDONED; NOT reopen-eligible (reopen unbuilt).
    'PENDING_DOC_FEE->EXPIRED',         // Phase-1 checkout abandoned
    'PENDING_AUDIT_FEE->EXPIRED',       // Phase-2 checkout abandoned
    // Waiver-reopen execution (owner ruling 2026-07-08) — SYSTEM-only by
    // design: the human decisions (inspector request + DTAM-side accountant
    // approval) are recorded on the WaiverReopenRequest row and in the
    // AuditLog; the state walk itself is performed by the service as SYSTEM.
    // A waiver approval is not a payment approval. Finance roles hold no
    // workflow edge at all (P0-E drift class).
    'EXPIRED->REVISION_REQUESTED',      // waiver-reopen (revision-expired)
    'EXPIRED->CAR_PENDING',             // waiver-reopen (CAR-expired)
    // Provider-cancellation refund (order 22, refund-service): the finance
    // officer's record is the human decision; the close is the service's.
    'DOC_FEE_PAID->CANCELLED',          // M1 paid, document review not started
    'AUDIT_FEE_PAID->CANCELLED',        // M2 paid, inspection not started
    'AUDIT_CONFIRMED->CANCELLED',       // M2 paid, inspection scheduled, not started
  ]),
});

// Statuses that require mandatory comment when transitioning TO them.
const REQUIRES_COMMENT_TARGETS = new Set([
  'REVISION_REQUESTED',
  'CAR_PENDING',
  'REJECTED',
]);

// Statuses where user (health) can edit form/upload documents.
const EDITABLE_STATUSES = new Set([
  'DRAFT',
  'REVISION_REQUESTED',
  'CAR_PENDING',
]);

// Revision/CAR loops are UNLIMITED — the only constraint is the 5-working-day
// revision deadline.  If the deadline expires the application moves to EXPIRED
// and the applicant must start a new application with a new Phase 1 payment.
// (Loop limits removed per business rule change 2026-03-22)

// Import shared utilities from the shared layer (not routes — fixes dependency inversion)
const { safeObject, safeArray } = require('../shared/safe-coerce');
const { buildWorkflowEvent } = require('../shared/workflow-event-builder');

/**
 * Resolve caller input to a canonical workflow state, or null.
 *
 * Fail-closed. Two alias tables used to sit between the input and this
 * answer — STATE_INPUT_ALIASES (16 legacy spellings plus 18 canonical
 * lowercase entries that toUpperCase already handles) and
 * STATE_BY_LEGACY_STATUS (27 legacy spellings plus the same 20 identity
 * entries again). They existed because writers kept producing values the
 * state machine could not name; PR 2b stopped that, so a value that is not
 * canonical is now a defect rather than history, and resolving it to
 * "something" would only hide the defect.
 */
function normalizeWorkflowStateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const upper = raw.toUpperCase();
  return WORKFLOW_STATES.includes(upper) ? upper : null;
}

/**
 * Expand states to the raw `status` values a query must match.
 *
 * Identity now: the column holds canonical states only, so a state matches
 * exactly itself. Retained as a named function because callers read better
 * for it and because it is the seam where a future compatibility need would
 * go — but it no longer fans a state out to a dozen historical spellings,
 * several of which no row ever held.
 */
function resolveRawStatusesForStates(values) {
  const requestedStates = Array.isArray(values) ? values : [values];
  return Array.from(new Set(
    requestedStates.map((value) => normalizeWorkflowStateInput(value)).filter(Boolean),
  ));
}

function resolveStateFromApplication(application) {
  const formData = safeObject(application?.formData);
  const stored = normalizeWorkflowStateInput(formData.workflowState);
  if (stored) {
    return stored;
  }
  return normalizeWorkflowStateInput(application?.status) || 'DRAFT';
}

function canTransition(fromState, toState, opts = undefined) {
  const allowed = ALLOWED_TRANSITIONS[fromState];
  if (!allowed || !allowed.has(toState)) {
    return false;
  }
  // WF-F4: optional role check. Backward compatible — callers that pass only
  // (from, to) get the edge-legality answer exactly as before. When an
  // `actorRole` is supplied (the strict-mode writer does this), the move must
  // ALSO be permitted for that role per ROLE_TRANSITIONS. As of the SYSTEM
  // grant, `system` is a first-class entry in ROLE_TRANSITIONS and is narrowed
  // to its documented automatic/cron edges. ADMIN is the only privileged actor
  // that still falls through here (it has NO ROLE_TRANSITIONS entry and is
  // gated by the `force` flag in buildTransitionUpdate instead); genuinely
  // unknown roles also fall through on edge legality.
  if (opts && opts.actorRole) {
    const canonicalRole = normalizeRole(opts.actorRole);
    // Only enforce the role gate for roles that participate in ROLE_TRANSITIONS
    // (now including system). Admin / unknown roles fall through on edge legality.
    if (canonicalRole && ROLE_TRANSITIONS[canonicalRole]) {
      return canRoleTransition(canonicalRole, fromState, toState);
    }
  }
  return true;
}

function canRoleTransition(role, fromState, toState) {
  const canonicalRole = normalizeRole(role);
  if (!canonicalRole) {
    return false;
  }
  const permissions = ROLE_TRANSITIONS[canonicalRole];
  if (!permissions) {
    return false;
  }
  return permissions.has(`${fromState}->${toState}`);
}

/**
 * Check if an application form is editable given its current status
 * @param {string} status - Current application status
 * @returns {boolean}
 */
function isApplicationEditable(status) {
  return EDITABLE_STATUSES.has(normalizeWorkflowStateInput(status));
}

const {
  certificationDecisionRefusal,
  CERT_DECISION_MESSAGES_TH,
} = require('./certification-decision-separation');

function buildTransitionUpdate({
  application,
  toState,
  actorId,
  actorRole,
  reasonCode = null,
  comment = null,
  metadata = null,
  force = false,
}) {
  const nextState = normalizeWorkflowStateInput(toState);
  if (!nextState) {
    throw new Error(`Invalid workflow state: ${toState}`);
  }

  const fromState = resolveStateFromApplication(application);
  if (fromState === nextState) {
    throw new Error(`Application already in workflow state ${nextState}`);
  }

  const canonicalRole = normalizeRole(actorRole);
  if (!canonicalRole) {
    throw new Error('Unknown actor role');
  }

  if (force && canonicalRole !== CANONICAL_ROLES.SYSTEM_ADMIN_DTAM) {
    throw new Error('Only admin can force workflow transition');
  }

  // Order 31: force recovers a stuck application, it never records someone else's verdict.
  // The status writer refuses the same; refusing here stops the side effects that run first.
  if (force && !mayWriteDecisionState(nextState, canonicalRole, fromState)) {
    const row = require('../shared/error-codes').ERROR_CODES.DECISION_STATE_NOT_FORCEABLE;
    throw Object.assign(new Error(row.messageTh), { code: row.code, status: row.httpStatus, statusCode: row.httpStatus });
  }

  if (!force && !canTransition(fromState, nextState)) {
    throw new Error(`Invalid transition ${fromState} -> ${nextState}`);
  }

  if (!force && !canRoleTransition(canonicalRole, fromState, nextState)) {
    throw new Error(`Role ${canonicalRole} cannot transition ${fromState} -> ${nextState}`);
  }

  // ── ด่านแยกหน้าที่ตาม ISO/IEC 17065 §7.6 (F-CERT-SOD, กลับมา 2026-09-10) ──
  //
  // ด่านนี้เคยอยู่ตรงนี้ แล้วถูกถอดออกโดยมติผลิตภัณฑ์ 2026-06-05 ("single-auditor
  // auto-issue") · ผลคือผู้ตรวจหน้างานคนเดียวถือทั้งการบันทึกผลตรวจ การอนุมัติ และการ
  // ออกใบ — และย้อนล้มใบที่ตัวเองออกได้ · operator ทักเองเมื่อ 2026-09-10 ว่าไม่ถูกต้อง
  //
  // ประตูอนุมัติของผู้อนุมัติ (`routes/api/provider/auditor.js` final-approval) สร้าง
  // transition ผ่านฟังก์ชันนี้ก่อนจะเขียนผ่าน writeApplicationStatus ด่านจึงอยู่ตรงนี้ให้
  // ปฏิเสธก่อนผลข้างเคียงใดจะเกิด · admin ไปไม่ถึงบรรทัดนี้ด้วย force เพราะ APPROVED
  // เป็นสถานะการตัดสินของผู้อนุมัติ (ด่าน mayWriteDecisionState ข้างบน คำสั่ง 31)
  // ไม่ให้การรับรอง ส่งกลับให้ทบทวน และส่งแฟ้มที่ไม่ผ่านกลับให้แก้ไข เป็นการตัดสินแบบเดียวกัน ด่านเดียวกัน:
  // ทุกขาของผู้อนุมัติที่ออกจากแฟ้มในคิวของตัวเอง อ่านจากสองตารางข้างบน ไม่มีรายการที่สอง
  const isCertificationDecision = canonicalRole === CANONICAL_ROLES.CERTIFICATE_APPROVER
    && DECISION_QUEUE_STATES.has(fromState)
    && ROLE_TRANSITIONS[CANONICAL_ROLES.CERTIFICATE_APPROVER].has(`${fromState}->${nextState}`);
  if (isCertificationDecision) {
    const refusal = certificationDecisionRefusal({ application, actorId, actorRole });
    if (refusal) {
      const err = new Error(`${refusal}: ${CERT_DECISION_MESSAGES_TH[refusal]}`);
      err.code = refusal;
      err.statusCode = 409;
      err.status = 409;
      err.messageTh = CERT_DECISION_MESSAGES_TH[refusal];
      throw err;
    }
  }

  // Mandatory comment check
  if (!force && REQUIRES_COMMENT_TARGETS.has(nextState) && !comment?.trim()) {
    throw new Error(`Transition to ${nextState} requires a mandatory comment`);
  }

  const formData = safeObject(application.formData);
  const workflowHistory = safeArray(application.workflowHistory);
  // The status column and the canonical state are the same vocabulary now —
  // LEGACY_STATUS_BY_STATE was 20 identity entries doing nothing but adding a
  // lookup between a value and itself.
  const nextLegacyStatus = nextState;

  const transitionEvent = buildWorkflowEvent({
    action: force ? 'WORKFLOW_FORCE_TRANSITION' : 'WORKFLOW_TRANSITION',
    fromState,
    toState: nextState,
    fromStatus: application.status || null,
    toStatus: nextLegacyStatus || null,
    actorId,
    actorRole: canonicalRole,
    reasonCode,
    comment,
    metadata,
  });

  return {
    previousState: fromState,
    nextState,
    nextLegacyStatus,
    transitionEvent,
    updateData: {
      status: nextLegacyStatus,
      updatedBy: actorId || null,
      // ผู้ตัดสินให้การรับรอง — บันทึกไว้บนแถว ไม่ใช่รู้กันเอง · คอลัมน์นี้คือที่เดิม
      // ของด่านสองคน (ROLE_TRANSITIONS เขียนว่า 'Consolidated from HEAD_AUDITOR')
      // และว่างมาตั้งแต่ด่านถูกถอด · การอนุมัติครั้งถัดไปจึงตรวจย้อนได้ว่าใครตัดสิน
      ...(isCertificationDecision ? { headAuditorId: actorId || null } : {}),
      formData: {
        ...formData,
        workflowState: nextState,
        workflowStateUpdatedAt: transitionEvent.timestamp,
      },
      workflowHistory: [...workflowHistory, transitionEvent],
    },
  };
}

// APPLICATION_STATUSES (frozen dictionary, previously in workflow-state-machine.js)
const APPLICATION_STATUSES = Object.freeze(
  WORKFLOW_STATES.reduce((acc, s) => { acc[s] = s; return acc; }, {}),
);

// InvalidTransitionError (previously in status-machine.js)
class InvalidTransitionError extends Error {
  constructor(entity, from, to, allowedTransitions = []) {
    super(
      `Invalid ${entity} transition: "${from}" → "${to}". ` +
      `Allowed from "${from}": [${allowedTransitions.join(', ')}]`,
    );
    this.name = 'InvalidTransitionError';
    this.entity = entity;
    this.from = from;
    this.to = to;
    this.allowedTransitions = allowedTransitions;
  }
}

// validateTransition (previously in status-machine.js)
function validateTransition(entity, fromRaw, toRaw) {
  // Keep the raw upper-cased value when normalization fails so the thrown
  // InvalidTransitionError names what the caller actually passed.
  const from = normalizeWorkflowStateInput(fromRaw) || String(fromRaw || '').toUpperCase();
  const to = normalizeWorkflowStateInput(toRaw) || String(toRaw || '').toUpperCase();

  if (!canTransition(from, to)) {
    const allowed = ALLOWED_TRANSITIONS[from];
    const allowedList = allowed ? [...allowed] : [];
    throw new InvalidTransitionError(entity, from, to, allowedList);
  }
}

module.exports = {
  WORKFLOW_STATES,
  APPLICATION_STATUSES,
  ALLOWED_TRANSITIONS,
  ROLE_TRANSITIONS,
  REQUIRES_COMMENT_TARGETS,
  EDITABLE_STATUSES,
  normalizeWorkflowStateInput,
  resolveRawStatusesForStates,
  resolveStateFromApplication,
  canTransition,
  canRoleTransition,
  isApplicationEditable,
  buildTransitionUpdate,
  validateTransition,
  InvalidTransitionError,
};
