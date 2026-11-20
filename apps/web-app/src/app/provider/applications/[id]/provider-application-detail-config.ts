import type { StaffHolder } from '@/components/holder/staff-holder-card';
import { PURPOSE_LICENCE_DOCUMENTS } from '@/lib/certification-purposes';
import {
  getStatusLabel,
  WORKFLOW_STATES,
  getSemanticColor,
} from '@/lib/constants/workflow-states';
import { safeUrl } from "@/lib/safe-url";
import { THAI_TIME_ZONE } from '@/lib/format/thai-date';
import { AREA_UNIT_LABEL, formatAreaSqm, legacyAreaToSqm } from '@/lib/area';
import { PLANT_NAMES, mapPurpose, mapServiceType } from '@/components/application/application-document-helpers';
import { REQUEST_TYPE_OPTIONS } from '@/app/health/applications/new/_steps/steps/step1-request-type-config';
import { AREA_TYPE_OPTIONS, LAND_TENURE_OPTIONS } from '@/app/health/applications/new/_steps/steps/step3-site-land-config';
import { landTenureWord } from '@gacp/validation/filing-fields';
import { growingMediumOf, growingMediumLabelTh } from '@gacp/validation/growing-medium';

export interface WorkflowEvent {
  timestamp?: string;
  action?: string;
  fromState?: string;
  toState?: string;
  comment?: string;
  actorId?: string;
  actorRole?: string;
}

export interface PartyProfile {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  accountType?: string;
}

export type FormDataRecord = Record<string, unknown>;

export interface TimelineEntry {
  timestamp?: string;
  date?: string;
  action?: string;
  toState?: string;
  comment?: string;
  actorRole?: string;
  // X2-FIX-A H-7: optional friendly actor name (e.g. "สมชาย เกษตรกร")
  // surfaced by the History tab when the backend emits it. Currently
  // only `admin.js` extension/override handlers persist it (lines
  // 248, 347); the canonical `buildWorkflowEvent` does NOT yet
  // include this field, so consumers must use the fallback chain
  // `actorName ?? actorRole ?? by ?? "SYSTEM"`. Tracked for backend
  // alignment in the X2-FIX-A handoff.
  actorName?: string;
  by?: string;
}

/**
 * C3 ("งานนี้พาสไปที่ใคร") — the doc-review assignment surfaced by the backend
 * detail endpoint: WHO the job was assigned to, BY WHOM, and WHEN. `null` when no
 * reviewer is assigned yet. Names may be null if a user row could not be resolved
 * (the UI falls back gracefully). Field names mirror the backend `assignment` block.
 */
export interface ApplicationAssignment {
  reviewerId: string;
  reviewerName?: string | null;
  assignedById?: string | null;
  assignedByName?: string | null;
  assignedAt?: string | null;
}

/**
 * Wave-3 ERP primitive: per-record chatter. Provider staff can post comments
 * or internal-only notes on an application; `internalOnly` marks a note that
 * is gated OUT of every applicant read (the backend filters internalOnly:false
 * on the applicant side). Field names mirror the backend detail response.
 */
export interface ApplicationComment {
  id: string;
  createdAt?: string;
  authorId?: string;
  role?: string;
  content?: string;
  internalOnly?: boolean;
}

export interface ApplicationData {
  id: string;
  applicationNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  rejectCount?: number;
  reviewComment?: string;
  assignment?: ApplicationAssignment | null;
  workflowHistory?: WorkflowEvent[];
  comments?: ApplicationComment[];
  health?: PartyProfile;
  applicant?: PartyProfile;
  formData?: FormDataRecord;
  /** The holder record (order 142); null for an application with no entity. */
  holder?: StaffHolder | null;
  scope?: { plantName: string | null; cultivationTypes: string[]; province: string | null } | null;
}

export interface FilingFacts {
  plantName: string;
  farmName: string;
  farmAddress: string;
  province: string;
  areaText: string;
  requestTypeTh: string;
  rows: Array<[string, string]>;
}

export const NOT_RECORDED_TH = 'ไม่มีบันทึก';
export const UNKNOWN_CHOICE_TH = 'ค่าที่บันทึกไม่อยู่ในรายการ';
export const GROWING_MEDIUM_ROW_TH = 'วัสดุปลูกในอาคารระบบปิด (ข้อมูลเพิ่มเติม ไม่อยู่ในแบบ กทล.1)';

const stated = (value: unknown): string => {
  const text = pickString(value);
  return text === '-' ? '' : text;
};
const firstStated = (...values: unknown[]): string => values.map(stated).find(Boolean) ?? '';
const labelOf = (options: ReadonlyArray<{ value: string; labelTH: string }>, value: unknown): string => {
  const key = stated(value);
  if (!key) { return ''; }
  return options.find((o) => o.value === key)?.labelTH ?? UNKNOWN_CHOICE_TH;
};
const landTenureTh = (value: unknown): string => {
  const key = stated(value);
  if (!key) { return ''; }
  const word = LAND_TENURE_OPTIONS.some((o) => o.value === key) ? key : landTenureWord(key);
  return labelOf(LAND_TENURE_OPTIONS, word ?? key);
};
const listOf = (value: unknown, label: (v: unknown) => string): string =>
  (Array.isArray(value) ? value : []).map(label).filter(Boolean).join(', ');

