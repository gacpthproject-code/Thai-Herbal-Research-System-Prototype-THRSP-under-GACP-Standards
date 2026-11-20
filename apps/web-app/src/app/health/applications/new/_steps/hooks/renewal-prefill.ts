import type { WizardState } from './use-application-flow-store.state-types';

/** The answers POST /applications/draft filled in from the renewed certificate's filing. */
export type RenewalPrefill = Partial<Pick<WizardState, 'farmData' | 'varieties' | 'varietiesNote' | 'processing' | 'certificationPurposes'>>;

function isBlank(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every(isBlank);
    return false;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The part of the server's prefill to load: an answer the applicant gave meanwhile is theirs.
 * `farmData` is taken field by field, so a site name typed while the save was in flight keeps
 * the address and land fields the server filled around it.
 */
export function prefillToLoad(prefill: RenewalPrefill | null | undefined, state: Partial<WizardState>): RenewalPrefill {
    const load: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(prefill ?? {})) {
        if (key === 'farmData') {
            const have: Record<string, unknown> = isPlainObject(state.farmData) ? state.farmData : {};
            const blanks = Object.entries(isPlainObject(value) ? value : {}).filter(([field]) => isBlank(have[field]));
            if (blanks.length > 0) load.farmData = { ...have, ...Object.fromEntries(blanks) };
            continue;
        }
        if (isBlank(state[key as keyof WizardState])) load[key] = value;
    }
    return load as RenewalPrefill;
}
