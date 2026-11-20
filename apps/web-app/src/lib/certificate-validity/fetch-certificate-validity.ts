/**
 * Server-side read of GET /api/certificate-validity, for server components. Same
 * transport as fetchPublicFees (lib/pricing/fetch-public-fees.ts). Never throws:
 * anything but a readable rule resolves to { status: 'unavailable' }.
 */

import { INTERNAL_BACKEND_URL, SERVER_REQUEST_TIMEOUT_MS } from '@/config/server.config';
import { CERTIFICATE_VALIDITY_PATH, parseCertificateValidity, type ValidityState } from './certificate-validity';

/** How long a served rule may be reused by a server-rendered page. */
export const VALIDITY_REVALIDATE_SECONDS = 300;

export async function fetchCertificateValidity(): Promise<ValidityState> {
    try {
        const res = await fetch(`${INTERNAL_BACKEND_URL}${CERTIFICATE_VALIDITY_PATH}`, {
            headers: { Accept: 'application/json' },
            next: { revalidate: VALIDITY_REVALIDATE_SECONDS },
            signal: typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(SERVER_REQUEST_TIMEOUT_MS)
                : undefined,
        } as RequestInit);
        if (!res.ok) return { status: 'unavailable' };
        const body = (await res.json()) as { success?: boolean; data?: unknown };
        const validity = body?.success === true ? parseCertificateValidity(body.data) : null;
        return validity ? { status: 'ready', validity } : { status: 'unavailable' };
    } catch {
        return { status: 'unavailable' };
    }
}
