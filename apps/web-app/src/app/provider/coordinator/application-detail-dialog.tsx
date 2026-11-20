"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/primitives/button";
import { api } from "@/lib/api/api-client";
import { resolveMapViewerUrl } from "@/lib/config/map-tiles";
import { getStatusLabel } from "@/lib/constants/workflow-states";
import { formatThaiDateTime } from "@/lib/format/thai-date";
import type { DispatcherApplicationDetail } from "./coordinator-types";

/**
 * What the dispatcher reads before assigning a reviewer or booking a visit: the holder, the site,
 * the scope, the payment state and who already holds the case (audit 2026-10-06 D11). Read-only,
 * from GET /api/provider/scheduler/applications/:id, never the whole application form.
 */
export default function ApplicationDetailDialog({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const titleId = useId();
  const [detail, setDetail] = useState<DispatcherApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<DispatcherApplicationDetail>(`/api/provider/scheduler/applications/${encodeURIComponent(applicationId)}`).then((res) => {
      if (cancelled) { return; }
      if (res.success && res.data) { setDetail(res.data); } else { setError(res.error || "ไม่สามารถโหลดรายละเอียดคำขอได้"); }
    });
    return () => { cancelled = true; };
  }, [applicationId]);

  const summary = detail?.summary;
  const mapUrl = summary && summary.farmLatitude !== null && summary.farmLongitude !== null
    ? resolveMapViewerUrl(summary.farmLatitude, summary.farmLongitude)
    : null;
  const paid = (value: boolean | undefined) => (value ? "ชำระแล้ว" : "ยังไม่ชำระ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button type="button" aria-label="ปิดหน้าต่าง" className="absolute inset-0 cursor-default bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl" data-testid="dispatcher-application-detail">
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-bold text-foreground">รายละเอียดคำขอ</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="ปิด">
            <X size={18} aria-hidden="true" focusable="false" />
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !summary && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}
        {summary && detail && (
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">เลขที่คำขอ</dt><dd className="font-semibold text-foreground">{summary.applicationNumber}</dd></div>
            <div><dt className="text-xs text-muted-foreground">สถานะ</dt><dd className="text-foreground">{getStatusLabel(summary.status)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ผู้ถือใบรับรอง</dt><dd className="text-foreground">{summary.holder?.name || "ไม่ได้บันทึก"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ยื่นโดย</dt><dd className="text-foreground">{summary.applicantName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">สถานที่ปลูก</dt><dd className="text-foreground">{summary.farmName || "ไม่ได้บันทึก"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ที่ตั้งพื้นที่</dt><dd className="text-foreground">{summary.farmAddress || "ไม่ได้บันทึก"}</dd></div>
            <div>
              <dt className="text-xs text-muted-foreground">พิกัด</dt>
              <dd className="tabular-nums text-foreground">
                {summary.farmLatitude !== null && summary.farmLongitude !== null ? `${summary.farmLatitude}, ${summary.farmLongitude}` : "ไม่ได้บันทึก"}
                {mapUrl && (
                  <a href={mapUrl} target="_blank" rel="noreferrer" className="ml-2 text-info underline">เปิดแผนที่</a>
                )}
              </dd>
            </div>
            <div><dt className="text-xs text-muted-foreground">ขอบข่าย</dt><dd className="text-foreground">{[...summary.scope.cultivationTypes, summary.scope.plantName].filter(Boolean).join(" · ") || "ไม่ได้บันทึก"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">การชำระ</dt><dd className="text-foreground">{`งวดที่ 1 ${paid(detail.payment.m1Paid)} · งวดที่ 2 ${paid(detail.payment.m2Paid)}`}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ผู้ตรวจเอกสาร</dt><dd className="text-foreground">{detail.reviewerName || "ยังไม่มอบหมาย"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ผู้ตรวจพื้นที่</dt><dd className="text-foreground">{detail.inspectorName || "ยังไม่มอบหมาย"}</dd></div>
            {detail.schedule && (
              <div><dt className="text-xs text-muted-foreground">นัดตรวจ</dt><dd className="text-foreground">{`${formatThaiDateTime(detail.schedule.scheduledDate)}${detail.schedule.location ? ` · ${detail.schedule.location}` : ""}`}</dd></div>
            )}
            {detail.reinspection?.status === "REQUESTED" && (
              <div><dt className="text-xs text-muted-foreground">ผู้ตรวจพื้นที่ขอลงพื้นที่ซ้ำ</dt><dd className="text-foreground">{detail.reinspection.reason || "-"}</dd></div>
            )}
          </dl>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>ปิด</Button>
        </div>
      </div>
    </div>
  );
}
