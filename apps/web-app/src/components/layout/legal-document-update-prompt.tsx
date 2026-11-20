'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/primitives/button';
import { formatThaiDate } from '@/lib/format/thai-date';
import {
    LEGAL_DOCUMENT_TITLE_TH, editionsToAcknowledge, grantPlatformConsents, platformConsentDocumentUrl,
    readConsentsPayload, wordingNotices, type ConsentScreen, type PendingEdition,
} from '@/lib/services/platform-consent';

type Status = { toAcknowledge: PendingEdition[]; notices: PendingEdition[] };

const ACTION_TH = { PRIVACY_POLICY: 'รับทราบ', TERMS_OF_SERVICE: 'ยอมรับข้อกำหนด' } as const;

const thaiDay = (iso: string) => formatThaiDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });

export function LegalDocumentUpdatePrompt() {
    const [status, setStatus] = useState<Status | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const pathname = usePathname();

    const load = useCallback(async () => {
        const payload = await readConsentsPayload();
        setStatus(payload ? { toAcknowledge: editionsToAcknowledge(payload), notices: wordingNotices(payload) } : null);
    }, []);

    useEffect(() => { void load(); }, [load, pathname]);

    const record = useCallback(async (edition: PendingEdition, source: ConsentScreen) => {
        setSaving(edition.category);
        setFailed(false);
        const refused = await grantPlatformConsents([edition.category], source);
        setFailed(refused.length > 0);
        await load();
        setSaving(null);
    }, [load]);

    if (!status || (status.toAcknowledge.length === 0 && status.notices.length === 0)) { return null; }

    return (
        <div className="mb-4 space-y-3">
            {status.toAcknowledge.length > 0 && (
                <section aria-labelledby="legal-update-title" className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
                    <h2 id="legal-update-title" className="text-base font-bold text-foreground">มีเอกสารฉบับใหม่ที่คุณต้องอ่าน</h2>
                    <p className="mt-1 text-sm text-foreground/80">
                        ระบบต้องได้รับการรับทราบหรือการยอมรับฉบับนี้ก่อนคุณยื่นคำขอ ส่งคำขอที่แก้ไขแล้ว หรือส่งหลักฐานการแก้ไขข้อบกพร่อง
                    </p>
                    <ul className="mt-3 space-y-3">
                        {status.toAcknowledge.map((edition) => (
                            <li key={edition.category} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-foreground">
                                    {LEGAL_DOCUMENT_TITLE_TH[edition.category]} ฉบับ {edition.version} มีผลตั้งแต่ {thaiDay(edition.effectiveDate)}{' '}
                                    <a href={platformConsentDocumentUrl(edition.category)} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">
                                        อ่านฉบับเต็ม
                                    </a>
                                </p>
                                <Button
                                    type="button"
                                    variant="primary"
                                    disabled={saving !== null}
                                    onClick={() => void record(edition, 'UPDATE_PROMPT')}
                                >
                                    {ACTION_TH[edition.category]}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {status.notices.map((edition) => (
                <section key={edition.category} aria-label="ประกาศปรับถ้อยคำ" className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-foreground">
                        {LEGAL_DOCUMENT_TITLE_TH[edition.category]} ปรับถ้อยคำเป็นฉบับ {edition.version} มีผลตั้งแต่ {thaiDay(edition.effectiveDate)} โดยไม่เปลี่ยนสาระสำคัญ{' '}
                        <a href={platformConsentDocumentUrl(edition.category)} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">
                            อ่านฉบับปรับปรุง
                        </a>
                    </p>
                    <Button type="button" variant="outline" disabled={saving !== null} onClick={() => void record(edition, 'WORDING_NOTICE')}>
                        รับทราบ
                    </Button>
                </section>
            ))}
            {failed && (
                <p role="alert" className="text-sm font-bold text-destructive">ระบบบันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
            )}
        </div>
    );
}
