import { FEE_SERVICES_FALLBACK, SERVICE_NAME } from '@/lib/pricing/fee-services';
import type { WorkflowState } from '@/lib/constants/workflow-states';

/**
 * Health Dashboard Stage: the applicant-facing progress model, and the one place
 * that turns an application status into what the applicant reads.
 *
 * Every applicant page (detail, list, /health/status, dashboard) calls
 * `applicantStatus(status, ctx)` and renders its label, sentence, next action and
 * "ขั้นตอนที่ x จาก y". Pages that kept their own tables disagreed about one
 * application (live walk 2026-10-07 F3).
 */

/**
 * The stage union, declared once as data so tests and callers can iterate it.
 * Every copy table below is a `Record<HealthDashboardStage, …>`, so adding a
 * stage here is a compile error until every renderer handles it — this is the
 * exhaustiveness guarantee, not a convention.
 */
export const HEALTH_DASHBOARD_STAGES = [
  'DRAFT',
  'PENDING_FEE_PHASE1',
  'UNDER_DOCUMENT_REVIEW',
  'REVISION_REQUIRED',
  'PENDING_FEE_PHASE2',
  // จ่ายงวดที่ 2 แล้ว แต่ยังไม่มีใครนัดวัน — คนละขั้นกับการตรวจที่เกิดขึ้นจริง
  'PENDING_AUDIT_SCHEDULE',
  'UNDER_FIELD_AUDIT',
  'PENDING_DECISION',
  'APPROVED',
  'CERTIFIED',
  // Terminal. REJECTED / EXPIRED / CANCELLED were in no classification
  // set below and fell through to the closing UNDER_DOCUMENT_REVIEW fallback,
  // so a rejected applicant was told their documents were under review.
  'CLOSED',
] as const;

export type HealthDashboardStage = (typeof HEALTH_DASHBOARD_STAGES)[number];

/**
 * Stages where the file is finished and the stepper no longer applies. Callers
 * must branch on this rather than on `getStepperIndex(...) === 0`, which DRAFT
 * also satisfies.
 */
const TERMINAL_STAGES = new Set<HealthDashboardStage>(['CLOSED']);

export function isTerminalStage(stage: HealthDashboardStage): boolean {
  return TERMINAL_STAGES.has(stage);
}


// ── Labels ──────────────────────────────────────────────────────────────────

export const STAGE_LABEL_TH: Record<HealthDashboardStage, string> = {
  DRAFT: 'ร่างคำขอ',
  PENDING_FEE_PHASE1: `รอชำระ${SERVICE_NAME.PHASE_1}`,
  UNDER_DOCUMENT_REVIEW: 'อยู่ระหว่างตรวจเอกสาร',
  REVISION_REQUIRED: 'แก้ไขเอกสารตามข้อเสนอแนะ',
  PENDING_FEE_PHASE2: 'รอชำระค่าบริการก่อนตรวจประเมินแปลง',
  PENDING_AUDIT_SCHEDULE: 'รอนัดวันตรวจประเมินแปลง',
  UNDER_FIELD_AUDIT: 'อยู่ระหว่างตรวจประเมินแปลง',
  PENDING_DECISION: 'ตรวจประเมินแปลงแล้ว รอการตัดสินให้การรับรอง',
  APPROVED: 'ผ่านการอนุมัติ',
  CERTIFIED: 'ได้รับใบรับรอง GACP',
  CLOSED: 'คำขอปิดแล้ว',
};

export const STAGE_LABEL_EN: Record<HealthDashboardStage, string> = {
  DRAFT: 'Draft',
  PENDING_FEE_PHASE1: 'Instalment 1: document review service fee due',
  UNDER_DOCUMENT_REVIEW: 'Document Review',
  REVISION_REQUIRED: 'Revision Required',
  PENDING_FEE_PHASE2: 'Service fee due before the site assessment',
  PENDING_AUDIT_SCHEDULE: 'Awaiting Audit Appointment',
  UNDER_FIELD_AUDIT: 'Field Audit in Progress',
  PENDING_DECISION: 'Awaiting Certification Decision',
  APPROVED: 'Approved',
  CERTIFIED: 'GACP Certified',
  CLOSED: 'Closed',
};

// ── Descriptions (tells user what's happening) ──────────────────────────────

