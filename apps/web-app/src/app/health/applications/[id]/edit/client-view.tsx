'use client';


import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/primitives/badge';
import { Button } from '@/components/ui/primitives/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives/card';
import { Icons } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/spinner';
import { apiClient as api } from '@/lib/api';
import { applicantStatus } from '@/lib/health-dashboard-stage';
import { useApplicationFlowStore } from '../../hooks/use-application-flow-store';
import type { WizardState } from '../../new/_steps/hooks/use-application-flow-store.state-types';
import { splitStoredPurposes } from '@/lib/certification-purposes';
import { recordStalePurposes } from '../../new/_steps/steps/step4-variety-purpose-config';

/** The wizard's own answers as GET /applications/:id echoes them: every stored key, null when never answered. */
type StoredAnswers = Partial<Record<keyof WizardState, unknown>>;

interface ApplicationForEdit {
  id: string;
  applicationNumber: string;
  status: string;
  entityId?: string | null;
  reviewComment?: string;
  // buildApplicationDetailPayload (apps/backend/routes/api/helpers/application-payload-builders.js):
  // the whole wizard allowlist as stored, plus the server-owned step-1 facts and the reviewer's note.
  formData?: StoredAnswers & {
    requestType?: string | null;
    applicantType?: string | null;
    certScope?: string | null;
    certificationPurpose?: string | null;
    cultivationMethod?: string | null;
    _lastReviewComment?: string | null;
  };
}

const SUPPORTED_PLANT_IDS = ['cannabis', 'kratom', 'turmeric', 'ginger', 'black_galangal', 'plai'] as const;
const SUPPORTED_SERVICE_TYPES = ['NEW', 'RENEWAL', 'MODIFY', 'REPLACEMENT'] as const;
const SUPPORTED_CULTIVATION_METHODS = ['outdoor', 'greenhouse', 'indoor'] as const;
// v2 step 1 vocabulary (step1-request-type-config.ts) — the register's own words.
// Never defaulted: a request type or applicant type the applicant did not choose
// would decide which papers the law demands of them (use-application-flow-store.ts
// initialState comment). A draft that never answered step 1 stays null here too.
const SUPPORTED_REQUEST_TYPES = ['NEW', 'RENEWAL', 'REPLACEMENT'] as const;
const SUPPORTED_APPLICANT_HOLDER_TYPES = ['INDIVIDUAL', 'JURISTIC', 'PARTNERSHIP', 'COMMUNITY_ENTERPRISE'] as const;
const SUPPORTED_CERT_SCOPES = ['PLANTING', 'PROCESSING'] as const;
// The statuses that mean "an officer asked for changes" — the only ones that
// may show the ต้องแก้ไขเอกสาร banner (P4 fix). CAR_PENDING is an officer's
// corrective-action request, same as REVISION_REQUESTED; DRAFT never had an
// officer look at it.
const OFFICER_REQUESTED_CHANGES_STATUSES = ['REVISION_REQUESTED', 'CAR_PENDING'] as const;

function isSupportedPlantId(value: unknown): value is (typeof SUPPORTED_PLANT_IDS)[number] {
  return typeof value === 'string' && (SUPPORTED_PLANT_IDS as readonly string[]).includes(value);
}

function isSupportedServiceType(value: unknown): value is (typeof SUPPORTED_SERVICE_TYPES)[number] {
  return typeof value === 'string' && (SUPPORTED_SERVICE_TYPES as readonly string[]).includes(value);
}

function isSupportedCultivationMethod(value: unknown): value is (typeof SUPPORTED_CULTIVATION_METHODS)[number] {
  return typeof value === 'string' && (SUPPORTED_CULTIVATION_METHODS as readonly string[]).includes(value);
}

function isSupportedRequestType(value: unknown): value is (typeof SUPPORTED_REQUEST_TYPES)[number] {
  return typeof value === 'string' && (SUPPORTED_REQUEST_TYPES as readonly string[]).includes(value);
}

function isSupportedApplicantHolderType(value: unknown): value is (typeof SUPPORTED_APPLICANT_HOLDER_TYPES)[number] {
  return typeof value === 'string' && (SUPPORTED_APPLICANT_HOLDER_TYPES as readonly string[]).includes(value);
}

