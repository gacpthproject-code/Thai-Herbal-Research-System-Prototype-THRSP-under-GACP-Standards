export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Search } from 'lucide-react';
import { Card } from '@/components/ui/primitives/card';
import { Button } from '@/components/ui/primitives/button';
import { QrImage } from '@/components/ui/qr-image';
import { qrRenderOptions } from '@/lib/qr/qr-render-options';
import QRCode from 'qrcode';
import { headers } from 'next/headers';
import { buildPublicVerifyUrl, buildPublicVerifyPageUrl, toCertificateSlug, resolvePublicOrigin } from '@/lib/verify/public-verify-url';
import { formatThaiDate, THAI_TIME_ZONE } from '@/lib/format/thai-date';
import { deriveVerifyView, CryptoVerdict, RevisionLine, VerdictHero } from './verify-view';
import { PublicVerifyHeader } from '@/components/feature/public-verify-header';
import { CERTIFICATE_ISSUER_TH } from '@/constants/service-facts';
import { parseCertificationScope, scopeLineTh } from '@/lib/verify/certification-scope';
import type { RenewalPointer } from '@/lib/verify/renewal-wording';

const QR_SIZE = 176;

export const metadata: Metadata = {
  title: 'ผลการตรวจสอบใบรับรอง GACP',
  description: 'ตรวจสอบความถูกต้องของใบรับรอง GACP สมุนไพร',
};

/**
 * Discriminated fetch outcome so the page can tell "the backend answered"
 * apart from "we could not reach the backend at all". The backend's verify
 * route answers HTTP 200 for EVERY definitive verdict — not-found, expired,
 * suspended, and revoked all come back as 200 + verified:false + reason
 * (apps/backend/routes/api/auth/public.js). So any non-2xx here is
 * infrastructure (proxy down, 5xx, rate-limit), never a verdict, and must
 * NEVER render the red "Certificate Invalid" hero — that would publicly
 * brand a farmer's genuine certificate as fake every time the backend blinks.
 */
// `publicOrigin` rides along on both variants — it's resolved from the SAME
// `headers()` call this function already makes for the backend fetch below,
// so the page component never has to call `headers()` a second time just to
// build the QR's URL (fix-round 1, review 6712f985).
type FetchOutcome =
    | { kind: 'ok'; payload: VerifyPayload | null; publicOrigin: string }
    | { kind: 'unavailable'; publicOrigin: string };

/** The slice of the backend verify envelope this page actually renders. */
interface VerifyPayload {
  data?: {
    /** The register's own number (the printed form) — what the page shows, never the typed URL param. */
    certificateNumber?: string;
    certificate?: {
      farmName?: string;
      /**
       * The company that holds the certificate. Order 68(1): a person's name is never
       * shown, so the backend sends null for any other holder, and this page reads no
       * other name field.
       */
      holderDisplayName?: string | null;
      province?: string;
      issueDate?: string;
      expiryDate?: string;
      /** Crop, cultivation types in Thai and standard (order 68(1)); parsed by parseCertificationScope. */
      scope?: unknown;
    };
    reason?: string;
    /**
     * F-G4-57 (ADDITIVE): the machine reason code beside the English `reason`,
     * and the renewal that superseded this certificate. A backend that has not
     * deployed them omits both, and the page falls back to the English reason.
     */
    reasonCode?: string | null;
    renewal?: RenewalPointer;
    verifiedAt?: string;
  } | null;
}

async function fetchCertificate(certNumber: string): Promise<FetchOutcome> {
  // C1 (audit 2026-06-30, staging-corrected x3): build the verify URL from the
  // INCOMING REQUEST host so nginx routes it to the SAME-environment backend, and
  // buildPublicVerifyUrl adds the `/api/v1` segment (the original bug was only the
  // missing `/api/v1`). Why the request host and not an env var: NEXT_PUBLIC_* is
  // INLINED AT BUILD TIME (the build-time value, empty) even in server components,
  // not read at runtime; INTERNAL_API_URL/BACKEND_URL are unset (→ localhost:8000,
  // unreachable from the frontend container); http://backend:8000 cross-wires
  // staging→the PROD backend on the shared droplet. The incoming x-forwarded-host
  // (the public host the citizen hit: staging.gacpth.com / gacpth.com) is the only
  // runtime, env-agnostic, per-env-correct source — proven: a server-side fetch to
  // https://staging.gacpth.com/api/v1/public/verify/<n> returns verified:true.
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  // S1 hardening (review 6712f985): the QR/verify-link origin is resolved
  // through an allowlist — see resolvePublicOrigin's docstring — so a
  // forged x-forwarded-host can't make this page mint a verify link that
  // points somewhere the requester chose. This does NOT change the
  // BACKEND fetch below, which intentionally keeps trusting the raw host
  // per the comment above (that is the established, per-environment
  // routing behaviour, unrelated to what a QR encodes).
  const publicOrigin = resolvePublicOrigin(host, proto);
  if (!host) return { kind: 'unavailable', publicOrigin };
  const url = buildPublicVerifyUrl(`${proto}://${host}`, certNumber);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) return { kind: 'ok', payload: await res.json(), publicOrigin };
    return { kind: 'unavailable', publicOrigin };
  } catch {
    return { kind: 'unavailable', publicOrigin };
  }
}