export const STAGE_DESCRIPTION_TH: Record<HealthDashboardStage, string> = {
  DRAFT: 'คำขอยังไม่ได้ส่ง กรุณากรอกข้อมูลให้ครบถ้วนแล้วกดยื่นคำขอ',
  PENDING_FEE_PHASE1: `กรุณาชำระ${SERVICE_NAME.PHASE_1} เพื่อเข้าสู่ขั้นตอนตรวจเอกสาร`,
  UNDER_DOCUMENT_REVIEW: 'เจ้าหน้าที่กำลังตรวจสอบเอกสารของคุณ กรุณารอผลการตรวจ',
  REVISION_REQUIRED: 'เจ้าหน้าที่แจ้งให้แก้ไขเอกสาร กรุณาอัปโหลดเอกสารที่แก้ไขภายในกำหนด',
  PENDING_FEE_PHASE2: 'กรุณาชำระค่าบริการ เพื่อนัดวันตรวจประเมินแปลง',
  PENDING_AUDIT_SCHEDULE: 'ชำระค่าบริการแล้ว รอเจ้าหน้าที่นัดวันเข้าตรวจแปลง',
  UNDER_FIELD_AUDIT: 'เจ้าหน้าที่กำลังดำเนินการตรวจประเมินแปลง กรุณารอผลการตรวจ',
  PENDING_DECISION: 'ตรวจประเมินแปลงเสร็จแล้ว รอผู้อนุมัติตัดสินว่าจะให้การรับรองหรือไม่',
  APPROVED: 'คำขอได้รับการอนุมัติแล้ว อยู่ระหว่างจัดทำใบรับรอง GACP',
  CERTIFIED: 'คุณได้รับใบรับรอง GACP แล้ว ดาวน์โหลดได้จากหน้าใบรับรอง',
  CLOSED: 'คำขอนี้ปิดแล้ว คุณยื่นคำขอใหม่ได้',
};

// ── Next Action (tells user what TO DO) ──────────────────────────────────────

export const STAGE_NEXT_ACTION_TH: Record<HealthDashboardStage, string> = {
  DRAFT: 'กรอกข้อมูลและยื่นคำขอ',
  PENDING_FEE_PHASE1: 'ชำระงวดที่ 1',
  UNDER_DOCUMENT_REVIEW: 'รอผลตรวจเอกสาร',
  REVISION_REQUIRED: 'อัปโหลดเอกสารที่แก้ไข',
  PENDING_FEE_PHASE2: 'ชำระค่าบริการ',
  PENDING_AUDIT_SCHEDULE: 'รอเจ้าหน้าที่นัดวันเข้าตรวจแปลง',
  UNDER_FIELD_AUDIT: 'รอผลตรวจประเมินแปลง',
  PENDING_DECISION: 'รอผลการตัดสินให้การรับรอง',
  APPROVED: 'รอออกใบรับรอง',
  CERTIFIED: 'ดาวน์โหลดใบรับรอง',
  CLOSED: 'ยื่นคำขอใหม่',
};

// ── With the application at hand (round 3, operator 2026-10-03) ───────────────
//
// PENDING_FEE_PHASE2 is a renewal's one charge AND a new filing's second instalment. The
// maps above have no application, so they say what is true for both. A screen that has
// the application (`isRenewal` from the backend payloads) names which; `undefined` falls
// back to the neutral map. Names are the catalogue's (constants/fee-service-catalogue.json).

export interface RenewalContext { isRenewal?: boolean | null | undefined }

const P2_NAME = FEE_SERVICES_FALLBACK.PHASE_2.name;
const RENEWAL_NAME = FEE_SERVICES_FALLBACK.RENEWAL.name;

export function stageLabelFor(stage: HealthDashboardStage, ctx: RenewalContext = {}): string {
  if (stage === 'PENDING_FEE_PHASE2' && typeof ctx.isRenewal === 'boolean') {
    return ctx.isRenewal ? `รอชำระ${RENEWAL_NAME}` : `รอชำระ${P2_NAME}`;
  }
  return STAGE_LABEL_TH[stage];
}

export function stageDescriptionFor(stage: HealthDashboardStage, ctx: RenewalContext = {}): string {
  if (stage === 'PENDING_FEE_PHASE2' && typeof ctx.isRenewal === 'boolean') {
    return ctx.isRenewal
      ? `กรุณาชำระ${RENEWAL_NAME} เพื่อนัดวันตรวจประเมินแปลง`
      : `เอกสารผ่านการตรวจสอบแล้ว กรุณาชำระ${P2_NAME}`;
  }
  if (stage === 'PENDING_AUDIT_SCHEDULE' && typeof ctx.isRenewal === 'boolean') {
    return `ชำระ${ctx.isRenewal ? RENEWAL_NAME : P2_NAME}แล้ว รอเจ้าหน้าที่นัดวันเข้าตรวจแปลง`;
  }
  return STAGE_DESCRIPTION_TH[stage];
}

