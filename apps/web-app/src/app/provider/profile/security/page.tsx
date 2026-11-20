'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Copy,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

import ProviderLayout from '../../components/provider-layout';
import ChangePasswordCard from './change-password-card';
import { apiClient, type ApiResponse } from '@/lib/api/api-client';
import { providerApiPaths } from '@/lib/services/provider-api';
import { setStoredAccessToken } from '@/lib/services/auth-service-session';
import { notifications } from '@/lib/notifications';
import { Button } from '@/components/ui/primitives/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives/card';
import { Input } from '@/components/ui/primitives/input';
import { Badge } from '@/components/ui/primitives/badge';

interface MfaStatusResponse {
  enabled: boolean;
  /** false for a staff account while the force-setup flag is on: the device move replaces disabling (review L3). */
  disableAllowed?: boolean;
  /** true while this session's sign-in with a backup code still proves a move (order 89 ก, ten minutes). */
  rebindProofAvailable?: boolean;
}

interface MfaSetupResponse {
  secret: string;
  qrCodeUri: string;
  backupCodes: string[];
  message?: string;
}

interface MfaVerifySetupResponse {
  message: string;
  // Present when the call completed a move (order 93 item 4): the session that performed the
  // move is re-issued at the new epoch, every other sign-in of the account is now refused.
  token?: string;
}

type Phase =
  | 'loading'
  | 'disabled' // MFA not enabled — show "Enable MFA" CTA
  | 'qr-shown'
  | 'done'
  | 'enabled' // MFA active — show disable form
  | 'error';

type ReenrolProof = { code: string } | { backupCode: string } | { useSignInProof: true };

const BACKUP_CODE_SHAPE = /^[0-9A-Z]{4}-[0-9A-Z]{4}$/;

function formatBackupCode(typed: string): string {
  const chars = typed.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  return chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
}

const REENROL_REFUSAL_TH: Record<string, string> = {
  MFA_CODE_REQUIRED:
    'รหัสปัจจุบันไม่ถูกต้อง หรือรหัสสำรองผิดหรือถูกใช้ไปแล้ว กรุณาใส่รหัส 6 หลักล่าสุดจากแอปที่ใช้อยู่ หรือรหัสสำรองที่ยังไม่เคยใช้',
  MFA_REENROL_UNAVAILABLE: 'ย้ายไม่ได้ในขณะนี้ การยืนยันตัวตนสองชั้นเดิมยังใช้งานอยู่ กรุณาลองใหม่ภายหลัง',
  MFA_REENROL_SESSION_MISMATCH: 'กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ ก่อนย้ายการยืนยันตัวตนสองชั้นไปเครื่องใหม่',
};
const TOO_MANY_TRIES_TH = 'ลองหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่ การยืนยันตัวตนสองชั้นเดิมยังใช้งานอยู่';
const NO_BACKUP_CODES_TH = 'ระบบเตรียมรหัสสำรองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
const BACKUP_CODES_NOT_CONFIRMED_TH = 'กรุณาบันทึกรหัสสำรอง แล้วติ๊กว่าบันทึกแล้วก่อนเปิดใช้งาน';
const DISABLE_NOT_FOR_STAFF_TH = 'บัญชีเจ้าหน้าที่ปิดการยืนยันตัวตนสองชั้นเองไม่ได้ หากเปลี่ยนเครื่อง ให้ใช้การย้ายไปเครื่องใหม่ด้วยรหัสจากแอปเดิมหรือรหัสสำรองแทน';
const DISABLE_WRONG_CODE_TH = 'รหัสไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง การยืนยันตัวตนสองชั้นยังใช้งานอยู่';

const refusalCode = (res: ApiResponse) => res.errorCode ?? res.code;

function reenrolRefusal(res: ApiResponse): string {
  if (res.status === 429) {
    return TOO_MANY_TRIES_TH;
  }
  return REENROL_REFUSAL_TH[refusalCode(res) ?? ''] ?? 'ย้ายไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่แล้วลองอีกครั้ง';
}

