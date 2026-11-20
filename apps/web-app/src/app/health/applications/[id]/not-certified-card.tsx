'use client';

import Link from 'next/link';
import { IconFileCertificate } from '@tabler/icons-react';

import { Card } from '@/components/ui/primitives/card';
import { formatThaiDate } from '@/lib/format/thai-date';
import type { CertificationRefusalView } from './application-detail-page-config';

export function NotCertifiedCard({ refusal }: { refusal: CertificationRefusalView }) {
  return (
    <Card className="border-destructive/40 p-5 sm:p-6" data-testid="not-certified-card">
      <div className="flex items-center gap-2">
        <IconFileCertificate size={18} className="text-destructive" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">ไม่ได้รับการรับรอง</h2>
      </div>
      <dl className="mt-3 space-y-3 text-sm">
        {refusal.reasonLabel ? (
          <div>
            <dt className="font-semibold text-foreground">เหตุผล</dt>
            <dd className="mt-1 text-foreground">{refusal.reasonLabel}</dd>
          </div>
        ) : null}
        {refusal.consideration ? (
          <div>
            <dt className="font-semibold text-foreground">ข้อพิจารณา</dt>
            <dd className="mt-1 whitespace-pre-wrap text-foreground">{refusal.consideration}</dd>
          </div>
        ) : null}
        {refusal.decidedAt ? (
          <div>
            <dt className="font-semibold text-foreground">วันที่มีคำสั่ง</dt>
            <dd className="mt-1 text-foreground">{formatThaiDate(refusal.decidedAt)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        ผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นคำขอได้รับหนังสือแจ้งคำสั่งฉบับเต็มในระบบ{' '}
        <Link href="/health/notifications" className="font-semibold text-primary underline underline-offset-2">
          อ่านหนังสือแจ้งคำสั่ง
        </Link>
      </p>
    </Card>
  );
}
