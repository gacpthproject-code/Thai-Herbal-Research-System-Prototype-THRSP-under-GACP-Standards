'use client';

/**
 * The person on site, name and phone: the only contact of an applicant the dispatcher (booking the
 * visit) and the field inspector (assigned to it) read (orders 29 and 56(3)). It is fetched only
 * when asked for, because the server writes an audit row for every view.
 */

import { useState } from 'react';
import { Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/primitives/button';
import { apiClient } from '@/lib/api/api-client';
import { providerApiPaths } from '@/lib/services/provider-api';
import { formatThaiDate } from '@/lib/format/thai-date';

const NONE_GIVEN_TH = 'ยังไม่มีผู้ติดต่อหน้างาน';

interface SiteContact {
    applicationNumber: string;
    siteContactName: string | null;
    sitePhone: string | null;
}

type ContactState =
    | { status: 'hidden' }
    | { status: 'loading' }
    | { status: 'shown'; contact: SiteContact }
    | { status: 'failed'; message: string };

/**
 * One card per application: handed another application it starts closed again, and an answer still
 * on its way for the application shown before lands in a card no longer on screen.
 */
export function SiteContactCard({ applicationId, given, requestedAt = null, requestPending = false }: SiteContactCardProps) {
    return (
        <SiteContactOfOneApplication
            key={applicationId}
            applicationId={applicationId}
            given={given}
            requestedAt={requestedAt}
            requestPending={requestPending}
        />
    );
}

interface SiteContactCardProps {
    applicationId: string;
    /** The queue's word on whether the filing names someone on site (order 65(2)); unknown when absent. */
    given?: boolean | undefined;
    /** When the applicant was asked to add one. */
    requestedAt?: string | null | undefined;
    /** The server's word that the system will still ask (jobs/site-contact-request-job.js); no promise without it. */
    requestPending?: boolean | undefined;
}

function NoneGiven({ requestedAt, requestPending }: { requestedAt: string | null; requestPending: boolean }) {
    const asked = requestedAt
        ? `ระบบแจ้งให้ผู้ยื่นเพิ่มแล้วเมื่อ ${formatThaiDate(requestedAt)}`
        : requestPending ? 'ระบบจะแจ้งให้ผู้ยื่นเพิ่มผู้ติดต่อหน้างาน' : null;
    return (
        <div className="space-y-1 text-sm">
            <p className="font-medium text-destructive">{NONE_GIVEN_TH}</p>
            {asked && <p className="text-xs text-muted-foreground">{asked}</p>}
        </div>
    );
}

function SiteContactOfOneApplication({ applicationId, given, requestedAt, requestPending }: SiteContactCardProps) {
    const [state, setState] = useState<ContactState>({ status: 'hidden' });

    const reveal = async () => {
        setState({ status: 'loading' });
        try {
            const res = await apiClient.get<SiteContact>(providerApiPaths.applicationSiteContact(applicationId));
            if (res.success && res.data) {
                setState({ status: 'shown', contact: res.data });
                return;
            }
            setState({
                status: 'failed',
                message: res.status === 503
                    ? 'ระบบบันทึกการเปิดดูไม่ได้ จึงยังแสดงข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง'
                    : 'เปิดข้อมูลผู้ติดต่อหน้างานของคำขอนี้ไม่ได้',
            });
        } catch {
            setState({ status: 'failed', message: 'เปิดข้อมูลผู้ติดต่อหน้างานไม่ได้ กรุณาลองใหม่อีกครั้ง' });
        }
    };

    const noneGiven = given === false || (state.status === 'shown' && !state.contact.siteContactName && !state.contact.sitePhone);

    return (
        <section className="space-y-2 rounded-lg border border-border p-4" data-testid="site-contact-card">
            <p className="text-sm font-bold text-foreground">ผู้ติดต่อหน้างาน</p>
            {noneGiven ? (
                <NoneGiven requestedAt={requestedAt ?? null} requestPending={requestPending ?? false} />
            ) : state.status === 'shown' ? (
                <div className="space-y-1 text-sm">
                    <p className="flex items-center gap-2 text-foreground">
                        <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" focusable="false" />
                        {state.contact.siteContactName || 'ผู้ยื่นไม่ได้ระบุชื่อ'}
                    </p>
                    <p className="flex items-center gap-2 text-foreground">
                        <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" focusable="false" />
                        {state.contact.sitePhone
                            ? <a className="underline" href={`tel:${state.contact.sitePhone.replace(/[^\d+]/g, '')}`}>{state.contact.sitePhone}</a>
                            : 'ผู้ยื่นไม่ได้ระบุเบอร์'}
                    </p>
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">ระบบบันทึกทุกครั้งที่เปิดดูข้อมูลนี้</p>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-[44px]"
                        disabled={state.status === 'loading'}
                        onClick={reveal}
                    >
                        {state.status === 'loading' ? 'กำลังเปิด' : 'ดูชื่อและเบอร์ผู้ติดต่อหน้างาน'}
                    </Button>
                    {state.status === 'failed' && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
                </>
            )}
        </section>
    );
}
