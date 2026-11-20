'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldPlus, Copy, Check } from 'lucide-react';

import { apiClient, type ApiResponse } from '@/lib/api/api-client';
import { providerApiPaths } from '@/lib/services/provider-api';
import { Button } from '@/components/ui/primitives/button';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * MfaEnrolmentForm — หน้าลงทะเบียนเครื่องยืนยันตัวตน สำหรับบัญชีที่ระบบบังคับให้มี 2FA
 * แต่ยังไม่เคยตั้ง (หลังบ้านตอบ `mfa_setup_required` + `setup_token`)
 *
 * ── ทำไมมี ────────────────────────────────────────────────────────────────
 *
 * กิ่งนี้ไม่เคยมีหน้าจอรองรับ · หลังบ้านตรวจรหัสผ่านผ่านแล้ว ยื่นตั๋ว setup_token มาให้
 * แต่ฝั่งหน้าจอไม่รู้จักคำตอบนี้ จึงไหลไปจบที่ "ไม่ได้รับ Token จากระบบ" — เจ้าหน้าที่ที่
 * กรอกรหัส **ถูก** จะเห็นหน้าล็อกอินค้างอยู่ ไม่มีทางรู้ว่าต้องทำอะไรต่อ และถ้าเขาคิดว่า
 * ตัวเองพิมพ์ผิดแล้วลองซ้ำ บัญชีจะถูกล็อก 15 นาที
 *
 * ผลจริงบน demo/staging ซึ่งตั้ง REQUIRE_MFA_FOR_PRIVILEGED=true: **ไม่มีเจ้าหน้าที่
 * คนไหนเข้าระบบได้เลยสักคน** เจอตอนเดินประตูจริง 2026-09-12
 *
 * กิ่งพี่น้องของมัน (`mfa_required` สำหรับคนที่ตั้งแล้ว) ถูกปิดไปก่อนหน้านี้ พร้อมคอมเมนต์
 * ว่า "closes the audit gap where mfa_required came back with no FE screen" —
 * ปิดไว้กิ่งเดียว อีกกิ่งเปิดค้าง
 *
 * ── ทำไมจบด้วย "เข้าสู่ระบบอีกครั้ง" ไม่ใช่พาเข้าไปเลย ─────────────────────
 *
 * `POST /api/mfa/verify-setup` เปิด 2FA แต่ **ไม่คืน session** ตามสัญญาของมัน · การแกล้ง
 * พาเข้าไปเลยจะต้องเก็บรหัสผ่านไว้ในหน้าจอเพื่อยิงล็อกอินซ้ำ ซึ่งแย่กว่าการบอกความจริง
 * หนึ่งประโยค · รอบถัดไปผู้ใช้จะได้ `mfa_required` ซึ่ง MfaChallengeForm รองรับอยู่แล้ว
 *
 * ── ทำไมต้องติ๊ก "บันทึกรหัสสำรองแล้ว" ก่อนยืนยัน ───────────────────────────
 *
 * คำสั่ง 89 ก ข้อ 1: หลังบ้านเปิด 2FA ให้ก็ต่อเมื่อคำขอมี `backupCodesSaved: true` · รหัสสำรอง
 * มากับคำตอบของ `/setup` และไม่มีประตูไหนคืนมันอีก จึงแสดงครั้งเดียวที่ขั้นนี้ คู่กับรหัสลับ
 */
export type MfaEnrolmentFormProps = {
    /** ตั๋ว purpose='mfa_setup' จากคำตอบของการล็อกอิน */
    setupToken: string;
    /** เรียกเมื่อผู้ใช้กดกลับไปหน้าเข้าสู่ระบบหลังลงทะเบียนเสร็จ */
    onDone: () => void;
};

type SetupData = { secret: string; qrCodeUri: string; backupCodes: string[] };

type Step =
    | { kind: 'preparing' }
    | { kind: 'scan'; setup: SetupData }
    | { kind: 'done' };

