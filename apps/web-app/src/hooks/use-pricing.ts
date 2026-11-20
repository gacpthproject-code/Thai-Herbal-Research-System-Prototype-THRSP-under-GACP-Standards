'use client';

/**
 * usePricing: the served fee table for client components.
 *
 * Reads GET /api/pricing/fees through apiClient (the proxy) on mount. There is
 * no local fallback table any more: DEFAULT_FEES and the constants it was built
 * from printed the old price whenever this request failed, and would have kept
 * printing it after a fee changed in the fee engine (config/business-rules.js,
 * served by /api/pricing/fees; SystemConfig fee.* rows are not applied, operator
 * 2026-10-03). A screen now
 * gets `state.status === 'unavailable'` and shows feesNotice(state) instead of
 * a number (src/lib/pricing/public-fees.ts).
 */

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/api-client';
import {
    PRICING_FEES_PATH,
    parsePublicFees,
    type FeesState,
    type PublicFees,
} from '@/lib/pricing/public-fees';

export type { PublicFees, FeesState } from '@/lib/pricing/public-fees';

interface UsePricingResult {
    state: FeesState;
    /** The served fees, or null while loading or when they cannot be read. */
    fees: PublicFees | null;
    refetch: () => Promise<void>;
}

export function usePricing(): UsePricingResult {
    const [state, setState] = useState<FeesState>({ status: 'loading' });

    const fetchFees = useCallback(async () => {
        setState({ status: 'loading' });
        try {
            const res = await apiClient.get<unknown>(PRICING_FEES_PATH);
            const fees = res.success ? parsePublicFees(res.data) : null;
            setState(fees ? { status: 'ready', fees } : { status: 'unavailable' });
        } catch {
            setState({ status: 'unavailable' });
        }
    }, []);

    useEffect(() => {
        void fetchFees();
    }, [fetchFees]);

    return {
        state,
        fees: state.status === 'ready' ? state.fees : null,
        refetch: fetchFees,
    };
}