export default function ProviderSecurityPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  // What /mfa/status last said. The status label reads this, never the page phase: a move shows the
  // QR phase while 2FA is still on (round 5 review L3).
  const [statusEnabled, setStatusEnabled] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Setup-flow state
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupQrDataUrl, setSetupQrDataUrl] = useState<string | null>(null);
  const [setupCodeInput, setSetupCodeInput] = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);

  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesSaved, setBackupCodesSaved] = useState(false);

  const [reenrolCodeInput, setReenrolCodeInput] = useState('');
  const [reenrolBackupCodeInput, setReenrolBackupCodeInput] = useState('');
  const [reenrolSubmitting, setReenrolSubmitting] = useState(false);
  const [reenrolling, setReenrolling] = useState(false);

  const [disableAllowed, setDisableAllowed] = useState(true);
  const [rebindProofAvailable, setRebindProofAvailable] = useState(false);

  // Disable-flow state
  const [disableCodeInput, setDisableCodeInput] = useState('');
  const [disableSubmitting, setDisableSubmitting] = useState(false);

  const readStatus = useCallback(async () => {
    const res = await apiClient.get<MfaStatusResponse>(providerApiPaths.mfaStatus);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to read MFA status');
    }
    setDisableAllowed(res.data.disableAllowed !== false);
    setRebindProofAvailable(res.data.rebindProofAvailable === true);
    setStatusEnabled(res.data.enabled);
    return res.data.enabled;
  }, []);

  const loadStatus = useCallback(async () => {
    setPhase('loading');
    setErrorMsg(null);
    setReenrolling(false);
    try {
      setPhase((await readStatus()) ? 'enabled' : 'disabled');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read MFA status');
    }
  }, [readStatus]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Render the otpauth:// URI as a QR data-URL so the user can scan with
  // Google Authenticator / 1Password / Authy / Bitwarden. Done client-side
  // so the secret never round-trips an image proxy.
  const renderQr = useCallback(async (uri: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
      });
      setSetupQrDataUrl(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'QR rendering failed');
    }
  }, []);

  const showNewFactor = useCallback(async (setup: MfaSetupResponse, reenrol: boolean) => {
    setSetupSecret(setup.secret);
    setBackupCodes(setup.backupCodes);
    setBackupCodesSaved(false);
    setSetupCodeInput('');
    setReenrolling(reenrol);
    await renderQr(setup.qrCodeUri);
    setPhase('qr-shown');
  }, [renderQr]);

  const clearNewFactor = useCallback(() => {
    setSetupSecret(null);
    setSetupQrDataUrl(null);
    setSetupCodeInput('');
    setBackupCodes([]);
    setBackupCodesSaved(false);
  }, []);

  const handleStartSetup = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await apiClient.post<MfaSetupResponse>(providerApiPaths.mfaSetup, {});
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Setup failed');
      }
      if (!res.data.backupCodes?.length) {
        throw new Error(NO_BACKUP_CODES_TH);
      }
      await showNewFactor(res.data, false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Setup failed');
      notifications.show({ title: 'เริ่มตั้งค่า MFA ไม่สำเร็จ', message: '', color: 'red' });
    }
  }, [showNewFactor]);

  const handleStartReenrol = useCallback(async (proof: ReenrolProof) => {
    setErrorMsg(null);
    setReenrolSubmitting(true);
    try {
      const res = await apiClient.post<MfaSetupResponse>(providerApiPaths.mfaSetup, proof, { suppressAuthRedirect: true });
      if (!res.success || !res.data) {
        setErrorMsg(reenrolRefusal(res));
        return;
      }
      if (!res.data.backupCodes?.length) {
        setErrorMsg(NO_BACKUP_CODES_TH);
        return;
      }
      setReenrolCodeInput('');
      setReenrolBackupCodeInput('');
      await showNewFactor(res.data, true);
    } catch {
      setErrorMsg('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setReenrolSubmitting(false);
    }
  }, [showNewFactor]);

  const handleVerifySetup = useCallback(async () => {
    if (setupCodeInput.length !== 6) {
      notifications.show({
        title: 'รหัส 6 หลักไม่ครบ',
        message: 'ใส่รหัสจากแอป Authenticator ให้ครบ 6 หลัก',
        color: 'red',
      });
      return;
    }
    if (!backupCodesSaved) {
      return;
    }
    setSetupSubmitting(true);
    try {
      const res = await apiClient.post<MfaVerifySetupResponse>(
        providerApiPaths.mfaVerifySetup,
        { code: setupCodeInput, backupCodesSaved: true },
      );
      if (!res.success || !res.data) {
        const reason = refusalCode(res);
        // Round 5: 5 wrong codes delete the pending move, and only the session that
        // started it may finish it. Either way this QR is dead: go back to the start.
        if (reenrolling && (reason === 'MFA_REENROL_RESTART' || reason === 'MFA_REENROL_SESSION_MISMATCH')) {
          clearNewFactor();
          await loadStatus();
          setErrorMsg('กรุณาเริ่มย้ายใหม่ด้วยรหัสจากแอปที่ใช้อยู่หรือรหัสสำรองที่ยังไม่เคยใช้ การยืนยันตัวตนสองชั้นเดิมยังใช้งานอยู่');
          return;
        }
        if (res.status === 429) {
          setErrorMsg(TOO_MANY_TRIES_TH);
          return;
        }
        if (reason === 'MFA_BACKUP_CODES_NOT_CONFIRMED') {
          const errorTh = res.meta?.errorTh;
          setErrorMsg(typeof errorTh === 'string' && errorTh.trim() ? errorTh : BACKUP_CODES_NOT_CONFIRMED_TH);
          return;
        }
        throw new Error(res.error || 'Verification failed');
      }
      if (typeof res.data.token === 'string' && res.data.token) {
        // The stored token is what every later request sends as Bearer; without this swap
        // the device that moved keeps sending its pre-epoch token and is signed out
        // (measured 2026-10-21 round 4: GET /api/notifications 401 TOKEN_REVOKED after the move).
        setStoredAccessToken(res.data.token);
      }
      clearNewFactor();
      await readStatus().catch(() => undefined);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'รหัสไม่ถูกต้อง');
      notifications.show({
        title: 'รหัส MFA ไม่ถูกต้อง',
        message: 'กรุณาลองใหม่อีกครั้ง',
        color: 'red',
      });
    } finally {
      setSetupSubmitting(false);
    }
  }, [setupCodeInput, backupCodesSaved, reenrolling, clearNewFactor, loadStatus, readStatus]);

  const handleDisable = useCallback(async () => {
    if (disableCodeInput.length !== 6) {
      notifications.show({
        title: 'รหัส 6 หลักไม่ครบ',
        message: 'ใส่รหัสปัจจุบันจากแอป Authenticator เพื่อยืนยันว่าเป็นคุณ',
        color: 'red',
      });
      return;
    }
    setDisableSubmitting(true);
    setErrorMsg(null);
    try {
      // A wrong code answers 401. That is this request's refusal, not an expired session, so the
      // person stays signed in and reads the message here.
      const res = await apiClient.delete(providerApiPaths.mfaDisable, {
        body: { code: disableCodeInput },
        suppressAuthRedirect: true,
      });
      if (!res.success) {
        const refusal = res.status === 429
          ? TOO_MANY_TRIES_TH
          : (refusalCode(res) === 'MFA_DISABLE_NOT_FOR_STAFF'
            ? ((typeof res.meta?.errorTh === 'string' && res.meta.errorTh.trim()) || DISABLE_NOT_FOR_STAFF_TH)
            : DISABLE_WRONG_CODE_TH);
        setErrorMsg(refusal);
        notifications.show({ title: 'ปิด MFA ไม่สำเร็จ', message: refusal, color: 'red' });
        return;
      }
      setDisableCodeInput('');
      setStatusEnabled(false);
      setPhase('disabled');
      notifications.show({
        title: 'ปิด MFA แล้ว',
        message: 'ระบบจะกลับไปใช้รหัสผ่านอย่างเดียวในการเข้าสู่ระบบ',
        color: 'orange',
      });
    } catch {
      setErrorMsg('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setDisableSubmitting(false);
    }
  }, [disableCodeInput]);

  const handleCopyBackupCodes = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      notifications.show({
        title: 'คัดลอกแล้ว',
        message: 'คัดลอกรหัสสำรองทั้งหมดแล้ว',
        color: 'green',
      });
    } catch {
      notifications.show({
        title: 'คัดลอกไม่สำเร็จ',
        message: 'กรุณาจดรหัสสำรองด้วยตนเอง',
        color: 'red',
      });
    }
  }, [backupCodes]);

  return (
    <ProviderLayout title="ความปลอดภัยบัญชี" subtitle="Two-Factor Authentication (TOTP)">
      <div className="w-full space-y-6 p-4 sm:p-6">
        {/* Header card */}
        <Card className="rounded-lg border-border bg-card shadow-none">
          <CardHeader className="border-b border-border/50 bg-muted/30 px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Multi-Factor Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              เพิ่มชั้นการป้องกันบัญชีของคุณด้วย Authenticator app เช่น Google Authenticator,
              Authy, 1Password หรือ Bitwarden ทุกครั้งที่เข้าสู่ระบบ ระบบจะขอรหัส 6 หลักนอกเหนือจากรหัสผ่าน
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">สถานะ:</span>
              {phase === 'error' ? (
                <Badge tone="danger" className="rounded-md text-xs">
                  อ่านสถานะไม่ได้
                </Badge>
              ) : statusEnabled === null ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> กำลังตรวจสอบ
                </span>
              ) : statusEnabled ? (
                <Badge tone="success" className="rounded-md text-xs">
                  เปิดใช้งาน
                </Badge>
              ) : (
                <Badge tone="warning" className="rounded-md text-xs">
                  ยังไม่เปิดใช้งาน
                </Badge>
              )}
            </div>
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* เปลี่ยนรหัสผ่านของตัวเอง (มติ operator 2026-09-26) — ทางเดียวที่รหัสผ่านเจ้าหน้าที่เปลี่ยนได้หลังสร้างบัญชี */}
        <ChangePasswordCard />

        {/* Phase: disabled — offer "Enable MFA" CTA */}
        {phase === 'disabled' && (
          <Card className="rounded-lg border-border bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <h3 className="font-medium text-foreground">เริ่มตั้งค่า MFA</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ระบบจะสร้าง secret key ให้คุณสแกนด้วย Authenticator app เพียงครั้งเดียว จากนั้นทุกการเข้าสู่ระบบจะขอรหัส 6 หลัก
                  </p>
                </div>
              </div>
              <Button onClick={() => void handleStartSetup()}>
                <ShieldCheck className="mr-2 h-4 w-4" /> เปิดใช้งาน MFA
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Phase: qr-shown — display QR + ask for first 6-digit code */}
        {phase === 'qr-shown' && (
          <Card className="rounded-lg border-border bg-card shadow-none">
            <CardHeader className="border-b border-border/50 bg-muted/30 px-6 py-4">
              <CardTitle className="text-sm font-medium text-foreground">
                ขั้นตอนที่ 1 · สแกน QR
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div className="rounded-lg border border-border bg-white p-3">
                  {setupQrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={setupQrDataUrl}
                      alt="MFA QR code"
                      className="h-64 w-64"
                    />
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3 text-sm text-muted-foreground">
                  <p>
                    เปิดแอป Authenticator แล้วสแกน QR code ด้านซ้าย หรือใส่ secret
                    ด้านล่างด้วยตนเอง
                  </p>
                  {reenrolling && (
                    <>
                      <p className="text-foreground">
                        แอปเดิมยังใช้ได้จนกว่าคุณจะยืนยันรหัสจากรายการใหม่ในขั้นตอนที่ 2
                      </p>
                      <p className="text-foreground">
                        เมื่อยืนยันแล้ว แอปเดิมและรหัสสำรองชุดเดิมทั้งหมดจะใช้ไม่ได้ทันที การเข้าสู่ระบบบนเครื่องอื่นทั้งหมดจะสิ้นสุด และระบบจะส่งการแจ้งเตือนเรื่องการย้ายนี้ถึงเจ้าของบัญชี
                      </p>
                    </>
                  )}
                  {setupSecret && (
                    <div className="break-all rounded-lg bg-muted/40 p-3 font-mono text-xs text-foreground">
                      {setupSecret}
                    </div>
                  )}
                  <p className="text-xs">
                    ผู้ออก: <span className="font-mono">GACP-DTAM</span> · อัลกอริทึม: SHA-1 ·
                    จำนวนหลัก: 6 · รอบเวลา: 30 วินาที
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/40 pt-6">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {reenrolling ? 'รหัสสำรองชุดใหม่' : 'รหัสสำรอง'}
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    เก็บรหัสสำรองด้านล่างไว้ในที่ปลอดภัย ระบบจะไม่แสดงอีก หากทำเครื่องยืนยันตัวตนหาย ใช้รหัสเหล่านี้เข้าสู่ระบบหรือย้ายไปเครื่องใหม่ได้ รหัสละครั้ง
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-4 sm:grid-cols-4">
                  {backupCodes.map((code, idx) => (
                    <div
                      key={`${code}-${idx}`}
                      className="rounded-md border border-border bg-card px-3 py-2 text-center font-mono text-sm"
                    >
                      {code}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="outline" onClick={() => void handleCopyBackupCodes()}>
                    <Copy className="mr-2 h-4 w-4" /> คัดลอกทั้งหมด
                  </Button>
                  <Checkbox
                    checked={backupCodesSaved}
                    onCheckedChange={setBackupCodesSaved}
                    label="บันทึกรหัสสำรองแล้ว"
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-border/40 pt-6">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    ขั้นตอนที่ 2 · ยืนยันรหัส
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ใส่รหัส 6 หลักจากแอปเพื่อยืนยันว่า setup สำเร็จ
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="max-w-xs flex-1">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={setupCodeInput}
                      onChange={(e) => setSetupCodeInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="text-center font-mono text-lg tracking-widest"
                      disabled={setupSubmitting}
                    />
                  </div>
                  <Button
                    onClick={() => void handleVerifySetup()}
                    disabled={setupSubmitting || setupCodeInput.length !== 6 || !backupCodesSaved}
                  >
                    {setupSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    ยืนยันและเปิดใช้งาน
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'done' && (
          <Card className="rounded-lg border-border bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" aria-hidden="true" />
                <div>
                  <h3 className="font-medium text-foreground">
                    {reenrolling ? 'ย้ายการยืนยันตัวตนสองชั้นไปเครื่องใหม่แล้ว' : 'เปิดใช้งานการยืนยันตัวตนสองชั้นแล้ว'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {reenrolling
                      ? 'แอปเดิมและรหัสสำรองชุดเดิมใช้ไม่ได้แล้ว การเข้าสู่ระบบบนเครื่องอื่นสิ้นสุดแล้ว และระบบส่งการแจ้งเตือนเรื่องการย้ายนี้ถึงเจ้าของบัญชีแล้ว'
                      : 'ตั้งแต่การเข้าสู่ระบบครั้งถัดไป ระบบจะขอรหัส 6 หลักจากแอปทุกครั้ง'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    รหัสสำรองแสดงไปแล้วในขั้นตอนก่อนหน้า ระบบจะไม่แสดงอีก
                  </p>
                </div>
              </div>
              <Button onClick={() => void loadStatus()}>เสร็จสิ้น</Button>
            </CardContent>
          </Card>
        )}

        {/* Phase: enabled — show disable form */}
        {/* Phase: enabled — move 2FA to a new device. Needs the current code first;
            the old factor keeps working until the new one is confirmed. */}
        {phase === 'enabled' && (
          <Card data-testid="mfa-reenrol" className="rounded-lg border-border bg-card shadow-none">
            <CardHeader className="border-b border-border/50 bg-muted/30 px-6 py-4">
              <CardTitle className="text-sm font-medium text-foreground">
                ย้าย MFA ไปแอปหรือโทรศัพท์เครื่องใหม่
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6 sm:pt-6">
              {rebindProofAvailable && (
                <div data-testid="mfa-rebind-proof" className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm text-foreground">
                    คุณเพิ่งเข้าสู่ระบบด้วยรหัสสำรอง จึงย้ายไปเครื่องใหม่ได้ทันทีโดยไม่ต้องใช้รหัสสำรองอีกรหัส ภายใน 10 นาทีหลังเข้าสู่ระบบ
                  </p>
                  <Button onClick={() => void handleStartReenrol({ useSignInProof: true })} disabled={reenrolSubmitting}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    ย้ายด้วยรหัสสำรองที่ใช้เข้าสู่ระบบ
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                ใส่รหัส 6 หลักปัจจุบันจากแอปที่ใช้อยู่เพื่อยืนยันว่าเป็นคุณ แล้วสแกน QR ใหม่ แอปเดิมยังใช้ได้จนกว่าจะยืนยันรหัสจากแอปใหม่
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="max-w-xs flex-1">
                  <Input
                    name="reenrolCurrentCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={reenrolCodeInput}
                    onChange={(e) => setReenrolCodeInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="text-center font-mono text-lg tracking-widest"
                    disabled={reenrolSubmitting}
                  />
                </div>
                <Button
                  onClick={() => void handleStartReenrol({ code: reenrolCodeInput })}
                  disabled={reenrolSubmitting || reenrolCodeInput.length !== 6}
                >
                  {reenrolSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  เริ่มย้าย
                </Button>
              </div>

              <div className="space-y-3 border-t border-border/40 pt-4">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    ใช้รหัสสำรอง (กรณีทำเครื่องเดิมหาย)
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ใส่รหัสสำรองที่ยังไม่เคยใช้หนึ่งรหัสแทนรหัส 6 หลักจากแอปเดิม รหัสนี้ใช้ได้ครั้งเดียวและจะถูกใช้ไปทันทีที่ระบบรับ เป็นตัวเลขและตัวอักษรภาษาอังกฤษ 8 ตัว จะมีขีดกลางหรือไม่ก็ได้
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="max-w-xs flex-1">
                    <Input
                      name="reenrolBackupCode"
                      type="text"
                      aria-label="รหัสสำรอง"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={reenrolBackupCodeInput}
                      onChange={(e) => setReenrolBackupCodeInput(formatBackupCode(e.target.value))}
                      placeholder="A1B2-C3D4"
                      className="text-center font-mono text-lg"
                      disabled={reenrolSubmitting}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void handleStartReenrol({ backupCode: reenrolBackupCodeInput })}
                    disabled={reenrolSubmitting || !BACKUP_CODE_SHAPE.test(reenrolBackupCodeInput)}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    ย้ายด้วยรหัสสำรอง
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'enabled' && !disableAllowed && (
          <Card data-testid="mfa-disable-not-for-staff" className="rounded-lg border-border bg-card shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              บัญชีเจ้าหน้าที่ปิดการยืนยันตัวตนสองชั้นเองไม่ได้ หากเปลี่ยนโทรศัพท์หรือทำเครื่องหาย ให้ย้ายไปเครื่องใหม่ด้านบนด้วยรหัสจากแอปเดิมหรือรหัสสำรอง
            </CardContent>
          </Card>
        )}

        {phase === 'enabled' && disableAllowed && (
          <Card className="rounded-lg border-border bg-card shadow-none">
            <CardHeader className="border-b border-border/50 bg-muted/30 px-6 py-4">
              <CardTitle className="text-sm font-medium text-foreground">
                ปิดใช้งาน MFA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  การปิด MFA จะลด security ของบัญชี ถ้าเปลี่ยนโทรศัพท์ให้ใช้การย้ายด้านบนแทน
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                ใส่รหัส 6 หลักปัจจุบันจากแอป Authenticator เพื่อยืนยันว่าเป็นคุณ
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="max-w-xs flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={disableCodeInput}
                    onChange={(e) => setDisableCodeInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="text-center font-mono text-lg tracking-widest"
                    disabled={disableSubmitting}
                  />
                </div>
                <Button
                  variant="destructive"
                  onClick={() => void handleDisable()}
                  disabled={disableSubmitting || disableCodeInput.length !== 6}
                >
                  {disableSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldOff className="mr-2 h-4 w-4" />
                  )}
                  ปิดใช้งาน MFA
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ProviderLayout>
  );
}
