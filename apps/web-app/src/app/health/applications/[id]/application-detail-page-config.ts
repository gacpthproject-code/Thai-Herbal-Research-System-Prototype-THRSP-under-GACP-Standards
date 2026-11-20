import { SERVICE_NAME } from '@/lib/pricing/fee-services';
import { AREA_UNIT_LABEL, formatAreaSqm, legacyAreaToSqm } from '@/lib/area';
// The pay CTA labels carry no price here. The amount is appended by
// resolveActionTarget from the served fees (GET /api/pricing/fees), per
// cultivation scope, because an application with several scopes owes a
// multiple. It used to be read from constants (F-G4-64 T9), which would have
// kept naming the old price after a fee changed in the fee engine
// (apps/backend/config/business-rules.js, served by /api/pricing/fees).
import { THAI_TIME_ZONE } from '@/lib/format/thai-date';

export type ActionMeta = {
  title: string;
  hint: string;
  buttonLabel?: string;
};

export const ACTION_META: Record<string, ActionMeta> & { WAITING: ActionMeta } = {
  CONTINUE_DRAFT: {
    title: 'ดำเนินการต่อ',
    hint: 'ข้อมูลยังเป็นแบบร่าง กรุณากรอกและยืนยันส่งข้อมูลให้ครบ',
    buttonLabel: 'ดำเนินการต่อ',
  },
  PAY_DOC_FEE: {
    title: 'ดำเนินการต่อ',
    hint: `เอกสารถูกส่งแล้ว กรุณาชำระ${SERVICE_NAME.PHASE_1} เพื่อเริ่มกระบวนการ`,
    buttonLabel: 'ชำระงวดที่ 1',
  },
  SUBMIT_REVISION: {
    title: 'ดำเนินการต่อ',
    hint: 'มีคำสั่งแก้ไขจากผู้ตรวจ กรุณาแก้ไขและส่งกลับภายในเวลาที่กำหนด',
    buttonLabel: 'แก้ไขและส่งข้อมูลใหม่',
  },
  PAY_AUDIT_FEE: {
    title: 'ดำเนินการต่อ',
    hint: 'กรุณาชำระค่าบริการ เพื่อนัดวันตรวจประเมินแปลง',
    buttonLabel: 'ชำระค่าบริการ',
  },
  SUBMIT_CAR_EVIDENCE: {
    title: 'ดำเนินการต่อ',
    hint: 'พบข้อบกพร่องจากการลงพื้นที่ กรุณาส่งหลักฐานการแก้ไข',
    buttonLabel: 'ส่งหลักฐานการแก้ไข',
  },
  // CAR_REVIEWING (F-A8b-03): the evidence is in, or the approver sent the file back to the
  // inspector; either way the applicant has nothing to send and waits for the inspector.
  WAIT_CAR_REVIEW: {
    title: 'รอผู้ตรวจพื้นที่พิจารณา',
    hint: 'ผู้ตรวจพื้นที่กำลังพิจารณาคำขอของคุณ ไม่ต้องดำเนินการเพิ่มในขั้นตอนนี้',
  },
  DOWNLOAD_CERTIFICATE: {
    title: 'ได้รับใบรับรอง GACP แล้ว',
    hint: 'ดาวน์โหลดใบรับรอง แล้วเริ่มส่งรายงานรายเดือน (ภ.ท.27/28) ตามเงื่อนไขใบรับรอง',
    buttonLabel: 'ดาวน์โหลดใบรับรอง',
  },
  NOT_CERTIFIED: {
    title: 'ไม่ได้รับการรับรอง',
    hint: 'เหตุผลและข้อพิจารณาอยู่ในหนังสือแจ้งคำสั่ง หากต้องการขอการรับรอง คุณยื่นคำขอใหม่ได้',
    buttonLabel: 'ยื่นคำขอใหม่',
  },
  REAPPLY: {
    title: 'ต้องเริ่มคำขอใหม่',
    hint: 'คำขอนี้ปิดแล้ว หากต้องการขอการรับรอง กรุณายื่นคำขอใหม่',
    buttonLabel: 'ยื่นคำขอใหม่',
  },
  WAITING: {
    title: 'รอดำเนินการจากระบบ',
    hint: 'คำขออยู่ระหว่างกระบวนการของเจ้าหน้าที่',
  },
  WAIT_SCHEDULE: {
    title: 'รอนัดหมายลงพื้นที่',
    hint: 'เจ้าหน้าที่จัดคิวกำลังกำหนดวันนัดตรวจที่ฟาร์มของคุณ',
  },
};

