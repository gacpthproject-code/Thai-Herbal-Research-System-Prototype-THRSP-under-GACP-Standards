'use client';

/**
 * Whom the certificate is for, as staff read it on an application (order 142): the holder
 * record, whether the identity was verified by a login, and "ยังไม่ยืนยันตัวตน" for an
 * individual who typed it in after a password registration.
 */

import { BadgeCheck, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives/card';
import {
    HOLDER_PAGE_COPY_TH,
    HOLDER_TYPES,
    isUnverifiedPerson,
    type StaffHolder,
} from '@/lib/holder/holder-registry';

export type { StaffHolder };

/** The badge staff read next to a holder's name, or null for an organisation. */
export function UnverifiedHolderBadge({ holder }: { holder: { type: string; identitySource?: string | null } | null | undefined }) {
    if (!isUnverifiedPerson(holder)) { return null; }
    return <Badge tone="warning" className="rounded-md px-2 py-0 text-[11px]">{HOLDER_PAGE_COPY_TH.unverified}</Badge>;
}

export function StaffHolderCard({ holder }: { holder: StaffHolder }) {
    const def = HOLDER_TYPES[holder.type];
    const signatory = holder.signatory
        ? [holder.signatory.title, holder.signatory.firstName, holder.signatory.lastName].filter(Boolean).join(' ')
        : '';
    return (
        <Card className="overflow-hidden rounded-lg border-border bg-card shadow-none">
            <CardHeader className="border-b border-border/50 bg-muted/30 px-4 py-2.5">
                <CardTitle className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Building2 className="h-4 w-4 text-primary" /> ผู้ถือใบรับรอง
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 text-sm">
                <p className="text-base font-medium text-foreground">{holder.legalName || '-'}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral" className="rounded-md px-2 py-0 text-[11px]">{def.labelTh}</Badge>
                    <UnverifiedHolderBadge holder={holder} />
                    {holder.verified && (
                        <Badge tone="success" className="gap-1 rounded-md px-2 py-0 text-[11px]">
                            <BadgeCheck className="h-3 w-3" />
                            {HOLDER_PAGE_COPY_TH.verifiedBy[holder.identitySource as 'THAID' | 'MORPROM']}
                        </Badge>
                    )}
                </div>
                <p><span className="text-muted-foreground">{def.registrationLabelTh}</span> <span className="font-mono">{holder.registrationNo || '-'}</span></p>
                {def.signatoryLabelTh && <p><span className="text-muted-foreground">{def.signatoryLabelTh}</span> {signatory || '-'}</p>}
                {holder.contact && <p><span className="text-muted-foreground">ที่อยู่</span> {holder.contact.address || '-'}</p>}
                {holder.contact && <p><span className="text-muted-foreground">โทรศัพท์</span> {holder.contact.phone || '-'}</p>}
            </CardContent>
        </Card>
    );
}
