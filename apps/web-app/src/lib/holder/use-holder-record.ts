'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/api-client';
import { HOLDER_PAGE_COPY_TH, type HolderRecord } from './holder-registry';

export interface HolderEntityResponse {
    id: string;
    type: HolderRecord['type'];
    slug: string | null;
    displayName: string;
    role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'VIEWER' | null;
    permissions: string[];
    holder: HolderRecord | null;
}

export interface HolderRecordState {
    entity: HolderEntityResponse | null;
    holder: HolderRecord | null;
    /** true until the first answer for this id lands. */
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
}

/** The holder record of one entity, read from the server, with honest loading and error states. */
export function useHolderRecord(entityId: string | null | undefined): HolderRecordState {
    const [entity, setEntity] = useState<HolderEntityResponse | null>(null);
    const [loading, setLoading] = useState(Boolean(entityId));
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!entityId) {
            setEntity(null);
            setLoading(false);
            return;
        }
        try {
            const response = await apiClient.get<HolderEntityResponse>(`/entities/${encodeURIComponent(entityId)}`);
            if (response.success && response.data) {
                setEntity(response.data);
                setError(null);
            } else {
                setError(HOLDER_PAGE_COPY_TH.loadFailed);
            }
        } catch {
            setError(HOLDER_PAGE_COPY_TH.loadFailed);
        } finally {
            setLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        setLoading(Boolean(entityId));
        void reload();
    }, [entityId, reload]);

    return { entity, holder: entity?.holder ?? null, loading, error, reload };
}