function isSupportedCertScope(value: unknown): value is (typeof SUPPORTED_CERT_SCOPES)[number] {
  return typeof value === 'string' && (SUPPORTED_CERT_SCOPES as readonly string[]).includes(value);
}

function isOfficerRequestedChangesStatus(status: string | undefined): status is (typeof OFFICER_REQUESTED_CHANGES_STATUSES)[number] {
  return Boolean(status) && (OFFICER_REQUESTED_CHANGES_STATUSES as readonly string[]).includes(status as string);
}

export default function EditApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.id as string;

  const [application, setApplication] = useState<ApplicationForEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // W1-RETRY — transport/5xx load failure. Previously a backend-down 503
  // fell into the terminal 'ไม่พบคำขอที่ระบุ' ("not found") alert with only
  // a back link: a definitive bad-state claim on a fetch failure, with no
  // retry (live probe 2026-07-24). This flag drives the amber indeterminate
  // ServiceUnavailable state (role="status") with a retry that re-fires the
  // same fetch. Terminal outcomes (4xx, non-editable status) keep `error`.
  const [unavailable, setUnavailable] = useState(false);

  const { hydrateDraft, resetWizard } = useApplicationFlowStore();

  const loadApplicationForEdit = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setUnavailable(false);

      const result = await api.get<ApplicationForEdit>(`/applications/${applicationId}`);

      // W1-RETRY: a 5xx or statusless failure (network / timeout — the
      // apiClient returns no `status` for those) means NO verdict was
      // reached about this application. Show the indeterminate retry
      // state instead of claiming the application does not exist.
      if (!result.success && (result.status === undefined || result.status >= 500)) {
        setUnavailable(true);
        return;
      }

      if (!result.success || !result.data) {
        setError('ไม่พบคำขอที่ระบุ');
        return;
      }

      const app = result.data;

      const editableStatuses = ['REVISION_REQUESTED', 'CAR_PENDING', 'DRAFT'];
      if (!editableStatuses.includes(app.status)) {
        setError(`ไม่สามารถแก้ไขคำขอที่มีสถานะ "${app.status}" ได้`);
        return;
      }

      setApplication(app);
    } catch (err: unknown) {
      console.error('[EditPage] Error loading application:', err);
      // Thrown fetch = transport failure — indeterminate, retryable.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadApplicationForEdit();
  }, [loadApplicationForEdit]);

  const handleStartEdit = () => {
    if (!application) {
      return;
    }
    const formData = application.formData ?? {};
    const stored = <K extends keyof WizardState>(key: K, blank: WizardState[K]): WizardState[K] => (formData[key] ?? blank) as WizardState[K];

    const normalizedPlantId = isSupportedPlantId(formData.plantId) ? formData.plantId : 'cannabis';
    const normalizedServiceType = isSupportedServiceType(formData.serviceType) ? formData.serviceType : 'NEW';
    // Backward-compatible: handle both old certificationPurpose (string) and new certificationPurposes (array)
    const rawPurposes = (Array.isArray(formData.certificationPurposes) && formData.certificationPurposes.length > 0)
      ? formData.certificationPurposes as string[]
      : (formData.certificationPurpose ? [formData.certificationPurpose] : []);
    // A stored purpose no ภ.ท. licence backs (MEDICAL, COMMERCIAL, …) is neither mapped nor
    // dropped without a word: the valid ones carry forward, the rest are recorded so step 4
    // tells the applicant to choose again (operator ruling 2026-10-05).
    const { valid: normalizedPurposes, stale: stalePurposes } = splitStoredPurposes(rawPurposes);
    recordStalePurposes(stalePurposes);
    // Cultivation methods: prefer canonical array; fall back to legacy single string.
    const rawCultivationMethods = (Array.isArray(formData.cultivationMethods) && formData.cultivationMethods.length > 0)
      ? formData.cultivationMethods
      : (formData.cultivationMethod ? [formData.cultivationMethod] : []);
    const normalizedCultivationMethods = rawCultivationMethods.filter(isSupportedCultivationMethod);

    resetWizard();
    // A load, not an edit (hydrateDraft: O1), and every key the autosave sends is restored
    // here, as the step page's resume does: the next save posts the whole store, so a key
    // left at its blank is written over the stored answer. A hand-kept subset through
    // setters lost step 4 that way (2026-10-28); hydration-covers-autosave.test.ts pins this.
    hydrateDraft({
      applicationId,
      plantId: normalizedPlantId,
      // v2 step 1 — null (never a default) when the draft never answered, so step 1 asks instead of guessing.
      requestType: isSupportedRequestType(formData.requestType) ? formData.requestType : null,
      applicantType: isSupportedApplicantHolderType(formData.applicantType) ? formData.applicantType : null,
      certScope: isSupportedCertScope(formData.certScope) ? formData.certScope : null,
      // The holder is the row's own entityId (fixed at create); resetWizard above cleared any other.
      ...(typeof application.entityId === 'string' ? { holderEntityId: application.entityId } : {}),
      previousCertificateNumber: stored('previousCertificateNumber', null),
      serviceType: normalizedServiceType,
      serviceTypes: stored('serviceTypes', []),
      certificationPurposes: normalizedPurposes,
      cultivationMethods: normalizedCultivationMethods,
      siteTypes: stored('siteTypes', []),
      locationType: stored('locationType', null),
      licensePdfUrl: stored('licensePdfUrl', null),
      // Saved consent values only — hard-coding `true` here once flipped consent on for drafts that never gave it.
      consentedPDPA: Boolean(formData.consentedPDPA),
      acknowledgedStandards: Boolean(formData.acknowledgedStandards),
      applicantData: stored('applicantData', null),
      generalInfo: stored('generalInfo', null),
      farmData: stored('farmData', null),
      siteData: stored('siteData', null),
      plots: stored('plots', []),
      lots: stored('lots', []),
      varieties: stored('varieties', []),
      varietiesNote: stored('varietiesNote', null),
      processing: stored('processing', null),
      cultivationDetails: stored('cultivationDetails', null),
      productionData: stored('productionData', null),
      harvestData: stored('harvestData', null),
      securityData: stored('securityData', null),
      plantTracking: stored('plantTracking', []),
      documents: stored('documents', []),
      stepDocuments: stored('stepDocuments', []),
      youtubeUrl: typeof formData.youtubeUrl === 'string' ? formData.youtubeUrl : '',
      qrCount: stored('qrCount', 0),
      estimatedQRCost: stored('estimatedQRCost', 0),
    });

    sessionStorage.setItem('gacp_edit_mode', JSON.stringify({
      isEditMode: true,
      applicationId,
      revisionComment: application.reviewComment || application.formData?._lastReviewComment || '',
      applicationNumber: application.applicationNumber,
    }));

    router.push(`/health/applications/new?edit=${application.id}`);
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="rounded-lg bg-card p-4 shadow-sm">
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
            <Spinner size="lg" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลคำขอ...</p>
          </CardContent>
        </div>
      </div>
    );
  }

  // W1-RETRY — backend unreachable / 5xx: amber indeterminate
  // ServiceUnavailable pattern (mirrors the public verify page):
  // role="status", Thai headline + English subline, retry re-fires the
  // SAME fetch. Never the red "not found" alert — no verdict was reached.
  if (unavailable) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div
          role="status"
          data-testid="edit-load-unavailable"
          className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <Icons.AlertTriangle size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 leading-snug">
              <p className="text-base font-bold text-amber-800">ยังโหลดข้อมูลคำขอไม่ได้ในขณะนี้</p>
              <p className="mt-1 text-sm text-amber-700">
                ระบบขัดข้องชั่วคราว ยังไม่สามารถแสดงข้อมูลคำขอได้ กรุณาลองใหม่อีกครั้ง
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Unable to load the application right now. Please try again.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              data-testid="edit-load-retry"
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={() => void loadApplicationForEdit()}
            >
              ลองอีกครั้ง
            </Button>
            <Button asChild variant="subtle">
              <Link href={`/health/applications/${applicationId}`}>
                <Icons.ArrowLeft size={16} className="mr-2" />
                กลับไปหน้าคำขอ
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert variant="error" title="ไม่สามารถแก้ไขได้">
          <p>{error}</p>
        </Alert>
        <div className="mt-4">
          <Button asChild >
            <Link href={`/health/applications/${applicationId}`}>
              <Icons.ArrowLeft size={16} className="mr-2" />
              กลับไปหน้าคำขอ
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const revisionComment = application?.reviewComment || application?.formData?._lastReviewComment;

  return (
    <div className="w-full px-4 py-8 sm:px-6">
      <div className="space-y-5">
        <Button asChild variant="subtle" className="w-fit">
          <Link href={`/health/applications/${applicationId}`}>
            <Icons.ArrowLeft size={16} className="mr-2" />
            กลับ
          </Link>
        </Button>

        <div className="rounded-lg bg-card p-4 shadow-sm">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Icons.Edit size={22} />
              </div>
              <div>
                <CardTitle className="text-xl">แก้ไขคำขอ</CardTitle>
                <CardDescription>
                  {application?.applicationNumber || `#${applicationId.slice(-6).toUpperCase()}`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </div>

        {revisionComment ? (
          <Alert variant="warning" title="หมายเหตุจากเจ้าหน้าที่">
            <p className="whitespace-pre-wrap text-sm">{revisionComment}</p>
            <p className="mt-2 text-xs text-amber-800/80">กรุณาตรวจสอบและแก้ไขข้อมูลตามหมายเหตุด้านบน</p>
          </Alert>
        ) : null}

        {/* Same defect class as the P4 badge below: "อ่านหมายเหตุจากเจ้าหน้าที่"
            and "กดส่งใหม่" both claim an officer already reviewed this filing.
            A never-submitted DRAFT never had that review, so it gets one
            neutral line instead of this list (BACKLOG-FOUND.md, "Found while
            fixing P4"). */}
        {isOfficerRequestedChangesStatus(application?.status) ? (
          <div className="rounded-lg bg-card p-4 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.FileText size={18} />
                ขั้นตอนการแก้ไข
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-foreground/90">
                <li>อ่านหมายเหตุจากเจ้าหน้าที่ด้านบน</li>
                <li>กดปุ่มเริ่มแก้ไขเพื่อเปิดแบบฟอร์ม</li>
                <li>แก้ไขข้อมูลที่ต้องการในแต่ละขั้นตอน</li>
                <li>ตรวจสอบความถูกต้องและกดส่งใหม่</li>
              </ul>
            </CardContent>
          </div>
        ) : application?.status === 'DRAFT' ? (
          <div className="rounded-lg bg-card p-4 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-foreground/90">{applicantStatus('DRAFT').description}</p>
            </CardContent>
          </div>
        ) : null}

        {/* P4 fix — "ต้องแก้ไขเอกสาร" states that an officer reviewed this
            filing and asked for changes. A never-submitted DRAFT has never
            been reviewed; showing that badge for it was a false claim
            (staging walk 2026-09-29, screens/21-draft-resume-landing.png). */}
        {isOfficerRequestedChangesStatus(application?.status) ? (
          <div className="rounded-lg bg-card p-4 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-muted-foreground">สถานะปัจจุบัน</p>
                <Badge tone="warning" className="mt-2">ต้องแก้ไขเอกสาร</Badge>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs text-muted-foreground">หลังส่งแก้ไข</p>
                <Badge tone="info" className="mt-2">รอตรวจสอบอีกครั้ง</Badge>
              </div>
            </CardContent>
          </div>
        ) : application?.status === 'DRAFT' ? (
          <div className="rounded-lg bg-card p-4 shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">สถานะปัจจุบัน</p>
              <Badge tone="neutral" className="mt-2">ร่างคำขอ ยังไม่ได้ยื่น</Badge>
            </CardContent>
          </div>
        ) : null}

        <Button size="lg" variant="primary" className="w-full" onClick={handleStartEdit}>
          <Icons.Edit size={18} className="mr-2" />
          เริ่มแก้ไขคำขอ
          <Icons.ChevronRight size={18} className="ml-2" />
        </Button>

        <Button asChild variant="subtle" className="w-full">
          <Link href={`/health/applications/${applicationId}`}>ยกเลิก</Link>
        </Button>
      </div>
    </div>
  );
}
