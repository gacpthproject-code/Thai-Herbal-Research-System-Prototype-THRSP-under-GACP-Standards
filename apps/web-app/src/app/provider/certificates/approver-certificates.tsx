"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, RefreshCcw } from "lucide-react";
import { Button } from '@/components/ui/primitives/button';
import { Badge } from '@/components/ui/primitives/badge';
import {
    CERTIFICATE_STATUS_LABEL_TH,
    normalizeCertificateStatus,
    type CertificateStatusKey,
} from '@/lib/certificates/certificate-status';
import { Spinner } from '@/components/ui/spinner';
import { LaunchpadHeader } from '@/components/provider/launchpad';
import { notifications } from '@/lib/notifications';
import { formatThaiDate } from '@/lib/format/thai-date';
import { providerApiPaths } from "@/lib/services/provider-api";
import { PROVIDERRequest } from "../audits/auditor-types";
import { ReasonDialog, type ReasonDialogSubmit } from "../certification-decisions/reason-dialog";
import type { ReasonOption } from "../certification-decisions/[id]/decision-file-types";

interface ApproverCertificate {
    id: string;
    certificateNumber: string;
    status: string;
    farmName: string | null;
    cropType: string | null;
    holderDisplayName: string | null;
    issuedDate: string | null;
    expiryDate: string | null;
    suspendedReason: string | null;
    revokedReason: string | null;
}

interface ApproverCertificatesPayload {
    items: ApproverCertificate[];
    suspensionReasons: ReasonOption[];
    revocationReasons: ReasonOption[];
}

type Action = 'suspensions' | 'reinstatements' | 'revocations';

const STATUS_TONE: Readonly<Record<CertificateStatusKey, 'success' | 'warning' | 'danger' | 'neutral'>> = {
    active: 'success',
    suspended: 'warning',
    revoked: 'danger',
    expired: 'neutral',
    renewed: 'neutral',
    unknown: 'neutral',
};

const statusOf = (status: string) => {
    const key = normalizeCertificateStatus(status);
    return { label: CERTIFICATE_STATUS_LABEL_TH[key], tone: STATUS_TONE[key] };
};

/**
 * /provider/certificates ของผู้อนุมัติใบรับรอง: ใบรับรองขององค์กร พักใช้ คืนสภาพ เพิกถอน
 * (คำสั่ง 29 และ 34(4))
 * เหตุจากรายการตายตัวที่เซิร์ฟเวอร์ส่งมา ผู้ถือได้รับแจ้งพร้อมเหตุผลที่เลือก
 */