const COPY = {
    title: 'ตั้งค่ายืนยันตัวตนสองชั้น',
    subtitle: 'บัญชีเจ้าหน้าที่ต้องผูกกับเครื่องยืนยันตัวตนก่อนเข้าใช้งานครั้งแรก',
    step1: 'เปิดแอปยืนยันตัวตน (เช่น Google Authenticator หรือ Microsoft Authenticator) แล้วเพิ่มบัญชีด้วยรหัสนี้',
    secretLabel: 'รหัสลับสำหรับตั้งค่า',
    copied: 'คัดลอกแล้ว',
    copy: 'คัดลอก',
    backupLabel: 'รหัสสำรอง',
    backupNote: 'เก็บรหัสสำรองด้านล่างไว้ในที่ปลอดภัย ระบบจะไม่แสดงอีก หากทำเครื่องยืนยันตัวตนหาย ใช้รหัสเหล่านี้กลับเข้าระบบได้ รหัสละครั้ง',
    copyAll: 'คัดลอกทั้งหมด',
    copyFailed: 'คัดลอกไม่สำเร็จ กรุณาจดรหัสสำรองด้วยตนเอง',
    savedConfirm: 'บันทึกรหัสสำรองแล้ว',
    step2: 'กรอกรหัส 6 หลักที่แอปแสดงอยู่ เพื่อยืนยันว่าผูกเครื่องสำเร็จ',
    codeLabel: 'รหัสจากแอป',
    submit: 'ยืนยันและเปิดใช้งาน',
    submitting: 'กำลังตรวจสอบ...',
    loading: 'กำลังเตรียมรหัสลับ...',
    setupFailed: 'ระบบเตรียมรหัสลับไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
    ticketExpired: 'หมดเวลาลงทะเบียนแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้งเพื่อเริ่มลงทะเบียน',
    invalidCode: 'รหัสไม่ถูกต้อง กรุณาตรวจว่าเวลาบนเครื่องตรงกับเวลาจริง แล้วลองรหัสล่าสุดอีกครั้ง',
    notConfirmed: 'กรุณาบันทึกรหัสสำรอง แล้วติ๊กว่าบันทึกแล้วก่อนเปิดใช้งาน',
    doneTitle: 'เปิดใช้งานเรียบร้อย',
    doneBody: 'ลงทะเบียนการยืนยันตัวตนสองชั้นเสร็จแล้ว รหัสสำรองแสดงไปแล้วในขั้นตอนก่อนหน้า ระบบจะไม่แสดงอีก',
    backToLogin: 'กลับไปเข้าสู่ระบบ',
    loginAgainNote: 'ระบบจะขอรหัสจากแอปอีกครั้งตอนเข้าสู่ระบบ',
};

function notConfirmedMessage(result: ApiResponse): string {
    const errorTh = result.meta?.errorTh;
    return typeof errorTh === 'string' && errorTh.trim() ? errorTh : COPY.notConfirmed;
}

const reasonOf = (result: ApiResponse) => result.errorCode ?? result.code;

// The ticket lives 15 minutes. When it runs out the person signs in again; telling them the
// code was wrong would send them retyping codes until the login lock.
function ticketExpiredMessage(result: ApiResponse): string {
    const errorTh = result.meta?.errorTh;
    return typeof errorTh === 'string' && errorTh.trim() ? errorTh : COPY.ticketExpired;
}