/** An officer comment as the server sends it to the applicant: the author by role only. */
export interface ApplicationCommentEntry {
  id: string;
  authorRole?: string | null;
  commentText?: string | null;
  createdAt?: string | null;
}

/** The booked inspection (server sends it only while the visit is booked). */
export interface AuditScheduleView {
  scheduledDate: string;
  auditorName: string | null;
}

/** The person on site as the server sends it to the application page (order 65(2)). */
export interface SiteContactView {
  siteContactName: string | null;
  sitePhone: string | null;
  siteContactIsApplicant: boolean;
  /** The filing lacks a name or a phone. */
  missing: boolean;
  /** The applicant may still change it: after filing and before the visit. */
  editable: boolean;
}

/** A reason the dispatcher recorded, as the server words it for the applicant (order 65(1)). */
export interface RecordedReasonView {
  kind: string;
  kindLabel: string;
  label: string;
  sideLabel: string;
  recordedAt: string | null;
}

/** Why a refused application was not certified, as the order states it (no officer named). */
export interface CertificationRefusalView {
  reasonLabel: string | null;
  consideration: string | null;
  decidedAt: string | null;
}

export interface ApplicationDetailPayload {
  id: string;
  applicationId: string;
  /** round 3: a renewal (one charge) vs a new filing (two instalments). */
  isRenewal?: boolean;
  /** The stored cultivation-type count the quotation priced; null when unknown. */
  cultivationScopeCount?: number | null;
  /** round 4: the engine's renewal price for this application (renewals only, else null). */
  renewalPriceEstimate?: number | null;
  applicationNumber?: string;
  /** The holder entity the application is filed for. */
  entityId?: string | null;
  healthId?: string;
  serviceType?: string;
  areaType?: string;
  status: string;
  workflowState?: string | null;
  workflowStateUpdatedAt?: string | null;
  submittedAt?: string | null;
  /** When and who, while the inspection is booked; null otherwise. */
  auditSchedule?: AuditScheduleView | null;
  /** Why the visit was booked late or the field inspector moved during a correction (order 65(1)). */
  recordedReasons?: RecordedReasonView[];
  /** The reason, consideration and date of the order not to certify; null unless refused. */
  certificationRefusal?: CertificationRefusalView | null;
  /** The person on site, and whether the applicant may still change it (order 65(2)). */
  siteContact?: SiteContactView | null;
  // Canonical phase status — source of truth for payment state. Backend
  // started returning these on 2026-04-28 to fix the case where an app
  // sits in REGISTERED + phase1Status=PAID and the page can't infer
  // "phase 1 done" from workflow text alone.
  phase1Status?: string | null;
  phase1PaidAt?: string | null;
  phase2Status?: string | null;
  phase2PaidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  steps?: Record<string, Record<string, unknown>>;
  // The wizard's FLAT formData (whitelisted by buildApplicationDetailPayload). This
  // is the real source of the application content for apps whose formData.steps is
  // empty (the current flat-save path) — used as the fallback in deriveApplicationSummary.
  formData?: {
    applicantData?: Record<string, unknown>;
    farmData?: Record<string, unknown>;
    plots?: Array<Record<string, unknown>>;
    plantId?: string | null;
    [key: string]: unknown;
  };
  metadata?: {
    lastDraftStep?: number | null;
    lastDraftSavedAt?: string | null;
    revisionDueAt?: string | null;
    carDueAt?: string | null;
    workflowHistoryCount?: number;
    commentsCount?: number;
  };
  comments?: ApplicationCommentEntry[];
}

export interface TrackingStepPayload {
  step: number;
  key: string;
  label: string;
  active: boolean;
  completed: boolean;
}

export interface DeadlinePayload {
  type: string;
  dueAt: string;
  remainingHours: number;
  remainingWorkingDays: number;
  isOverdue: boolean;
}

export interface TrackingStatusPayload {
  applicationId: string;
  /** round 3: which charge PENDING_AUDIT_FEE is for this application. */
  isRenewal?: boolean;
  applicationNumber?: string;
  status: string;
  displayStatus?: string;
  tracking?: {
    currentStep: number;
    totalSteps: number;
    steps: TrackingStepPayload[];
  };
  actionCard?: {
    key: string;
    title: string;
    enabled: boolean;
  };
  deadline?: DeadlinePayload | null;
}