export function ApproverCertificates() {
    const [data, setData] = useState<ApproverCertificatesPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<{ cert: ApproverCertificate; action: Action } | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const result = await PROVIDERRequest<ApproverCertificatesPayload>(providerApiPaths.approverCertificates);
        if (result.success && result.data) {
            setData(result.data);
        } else {
            setError(result.error || 'โหลดรายการใบรับรองไม่สำเร็จ กรุณาลองอีกครั้ง');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const submit = async ({ reasonCode, reasonText, note }: ReasonDialogSubmit): Promise<string | null> => {
        if (!pending) { return null; }
        const result = await PROVIDERRequest(
            providerApiPaths.approverCertificateAction(pending.cert.id, pending.action),
            { method: 'POST', body: JSON.stringify({ reasonCode, ...(reasonText ? { reasonText } : {}), note }) },
        );
        if (!result.success) {
            return result.error || 'บันทึกไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่เพื่อดูสถานะล่าสุดแล้วลองอีกครั้ง';
        }
        notifications.show({ color: 'teal', title: 'บันทึกแล้ว', message: `ใบรับรองเลขที่ ${pending.cert.certificateNumber} ระบบแจ้งผู้ถือใบรับรองแล้ว` });
        await load();
        return null;
    };

    const dialog = pending ? {
        suspensions: {
            title: `พักใช้ใบรับรอง ${pending.cert.certificateNumber}`,
            description: 'ระหว่างพักใช้ ใบรับรองและล็อตผลผลิตจะตรวจสอบไม่ผ่าน คืนสภาพได้เมื่อแก้ไขแล้ว',
            reasons: data?.suspensionReasons,
            confirmLabel: 'ยืนยันพักใช้',
            destructive: true,
        },
        reinstatements: {
            title: `คืนสภาพใบรับรอง ${pending.cert.certificateNumber}`,
            description: 'ใบรับรองจะกลับมาใช้ได้ตามปกติ',
            reasons: undefined,
            confirmLabel: 'ยืนยันคืนสภาพ',
            destructive: false,
        },
        revocations: {
            title: `เพิกถอนใบรับรอง ${pending.cert.certificateNumber}`,
            description: 'การเพิกถอนมีผลทันทีและย้อนกลับไม่ได้ ใบรับรองจะตรวจสอบไม่ผ่านตั้งแต่นี้ไป',
            reasons: data?.revocationReasons,
            confirmLabel: 'ยืนยันเพิกถอน',
            destructive: true,
        },
    }[pending.action] : null;

    return (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
                <LaunchpadHeader
                    greeting="ผู้อนุมัติใบรับรอง"
                    title="ใบรับรองที่ออกแล้ว"
                    subtitle="พักใช้ คืนสภาพ หรือเพิกถอนใบรับรองขององค์กร"
                    actions={(
                        <div className="flex flex-wrap gap-2">
                            <Button href="/provider/certification-decisions" variant="outline" size="sm">
                                <ChevronLeft size={16} className="mr-1" />
                                กลับไปหน้าคิว
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void load()}>
                                <RefreshCcw size={16} className="mr-2" />
                                รีเฟรช
                            </Button>
                        </div>
                    )}
                />
                {isLoading ? (
                    <div className="flex justify-center py-16"><Spinner /></div>
                ) : error ? (
                    <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm">
                        <p>{error}</p>
                        <Button type="button" variant="outline" className="mt-4 min-h-[44px]" onClick={() => void load()}>ลองอีกครั้ง</Button>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {(data?.items || []).map((cert) => {
                            const st = statusOf(cert.status);
                            const key = String(cert.status || '').toLowerCase();
                            return (
                                <li key={cert.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
                                    <div className="space-y-1 text-sm">
                                        <p className="font-bold text-foreground">{cert.certificateNumber}</p>
                                        <p>{cert.holderDisplayName || '-'} · {cert.farmName || '-'} · {cert.cropType || '-'}</p>
                                        <p className="text-muted-foreground">
                                            ออกเมื่อ {cert.issuedDate ? formatThaiDate(cert.issuedDate) : '-'} หมดอายุ {cert.expiryDate ? formatThaiDate(cert.expiryDate) : '-'}
                                        </p>
                                        {key === 'suspended' && cert.suspendedReason ? <p>เหตุที่พักใช้: {cert.suspendedReason}</p> : null}
                                        {key === 'revoked' && cert.revokedReason ? <p>เหตุที่เพิกถอน: {cert.revokedReason}</p> : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge tone={st.tone}>{st.label}</Badge>
                                        {key === 'active' ? (
                                            <Button size="sm" variant="outline" onClick={() => setPending({ cert, action: 'suspensions' })}>พักใช้</Button>
                                        ) : null}
                                        {key === 'suspended' ? (
                                            <Button size="sm" variant="outline" onClick={() => setPending({ cert, action: 'reinstatements' })}>คืนสภาพ</Button>
                                        ) : null}
                                        {key === 'active' || key === 'suspended' ? (
                                            <Button size="sm" variant="destructive" onClick={() => setPending({ cert, action: 'revocations' })}>เพิกถอน</Button>
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                        {(data?.items || []).length === 0 ? (
                            <li className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีใบรับรองในองค์กรนี้</li>
                        ) : null}
                    </ul>
                )}
                {pending && dialog ? (
                    <ReasonDialog
                        open
                        onOpenChange={(o) => { if (!o) { setPending(null); } }}
                        title={dialog.title}
                        description={dialog.description}
                        {...(dialog.reasons ? { reasons: dialog.reasons } : {})}
                        noteLabel="บันทึกเพิ่มเติม (ไม่บังคับ)"
                        noteHint="บันทึกไว้เป็นหลักฐานภายใน ผู้ถือใบรับรองไม่เห็นข้อความนี้ ผู้ถือเห็นเฉพาะเหตุผลที่เลือกหรือที่ระบุ"
                        noteRequired={false}
                        confirmLabel={dialog.confirmLabel}
                        destructive={dialog.destructive}
                        onSubmit={submit}
                    />
                ) : null}
            </div>
    );
}
