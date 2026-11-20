"use client";

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from "react";
import ProviderLayout from "../components/provider-layout";
import { Button } from '@/components/ui/primitives/button';
import { Spinner } from '@/components/ui/spinner';
import { LaunchpadHeader } from '@/components/provider/launchpad';
import { RefreshCcw } from "lucide-react";
import { providerApiPaths } from "@/lib/services/provider-api";
import {
    type FinalApprovalItem,
    PROVIDERRequest,
} from "../audits/auditor-types";
import { FinalApprovalList } from "../audits/final-approval-list";

/**
 * คิวตัดสินให้การรับรอง — หน้าจอเดียวของบทบาท certificate_approver
 *
 * ใช้ <FinalApprovalList> ตัวเดียวกับแท็บ "อนุมัติ" ในหน้าผู้ตรวจ: การตัดสินใบเดียวกัน
 * ควรหน้าตาเหมือนกันไม่ว่าใครเปิด · ที่ไม่เหมือนคือหน้านี้ไม่แตะ endpoint ของผู้ตรวจเลย
 * (ดูเหตุผลใน page.tsx) จึงไม่มีวันขึ้น error เพราะสิทธิ์ที่บทบาทนี้ตั้งใจไม่มี
 * แต่ละแถวเปิดแฟ้ม การตัดสินอยู่ในแฟ้มเท่านั้น (คำสั่ง 29)
 */
export default function CertificationDecisionsPage() {
    const [items, setItems] = useState<FinalApprovalItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const fetchQueue = useCallback(async () => {
        setFetchError(null);
        try {
            const result = await PROVIDERRequest<{ total: number; items: FinalApprovalItem[] }>(
                providerApiPaths.auditorFinalApprovalQueue,
            );
            if (result.success && result.data) {
                setItems(result.data.items || []);
            } else {
                setFetchError(result.error || "ไม่สามารถโหลดคิวรอการตัดสินได้");
                setItems([]);
            }
        } catch (error: unknown) {
            const message = error instanceof Error && error.message
                ? error.message
                : "ไม่สามารถโหลดคิวรอการตัดสินได้";
            setFetchError(message);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void fetchQueue(); }, [fetchQueue]);

    return (
        <ProviderLayout>
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
                <LaunchpadHeader
                    greeting="ผู้อนุมัติใบรับรอง"
                    title="ตัดสินให้การรับรอง"
                    subtitle={`คำขอที่ตรวจประเมินแปลงแล้ว รอการตัดสิน · ${items.length} รายการ`}
                    actions={(
                        <div className="flex flex-wrap gap-2">
                        <Button href="/provider/certificates" variant="outline" size="sm">
                            ใบรับรองที่ออกแล้ว
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void fetchQueue()}>
                            <RefreshCcw size={16} className="mr-2" />
                            รีเฟรช
                        </Button>
                        </div>
                    )}
                />

                {isLoading ? (
                    <div className="flex justify-center py-16"><Spinner /></div>
                ) : (
                    <FinalApprovalList
                        items={items}
                        fetchError={fetchError}
                        onRetry={fetchQueue}
                    />
                )}
            </div>
        </ProviderLayout>
    );
}