export default async function PublicCertVerifyPage({
  params,
}: {
  params: Promise<{ 'cert-number': string }>;
}) {
  const routeParams = await params;
  const typedNumber = routeParams['cert-number'];
  const outcome = await fetchCertificate(typedNumber);
  const unavailable = outcome.kind === 'unavailable';
  const result = unavailable ? null : outcome.payload;

  const view = deriveVerifyView(result);
  const cert = result?.data?.certificate;
  // Shown and linked: the stored number when the register answered, else what was typed.
  const certNumber = result?.data?.certificateNumber || typedNumber;

  // The QR must encode THIS page's own public URL (what a phone camera
  // should open), not the internal backend API URL `buildPublicVerifyUrl`
  // builds for the server-side data fetch. `outcome.publicOrigin` was
  // already resolved (allowlisted) inside fetchCertificate from the SAME
  // headers() call that fetch used.
  const publicVerifyPageUrl = buildPublicVerifyPageUrl(outcome.publicOrigin, certNumber);

  // SSR pre-render (fix-round 1, review 6712f985): no-JS / crawler / first
  // paint see a real, scannable code. On failure `initialDataUrl` stays null
  // and QrImage's own client-side effect takes over.
  const ssrQrDataUrl = await QRCode.toDataURL(publicVerifyPageUrl, qrRenderOptions(QR_SIZE)).catch(
    () => null,
  );
  const holder = cert?.holderDisplayName;
  const scope = parseCertificationScope(cert?.scope);
  const scopeLine = scope ? scopeLineTh(scope) : '';

  return (
    <div className="flex min-h-screen flex-col bg-mint-bg">
      <PublicVerifyHeader />

      <main id="main-content" className="flex flex-1 justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-xl">
          <h1 className="mb-5 text-center text-2xl font-bold leading-snug text-primary">ผลการตรวจสอบใบรับรอง</h1>

          <Card className="overflow-hidden">
            {unavailable ? (
              /* Transport/server failure: NO verdict was reached. Neutral
                 amber, never a red verdict: a farmer's genuine certificate
                 must not be publicly branded fake because the backend was
                 unreachable for a moment. */
              <div role="status" className="flex items-start gap-3 bg-amber-50 px-5 py-5 sm:px-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
                  <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="leading-snug">
                  <p className="text-base font-bold text-amber-900">ไม่สามารถตรวจสอบได้ในขณะนี้</p>
                  <p className="text-sm text-amber-900">
                    ระบบตรวจสอบขัดข้องชั่วคราว ยังไม่สามารถยืนยันสถานะใบรับรองได้ กรุณาลองใหม่อีกครั้ง
                  </p>
                </div>
              </div>
            ) : (
              <VerdictHero view={view} />
            )}

            {/* Certificate revision (ฉบับแก้ไขภายใต้เลขเดิม): one neutral
                line, only past revision 1. Informational, never a verdict. */}
            {!unavailable && view.revision && (
              <RevisionLine revision={view.revision} certNumber={certNumber} />
            )}

            <div className="space-y-1 p-5 sm:p-6">
              <p className="text-xs text-muted-foreground">เลขที่ใบรับรอง</p>
              <p className="break-words text-lg font-bold text-foreground">{certNumber}</p>

              {cert ? (
                <dl className="pt-2">
                  {holder && <InfoRow label="ผู้ถือใบรับรอง" value={holder} />}
                  {scopeLine && <InfoRow label="ขอบเขตการรับรอง" value={scopeLine} />}
                  {cert.farmName && <InfoRow label="แหล่งปลูก" value={cert.farmName} />}
                  {cert.province && <InfoRow label="จังหวัด" value={cert.province} />}
                  {cert.issueDate && <InfoRow label="วันที่ออก" value={formatDate(cert.issueDate)} />}
                  {cert.expiryDate && <InfoRow label="วันหมดอายุ" value={formatDate(cert.expiryDate)} />}
                </dl>
              ) : unavailable ? (
                <div className="flex flex-col items-start gap-3 pt-3">
                  <p className="text-sm text-muted-foreground">
                    ยังไม่สามารถแสดงข้อมูลใบรับรองได้ เนื่องจากระบบขัดข้องชั่วคราว
                  </p>
                  {/* Button renders a plain <a> for href, so the retry
                      always re-runs this server component's fetch. */}
                  <Button href={`/verify/${encodeURIComponent(toCertificateSlug(certNumber))}`} variant="outline" size="sm">
                    ลองตรวจสอบอีกครั้ง
                  </Button>
                </div>
              ) : view.verdict !== 'NOT_FOUND' ? (
                /* The register withholds the holder and dates of a certificate
                   that is not in force (apps/backend/routes/api/auth/public.js). */
                <p className="pt-3 text-sm text-muted-foreground">
                  ไม่แสดงรายละเอียดของใบรับรองที่ไม่มีผลแล้ว
                </p>
              ) : null}
            </div>

            <div className="border-t border-primary-100 bg-mint-soft px-5 py-3 sm:px-6">
              <p className="text-xs text-muted-foreground">
                {unavailable
                  ? 'ยังไม่มีการตรวจสอบ เนื่องจากระบบขัดข้องชั่วคราว'
                  : `ตรวจสอบเมื่อ ${formatCheckedAt(result?.data?.verifiedAt || Date.now())}`}
              </p>
            </div>
          </Card>

          {/* Operator decision 6 (2026-09-17), audit UXUI-02: the issuer is
              named only for a certificate the register returned. */}
          {cert ? (
            <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
              {CERTIFICATE_ISSUER_TH}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button href="/verify" variant="outline" size="sm" leftSection={<Search className="h-4 w-4" aria-hidden="true" />}>
              ตรวจสอบเลขอื่น
            </Button>
            <Button variant="ghost" size="sm" href="/" leftSection={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
              กลับหน้าหลัก
            </Button>
          </div>

          {/* Signature, fingerprint and this page's own QR are evidence for
              agencies and auditors. A citizen gets the answer above; the
              proof stays one tap away instead of in the way. */}
          <details className="group mt-6 rounded-lg border border-primary-100 bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground underline underline-offset-2 group-open:no-underline">
              รายละเอียดทางเทคนิค
            </summary>
            <div className="mt-3 space-y-4">
              {view.hasIntegrity ? (
                <CryptoVerdict view={view} />
              ) : (
                <p className="text-xs text-muted-foreground">ไม่มีผลตรวจลายเซ็นดิจิทัลสำหรับเลขนี้</p>
              )}
              <div className="flex flex-col items-center gap-2">
                {/* QR modules need true white behind them to keep scan
                    contrast; this must NOT flip under dark mode. */}
                <div className="rounded-lg border border-primary-100 bg-white p-3 dark:bg-white">
                  <QrImage
                    value={publicVerifyPageUrl}
                    alt={`QR ตรวจสอบใบรับรอง ${certNumber}`}
                    size={QR_SIZE}
                    className="h-44 w-44"
                    initialDataUrl={ssrQrDataUrl}
                  />
                </div>
                <p className="text-xs text-muted-foreground">QR ของหน้านี้ สแกนเพื่อเปิดผลตรวจเดียวกัน</p>
              </div>
              <Link href="/verify/technical" className="inline-block text-xs font-semibold text-primary underline underline-offset-2">
                เครื่องมือตรวจสอบสำหรับหน่วยงานที่เชื่อมระบบ
              </Link>
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-primary-100 py-2 last:border-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Issue and expiry dates are Bangkok days. This page renders on the server,
 * whose clock is UTC, so a certificate issued between 00:00 and 06:59 in
 * Bangkok showed the day before (UXUI-11, audit 2026-09-17).
 */
function formatDate(value: string) {
  return formatThaiDate(value, { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * "17/9/2569 01:30:00" in Bangkok time, whatever the server clock's zone. An
 * unparseable backend time falls back to the page's own clock (still Bangkok)
 * instead of printing "Invalid Date".
 */
function formatCheckedAt(value: string | number | Date) {
  const at = new Date(value);
  const shown = Number.isNaN(at.getTime()) ? new Date() : at;
  return shown.toLocaleString('th-TH', { timeZone: THAI_TIME_ZONE });
}
