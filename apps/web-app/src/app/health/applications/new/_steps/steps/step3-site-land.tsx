'use client';

/**
 * Step 3 — สถานที่ปลูกและสิทธิในที่ดิน (กทล.1 ส่วนที่ ๒ ข้อ ๑-๒).
 *
 * Two of the answers on this screen are DIMENSIONS the requirement register matches
 * rules on: `landOwnership` and `areaType`. Changing either changes which papers the
 * filing owes — a lease pulls in the landlord's consent, an อาคารระบบปิด pulls in the
 * building plan. So the container re-ASKS the server after they change instead of
 * keeping its own idea of the required set, and every card says why it appeared.
 *
 * The field list is the paper's and only the paper's. v1's site step had grown a water
 * system and an expected-yield estimate, neither of which กทล.1 asks; each was a thing a
 * farmer had to answer before they could file and that nobody was entitled to require.
 */

import { useEffect, useRef, useState } from 'react';
import { useApplicationFlowStore } from '../hooks/use-application-flow-store';
import { useRequirementSlots, SLOTS_LOADING_TH, SLOTS_PENDING_TH } from '../hooks/use-requirement-slots';
import { RequirementSlotCard } from './requirement-slot-card';
import { ChoiceGroup, TickBox } from '@/components/ui/choice';
import {
    LAND_TENURE_OPTIONS,
    AREA_TYPE_OPTIONS,
    GROWING_MEDIUM_OPTIONS,
    asksGrowingMedium,
    LAND_DOCUMENT_FIELDS,
    STEP3_SITE_SLOT_IDS,
    STEP3_COPY_TH,
    needsLandlordName,
    needsConsentValidUntil,
    consentEndsBeforeCertificateExpiry,
    sitePhoneLooksWrong,
    siteStarted,
    step3FieldErrors,
    siteFieldAsked,
    SITE_FIELD_KEYS,
    CONSENT_ENDS_EARLY_TH,
    type LandTenure,
    type SiteAreaType,
    type GrowingMedium,
} from './step3-site-land-config';
import { carriedOverNotice } from './step1-request-type-config';
import type { RequestType } from '../hooks/use-application-flow-store.state-types';
import type { RequirementSlot } from '@/lib/services/application-requirements';
import { useCertificateValidity } from '@/hooks/use-certificate-validity';
import { bangkokTodayIso } from '@/lib/format/thai-date';
import { getStoredUser } from '@/lib/services/auth-service-session';

export interface Step3SiteLandProps {
    farmData: Record<string, unknown>;
    /** The server's answer. Never a list this screen keeps. */
    slots: readonly RequirementSlot[];
    appId: string;
    onChange: (key: string, value: unknown) => void;
    /** Several answers at once (the one-tap contact fill). Defaults to one onChange per key. */
    onPatch?: (patch: Record<string, unknown>) => void;
    onChanged: () => void;
    /** The applicant's own name and phone, for "ใช้ชื่อและเบอร์ของฉัน"; null when either is unknown. */
    me?: { name: string; phone: string } | null;
    /** The server's word that this filing still takes document writes (delete control). */
    editable?: boolean;
    /** The served certificate term in months; null while unread or unavailable. */
    certificateValidityMonths?: number | null;
    /** Today in Bangkok, yyyy-mm-dd. */
    todayIso?: string;
    /** The certificate asked for; a PROCESSING filing is not asked its planting volume. */
    certScope?: 'PLANTING' | 'PROCESSING' | null;
    /** A replacement is asked none of the ข้อ ๒ fields; a renewal shows the carried-over answers. */
    requestType?: RequestType | null;
    /** The draft is still being read from the server; its gaps are named once it lands. */
    hydrating?: boolean;
}

