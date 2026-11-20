'use client';

import { useState } from 'react';
import { IconPhone, IconUser } from '@tabler/icons-react';

import { Card } from '@/components/ui/primitives/card';
import { Button } from '@/components/ui/primitives/button';
import { api } from '@/lib/api/api-client';
import { siteContactGaps } from '@gacp/validation/site-contact';
import { STEP3_COPY_TH, sitePhoneLooksWrong } from '../new/_steps/steps/step3-site-land-config';
import type { SiteContactView } from './application-detail-page-config';

interface ContactDraft {
  siteContactName: string;
  sitePhone: string;
  siteContactIsApplicant: boolean;
  siteContactInformed: boolean;
}

const draftOf = (contact: SiteContactView): ContactDraft => ({
  siteContactName: contact.siteContactName ?? '',
  sitePhone: contact.sitePhone ?? '',
  siteContactIsApplicant: contact.siteContactIsApplicant,
  siteContactInformed: false,
});

/**
 * The person on site (order 65(2)): who the dispatcher calls to book the visit and the field
 * inspector meets at the site. The applicant changes it here until the visit, under the rule the
 * wizard runs; a filing without one says so and asks for it.
 */
export function ApplicantSiteContactCard({ applicationId, contact, me = null }: {
  applicationId: string;
  contact: SiteContactView;
  me?: { name: string; phone: string } | null;
}) {
  const [shown, setShown] = useState(contact);
  const [editing, setEditing] = useState(contact.missing && contact.editable);
  const [draft, setDraft] = useState<ContactDraft>(() => draftOf(contact));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = siteContactGaps(draft).length === 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    const response = await api.patch<{ siteContactName: string; sitePhone: string; siteContactIsApplicant: boolean }>(
      `/applications/${encodeURIComponent(applicationId)}/site-contact`, draft,
    );
    setSaving(false);
    if (!response.success || !response.data) {
      setError(response.error || 'บันทึกผู้ติดต่อหน้างานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      return;
    }
    setShown({ ...shown, ...response.data, missing: false });
    setEditing(false);
  };

  return (
    <Card className="p-5 sm:p-6" data-testid="applicant-site-contact-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{STEP3_COPY_TH.siteContactHeading}</h2>
        {shown.editable && !editing && (
          <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => { setDraft(draftOf(shown)); setEditing(true); }}>
            แก้ไขผู้ติดต่อหน้างาน
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{STEP3_COPY_TH.siteContactHelp}</p>

      {!editing && (shown.missing ? (
        <p role="status" className="mt-3 text-sm font-medium text-destructive">ยังไม่มีผู้ติดต่อหน้างาน</p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-1.5"><IconUser size={14} aria-hidden="true" /><dt className="sr-only">{STEP3_COPY_TH.siteContactName}</dt><dd className="font-semibold text-foreground">{shown.siteContactName}</dd></div>
          <div className="flex items-center gap-1.5"><IconPhone size={14} aria-hidden="true" /><dt className="sr-only">{STEP3_COPY_TH.sitePhone}</dt><dd className="font-semibold text-foreground">{shown.sitePhone}</dd></div>
        </dl>
      ))}

      {editing && (
        <div className="mt-3 space-y-3">
          {shown.missing && <p role="status" className="text-sm font-medium text-destructive">ยังไม่มีผู้ติดต่อหน้างาน กรุณาเพิ่มก่อนวันนัด</p>}
          {me && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setDraft({ siteContactName: me.name, sitePhone: me.phone, siteContactIsApplicant: true, siteContactInformed: false })}
            >
              {STEP3_COPY_TH.useMyContact}
            </Button>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="applicant-site-contact-name" className="block text-sm font-medium text-foreground">{STEP3_COPY_TH.siteContactName}</label>
              <input
                id="applicant-site-contact-name"
                value={draft.siteContactName}
                onChange={(e) => setDraft({ ...draft, siteContactName: e.target.value, siteContactIsApplicant: false })}
                className="w-full rounded-xl border-2 border-muted bg-card px-4 py-2.5 text-sm text-foreground focus:border-leaf-700 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="applicant-site-phone" className="block text-sm font-medium text-foreground">{STEP3_COPY_TH.sitePhone}</label>
              <input
                id="applicant-site-phone"
                type="tel"
                value={draft.sitePhone}
                onChange={(e) => setDraft({ ...draft, sitePhone: e.target.value, siteContactIsApplicant: false })}
                aria-invalid={sitePhoneLooksWrong(draft.sitePhone) ? true : undefined}
                className="w-full rounded-xl border-2 border-muted bg-card px-4 py-2.5 text-sm text-foreground focus:border-leaf-700 focus:outline-none"
              />
              {sitePhoneLooksWrong(draft.sitePhone) && <p role="alert" className="text-xs text-destructive">{STEP3_COPY_TH.sitePhoneInvalid}</p>}
            </div>
          </div>
          {!draft.siteContactIsApplicant && (
            <label htmlFor="applicant-site-contact-informed" className="flex min-h-[44px] cursor-pointer items-start gap-2 text-sm text-foreground">
              <input
                id="applicant-site-contact-informed"
                type="checkbox"
                checked={draft.siteContactInformed}
                onChange={(e) => setDraft({ ...draft, siteContactInformed: e.target.checked })}
                className="mt-1"
              />
              <span>{STEP3_COPY_TH.siteContactInformed}</span>
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="min-h-[44px]" disabled={!complete || saving} onClick={() => { void save(); }}>
              {saving ? 'กำลังบันทึก' : 'บันทึกผู้ติดต่อหน้างาน'}
            </Button>
            {!shown.missing && (
              <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setEditing(false)}>ยกเลิก</Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
