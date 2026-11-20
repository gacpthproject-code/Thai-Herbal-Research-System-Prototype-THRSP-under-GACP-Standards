"use client";

export const dynamic = 'force-dynamic';

/**
 * ต่ออายุใบรับรอง: shows the certificate, explains the three steps, and links to the
 * wizard. Opening this page creates nothing. A renewal is filed through the normal
 * wizard as requestType RENEWAL: a short document check, then the renewal fee once the
 * documents pass (paid on /health/payments like any application), then the site visit.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { apiClient as api } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { Card } from '@/components/ui/primitives/card';
import { HEALTH_LOGIN_ROUTE } from '@/lib/constants/auth-routes';
import { getStoredUser } from '@/lib/services/auth-service-session';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatThaiDate } from '@/lib/format/thai-date';
import type { Certificate } from './types';

/** Where "เริ่มยื่นต่ออายุ" goes: the wizard, preset to renew this certificate. */
function renewalWizardHref(certificateNumber: string): string {
    return `/health/applications/new?renew=${encodeURIComponent(certificateNumber)}`;
}

function RenewalLoadingFallback() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Spinner size="xl" />
        </div>
    );
}

type LoadState =
    | { status: 'loading' }
    | { status: 'ready'; certificate: Certificate }
    | { status: 'not-found' }
    | { status: 'failed' }
    | { status: 'no-cert-id' };

function RenewalContent() {
    const certId = useSearchParams().get('certId');
    const { dict } = useLanguage();
    const copy = dict.health.renewal;
    const [load, setLoad] = useState<LoadState>({ status: 'loading' });

    const loadCertificate = useCallback(async (id: string) => {
        setLoad({ status: 'loading' });
        try {
            const result = await api.get<Certificate>(`/api/certificates/${id}`);
            if (result.success && result.data) { setLoad({ status: 'ready', certificate: result.data }); return; }
            // A 4xx is the server's verdict (missing, or not this holder's): retrying will
            // not change it. Anything else is a failed read and gets a retry.
            setLoad(result.status !== undefined && result.status < 500 ? { status: 'not-found' } : { status: 'failed' });
        } catch {
            setLoad({ status: 'failed' });
        }
    }, []);

    useEffect(() => {
        if (!getStoredUser()) {
            window.location.href = HEALTH_LOGIN_ROUTE;
            return;
        }
        if (certId) { void loadCertificate(certId); } else { setLoad({ status: 'no-cert-id' }); }
    }, [certId, loadCertificate]);

    if (load.status === 'loading') return <RenewalLoadingFallback />;

    if (load.status === 'failed' && certId) {
        return (
            <div className="mx-auto max-w-3xl px-4 pt-16">
                <div role="status" data-testid="renewal-load-error" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-400/40 dark:bg-amber-950/40">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-200" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <p className="text-base font-bold text-amber-900 dark:text-amber-100">{copy.loadErrorTitle}</p>
                            <p className="mt-1 text-sm text-amber-800 dark:text-amber-100">{copy.loadErrorBody}</p>
                            {copy.loadErrorSubline ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-100">{copy.loadErrorSubline}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    data-testid="renewal-load-retry"
                                    onClick={() => { void loadCertificate(certId); }}
                                    className="inline-flex min-h-[44px] items-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800"
                                >
                                    {dict.common?.fetchError?.retry || 'ลองอีกครั้ง'}
                                </button>
                                <Link href="/health/certificates" className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-300 bg-card px-4 text-sm font-semibold text-amber-800 dark:text-amber-100">
                                    {copy.goToCertList}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (load.status !== 'ready') {
        return (
            <div className="mx-auto max-w-xl px-4 pt-16 text-center">
                <h1 className="mb-4 text-2xl font-semibold text-foreground">{copy.title}</h1>
                <p className="mb-6 text-muted-foreground">{load.status === 'not-found' ? copy.errorNoCert : copy.noCertBody}</p>
                <Link href="/health/certificates" className="inline-flex items-center rounded-xl bg-leaf-700 px-7 py-3.5 font-semibold text-white hover:bg-leaf-800">
                    {copy.goToCertList}
                </Link>
            </div>
        );
    }

    const { certificate } = load;
    const facts: ReadonlyArray<{ label: string; value: string }> = [
        { label: copy.certNumber, value: certificate.certificateNumber },
        ...(certificate.holderDisplayName ? [{ label: copy.holder, value: certificate.holderDisplayName }] : []),
        { label: copy.farm, value: certificate.farmName || '-' },
        { label: copy.expiry, value: formatThaiDate(certificate.expiryDate) },
    ];

    return (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
            <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>

            <Card className="p-5">
                <h2 className="mb-3 text-sm font-semibold text-foreground">{copy.certHeading}</h2>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    {facts.map((fact) => (
                        <div key={fact.label}>
                            <dt className="text-muted-foreground">{fact.label}</dt>
                            <dd className="font-medium text-foreground">{fact.value}</dd>
                        </div>
                    ))}
                </dl>
            </Card>

            <Card className="p-5">
                <h2 className="mb-4 text-sm font-semibold text-foreground">{copy.stepsHeading}</h2>
                <ol className="space-y-4">
                    {copy.steps.map((step, index) => (
                        <li key={step.title} className="flex gap-3">
                            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-sm font-bold text-leaf-onSoft">
                                {index + 1}
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </Card>

            <div className="space-y-2">
                <Link
                    href={renewalWizardHref(certificate.certificateNumber)}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-leaf-700 px-6 text-sm font-semibold text-white hover:bg-leaf-800 sm:w-auto"
                >
                    {copy.startCta}
                </Link>
                <p className="text-xs text-muted-foreground">{copy.startNote}</p>
            </div>
        </div>
    );
}

export default function RenewalPage() {
    return <Suspense fallback={<RenewalLoadingFallback />}><RenewalContent /></Suspense>;
}