function Text({ id, label, value, onChange, onBlur, required = false, type = 'text', error = null }: {
    id: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
    required?: boolean; type?: string; error?: string | null;
}) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium text-foreground">
                {label}
                {required && <span aria-hidden className="ml-1 text-destructive">*</span>}
                {required && <span className="sr-only"> (บังคับ)</span>}
            </label>
            <input
                id={id}
                type={type}
                inputMode={type === 'number' ? 'numeric' : undefined}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className="w-full rounded-xl border-2 border-muted bg-card px-4 py-2.5 text-sm text-foreground focus:border-leaf-700 focus:outline-none"
            />
            {error && <p id={`${id}-error`} role="alert" className="text-[13px] text-destructive">{error}</p>}
        </div>
    );
}

export function Step3SiteLand({
    farmData, slots, appId, onChange, onPatch, onChanged, editable = false,
    certificateValidityMonths = null, todayIso = bangkokTodayIso(), me = null,
    certScope = null, requestType = null, hydrating = false,
}: Step3SiteLandProps) {
    const filing = { certScope, requestType };
    const str = (key: string) => String(farmData[key] ?? '');
    const patch = onPatch ?? ((values: Record<string, unknown>) => Object.entries(values).forEach(([key, value]) => onChange(key, value)));
    const contactIsApplicant = farmData.siteContactIsApplicant === true;
    const landOwnership = (farmData.landOwnership as LandTenure | undefined) ?? null;
    const areaTypes = Array.isArray(farmData.areaTypes) ? (farmData.areaTypes as SiteAreaType[]) : [];
    const landDoc = (farmData.landDocumentDetail ?? {}) as Record<string, string>;

    // Order 143(4): what กทล.1 ข้อ ๒ still lacks, said under the box once the applicant has left
    // it, or at once when what they typed is not what the paper asks for (a position that is
    // not two numbers, a count of zero). Untouched blanks keep their asterisk and no red text,
    // except on a draft that arrives here already started (resumed, or bounced back by the
    // route guard): every gap is named the moment it lands, so a dead ถัดไป is never silent.
    const started = siteStarted(farmData);
    const landed = !hydrating;
    const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set(landed && started ? SITE_FIELD_KEYS : []));
    const startedRef = useRef(started);
    startedRef.current = started;
    useEffect(() => {
        if (landed && startedRef.current) { setTouched(new Set(SITE_FIELD_KEYS)); }
    }, [landed]);
    const touch = (key: string) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    const gaps = step3FieldErrors(farmData, filing);
    const asked = (key: string) => siteFieldAsked(key, filing);
    const volumeRequired = asked('plantsPerCycle');
    const notice = carriedOverNotice(requestType);
    const stated = (value: unknown) => String(value ?? '').trim() !== '';
    const shown = (key: string, value: unknown): string | null =>
        (gaps[key] && (touched.has(key) || stated(value))) ? gaps[key] : null;
    const landTouched = Array.from(touched).some((key) => key.startsWith('landDocumentDetail.') || key === 'landlordName');

    const toggleAreaType = (value: SiteAreaType) => {
        // A checkbox row on the paper: a farm with a greenhouse standing in an open
        // field ticks two, and owes the papers of both.
        const next = areaTypes.includes(value)
            ? areaTypes.filter((v) => v !== value)
            : [...areaTypes, value];
        patch(asksGrowingMedium(next) ? { areaTypes: next } : { areaTypes: next, growingMedium: undefined });
    };
    const growingMedium = (farmData.growingMedium as GrowingMedium | undefined) ?? null;

    const siteSlots = STEP3_SITE_SLOT_IDS
        .map((id) => slots.find((s) => s.slotId === id))
        .filter((s): s is RequirementSlot => Boolean(s));

    return (
        <div className="space-y-8">
            {notice && (
                <p role="status" className="rounded-xl border border-leaf-300 bg-leaf-soft px-4 py-3 text-sm leading-relaxed text-foreground">
                    {notice}
                </p>
            )}
            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{STEP3_COPY_TH.siteHeading}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Text id="site-name" label={STEP3_COPY_TH.siteName} value={str('siteName')} onChange={(v) => onChange('siteName', v)} required />
                    <div className="sm:col-span-2">
                        <Text id="site-address" label={STEP3_COPY_TH.siteAddress} value={str('siteAddress')} onChange={(v) => onChange('siteAddress', v)} required />
                    </div>
                    <Text id="site-subdistrict" label={STEP3_COPY_TH.siteSubDistrict} value={str('subDistrict')} onChange={(v) => onChange('subDistrict', v)} required />
                    <Text id="site-district" label={STEP3_COPY_TH.siteDistrict} value={str('district')} onChange={(v) => onChange('district', v)} required />
                    <Text id="site-province" label={STEP3_COPY_TH.siteProvince} value={str('province')} onChange={(v) => onChange('province', v)} required />
                    <Text id="site-postal-code" label={STEP3_COPY_TH.sitePostalCode} value={str('postalCode')} onChange={(v) => onChange('postalCode', v)} />
                    <Text
                        id="coordinates"
                        label={STEP3_COPY_TH.coordinates}
                        value={str('coordinates')}
                        onChange={(v) => onChange('coordinates', v)}
                        onBlur={() => touch('coordinates')}
                        error={shown('coordinates', farmData.coordinates)}
                        required={asked('coordinates')}
                    />
                </div>
            </section>

            <section className="space-y-3" data-testid="site-contact-section">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{STEP3_COPY_TH.siteContactHeading}</h3>
                    {me && (
                        <button
                            type="button"
                            onClick={() => patch({ siteContactName: me.name, sitePhone: me.phone, siteContactIsApplicant: true })}
                            className="min-h-[44px] rounded-xl border-2 border-leaf-700 px-3 py-2 text-sm font-medium text-foreground hover:bg-leaf-soft"
                        >
                            {STEP3_COPY_TH.useMyContact}
                        </button>
                    )}
                </div>
                <p className="text-[13px] text-foreground/80">{STEP3_COPY_TH.siteContactHelp}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Text
                        id="site-contact-name"
                        label={STEP3_COPY_TH.siteContactName}
                        value={str('siteContactName')}
                        onChange={(v) => patch({ siteContactName: v, siteContactIsApplicant: false })}
                        required
                    />
                    <Text
                        id="site-phone"
                        label={STEP3_COPY_TH.sitePhone}
                        value={str('sitePhone')}
                        onChange={(v) => patch({ sitePhone: v, siteContactIsApplicant: false })}
                        type="tel"
                        required
                        error={sitePhoneLooksWrong(farmData.sitePhone) ? STEP3_COPY_TH.sitePhoneInvalid : null}
                    />
                </div>
                {!contactIsApplicant && (
                    <label htmlFor="site-contact-informed" className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-foreground">
                        <span className="mt-0.5 flex">
                            <TickBox
                                id="site-contact-informed"
                                checked={farmData.siteContactInformed === true}
                                onCheckedChange={(checked) => onChange('siteContactInformed', checked)}
                            />
                        </span>
                        <span>{STEP3_COPY_TH.siteContactInformed}</span>
                    </label>
                )}
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{STEP3_COPY_TH.landHeading}</h3>
                <div className="space-y-2">
                    <p id="land-ownership-label" className="text-sm font-medium text-foreground">
                        {STEP3_COPY_TH.landOwnership}
                        {asked('landOwnership') && <span aria-hidden className="ml-1 text-destructive">*</span>}
                        {asked('landOwnership') && <span className="sr-only"> (บังคับ)</span>}
                    </p>
                    {gaps.landOwnership && landTouched && (
                        <p id="land-ownership-error" role="alert" className="text-[13px] text-destructive">{gaps.landOwnership}</p>
                    )}
                    <ChoiceGroup
                        mode="single"
                        labelledBy="land-ownership-label"
                        className="sm:grid-cols-2"
                        options={LAND_TENURE_OPTIONS}
                        isChecked={(value) => landOwnership === value}
                        onPick={(value) => onChange('landOwnership', value)}
                    />
                </div>

                {needsLandlordName(landOwnership) && (
                    <Text
                        id="landlord-name"
                        label={STEP3_COPY_TH.landlordName}
                        value={str('landlordName')}
                        onChange={(v) => onChange('landlordName', v)}
                        onBlur={() => touch('landlordName')}
                        error={shown('landlordName', farmData.landlordName)}
                        required={asked('landlordName')}
                    />
                )}

                {needsConsentValidUntil(landOwnership) && (
                    <div className="space-y-2">
                        <Text
                            id="land-consent-valid-until"
                            label={STEP3_COPY_TH.landConsentValidUntil}
                            value={str('landConsentValidUntil')}
                            onChange={(v) => onChange('landConsentValidUntil', v)}
                            type="date"
                        />
                        {consentEndsBeforeCertificateExpiry(str('landConsentValidUntil'), {
                            todayIso, months: certificateValidityMonths,
                        }) && (
                            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100">
                                {CONSENT_ENDS_EARLY_TH}
                            </p>
                        )}
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    {LAND_DOCUMENT_FIELDS.map((field) => (
                        <Text
                            key={field.key}
                            id={`land-doc-${field.key}`}
                            label={field.labelTH}
                            value={String(landDoc[field.key] ?? '')}
                            onChange={(v) => onChange('landDocumentDetail', { ...landDoc, [field.key]: v })}
                            onBlur={() => touch(`landDocumentDetail.${field.key}`)}
                            error={shown(`landDocumentDetail.${field.key}`, landDoc[field.key])}
                            required={field.required && asked(`landDocumentDetail.${field.key}`)}
                        />
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{STEP3_COPY_TH.scaleHeading}</h3>
                <div className="space-y-2">
                    <p id="area-type-label" className="text-sm font-medium text-foreground">{STEP3_COPY_TH.areaType}</p>
                    <ChoiceGroup
                        mode="multi"
                        labelledBy="area-type-label"
                        className="sm:grid-cols-4"
                        options={AREA_TYPE_OPTIONS}
                        isChecked={(value) => areaTypes.includes(value)}
                        onPick={toggleAreaType}
                    />
                </div>

                {asksGrowingMedium(areaTypes) && (
                    <div className="space-y-2">
                        <p id="growing-medium-label" className="text-sm font-medium text-foreground">
                            {STEP3_COPY_TH.growingMedium}
                            <span aria-hidden className="ml-1 text-destructive">*</span>
                            <span className="sr-only"> (บังคับ)</span>
                        </p>
                        <p className="text-[13px] text-foreground/80">{STEP3_COPY_TH.growingMediumHelp}</p>
                        {gaps.growingMedium && touched.has('growingMedium') && (
                            <p role="alert" className="text-[13px] text-destructive">{gaps.growingMedium}</p>
                        )}
                        <ChoiceGroup
                            mode="single"
                            labelledBy="growing-medium-label"
                            className="sm:grid-cols-2"
                            options={GROWING_MEDIUM_OPTIONS}
                            isChecked={(value) => growingMedium === value}
                            onPick={(value) => onChange('growingMedium', value)}
                        />
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                    <Text id="area-sqm" label={STEP3_COPY_TH.areaSqm} value={str('areaSqm')} onChange={(v) => onChange('areaSqm', v)} type="number" required />
                    <Text
                        id="plants-per-cycle"
                        label={STEP3_COPY_TH.plantsPerCycle}
                        value={str('plantsPerCycle')}
                        onChange={(v) => onChange('plantsPerCycle', v)}
                        onBlur={() => touch('plantsPerCycle')}
                        error={shown('plantsPerCycle', farmData.plantsPerCycle)}
                        type="number"
                        required={volumeRequired}
                    />
                    <Text
                        id="cycles-per-year"
                        label={STEP3_COPY_TH.cyclesPerYear}
                        value={str('cyclesPerYear')}
                        onChange={(v) => onChange('cyclesPerYear', v)}
                        onBlur={() => touch('cyclesPerYear')}
                        error={shown('cyclesPerYear', farmData.cyclesPerYear)}
                        type="number"
                        required={volumeRequired}
                    />
                </div>
            </section>

            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">{STEP3_COPY_TH.documentsHeading}</h3>
                <p role="status" className="rounded-xl border border-leaf-300 bg-leaf-soft px-4 py-3 text-[13px] leading-relaxed text-foreground">
                    {STEP3_COPY_TH.conditionalExplainer}
                </p>
                <div className="space-y-3">
                    {siteSlots.map((slot) => (
                        <RequirementSlotCard key={slot.slotId} slot={slot} appId={appId} onChanged={onChanged} editable={editable} stepKey="site-land" />
                    ))}
                </div>
            </section>
        </div>
    );
}

export default Step3SiteLand;

/**
 * The routed step. Re-asks the server whenever a dimension changes, because the answer
 * to "which papers does this filing owe" is the server's and changes with these fields.
 */
export function Step3SiteLandStep() {
    const { state, setFarmData } = useApplicationFlowStore();
    const validity = useCertificateValidity();

    const appId = state.applicationId ?? '';
    const farmData = (state.farmData ?? {}) as unknown as Record<string, unknown>;
    const me = myContact(getStoredUser(), state.applicantData as unknown as Record<string, unknown> | null);
    // Honest states (2026-09-06): a missing appId or an in-flight read must never
    // render this step's conditional-documents section as empty-because-nothing-owed.
    const { slots, loading, error: loadError, pending, editable, reload } = useRequirementSlots(appId);
    // The two dimensions. Re-fetch keys off them so a changed answer re-asks the law.
    const dimensionKey = `${String(farmData.landOwnership ?? '')}|${JSON.stringify(farmData.areaTypes ?? [])}`;
    useEffect(() => { void reload(); }, [reload, dimensionKey]);

    return (
        <div className="space-y-4">
            {loading && (
                <p role="status" className="rounded-xl border-2 border-muted bg-card px-4 py-3 text-center text-sm text-foreground/80">
                    {SLOTS_LOADING_TH}
                </p>
            )}
            {!loading && pending && (
                <p role="status" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground/80">
                    {SLOTS_PENDING_TH}
                </p>
            )}
            {!loading && !pending && loadError && (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {loadError}
                    <button
                        type="button"
                        onClick={() => { void reload(); }}
                        className="ms-2 font-semibold underline underline-offset-2"
                    >
                        ลองใหม่
                    </button>
                </p>
            )}
            <Step3SiteLand
                farmData={farmData}
                slots={[...slots]}
                editable={editable}
                appId={appId}
                certificateValidityMonths={validity.status === 'ready' ? validity.validity.months : null}
                onChange={(key, value) => { setFarmData({ ...farmData, [key]: value } as never); }}
                onPatch={(values) => { setFarmData({ ...farmData, ...values } as never); }}
                onChanged={() => { void reload(); }}
                me={me}
                certScope={state.certScope}
                requestType={state.requestType}
                hydrating={state.resumePending === true}
            />
        </div>
    );
}

/**
 * The applicant's own name and phone, for "ใช้ชื่อและเบอร์ของฉัน" (order 65(2)): the signed-in
 * person's name, and the mobile step 2 asked for (or the account's). Null when either is unknown.
 */
function myContact(
    user: { firstName?: string; lastName?: string; phoneNumber?: string; phone?: string } | null,
    applicantData: Record<string, unknown> | null,
): { name: string; phone: string } | null {
    const name = [user?.firstName, user?.lastName].map((part) => (part ?? '').trim()).filter(Boolean).join(' ');
    const phone = [applicantData?.phone, user?.phoneNumber, user?.phone]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .find(Boolean) ?? '';
    return name && phone ? { name, phone } : null;
}
