'use client';

/**
 * The reason a dispatcher states for an assignment out of the ordinary (operator orders 56(1) and
 * 60(a)): a fixed list closed by "อื่น ๆ (โปรดระบุ)" with the dispatcher's own words (order 44).
 * The server refuses the assignment with a code that names which list it asks from; the lists come
 * from GET /api/provider/scheduler/reasons, so the web keeps no copy of them.
 */

import { useEffect, useId, useState } from 'react';
import { apiClient } from '@/lib/api/api-client';
import { providerApiPaths } from '@/lib/services/provider-api';

export type ReasonListKey = 'overCap' | 'lateVisit' | 'correctionReassign';

export interface ReasonOption {
    code: string;
    label: string;
    /** Whose side the delay counts against, for the late-visit and correction lists (order 65(1)). */
    side?: string;
    sideLabel?: string;
}

export interface StatedReason {
    reasonCode: string;
    reasonText?: string;
}

export type ReasonLists = Record<ReasonListKey, ReasonOption[]>;

export type StatedReasons = Partial<Record<ReasonListKey, StatedReason>>;

/** The refusals that ask for a stated reason, and the list each asks from. */
export const REASON_ASKED_BY: Readonly<Record<string, ReasonListKey>> = Object.freeze({
    OFFICER_OVER_CAP_CONFIRMATION_REQUIRED: 'overCap',
    LATE_VISIT_REASON_REQUIRED: 'lateVisit',
    CORRECTION_REASSIGN_REASON_REQUIRED: 'correctionReassign',
});

export const OTHER_REASON_CODE = 'OTHER';
const OTHER_TEXT_MIN = 10;
const OTHER_TEXT_MAX = 500;

const SHOWN_TO_APPLICANT = 'ผู้ยื่นจะเห็นเหตุผลที่พิมพ์นี้ในหน้าคำขอ';

/**
 * `otherNote`: who reads the words typed for "อื่น ๆ". The late-visit and correction reasons are the
 * ones the applicant reads on the application page (backend shared/dispatcher-reasons.js
 * recordedReasonsOf); an over-cap reason goes to the DTAM admin only.
 */
export const REASON_COPY: Readonly<Record<ReasonListKey, { title: string; intro: string; otherNote?: string }>> = Object.freeze({
    overCap: {
        title: 'ผู้ตรวจคนนี้มีงานถึงเพดานแล้ว',
        intro: 'หากยังต้องการมอบหมายให้คนนี้ กรุณาเลือกเหตุผล ระบบจะบันทึกเหตุผลไว้ให้ผู้ดูแลฝั่งกรมตรวจดูได้',
    },
    lateVisit: {
        title: 'วันนัดนี้เลยวันที่ต้องตรวจภายใน',
        intro: 'นัดวันนี้ได้ แต่ต้องเลือกเหตุผลที่นัดช้ากว่ากำหนด ระบบจะบันทึกเหตุผลไว้',
        otherNote: SHOWN_TO_APPLICANT,
    },
    correctionReassign: {
        title: 'เปลี่ยนผู้ตรวจพื้นที่ระหว่างที่ผู้ยื่นแก้ไขข้อบกพร่อง',
        intro: 'ตามปกติผู้ตรวจพื้นที่คนเดิมเป็นผู้พิจารณาหลักฐานการแก้ไข หากต้องเปลี่ยน กรุณาเลือกเหตุผล ระบบจะบันทึกไว้',
        otherNote: SHOWN_TO_APPLICANT,
    },
});

/** The list a refusal asks a reason from, or null when the refusal is something else. */
export function reasonAskedBy(response: { errorCode?: string; code?: string }): ReasonListKey | null {
    const code = response.errorCode || response.code || '';
    return REASON_ASKED_BY[code] ?? null;
}

/** A reason the server will take: a code from the list, and for OTHER 10 to 500 characters of words. */
export function statedReasonComplete(reason: StatedReason | undefined): boolean {
    if (!reason || !reason.reasonCode) return false;
    if (reason.reasonCode !== OTHER_REASON_CODE) return true;
    const length = (reason.reasonText ?? '').trim().length;
    return length >= OTHER_TEXT_MIN && length <= OTHER_TEXT_MAX;
}

/** The dispatcher's reason lists, read once per screen; null until they arrive. */
export function useDispatcherReasons(): ReasonLists | null {
    const [lists, setLists] = useState<ReasonLists | null>(null);
    useEffect(() => {
        let alive = true;
        apiClient.get<ReasonLists>(providerApiPaths.schedulerReasons).then((res) => {
            if (alive && res.success && res.data) setLists(res.data);
        }).catch(() => undefined);
        return () => { alive = false; };
    }, []);
    return lists;
}

interface StatedReasonPickerProps {
    list: ReasonListKey;
    options: ReasonOption[] | undefined;
    value: StatedReason | undefined;
    onChange: (reason: StatedReason) => void;
}

export function StatedReasonPicker({ list, options, value, onChange }: StatedReasonPickerProps) {
    const name = useId();
    const textId = useId();
    const noteId = useId();
    const copy = REASON_COPY[list];
    const otherChosen = value?.reasonCode === OTHER_REASON_CODE;
    const otherLength = (value?.reasonText ?? '').trim().length;
    return (
        <fieldset className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4" data-testid={`stated-reason-${list}`}>
            <legend className="px-1 text-sm font-bold text-foreground">{copy.title}</legend>
            <p className="text-sm text-muted-foreground">{copy.intro}</p>
            {!options && <p className="text-sm text-muted-foreground">กำลังโหลดรายการเหตุผล</p>}
            <div className="space-y-2">
                {(options ?? []).map((option) => (
                    <label key={option.code} className="flex min-h-[44px] cursor-pointer items-start gap-2 text-sm text-foreground">
                        <input
                            type="radio"
                            name={name}
                            value={option.code}
                            checked={value?.reasonCode === option.code}
                            onChange={() => onChange(option.code === OTHER_REASON_CODE
                                ? { reasonCode: option.code, reasonText: value?.reasonText ?? '' }
                                : { reasonCode: option.code })}
                            className="mt-1"
                        />
                        <span>
                            {option.label}
                            {option.sideLabel && <span className="block text-xs text-muted-foreground">ฝ่ายที่รับผิดชอบ: {option.sideLabel}</span>}
                        </span>
                    </label>
                ))}
            </div>
            {otherChosen && (
                <div className="space-y-1">
                    <label htmlFor={textId} className="text-sm font-medium text-foreground">เหตุผล</label>
                    {copy.otherNote && <p id={noteId} className="text-xs text-muted-foreground">{copy.otherNote}</p>}
                    <textarea
                        id={textId}
                        aria-describedby={copy.otherNote ? noteId : undefined}
                        value={value?.reasonText ?? ''}
                        maxLength={OTHER_TEXT_MAX}
                        rows={3}
                        onChange={(event) => onChange({ reasonCode: OTHER_REASON_CODE, reasonText: event.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                        {otherLength < OTHER_TEXT_MIN ? `พิมพ์อย่างน้อย ${OTHER_TEXT_MIN} ตัวอักษร` : `${otherLength}/${OTHER_TEXT_MAX} ตัวอักษร`}
                    </p>
                </div>
            )}
        </fieldset>
    );
}
