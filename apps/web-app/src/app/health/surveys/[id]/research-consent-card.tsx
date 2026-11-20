'use client';

/**
 * ข้อความแจ้งและช่องยินยอมเพื่อการวิจัย (คำสั่ง operator 34(5), 2026-10-07).
 * The wording and its version come from GET /api/surveys/research-consent; the
 * server refuses an answer that does not carry the version shown here.
 */

import { Card, CardContent } from '@/components/ui/primitives/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PRIVACY_EMAIL } from '@/constants/contact-emails';

export interface ResearchConsentNotice {
  version: string;
  title: string;
  sections: { heading: string; body: string }[];
  acceptLabel: string;
}

interface ResearchConsentCardProps {
  notice: ResearchConsentNotice;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}

export function ResearchConsentCard({ notice, accepted, onAcceptedChange }: ResearchConsentCardProps) {
  return (
    <Card className="mt-6" data-testid="research-consent-card">
      <CardContent className="space-y-3 p-4 md:p-6">
        <h2 className="text-base font-semibold">{notice.title}</h2>
        <dl className="space-y-3 text-sm">
          {notice.sections.map((section) => (
            <div key={section.heading}>
              <dt className="font-medium">{section.heading}</dt>
              <dd className="mt-1 leading-6 text-muted-foreground">{section.body}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          สอบถามเรื่องข้อมูลส่วนบุคคลได้ที่ {PRIVACY_EMAIL}
        </p>
        <Checkbox
          checked={accepted}
          onCheckedChange={onAcceptedChange}
          label={notice.acceptLabel}
          required
        />
      </CardContent>
    </Card>
  );
}