export function stageNextActionFor(stage: HealthDashboardStage, ctx: RenewalContext = {}): string {
  if (stage === 'PENDING_FEE_PHASE2' && typeof ctx.isRenewal === 'boolean') {
    return ctx.isRenewal ? `ชำระ${RENEWAL_NAME}` : 'ชำระงวดที่ 2';
  }
  return STAGE_NEXT_ACTION_TH[stage];
}

// ── Badge Colors ────────────────────────────────────────────────────────────

export const STAGE_BADGE_STYLE: Record<HealthDashboardStage, { bg: string; text: string; dot: string }> = {
  DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  PENDING_FEE_PHASE1: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  UNDER_DOCUMENT_REVIEW: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  REVISION_REQUIRED: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  PENDING_FEE_PHASE2: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  PENDING_AUDIT_SCHEDULE: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  UNDER_FIELD_AUDIT: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  PENDING_DECISION: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  APPROVED: { bg: 'bg-leaf-soft', text: 'text-leaf-700', dot: 'bg-leaf-600' },
  CERTIFIED: { bg: 'bg-leaf-soft', text: 'text-leaf-800', dot: 'bg-leaf-700' },
  CLOSED: { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
};

// ── Stepper Configuration ───────────────────────────────────────────────────

// CLOSED is deliberately absent: it is not a rung, it is the end of the road.
export const STEPPER_STEPS: Array<{
  stage: Exclude<HealthDashboardStage, 'CLOSED'>;
  label: string;
  shortLabel: string;
  icon: string;
}> = [
  { stage: 'DRAFT', label: 'ร่างคำขอ', shortLabel: 'ร่าง', icon: 'FileEdit' },
  { stage: 'PENDING_FEE_PHASE1', label: `ชำระ${SERVICE_NAME.PHASE_1}`, shortLabel: 'งวดที่ 1', icon: 'CreditCard' },
  { stage: 'UNDER_DOCUMENT_REVIEW', label: 'ตรวจเอกสาร', shortLabel: 'ตรวจเอกสาร', icon: 'FileSearch' },
  { stage: 'REVISION_REQUIRED', label: 'แก้ไขเอกสาร', shortLabel: 'แก้ไข', icon: 'FilePen' },
  { stage: 'PENDING_FEE_PHASE2', label: `ชำระ${SERVICE_NAME.PHASE_2}`, shortLabel: 'งวดที่ 2', icon: 'CreditCard' },
  { stage: 'PENDING_AUDIT_SCHEDULE', label: 'รอนัดวันตรวจแปลง', shortLabel: 'รอนัด', icon: 'CalendarClock' },
  { stage: 'UNDER_FIELD_AUDIT', label: 'ตรวจประเมินแปลง', shortLabel: 'ตรวจแปลง', icon: 'ClipboardCheck' },
  { stage: 'PENDING_DECISION', label: 'ตัดสินให้การรับรอง', shortLabel: 'รอตัดสิน', icon: 'Scale' },
  { stage: 'APPROVED', label: 'อนุมัติ', shortLabel: 'อนุมัติ', icon: 'CheckCircle' },
  { stage: 'CERTIFIED', label: 'ออกใบรับรอง', shortLabel: 'ใบรับรอง', icon: 'Award' },
];

// ── Stepper index (for progress %) ──────────────────────────────────────────

/**
 * The stepper for one application. A renewal (round 5, mirroring the mobile
 * trackingStepsFor) pays ONE charge and skips document review: no instalment-1 step,
 * no review/revision steps, and its payment step is named by the RENEWAL catalogue
 * entry. A new filing keeps STEPPER_STEPS.
 */
const RENEWAL_SKIPS: ReadonlySet<HealthDashboardStage> = new Set(['PENDING_FEE_PHASE1', 'UNDER_DOCUMENT_REVIEW', 'REVISION_REQUIRED']);
export function stepperStepsFor(ctx: RenewalContext = {}): typeof STEPPER_STEPS {
  if (ctx.isRenewal !== true) return STEPPER_STEPS;
  return STEPPER_STEPS
    .filter((step) => !RENEWAL_SKIPS.has(step.stage))
    .map((step) => (step.stage === 'PENDING_FEE_PHASE2'
      ? { ...step, label: `ชำระ${RENEWAL_NAME}`, shortLabel: 'ต่ออายุ' }
      : step));
}

/** getStepperIndex / getProgressPercent for one application's own stepper. */
export function stepperIndexFor(stage: HealthDashboardStage, ctx: RenewalContext = {}): number {
  const steps = stepperStepsFor(ctx);
  const idx = steps.findIndex((s) => s.stage === stage);
  if (idx >= 0) return idx;
  return isTerminalStage(stage) ? -1 : 0;
}
export function progressPercentFor(stage: HealthDashboardStage, ctx: RenewalContext = {}): number {
  const idx = stepperIndexFor(stage, ctx);
  if (idx < 0) return 0;
  return Math.round((idx / (stepperStepsFor(ctx).length - 1)) * 100);
}

export function getStepperIndex(stage: HealthDashboardStage): number {
  // REVISION_REQUIRED goes back to index 2 (document review area) on the stepper
  // but we treat it as its own visual step for clarity.
  //
  // Terminal stages return -1 — "not on the ladder". Collapsing them to 0 (the
  // old behaviour for any stage the stepper did not know) rendered a closed
  // file as a fresh draft sitting on step 1 of 9.
  const idx = STEPPER_STEPS.findIndex((s) => s.stage === stage);
  if (idx >= 0) return idx;
  return isTerminalStage(stage) ? -1 : 0;
}

export function getProgressPercent(stage: HealthDashboardStage): number {
  const idx = getStepperIndex(stage);
  if (idx < 0) return 0;
  return Math.round((idx / (STEPPER_STEPS.length - 1)) * 100);
}

// ── Status → stage ─────────────────────────────────────────────────────────

const STAGE_BY_STATUS: Record<WorkflowState, HealthDashboardStage> = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'PENDING_FEE_PHASE1',
  PENDING_DOC_FEE: 'PENDING_FEE_PHASE1',
  DOC_FEE_PAID: 'UNDER_DOCUMENT_REVIEW',
  ASSIGNED_FOR_REVIEW: 'UNDER_DOCUMENT_REVIEW',
  REVISION_REQUESTED: 'REVISION_REQUIRED',
  DOC_APPROVED: 'PENDING_FEE_PHASE2',
  PENDING_AUDIT_FEE: 'PENDING_FEE_PHASE2',
  // จ่ายงวดที่ 2 แล้วแต่ยังไม่มีใครนัดวัน คนละขั้นกับการตรวจที่เกิดขึ้นจริง
  AUDIT_FEE_PAID: 'PENDING_AUDIT_SCHEDULE',
  AUDIT_CONFIRMED: 'UNDER_FIELD_AUDIT',
  CAR_PENDING: 'UNDER_FIELD_AUDIT',
  CAR_REVIEWING: 'UNDER_FIELD_AUDIT',
  AUDIT_PASSED: 'PENDING_DECISION',
  AUDIT_NOT_PASSED: 'PENDING_DECISION',
  APPROVED: 'APPROVED',
  CERTIFIED: 'CERTIFIED',
  REJECTED: 'CLOSED',
  EXPIRED: 'CLOSED',
  CANCELLED: 'CLOSED',
};