export function filingFactsOf(application: ApplicationData): FilingFacts {
  const formData: FormDataRecord = application.formData || {};
  const farm = isRecord(formData.farmData) ? formData.farmData : {};
  const scope = application.scope ?? null;

  const plantRef = firstStated(formData.plantName, formData.plantId);
  const plantName = scope?.plantName || PLANT_NAMES[plantRef.toLowerCase()] || plantRef || NOT_RECORDED_TH;

  const areaSqm = stated(farm.areaSqm);
  const legacySize = stated(farm.totalAreaSize);
  const sqm = areaSqm ? legacyAreaToSqm(areaSqm) : legacySize ? legacyAreaToSqm(legacySize, stated(farm.totalAreaUnit)) : null;

  const requestType = stated(formData.requestType);
  const requestTypeTh = requestType
    ? labelOf(REQUEST_TYPE_OPTIONS, requestType)
    : (stated(formData.serviceType) ? mapServiceType(formData.serviceType) : NOT_RECORDED_TH);

  const cultivationTypes = scope?.cultivationTypes?.length
    ? scope.cultivationTypes.join(', ')
    : listOf(farm.areaTypes, (v) => labelOf(AREA_TYPE_OPTIONS, v));

  const candidates: Array<[string, string]> = [
    ['ลักษณะพื้นที่', cultivationTypes],
    [GROWING_MEDIUM_ROW_TH, growingMediumLabelTh(growingMediumOf(farm)) ?? ''],
    ['ขนาดพื้นที่ปลูก', sqm === null ? '' : `${formatAreaSqm(sqm)} ${AREA_UNIT_LABEL}`],
    ['จำนวนต้นต่อรอบ', stated(farm.plantsPerCycle)],
    ['รอบปลูกต่อปี', stated(farm.cyclesPerYear)],
    ['สิทธิในที่ดิน', landTenureTh(farm.landOwnership)],
    ['วัตถุประสงค์', listOf(formData.certificationPurposes, (v) => (stated(v) ? mapPurpose(v) : ''))],
    ['พันธุ์', listOf(formData.varieties, stated) || stated(formData.varietiesNote)],
  ];

  return {
    plantName,
    farmName: firstStated(farm.siteName, farm.farmName, formData.farmName) || NOT_RECORDED_TH,
    farmAddress: firstStated(farm.siteAddress, farm.address, formData.farmAddress) || NOT_RECORDED_TH,
    province: scope?.province || stated(farm.province) || NOT_RECORDED_TH,
    areaText: sqm === null ? NOT_RECORDED_TH : `${formatAreaSqm(sqm)} ${AREA_UNIT_LABEL}`,
    requestTypeTh,
    rows: candidates.filter(([, value]) => value !== ''),
  };
}

// Build STATUS_LABELS from canonical source
const _built: Record<string, { label: string; color: string }> = {};
for (const state of WORKFLOW_STATES) {
  _built[state] = {
    label: getStatusLabel(state),
    color: getSemanticColor(state),
  };
}

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ..._built,
  // Alias not in canonical workflow states
  REGISTERED: { label: "ลงทะเบียนแล้ว", color: "gray" },
};

// X2-FIX-A H-3: document names in the Documents tab + Document Checklist
// are now Thai. The standard DTAM labels were sourced from the GACP
// regulatory checklist; any name marked TODO needs product confirmation
// before being committed as canonical.
export const DOCUMENT_FIELDS = [
  { key: "idCardDoc", name: "บัตรประจำตัวประชาชน" },
  { key: "houseRegDoc", name: "ทะเบียนบ้าน" },
  { key: "criminalBgDoc", name: "หนังสือรับรองประวัติอาชญากรรม" },
  ...PURPOSE_LICENCE_DOCUMENTS,
  { key: "LAND_TITLE", name: "เอกสารสิทธิ์ที่ดิน" },
  { key: "SITE_MAP", name: "แผนผังแปลงปลูก" },
  { key: "WATER_TEST", name: "ผลตรวจน้ำ" },
  { key: "SOIL_TEST", name: "ผลตรวจดิน" },
  { key: "SOP_MANUAL", name: "คู่มือ SOP" },
  { key: "GACP_CERTIFICATE", name: "ใบประกาศนียบัตรอบรม GACP" },
  { key: "companyRegDoc", name: "หนังสือรับรองบริษัท" },
  { key: "communityRegDoc", name: "หนังสือรับรองวิสาหกิจชุมชน" },
];

