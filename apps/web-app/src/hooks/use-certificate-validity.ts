'use client';

/** The served certificate term for client components (see lib/certificate-validity). */

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/api-client';
import {
    CERTIFICATE_VALIDITY_PATH,
    parseCertificateValidity,
    type ValidityState,
} from '@/lib/certificate-validity/certificate-validity';

export function useCertificateValidity(): ValidityState {
    const [state, setState] = useState<ValidityState>({ status: 'loading' });
    useEffect(() => {
        let live = true;
        apiClient.get<unknown>(CERTIFICATE_VALIDITY_PATH)
            .then((res) => {
                const validity = res.success ? parseCertificateValidity(res.data) : null;
                if (live) setState(validity ? { status: 'ready', validity } : { status: 'unavailable' });
            })
            .catch(() => {
                if (live) setState({ status: 'unavailable' });
            });
        return () => {
            live = false;
        };
    }, []);
    return state;
}