/**
 * The stage of an application, read from its status column alone. A certificate
 * row never promotes a status: the list once read APPROVED + a certificate as
 * "ได้รับใบรับรอง" while the detail and status pages called it pending (live walk
 * 2026-10-07 F3).
 */
export function stageForStatus(status: string | null | undefined): HealthDashboardStage {
  const key = String(status || '').trim().toUpperCase();
  if (!key) return 'DRAFT';
  // Unknown strings keep the old "under review" floor rather than claiming a draft.
  return STAGE_BY_STATUS[key as WorkflowState] ?? 'UNDER_DOCUMENT_REVIEW';
}

// ── The applicant's view of one status: the one mapping every page reads ─────

const STAGE_NEEDS_USER_ACTION: Record<HealthDashboardStage, boolean> = {
  DRAFT: true,
  PENDING_FEE_PHASE1: true,
  UNDER_DOCUMENT_REVIEW: false,
  REVISION_REQUIRED: true,
  PENDING_FEE_PHASE2: true,
  PENDING_AUDIT_SCHEDULE: false,
  UNDER_FIELD_AUDIT: false,
  PENDING_DECISION: false,
  APPROVED: false,
  CERTIFIED: false,
  CLOSED: false,
};

type StatusCopy = { label?: string; description: string; nextAction?: string; needsUserAction?: boolean };