// X2-FIX-A H-4: the doc-review detail page is Thai-first; formatDate
// now uses the th-TH locale (Buddhist-year-aware) instead of en-GB so
// timestamps in the History tab and SLA panel match the surrounding
// chrome. Tests previously relied on en-GB format strings; the H-4
// test exercises this directly.
export function formatDate(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("th-TH", {
    timeZone: THAI_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// X2-FIX-A H-4: "N days" → "N วัน" so the SLA chip on the detail page
// reads natively for Thai DTAM staff. The numeric value + danger flag
// stay identical so downstream parsers (getSlaAgingBadge in
// applications/page.tsx, which splits on space) remain unaffected.
export function getSlaDays(createdAt?: string | null): { label: string; danger: boolean } {
  if (!createdAt) {
    return { label: "-", danger: false };
  }
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) {
    return { label: "-", danger: false };
  }
  const diff = Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)));
  return {
    label: `${diff} วัน`,
    danger: diff > 5,
  };
}

// X2-FIX-A H-4: revision countdown labels translated. Backend stores
// revisionDueAt; we surface "เลย N วัน" when past due and "เหลือ N วัน"
// when in the future. Colour mapping unchanged.
export function getRevisionCountdown(dueAt?: string | null): { label: string; color: string } | null {
  if (!dueAt) {
    return null;
  }
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const diffMs = due.getTime() - Date.now();
  if (diffMs < 0) {
    const overdueDays = Math.abs(Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    return { label: `เลย ${overdueDays} วัน`, color: "red" };
  }
  const remainingDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return {
    label: `เหลือ ${remainingDays} วัน`,
    color: remainingDays <= 2 ? "orange" : "teal",
  };
}

// ── Fiori object-page semantic status mapping ──────────────────────────────
// Pure helper: maps a workflow status to a label + a semantic tone. The
// tone drives the solid status badge in the provider object header.
//   success = terminal-good / approved gates
//   warning = revision / CAR loops / pending-fee waiting states
//   danger  = rejected / expired
//   info    = in-flight review / audit-confirmed
//   neutral = draft / submitted / anything unmapped
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_TONE_MAP: Record<string, StatusTone> = {
  APPROVED: 'success',
  CERTIFIED: 'success',
  AUDIT_PASSED: 'success',
  DOC_APPROVED: 'success',
  DOC_FEE_PAID: 'success',
  AUDIT_FEE_PAID: 'success',
  REVISION_REQUESTED: 'warning',
  CAR_PENDING: 'warning',
  CAR_REVIEWING: 'warning',
  AUDIT_NOT_PASSED: 'warning',
  PENDING_DOC_FEE: 'warning',
  PENDING_AUDIT_FEE: 'warning',
  REJECTED: 'danger',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
  ASSIGNED_FOR_REVIEW: 'info',
  AUDIT_CONFIRMED: 'info',
  DRAFT: 'neutral',
  SUBMITTED: 'neutral',
};

export function statusTone(status?: string): { label: string; tone: StatusTone } {
  const key = String(status || '').toUpperCase();
  const label = STATUS_LABELS[key]?.label || key || '-';
  // Catch-all for the *_UNDER_REVIEW family + PENDING_* family that may not
  // be enumerated above (defence-in-depth for future states).
  let tone = STATUS_TONE_MAP[key];
  if (!tone) {
    if (key.includes('UNDER_REVIEW')) tone = 'info';
    else if (key.startsWith('PENDING_')) tone = 'warning';
    else tone = 'neutral';
  }
  return { label, tone };
}

// tone → design-token classes for the solid semantic status badge. Single
// source of truth so the object-page header (detail), the applications list,
// and the work-inbox all render the SAME badge. White foreground for the
// colored tones (the --*-foreground vars are all 0 0% 100%); neutral keeps
// the muted-foreground pairing.
export const STATUS_BADGE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-destructive text-white',
  info: 'bg-info text-white',
  neutral: 'bg-muted text-muted-foreground',
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveDocumentUrl(formData: FormDataRecord | undefined, key: string): string | null {
  if (!formData) {
    return null;
  }

  // safeUrl กันค่าที่กลายเป็นโค้ดได้ (javascript: ฯลฯ) · คืน null ก็คือ "ไม่มีเอกสาร"
  // ซึ่งหน้าจอรองรับอยู่แล้ว (ป้าย Missing) — ไม่มีทางแสดงลิงก์ที่กดแล้วรันโค้ด
  const direct = safeUrl(formData[key]);
  if (direct) {
    return direct;
  }

  const documents = isRecord(formData.documents) ? formData.documents : null;
  const applicantData = isRecord(formData.applicantData) ? formData.applicantData : null;
  const uploadedDocuments = isRecord(formData.uploadedDocuments) ? formData.uploadedDocuments : null;

  const nested = documents?.[key] || applicantData?.[key] || uploadedDocuments?.[key];
  return safeUrl(nested);
}

export function pickString(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "-";
}