export default function MfaEnrolmentForm({ setupToken, onDone }: MfaEnrolmentFormProps) {
    const [step, setStep] = useState<Step>({ kind: 'preparing' });
    const [code, setCode] = useState('');
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [codesCopied, setCodesCopied] = useState(false);

    const auth = useCallback(
        () => ({ Authorization: `Bearer ${setupToken}` }),
        [setupToken],
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await apiClient.post<SetupData>(providerApiPaths.mfaSetup, {}, { headers: auth() });
            if (cancelled) { return; }
            if (result.success && result.data?.secret && result.data.backupCodes?.length) {
                setStep({ kind: 'scan', setup: result.data });
            } else {
                setError(reasonOf(result) === 'MFA_SETUP_TICKET_EXPIRED' ? ticketExpiredMessage(result) : COPY.setupFailed);
            }
        })();
        return () => { cancelled = true; };
    }, [auth]);

    async function handleCopyCodes(codes: string[]) {
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCodesCopied(true);
        } catch {
            setError(COPY.copyFailed);
        }
    }

    async function handleVerify(e: React.FormEvent) {
        e.preventDefault();
        if (code.length !== 6 || !saved) { return; }
        setBusy(true);
        setError(null);
        const result = await apiClient.post<{ message?: string }>(
            // /api/mfa is where the backend mounts the router (routes/api/index.js); the old
            // identity-prefixed path was never mounted and 404'd (security re-review 2026-09-26).
            providerApiPaths.mfaVerifySetup, { code, backupCodesSaved: true }, { headers: auth() },
        );
        setBusy(false);
        if (result.success) {
            setStep({ kind: 'done' });
            return;
        }
        const reason = reasonOf(result);
        if (reason === 'MFA_SETUP_TICKET_EXPIRED') {
            setError(ticketExpiredMessage(result));
            return;
        }
        setError(reason === 'MFA_BACKUP_CODES_NOT_CONFIRMED' ? notConfirmedMessage(result) : COPY.invalidCode);
    }

    if (step.kind === 'done') {
        return (
            <div className="space-y-5">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-leaf-soft text-leaf-onSoft">
                        <Check size={22} strokeWidth={3} />
                    </span>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">{COPY.doneTitle}</h2>
                        <p className="text-sm text-muted-foreground">{COPY.loginAgainNote}</p>
                    </div>
                </div>
                <p className="text-sm text-foreground">{COPY.doneBody}</p>
                <button
                    type="button"
                    onClick={onDone}
                    className="min-h-[48px] w-full rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
                >
                    {COPY.backToLogin}
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleVerify} className="space-y-5">
            <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-leaf-soft text-leaf-onSoft">
                    <ShieldPlus size={22} />
                </span>
                <div>
                    <h2 className="text-lg font-bold text-foreground">{COPY.title}</h2>
                    <p className="text-sm text-muted-foreground">{COPY.subtitle}</p>
                </div>
            </div>

            <div>
                <p className="mb-2 text-sm text-foreground">{COPY.step1}</p>
                {step.kind === 'scan' ? (
                    <div className="flex items-center gap-2">
                        <code
                            data-testid="mfa-setup-secret"
                            className="flex-1 break-all rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-sm text-foreground"
                        >
                            {step.setup.secret}
                        </code>
                        <button
                            type="button"
                            aria-label={COPY.copy}
                            onClick={() => {
                                void navigator.clipboard?.writeText(step.setup.secret);
                                setCopied(true);
                            }}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border"
                        >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{COPY.loading}</p>
                )}
                {copied && <p className="mt-1 text-xs text-leaf-700">{COPY.copied}</p>}
            </div>

            {step.kind === 'scan' && (
                <div className="space-y-3">
                    <div>
                        <p className="mb-1 text-sm font-semibold text-foreground">{COPY.backupLabel}</p>
                        <p className="mb-2 text-sm text-foreground">{COPY.backupNote}</p>
                        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3">
                            {step.setup.backupCodes.map((c) => (
                                <li key={c} className="font-mono text-sm tabular-nums text-foreground">{c}</li>
                            ))}
                        </ul>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopyCodes(step.setup.backupCodes)}
                    >
                        {codesCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {codesCopied ? COPY.copied : COPY.copyAll}
                    </Button>
                    <Checkbox checked={saved} onCheckedChange={setSaved} label={COPY.savedConfirm} />
                </div>
            )}

            <div>
                <label htmlFor="mfa-setup-code" className="mb-1 block text-sm font-semibold text-foreground">
                    {COPY.codeLabel}
                </label>
                <p className="mb-2 text-sm text-muted-foreground">{COPY.step2}</p>
                <input
                    id="mfa-setup-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="min-h-[48px] w-full rounded-lg border border-border px-3 text-center font-mono text-xl tracking-[0.4em]"
                />
            </div>

            {error && (
                <div role="alert" aria-live="polite" className="rounded border border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={busy || code.length !== 6 || !saved || step.kind !== 'scan'}
                className="min-h-[48px] w-full rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
            >
                {busy ? COPY.submitting : COPY.submit}
            </button>
        </form>
    );
}
