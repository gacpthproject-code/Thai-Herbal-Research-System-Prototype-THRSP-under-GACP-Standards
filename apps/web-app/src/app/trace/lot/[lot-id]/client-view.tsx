'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, MapPin, Package, ShieldCheck, Printer, Award } from 'lucide-react';
import { Badge } from '@/components/ui/primitives/badge';
import { Button } from '@/components/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives/card';
import { Spinner } from '@/components/ui/spinner';
import { SummaryHeader } from '@/components/feature/summary-header';
import { cn } from '@/lib/utils';
import { fetchTraceEnvelope, type LapsedCertificate } from '../../trace-fetch';
import { TraceUnavailable } from '../../trace-unavailable';
import { describeCertificate } from '../../certificate-status';
import type { RenewalPointer } from '@/lib/verify/renewal-wording';
import { formatThaiDate } from '@/lib/format/thai-date';
import { packageTypeLabel } from '@/lib/trace/package-type-labels';
import { verifyPathFor } from '@/lib/verify/verify-route';
import { CERTIFICATE_VERDICTS, VERDICT_TONE_CLASSES, verdictForTraceGateReason } from '@/lib/verify/certificate-verdict';
import { parseCertificationScope, scopeLineTh } from '@/lib/verify/certification-scope';
import { CERTIFICATE_ISSUER_TH } from '@/constants/service-facts';

export type LotTraceData = {
    lotId: string;
    lotNumber: string;
    batchId: string;
    batchNumber: string;
    status: string;
    farm: {
        // ไม่มี `id`: หน้าสาธารณะไม่เคยได้รับมันตั้งแต่ T12 — id ภายในเป็นมือจับสำหรับไล่เดา
        // ชนิดเดิมประกาศไว้ทั้งที่เซิร์ฟเวอร์เลิกส่งแล้ว ซึ่งทำให้คนอ่านโค้ดเข้าใจผิด
        name: string;
        district: string;
        province: string;
        // มติ 2026-09-05 เปิดสี่ช่องนี้ · เซิร์ฟเวอร์ส่งมาตั้งแต่ T12 แต่หน้านี้ไม่เคยประกาศรับ
        address?: string | null;
        subDistrict?: string | null;
        postalCode?: string | null;
        status?: string | null;
    } | null;
    harvestDate: string | null;
    harvestDateTH: string | null;
    /** ผลวิเคราะห์ของรุ่นที่ล็อตนี้มาจาก — ล็อตไม่เคยมี COA ของตัวเอง (T11) */
    labTest?: {
        lot?: {
            tested?: boolean;
            latest?: {
                fileUrl?: string | null; fileName?: string | null;
                labName?: string | null; reportNumber?: string | null;
                verificationStatus?: string | null;
            } | null;
        } | null;
    } | null;
    packaging: {
        type: string;
        unitWeight: number;
        unitCount: number;
        totalWeight: number;
    };
    qrUrl: string | null;
    /** มติ 2026-09-07 ข้อ 7 "บอก" — สี่ฟิลด์จาก toPublicPlant เท่านั้น */
    plant?: { code: string | null; nameTH: string | null; nameEN: string | null; scientificName: string | null } | null;
    /** การเรียกคืน — null เมื่อไม่ถูกเรียกคืน (เซิร์ฟเวอร์ไม่ส่ง {recalled:false}) */
    recall?: { recalled: boolean; messageTh: string } | null;
    certificate: {
        reference: string;
        issuedDate: string | null;
        issuedDateTH: string | null;
        expiryDate: string | null;
        expiryDateTH: string | null;
        isValid: boolean;
        producedInForce?: boolean;
        renewal?: RenewalPointer;
        /** Crop, cultivation types in Thai and standard, the same answer /verify gets (order 68(1)). */
        scope?: unknown;
    } | null;
    // ไม่มี `source` และไม่มี `healthPlantingUnitsUrl` อีกแล้ว: มติ operator 2026-09-05 ตัด
    // ชื่อแปลง/ชื่อรอบปลูกออกจากหน้าสาธารณะ (เป็นการเรียกขานภายในของฟาร์ม ชื่อแปลงพาชื่อคนมาได้)
    // และ R8 ยกเลิกหน้าติดตามรายต้นที่ลิงก์นั้นชี้ไป · ประกาศชนิดไว้ทั้งที่เซิร์ฟเวอร์เลิกส่งแล้ว
    // ทำให้คนอ่านโค้ดเข้าใจว่ามันยังมา และหน้าจอพิมพ์ "-" ค้างไว้ตลอดกาล
    links?: {
        requiresAuthentication?: boolean;
    } | null;
    traceabilityScope: string;
};