/** Statuses whose stage copy would be untrue for them. */
const STATUS_COPY: Partial<Record<WorkflowState, StatusCopy>> = {
  // Paid, not yet assigned: the dispatcher has not handed it to a document reviewer, so
  // nobody is reading it yet and the applicant may still withdraw (live walk F5, order 32).
  DOC_FEE_PAID: {
    label: 'รอมอบหมายผู้ตรวจเอกสาร',
    description: 'ระบบได้รับชำระเงินแล้ว คำขอของคุณอยู่ในคิวรอมอบหมายให้ผู้ตรวจเอกสาร ยังไม่เริ่มตรวจ',
    nextAction: 'รอมอบหมายผู้ตรวจเอกสาร',
  },
  CAR_PENDING: {
    description: 'ผู้ตรวจพบข้อบกพร่องจากการลงพื้นที่ กรุณาส่งหลักฐานการแก้ไขภายในเวลาที่กำหนด',
    nextAction: 'ส่งหลักฐานการแก้ไข',
    needsUserAction: true,
  },
  // F-A8b-03: the evidence is with the inspector (or the approver sent the file back to the
  // inspector); the applicant waits.
  CAR_REVIEWING: {
    description: 'ผู้ตรวจพื้นที่กำลังพิจารณาคำขอของคุณ ไม่ต้องดำเนินการเพิ่มในขั้นตอนนี้',
    nextAction: 'รอผู้ตรวจพื้นที่พิจารณา',
    needsUserAction: false,
  },
  AUDIT_PASSED: {
    description: 'คุณผ่านการตรวจประเมินแปลงแล้ว รอผู้อนุมัติตัดสินว่าจะให้การรับรองหรือไม่',
  },
  // Order 56(2): the inspector's "ไม่ผ่าน" does not close the application; the approver decides.
  AUDIT_NOT_PASSED: {
    description: 'ผลการตรวจพื้นที่คือไม่ผ่าน คำขอนี้อยู่ระหว่างการพิจารณาว่าจะไม่ให้การรับรอง หรือให้คุณแก้ไขข้อบกพร่อง และจะแจ้งผลให้ทราบ',
  },
  REJECTED: {
    label: 'ไม่ได้รับการรับรอง',
    description: 'คำขอของคุณไม่ได้รับการรับรอง ดูเหตุผลได้ในรายละเอียดคำขอ หากต้องการดำเนินการต่อ กรุณายื่นคำขอใหม่',
    nextAction: 'ยื่นคำขอใหม่',
  },
  EXPIRED: {
    label: 'ยกเลิก (เลยกำหนด)',
    description: 'คำขอของคุณถูกยกเลิกเพราะเลยกำหนดเวลา หากต้องการดำเนินการต่อ กรุณายื่นคำขอใหม่',
    nextAction: 'ยื่นคำขอใหม่',
  },
  CANCELLED: {
    label: 'ยกเลิก',
    description: 'คำขอของคุณถูกยกเลิกแล้ว หากต้องการดำเนินการต่อ กรุณายื่นคำขอใหม่',
    nextAction: 'ยื่นคำขอใหม่',
  },
};

const UNKNOWN_STATUS_COPY: StatusCopy = {
  label: 'ไม่ทราบสถานะ',
  description: 'ไม่สามารถระบุสถานะปัจจุบันได้ กรุณาดูรายละเอียดคำขอ',
  nextAction: 'ดูรายละเอียดคำขอ',
};

export interface ApplicantStatus {
  stage: HealthDashboardStage;
  label: string;
  description: string;
  nextAction: string;
  needsUserAction: boolean;
  /** 1-based rung on stepperStepsFor(ctx); null once the file is closed. */
  step: number | null;
  totalSteps: number;
  progressPercent: number;
}

export function applicantStatus(status: string | null | undefined, ctx: RenewalContext = {}): ApplicantStatus {
  const stage = stageForStatus(status);
  const key = String(status || '').trim().toUpperCase();
  const known = !key || key in STAGE_BY_STATUS;
  const copy = known ? STATUS_COPY[key as WorkflowState] : UNKNOWN_STATUS_COPY;
  const index = stepperIndexFor(stage, ctx);
  return {
    stage,
    label: copy?.label ?? stageLabelFor(stage, ctx),
    description: copy?.description ?? stageDescriptionFor(stage, ctx),
    nextAction: copy?.nextAction ?? stageNextActionFor(stage, ctx),
    needsUserAction: copy?.needsUserAction ?? STAGE_NEEDS_USER_ACTION[stage],
    step: index < 0 ? null : index + 1,
    totalSteps: stepperStepsFor(ctx).length,
    progressPercent: progressPercentFor(stage, ctx),
  };
}

export function stepCounterTH(view: Pick<ApplicantStatus, 'step' | 'totalSteps'>): string {
  return view.step === null ? '' : `ขั้นตอนที่ ${view.step} จาก ${view.totalSteps}`;
}
