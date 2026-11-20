'use client';

import { IconInfoCircle } from '@tabler/icons-react';

import { Card } from '@/components/ui/primitives/card';
import { formatThaiDate } from '@/lib/format/thai-date';
import type { RecordedReasonView } from './application-detail-page-config';

/**
 * Why the visit was booked after the date the company must inspect by, or why the field inspector
 * changed during a correction, in the words the dispatcher recorded and with the side the delay
 * counts against (order 65(1)). Rendered only when the server sent at least one reason.
 */
export function RecordedReasonsCard({ reasons }: { reasons: RecordedReasonView[] }) {
  return (
    <Card className="p-5 sm:p-6" data-testid="recorded-reasons-card">
      <div className="flex items-center gap-2">
        <IconInfoCircle size={18} className="text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">เหตุผลที่หน่วยตรวจบันทึกไว้</h2>
      </div>
      <ul className="mt-3 space-y-3 text-sm">
        {reasons.map((reason, index) => (
          <li key={`${reason.kind}-${index}`} className="rounded-lg border border-border p-3">
            <p className="font-semibold text-foreground">{reason.kindLabel}</p>
            <p className="mt-1 text-foreground">{reason.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ฝ่ายที่รับผิดชอบ: {reason.sideLabel}
              {reason.recordedAt ? ` · บันทึกเมื่อ ${formatThaiDate(reason.recordedAt)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
