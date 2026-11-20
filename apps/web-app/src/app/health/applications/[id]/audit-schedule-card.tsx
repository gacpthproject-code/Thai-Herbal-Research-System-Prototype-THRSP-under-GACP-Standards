'use client';

import { IconCalendarEvent, IconUser } from '@tabler/icons-react';

import { Card } from '@/components/ui/primitives/card';
import { toThaiDateTime, type AuditScheduleView } from './application-detail-page-config';

/**
 * The booked inspection, as the applicant needs to read it: when and who is coming. Every
 * inspection is on site (order 27). Rendered only while the visit is booked (the server sends
 * `auditSchedule` only then). The date is a Bangkok date in the Buddhist year (toThaiDateTime).
 */
export function AuditScheduleCard({ schedule }: { schedule: AuditScheduleView }) {
  return (
    <Card className="p-5 sm:p-6" data-testid="audit-schedule-card">
      <div className="flex items-center gap-2">
        <IconCalendarEvent size={18} className="text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">นัดตรวจพื้นที่ของคุณ</h2>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">วันและเวลา</dt>
          <dd className="font-semibold text-foreground">{`${toThaiDateTime(schedule.scheduledDate)} น.`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">ผู้ตรวจพื้นที่</dt>
          <dd className="flex items-center gap-1.5 font-semibold text-foreground">
            <IconUser size={14} aria-hidden="true" />
            {schedule.auditorName || 'ยังไม่ทราบชื่อ'}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
