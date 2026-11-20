'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { usePaymentMode } from '@/hooks/use-payment-mode';
import type { SettledPaymentMode } from '@/lib/payment/payment-mode';

export function TrialPaymentNotice({ className = '' }: { className?: string }) {
    const payment = usePaymentMode();
    if (payment.mode !== 'TRIAL') return null;
    return (
        <p
            role="note"
            data-trial-payment-notice
            className={`rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ${className}`}
        >
            {payment.copy.notice}
        </p>
    );
}

/**
 * A document about money that moved is stamped by the mode its settlement recorded
 * (`settledMode`); one with no settlement yet follows the key of the day.
 */
export function TrialMarkedDocument({
    className = '',
    children,
    settledMode = null,
    ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; settledMode?: SettledPaymentMode }) {
    const payment = usePaymentMode();
    const stamp = payment.mode !== 'UNKNOWN' && (settledMode ?? payment.mode) === 'TRIAL' ? payment.copy : null;
    return (
        <div {...rest} className={`relative ${className}`}>
            {children}
            {stamp ? (
                <div
                    data-trial-document-mark
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden print:fixed"
                >
                    <div
                        role="note"
                        className="-rotate-12 rounded-lg border-2 border-rose-700/40 px-3 py-1 text-center text-rose-700/60"
                    >
                        <div className="text-2xl font-bold leading-normal sm:text-4xl">{stamp.documentMark}</div>
                        <div className="pb-1 text-xs font-semibold leading-normal sm:text-sm">{stamp.documentMarkDetail}</div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