type LotTraceResponse = {
    success: boolean;
    message?: string;
    data?: LotTraceData;
};

function formatDate(value: string | null | undefined): string {
    return formatThaiDate(value, { year: 'numeric', month: 'short', day: '2-digit' }, '-');
}

function formatWeight(value: number | null | undefined): string {
    const numeric = Number(value || 0);
    return `${numeric.toLocaleString('th-TH', { maximumFractionDigits: 2 })} กก.`;
}

const LOT_NOT_FOUND_TH = 'ไม่พบข้อมูลสินค้านี้ในระบบ ตรวจสอบว่าสแกน QR จากบรรจุภัณฑ์ หรือสอบถามผู้ขาย';

export default function PublicLotTracePage({ initialData = null }: { initialData?: LotTraceData | null }) {
    const params = useParams();
    const lotId = useMemo(() => String((params as Record<string, string | string[] | undefined>)?.['lot-id'] || (params as Record<string, string | string[] | undefined>)?.lotId || ''), [params]);

    // Server-rendered payload (page.tsx). This is the BUYER'S door — the page a
    // scanned lot QR lands on — and the repo's own memory records that the public
    // scan has two doors, of which only the generic one had been moved to the
    // server. Failure paths are untouched: null means the effect below runs
    // exactly as it always did.
    const [loading, setLoading] = useState(initialData === null);
    const [error, setError] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [data, setData] = useState<LotTraceData | null>(initialData);
    const [lapsed, setLapsed] = useState<LapsedCertificate | null>(null);

    useEffect(() => {
        if (initialData !== null) return;
        if (!lotId) {
            setError(LOT_NOT_FOUND_TH);
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function run() {
            setLoading(true);
            setError(null);
            setUnavailable(false);
            // W1-TRACE: only a definitive backend verdict (404/410/2xx
            // envelope) may claim "not found". A transport/5xx failure
            // (backend down) shows the neutral amber unavailable state.
            const outcome = await fetchTraceEnvelope<LotTraceResponse>(`/api/trace/lot/${encodeURIComponent(lotId)}`);
            if (cancelled) return;
            if (outcome.kind === 'unavailable') {
                setUnavailable(true);
            } else if (outcome.kind === 'ok' && outcome.payload.data) {
                setData(outcome.payload.data);
            } else {
                if (outcome.kind === 'not-found' && outcome.lapsedCertificate) {
                    setLapsed(outcome.lapsedCertificate);
                }
                setError(
                    (outcome.kind === 'not-found' && outcome.message) ||
                    LOT_NOT_FOUND_TH
                );
            }
            setLoading(false);
        }

        void run();
        return () => {
            cancelled = true;
        };
    }, [lotId, initialData]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Spinner className="h-8 w-8 text-primary" />
            </div>
        );
    }

    if (unavailable) {
        return <TraceUnavailable retryHref={`/trace/lot/${encodeURIComponent(lotId)}`} code={lotId} />;
    }

    if (lapsed) {
        return <LapsedCertificateCard lapsed={lapsed} />;
    }

    if (!data || error) {
        // Definitive backend verdict only (the backend ANSWERED not-found /
        // revoked / expired) — transport failures never reach this card.
        return (
            <div className="min-h-screen bg-background px-4 py-20">
                <Card className="mx-auto max-w-md rounded-[2rem] border-none shadow-xl">
                    <CardContent className="p-10 text-center">
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-500">
                            <AlertCircle size={40} aria-hidden="true" />
                        </div>
                        <h2 className="mb-4 text-xl font-bold text-foreground">ไม่พบข้อมูลสินค้า</h2>
                        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
                            {error || LOT_NOT_FOUND_TH}
                        </p>
                        <Button asChild className="h-12 w-full rounded-xl font-bold">
                            <Link href="/">กลับหน้าแรก</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // F-QA-02: "ยังไม่เคยมีใบรับรอง" กับ "ใบรับรองหมดอายุ/ถูกเพิกถอน" เป็นคนละคำตอบ
    // ตัวตัดสินอยู่ที่ ../../certificate-status เพื่อให้ประตูสาธารณะทุกบานพูดตรงกัน
    const cert = describeCertificate(data.certificate, 'ล็อต');

    const certificatePath = cert.hasCertificate ? verifyPathFor(data.certificate?.reference ?? '') : null;
    const successorNumber = cert.state === 'RENEWED' ? data.certificate?.renewal?.successorCertificateNumber ?? null : null;
    const successorPath = successorNumber ? verifyPathFor(successorNumber) : null;
    const scope = cert.state === 'VALID' ? parseCertificationScope(data.certificate?.scope) : null;
    const scopeLine = scope ? scopeLineTh(scope) : '';
    const summaryMetrics = [
        { label: 'เก็บเกี่ยวเมื่อ', value: data.harvestDateTH || formatDate(data.harvestDate) },
        { label: 'น้ำหนักรวม', value: formatWeight(data.packaging.totalWeight) },
        { label: 'จำนวน', value: `${data.packaging.unitCount} หน่วย` },
    ];

    return (
        <div className="animate-fade-in min-h-screen bg-background px-4 py-10">
            <div className="mx-auto max-w-5xl space-y-8">
                
                <SummaryHeader
                    eyebrow="ข้อมูลที่มาของสินค้า"
                    title={data.plant?.nameTH ? `${data.plant.nameTH} ล็อต ${data.lotNumber}` : `ล็อต ${data.lotNumber}`}
                    description={`ผลผลิตจาก${data.farm?.name || 'ฟาร์มที่ลงทะเบียนไว้'}${data.farm?.province ? ` จังหวัด${data.farm.province}` : ''}`}
                    metrics={summaryMetrics}
                    actions={
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20"
                            onClick={() => window.print()}
                        >
                            <Printer className="mr-2 h-4 w-4" aria-hidden="true" /> พิมพ์หน้านี้
                        </Button>
                    }
                    className="gov-gradient border-none shadow-xl"
                />

                {data.recall?.recalled ? (
                    // การเรียกคืนคือคำเตือนที่สำคัญที่สุดบนหน้านี้ — มาก่อนทุกการ์ด
                    // และพูดตรง ๆ ว่าให้ทำอะไร (งดบริโภค · ส่งคืน) ไม่ใช่เหตุผลสอบสวน
                    <div role="alert" className="rounded-2xl border-2 border-red-600 bg-red-50 p-5">
                        <p className="text-base font-bold text-red-700">ประกาศเรียกคืนสินค้า</p>
                        <p className="mt-1 text-sm leading-relaxed text-red-800">{data.recall.messageTh}</p>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    
                    {/* Source Information */}
                    <Card className="rounded-2xl border-border bg-card shadow-sm">
                        <CardHeader className="border-b border-border/50 bg-muted/30">
                            <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                                <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                                แหล่งที่มา
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 p-6">
                            <div>
                                <p className="text-xs font-bold text-muted-foreground">ฟาร์ม</p>
                                <p className="text-lg font-bold text-foreground">{data.farm?.name || '-'}</p>
                                {data.plant?.nameTH ? (
                                    <p className="mt-1 text-sm font-semibold text-leaf-onSoft">
                                        พืช: {data.plant.nameTH}
                                        {data.plant.scientificName ? (
                                            <span className="ml-1 font-normal italic text-muted-foreground">({data.plant.scientificName})</span>
                                        ) : null}
                                    </p>
                                ) : null}
                                <p className="text-xs font-medium text-muted-foreground">{data.farm?.district}, {data.farm?.province}</p>
                                {/* มติ operator 2026-09-05: "ที่อยู่ติดต่อ...เมื่อสแกนต้องเห็นทั้งหมด"
                                    หลังบ้านส่งมาตั้งแต่ T12 แต่หน้านี้ไม่เคยแสดง — เจอตอนกดผ่าน
                                    เบราว์เซอร์จริง · พิกัด GPS ยังไม่เปิด และไม่เคยถูก select ออกมา */}
                                {data.farm?.address && (
                                    <p className="mt-2 text-sm text-foreground">
                                        {data.farm.address}
                                        {data.farm.subDistrict ? ` ต.${data.farm.subDistrict}` : ''}
                                        {data.farm.district ? ` อ.${data.farm.district}` : ''}
                                        {data.farm.province ? ` จ.${data.farm.province}` : ''}
                                        {data.farm.postalCode ? ` ${data.farm.postalCode}` : ''}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ผลวิเคราะห์ — มติ 2026-09-05: เอกสารต้องเปิดดูได้จริงจากหน้าสแกน
                        ก่อนหน้านี้หน้านี้ไม่มีการ์ดนี้เลย ทั้งที่ API ส่ง labTest มาแล้ว */}
                    {data.labTest?.lot && (
                        <Card className="rounded-2xl border-border bg-card shadow-sm">
                            <CardHeader className="border-b border-border/50 bg-muted/30">
                                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                                    ผลตรวจจากห้องปฏิบัติการ
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 p-6">
                                {data.labTest.lot.tested
                                    ? (
                                        <>
                                            <p className="text-sm font-semibold text-foreground">
                                                มีผลตรวจแล้ว
                                                {data.labTest.lot.latest?.labName ? ` ตรวจโดย ${data.labTest.lot.latest.labName}` : ''}
                                            </p>
                                            {data.labTest.lot.latest?.fileUrl && (
                                                <a
                                                    href={data.labTest.lot.latest.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-block text-sm font-semibold text-blue-700 underline"
                                                >
                                                    เปิดเอกสารผลตรวจ
                                                    {data.labTest.lot.latest.reportNumber ? ` เลขที่ ${data.labTest.lot.latest.reportNumber}` : ''}
                                                </a>
                                            )}
                                            {data.labTest.lot.latest?.verificationStatus === 'FARMER_UPLOADED' && (
                                                <p className="text-xs text-muted-foreground">
                                                    เอกสารนี้เกษตรกรเป็นผู้แนบ ยังไม่ได้ผ่านการตรวจสอบโดยเจ้าหน้าที่
                                                </p>
                                            )}
                                        </>
                                    )
                                    : (
                                        // "ยังไม่ได้ตรวจ" คือคำตอบ ไม่ใช่ความว่าง — ผู้ซื้อต้องแยกออกจาก "ระบบไม่รู้"
                                        <p className="text-sm text-muted-foreground">ยังไม่มีผลตรวจสำหรับรุ่นนี้</p>
                                    )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Packaging Information */}
                    <Card className="rounded-2xl border-border bg-card shadow-sm">
                        <CardHeader className="border-b border-border/50 bg-muted/30">
                            <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                                <Package className="h-4 w-4 text-primary" aria-hidden="true" />
                                การบรรจุ
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-2 gap-y-4">
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground">ประเภทบรรจุภัณฑ์</p>
                                    <p className="text-sm font-bold text-foreground">{packageTypeLabel(data.packaging.type)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground">จำนวนหน่วย</p>
                                    <p className="text-sm font-bold text-foreground">{data.packaging.unitCount} หน่วย</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground">น้ำหนักต่อหน่วย</p>
                                    <p className="text-sm font-bold text-foreground">{formatWeight(data.packaging.unitWeight)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground">น้ำหนักรวม</p>
                                    <p className="text-sm font-bold text-primary">{formatWeight(data.packaging.totalWeight)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Certificate Status */}
                    <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-sm md:col-span-2">
                        <div className="flex flex-col divide-y divide-border/50 md:flex-row md:divide-x md:divide-y-0">
                            <div className="flex-1 space-y-4 p-6">
                                <h4 className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                                    <Award className="h-4 w-4 text-primary" aria-hidden="true" /> ใบรับรอง GACP ของแหล่งปลูก
                                </h4>
                                {/* F-QA-02: แถวเลขที่ใบ/วันหมดอายุพิมพ์เฉพาะเมื่อมีใบรับรองจริง ·
                                    "เลขที่ใบรับรอง: -" บอกผู้ซื้อว่ามีใบอยู่แต่ระบบไม่ยอมบอกเลข */}
                                {cert.hasCertificate ? (
                                    <div className="space-y-2">
                                        <p className="text-sm font-bold">เลขที่ใบรับรอง: <span className="text-foreground">{data.certificate?.reference}</span></p>
                                        <p className="text-sm font-bold">วันหมดอายุ: <span className="text-foreground">{data.certificate?.expiryDateTH || formatDate(data.certificate?.expiryDate)}</span></p>
                                        {scopeLine ? (
                                            <p className="text-sm font-bold">ขอบเขตการรับรอง: <span className="text-foreground">{scopeLine}</span></p>
                                        ) : null}
                                        {cert.state === 'VALID' ? (
                                            <p className="text-xs leading-relaxed text-muted-foreground">{CERTIFICATE_ISSUER_TH}</p>
                                        ) : null}
                                    </div>
                                ) : null}
                                {cert.note ? (
                                    <p className="text-sm text-muted-foreground">{cert.note}</p>
                                ) : null}
                                {successorPath ? (
                                    <Link href={successorPath} className="block text-sm font-semibold text-primary underline underline-offset-2">
                                        ตรวจสอบฉบับปัจจุบัน {successorNumber}
                                    </Link>
                                ) : null}
                                {certificatePath ? (
                                    <Link href={certificatePath} className="inline-block text-sm font-semibold text-primary underline underline-offset-2">
                                        ตรวจสอบสถานะใบรับรองนี้
                                    </Link>
                                ) : null}
                            </div>
                            <div className="flex flex-col items-center justify-center bg-primary/5 p-6 text-center md:w-1/3">
                                <div className={cn(
                                    "mb-3 flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
                                    cert.tone === 'success' && "bg-leaf-700 text-white",
                                    cert.tone === 'danger' && "bg-red-500 text-white",
                                    cert.tone === 'neutral' && "bg-muted text-muted-foreground",
                                )}>
                                    {cert.state === 'VALID' ? <ShieldCheck size={24} aria-hidden="true" />
                                        : cert.tone === 'danger' ? <AlertCircle size={24} aria-hidden="true" />
                                            : <Award size={24} aria-hidden="true" />}
                                </div>
                                <p className="text-sm font-bold">สถานะการรับรอง</p>
                                {/* Status-only claim (cert ACTIVE + not expired). This lot surface
                                    carries no cryptographic QR verification, so we deliberately do
                                    NOT assert "Authentic / verified" — only the certificate status.
                                    F-QA-02: และ "ไม่เคยมีใบ" ต้องไม่ถูกอ่านว่า "ใบหมดอายุ" */}
                                <Badge className={cn(
                                    "mt-1 rounded-full border-none px-4 font-bold",
                                    cert.tone === 'success' && "bg-leaf-soft text-leaf-onSoft",
                                    cert.tone === 'danger' && "bg-red-100 text-red-800",
                                    cert.tone === 'neutral' && "bg-muted text-muted-foreground",
                                )}>
                                    {cert.badgeLabel}
                                </Badge>
                            </div>
                        </div>
                    </Card>

                </div>
            </div>

            <style jsx global>{`
                @media print {
                    .gov-gradient { background: #006738 !important; color: white !important; }
                    button, .btn-friendly { display: none !important; }
                }
            `}</style>
        </div>
    );
}

/**
 * The 410 certificate gate: the lot exists, but the certificate of the farm it
 * came from is no longer in force, so the server withholds the lot's details.
 * The buyer is told that in words, with the certificate's status, and where to
 * read the certificate itself. Not "not found": the product is real.
 */
function LapsedCertificateCard({ lapsed }: { lapsed: LapsedCertificate }) {
    const copy = CERTIFICATE_VERDICTS[verdictForTraceGateReason(lapsed.reason)];
    const tone = VERDICT_TONE_CLASSES[copy.tone];
    const certificatePath = lapsed.reference ? verifyPathFor(lapsed.reference) : null;
    return (
        <div className="min-h-screen bg-background px-4 py-20">
            <Card className="mx-auto max-w-md rounded-[2rem] border-none shadow-xl">
                <CardContent className="space-y-4 p-8 text-center">
                    <h2 className="text-xl font-bold text-foreground">ใบรับรองของแหล่งปลูกนี้ไม่มีผลแล้ว</h2>
                    <p className={`mx-auto inline-block rounded-full px-3 py-0.5 text-sm font-bold ${tone.chip}`}>
                        สถานะใบรับรอง: {copy.word}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        ระบบจึงไม่แสดงข้อมูลที่มาของสินค้าล็อตนี้ สอบถามผู้ขายหรือผู้ผลิตก่อนตัดสินใจซื้อ
                    </p>
                    {certificatePath ? (
                        <Link href={certificatePath} className="inline-block text-sm font-semibold text-primary underline underline-offset-2">
                            ดูสถานะใบรับรอง {lapsed.reference}
                        </Link>
                    ) : null}
                    <Button asChild variant="outline" className="h-12 w-full rounded-xl font-bold">
                        <Link href="/">กลับหน้าแรก</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
