'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/api-client';
import {
    PAYMENT_MODE_PATH,
    UNKNOWN_PAYMENT_MODE,
    parsePaymentMode,
    type PaymentMode,
} from '@/lib/payment/payment-mode';

let pending: Promise<PaymentMode> | null = null;

function loadPaymentMode(): Promise<PaymentMode> {
    if (!pending) {
        pending = apiClient
            .get<unknown>(PAYMENT_MODE_PATH)
            .then((res) => (res.success ? parsePaymentMode(res.data) : UNKNOWN_PAYMENT_MODE))
            .catch(() => UNKNOWN_PAYMENT_MODE)
            .then((mode) => {
                if (mode.mode === 'UNKNOWN') pending = null;
                return mode;
            });
    }
    return pending;
}

export function __resetPaymentModeForTests(): void {
    pending = null;
}

export function usePaymentMode(): PaymentMode {
    const [mode, setMode] = useState<PaymentMode>(UNKNOWN_PAYMENT_MODE);
    useEffect(() => {
        let cancelled = false;
        void loadPaymentMode().then((m) => {
            if (!cancelled) setMode(m);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return mode;
}