export interface WorkflowHistoryEntry {
  index: number;
  timestamp?: string | null;
  action?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  step?: number | null;
  reason?: string | null;
  comment?: string | null;
  /** How many identical events the server folded into this one (1 = not folded). */
  repeatCount?: number;
  /** The first event's time when folded. */
  firstTimestamp?: string | null;
}

export type HistoryCommentEntry = ApplicationCommentEntry;

export interface ApplicationHistoryPayload {
  applicationId: string;
  applicationNumber?: string;
  status: string;
  workflowHistory: WorkflowHistoryEntry[];
  comments: HistoryCommentEntry[];
  revisions?: Array<Record<string, unknown>>;
  rejections?: Array<Record<string, unknown>>;
}

export function resolveActionMeta(actionKey?: string | null): ActionMeta {
  const key = String(actionKey || '').trim().toUpperCase();
  return ACTION_META[key] || ACTION_META.WAITING;
}

export function toThaiDate(isoLike?: string | null): string {
  if (!isoLike) {
    return '-';
  }
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleDateString('th-TH', { timeZone: THAI_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
}

export function toThaiDateTime(isoLike?: string | null): string {
  if (!isoLike) {
    return '-';
  }
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('th-TH', {
    timeZone: THAI_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pickStepValue(
  step: Record<string, unknown> | undefined,
  aliases: string[],
): string | null {
  if (!step || typeof step !== 'object') {
    return null;
  }
  for (const alias of aliases) {
    const value = (step as Record<string, unknown>)[alias];
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

export interface ApplicationSummary {
  operatorName: string;
  operatorType: string;
  plantName: string;
  plotName: string;
  province: string;
  surroundingEnvironment: string;
  areaText: string;
}

// Code→label maps PER LANGUAGE (mirror the auth/wizard applicant-type dictionaries +
// domain-types PLANTS). These localise the enum CODES only — user-entered values
// (names, province, plot names) are shown as the applicant typed them.
const APPLICANT_TYPE_LABELS: Record<string, Record<string, string>> = {
  th: { INDIVIDUAL: 'บุคคลธรรมดา', JURISTIC: 'นิติบุคคล', PARTNERSHIP: 'ห้างหุ้นส่วน', COMMUNITY_ENTERPRISE: 'วิสาหกิจชุมชน', COMMUNITY: 'วิสาหกิจชุมชน', ENTERPRISE: 'วิสาหกิจชุมชน' },
  en: { INDIVIDUAL: 'Individual', JURISTIC: 'Juristic Person', PARTNERSHIP: 'Partnership', COMMUNITY_ENTERPRISE: 'Community Enterprise', COMMUNITY: 'Community Enterprise', ENTERPRISE: 'Community Enterprise' },
};
const PLANT_LABELS: Record<string, Record<string, string>> = {
  th: { cannabis: 'กัญชา', kratom: 'กระท่อม', turmeric: 'ขมิ้นชัน', ginger: 'ขิง', black_galangal: 'กระชายดำ', plai: 'ไพล' },
  en: { cannabis: 'Cannabis', kratom: 'Kratom', turmeric: 'Turmeric', ginger: 'Ginger', black_galangal: 'Black Galangal', plai: 'Plai' },
};
// Look up CODE → label in the UI language; unknown codes / already-localised values
// pass through unchanged.
function localizedLabel(maps: Record<string, Record<string, string>>, code: string | null, language: string): string | null {
  if (!code) { return code; }
  const map = maps[language] || maps.th || {};
  const k = code.trim();
  return map[k] || map[k.toUpperCase()] || map[k.toLowerCase()] || code;
}

/**
 * Build the "คำขอ" summary for the applicant detail page. Prefers the canonical
 * wizard-step shape (formData.steps['1'..'3']) but FALLS BACK to the wizard's flat
 * formData (applicantData / farmData / plots) when steps is empty.
 *
 * Why: the current wizard's flat-save path stores the application content in
 * top-level formData fields and leaves formData.steps = {} (bug 2026-06-24). The
 * applicant detail "คำขอ" section reads steps, so it rendered blank even though the
 * data is present — and the provider review + edit flows (which read flat formData)
 * show it fine. This makes the applicant view read the same source.
 */
export function deriveApplicationSummary(
  detail: ApplicationDetailPayload | null,
  language: string = 'th',
  holder?: { displayName: string; type: string },
): ApplicationSummary {
  const steps = detail?.steps || {};
  const step1 = steps['1'] || {};
  const step2 = steps['2'] || {};
  const step3 = steps['3'] || {};

  const asRec = (v: unknown): Record<string, unknown> => (
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  );
  const fd = detail?.formData || {};
  const applicant = asRec(fd.applicantData);
  const farm = asRec(fd.farmData);
  const plots = Array.isArray(fd.plots) ? fd.plots : [];
  const plot0 = asRec(plots[0]);

  const flatOperatorName = pickStepValue(applicant, ['name'])
    || [pickStepValue(applicant, ['firstName']), pickStepValue(applicant, ['lastName'])].filter(Boolean).join(' ').trim();

  const operatorName = holder?.displayName || pickStepValue(step1, ['operator_name', 'operatorName']) || flatOperatorName || '-';
  // ประเภทผู้ยื่น — localise the enum code in the UI language (INDIVIDUAL → บุคคลธรรมดา / Individual).
  const operatorType = localizedLabel(APPLICANT_TYPE_LABELS,
    holder?.type || pickStepValue(step1, ['operator_type', 'operatorType'])
    || pickStepValue(fd as Record<string, unknown>, ['applicantType']) || pickStepValue(applicant, ['applicantType']), language) || '-';
  // พืชที่ยื่นขอ — localise the plant code (cannabis → กัญชา / Cannabis).
  const plantName = localizedLabel(PLANT_LABELS,
    pickStepValue(step3, ['botanical_name', 'botanicalName', 'strain_name', 'strainName', 'herb_type_id', 'herbTypeId'])
    || pickStepValue(fd as Record<string, unknown>, ['plantName', 'plantId']), language) || '-';
  // ชื่อแปลงปลูก — when there is more than one plot, list ALL plot names
  // (e.g. "แปลงที่ 1, แปลงที่ 2"); fall back to the farm name.
  const flatPlotNames = plots.map((p) => pickStepValue(asRec(p), ['name'])).filter((n): n is string => Boolean(n));
  const plotName = pickStepValue(step2, ['plot_name', 'plotName'])
    || (flatPlotNames.length > 0 ? flatPlotNames.join(', ') : '')
    || pickStepValue(farm, ['siteName', 'farmName']) || '-';
  // province reads ONLY the province alias (V1-A/D7) — flat fallback is farmData.province.
  const province = pickStepValue(step2, ['province']) || pickStepValue(farm, ['province']) || '-';
  const surroundingEnvironment = pickStepValue(step2, ['surrounding_environment', 'surroundingEnvironment'])
    || pickStepValue(farm, ['waterSourceDetail']) || '-';

  // Area, always in square metres.
  //
  // Two shapes reach this function. The older one recorded rai, งาน and ตร.ว.
  // in three separate fields and printed all three; it is summed into one
  // number, so an application from before the switch and one from after read
  // the same on the same screen. The newer one is a single size in whatever
  // unit that submission recorded.
  const stepAreaRai = pickStepValue(step2, ['area_rai', 'areaRai']);
  let areaText: string;
  if (stepAreaRai !== null) {
    const ngan = pickStepValue(step2, ['area_ngan', 'areaNgan']) || '0';
    const sqWa = pickStepValue(step2, ['area_sq_wa', 'areaSqWa']) || '0';
    const totalSqm = legacyAreaToSqm(stepAreaRai, 'rai')
      + legacyAreaToSqm(ngan, 'ngan')
      + legacyAreaToSqm(sqWa, 'sqwa');
    areaText = `${formatAreaSqm(totalSqm)} ${AREA_UNIT_LABEL}`;
  } else {
    const siteSqm = pickStepValue(farm, ['areaSqm']);
    const unit = pickStepValue(plot0, ['areaUnit']) || pickStepValue(farm, ['totalAreaUnit']);
    const plotTotal = plots.reduce((sum, p) => sum + (Number(pickStepValue(asRec(p), ['areaSize']) || 0) || 0), 0);
    const legacySize = plotTotal > 0 ? String(plotTotal) : pickStepValue(farm, ['totalAreaSize']);
    const sqm = siteSqm ? legacyAreaToSqm(siteSqm) : legacySize ? legacyAreaToSqm(legacySize, unit) : null;
    areaText = sqm === null ? '-' : `${formatAreaSqm(sqm)} ${AREA_UNIT_LABEL}`;
  }

  return { operatorName, operatorType, plantName, plotName, province, surroundingEnvironment, areaText };
}
