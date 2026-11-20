/**
 * /provider/profile/security — moving an ENABLED 2FA to a new device asks for the
 * current code first (round 4 of fix/no-recovery, 2026-09-26).
 *
 * POST /api/mfa/setup used to overwrite an enabled secret on any session. It now
 * needs the current TOTP code, and the old factor stays active until the new one
 * is confirmed at /verify-setup (backend: apps/backend/__tests__/unit/
 * mfa-setup-reenrol.test.js). This page is the only web surface that calls
 * /setup on a signed-in account; the login enrolment form only runs for accounts
 * without 2FA. The health security page has no 2FA controls at all.
 * Harness copied from change-password-card.test.tsx next to this file.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiResult = {
    success: boolean;
    data?: unknown;
    error?: string;
    code?: string;
    errorCode?: string;
    status?: number;
    meta?: Record<string, unknown>;
};
const mockGet = jest.fn<(url: string) => Promise<ApiResult>>();
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<ApiResult>>();
const mockEndExpiredSession = jest.fn();
const mockDelete = jest.fn<(url: string, options?: { body?: unknown; suppressAuthRedirect?: boolean }) => Promise<ApiResult>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => mockGet(url),
        post: async (url: string, body?: unknown, options?: { suppressAuthRedirect?: boolean }) => {
            const res = await mockPost(url, body);
            if (res.status !== 401) { return res; }
            if (!options?.suppressAuthRedirect) {
                mockEndExpiredSession();
                return { success: false, error: 'Session expired. Please sign in again' };
            }
            return { success: false, error: res.error, ...(res.code ? { code: res.code } : {}) };
        },
        delete: async (url: string, options?: { body?: unknown; suppressAuthRedirect?: boolean }) => {
            const res = await mockDelete(url, options);
            if (res.status !== 401) { return res; }
            if (!options?.suppressAuthRedirect) {
                mockEndExpiredSession();
                return { success: false, error: 'Session expired. Please sign in again' };
            }
            return { success: false, error: res.error, ...(res.code ? { code: res.code } : {}) };
        },
    },
}));

const mockLogout = jest.fn<() => Promise<void>>();
jest.mock('@/lib/services/auth-service', () => ({
    AuthService: { logout: () => mockLogout() },
}));
const mockSetStoredAccessToken = jest.fn<(token: string) => void>();
jest.mock('@/lib/services/auth-service-session', () => ({
    setStoredAccessToken: (token: string) => mockSetStoredAccessToken(token),
}));

jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

const mockPush = jest.fn();
jest.mock('next/navigation', () => {
    const router = { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    return {
        useRouter: () => router,
        usePathname: () => '/provider/profile/security',
        useSearchParams: () => new URLSearchParams(),
    };
});

jest.mock('../../../components/provider-layout', () => {
    const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    Passthrough.displayName = 'MockProviderLayout';
    return { __esModule: true, default: Passthrough };
});

import ProviderSecurityPage from '../page';

const NEW_CODES = Array.from({ length: 10 }, (_, i) => `BBBB-${String(i + 1).padStart(4, '0')}`);
const REBIND = {
    secret: 'NEWSECRETBASE32',
    qrCodeUri: 'otpauth://totp/x?secret=NEWSECRETBASE32',
    backupCodes: NEW_CODES,
    reenrol: true,
};


describe('/provider/profile/security — 2FA enabled: move to a new device', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGet.mockResolvedValue({ success: true, data: { enabled: true } });
    });

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        container?.remove();
        container = null;
        document.body.innerHTML = '';
    });

    async function flush(rounds = 20) {
        for (let i = 0; i < rounds; i++) {
            await act(async () => { await Promise.resolve(); });
        }
    }

    async function mount() {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<ProviderSecurityPage />);
        });
        await flush();
    }

    const card = () => container!.querySelector('[data-testid="mfa-reenrol"]');
    function type(input: HTMLInputElement, value: string) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => {
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
    const startButton = () => Array.from(card()!.querySelectorAll('button')).find((b) => (b.textContent || '').includes('เริ่มย้าย'))!;
    const buttonWith = (label: string) => Array.from(container!.querySelectorAll('button')).find((b) => (b.textContent || '').includes(label));
    const savedBox = () => container!.querySelector<HTMLButtonElement>('[role="checkbox"]');
    const qrCodeInput = () => Array.from(container!.querySelectorAll<HTMLInputElement>('input')).find((i) => i.placeholder === '123456' && i.name !== 'reenrolCurrentCode')!;
    const text = () => container!.textContent ?? '';
    const statusLine = () => Array.from(container!.querySelectorAll('span')).find((e) => e.textContent === 'สถานะ:')!.parentElement!.textContent;
    const bodyOf = (url: string) => mockPost.mock.calls.find(([u]) => u === url)?.[1];
    async function tickSaved() {
        expect(savedBox()).not.toBeNull();
        await act(async () => { savedBox()!.click(); });
    }
    async function startWithBackupCode(value: string) {
        type(card()!.querySelector<HTMLInputElement>('input[name="reenrolBackupCode"]')!, value);
        await act(async () => { buttonWith('ย้ายด้วยรหัสสำรอง')!.click(); });
        await flush(10);
    }

    it('asks for the current code before anything is set up, and never calls setup on its own', async () => {
        await mount();
        expect(card()).not.toBeNull();
        expect(card()!.textContent).toContain('รหัส 6 หลักปัจจุบัน');
        expect(card()!.querySelector('input[name="reenrolCurrentCode"]')).not.toBeNull();
        expect(startButton().disabled).toBe(true);
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('sends the current code with setup, then shows the new QR and says the old one still works', async () => {
        mockPost.mockResolvedValue({ success: true, data: { ...REBIND, method: 'TOTP' } });
        await mount();
        type(card()!.querySelector<HTMLInputElement>('input[name="reenrolCurrentCode"]')!, '123456');
        await act(async () => { startButton().click(); });
        await flush(10);
        expect(mockPost).toHaveBeenCalledWith('/api/mfa/setup', { code: '123456' });
        expect(container!.textContent).toContain('ขั้นตอนที่ 1');
        expect(container!.textContent).toContain('NEWSECRETBASE32');
        expect(container!.textContent).toContain('แอปเดิมยังใช้ได้จนกว่า');
    });

    it('a wrong current code is refused and nothing moves', async () => {
        mockPost.mockResolvedValue({ success: false, error: 'Invalid code', code: 'MFA_CODE_REQUIRED' });
        await mount();
        type(card()!.querySelector<HTMLInputElement>('input[name="reenrolCurrentCode"]')!, '000000');
        await act(async () => { startButton().click(); });
        await flush(10);
        expect(container!.textContent).toContain('รหัสปัจจุบันไม่ถูกต้อง');
        expect(container!.textContent).not.toContain('ขั้นตอนที่ 1');
    });
    // Round 5 (2026-09-26): the backend deletes a re-enrol after 5 wrong codes and refuses
    // a different session. The page must not leave the officer typing into a dead QR step.
    it('after MFA_REENROL_RESTART the QR step closes and the officer is told to start again', async () => {
        mockPost.mockImplementation(async (url: string) => (url === '/api/mfa/setup'
            ? { success: true, data: { ...REBIND, method: 'TOTP' } }
            : { success: false, error: 'Too many wrong codes', code: 'MFA_REENROL_RESTART' }));
        await mount();
        type(card()!.querySelector<HTMLInputElement>('input[name="reenrolCurrentCode"]')!, '123456');
        await act(async () => { startButton().click(); });
        await flush(10);
        const qrInput = Array.from(container!.querySelectorAll<HTMLInputElement>('input')).find((i) => i.placeholder === '123456' && i.name !== 'reenrolCurrentCode')!;
        type(qrInput, '000000');
        await tickSaved();
        const confirm = Array.from(container!.querySelectorAll('button')).find((b) => (b.textContent || '').includes('ยืนยันและเปิดใช้งาน'))!;
        await act(async () => { confirm.click(); });
        await flush(20);
        expect(mockPost).toHaveBeenCalledWith('/api/mfa/verify-setup', { code: '000000', backupCodesSaved: true });
        expect(container!.textContent).not.toContain('ขั้นตอนที่ 1');
        expect(card()).not.toBeNull();
        expect(container!.textContent).toContain('กรุณาเริ่มย้ายใหม่');
    });

    it('a store outage is not reported as a wrong code', async () => {
        mockPost.mockResolvedValue({ success: false, error: 'unavailable', code: 'MFA_REENROL_UNAVAILABLE' });
        await mount();
        type(card()!.querySelector<HTMLInputElement>('input[name="reenrolCurrentCode"]')!, '123456');
        await act(async () => { startButton().click(); });
        await flush(10);
        expect(container!.textContent).not.toContain('รหัสปัจจุบันไม่ถูกต้อง');
        expect(container!.textContent).toContain('ย้ายไม่ได้ในขณะนี้');
    });

    // Order 89 ก: an officer who lost the old device moves 2FA with ONE backup code (consumed when the
    // server accepts it). The new device must be confirmed with its code and the saved checkbox.
    it('the backup-code path sends { backupCode } to setup, upper case with the dash, whatever was typed', async () => {
        mockPost.mockResolvedValue({ success: true, data: { ...REBIND, method: 'BACKUP_CODE' } });
        await mount();
        const input = card()!.querySelector<HTMLInputElement>('input[name="reenrolBackupCode"]');
        expect(input).not.toBeNull();
        type(input!, 'a1b2c3d');
        expect(buttonWith('ย้ายด้วยรหัสสำรอง')!.disabled).toBe(true);
        await startWithBackupCode('a1b2c3d4');
        expect(mockPost).toHaveBeenCalledWith('/api/mfa/setup', { backupCode: 'A1B2-C3D4' });
        expect(text()).toContain('ขั้นตอนที่ 1');
    });

    it('after a backup code the NEW backup codes are shown once, and confirm waits for the saved checkbox', async () => {
        mockPost.mockResolvedValue({ success: true, data: { ...REBIND, method: 'BACKUP_CODE' } });
        await mount();
        await startWithBackupCode('A1B2-C3D4');
        for (const backupCode of NEW_CODES) {
            expect(text().split(backupCode).length - 1).toBe(1);
        }
        type(qrCodeInput(), '123456');
        const confirm = buttonWith('ยืนยันและเปิดใช้งาน')!;
        expect(confirm.disabled).toBe(true);
        await tickSaved();
        expect(buttonWith('ยืนยันและเปิดใช้งาน')!.disabled).toBe(false);
    });

    it('the QR step says the old device and old backup codes stop at confirmation, other sign-ins end, and the owner is told', async () => {
        mockPost.mockResolvedValue({ success: true, data: { ...REBIND, method: 'BACKUP_CODE' } });
        await mount();
        await startWithBackupCode('A1B2-C3D4');
        expect(text()).toContain('แอปเดิมและรหัสสำรองชุดเดิมทั้งหมดจะใช้ไม่ได้ทันที');
        expect(text()).toContain('การเข้าสู่ระบบบนเครื่องอื่นทั้งหมดจะสิ้นสุด');
        expect(text()).toContain('แจ้งเตือน');
    });

    it('verify carries backupCodesSaved: true, and the done card confirms the move without showing any code', async () => {
        mockPost.mockImplementation(async (url: string) => (url === '/api/mfa/setup'
            ? { success: true, data: { ...REBIND, method: 'BACKUP_CODE' } }
            : { success: true, data: { message: 'moved', token: 'fresh-session', method: 'BACKUP_CODE' } }));
        await mount();
        await startWithBackupCode('A1B2-C3D4');
        type(qrCodeInput(), '123456');
        await tickSaved();
        await act(async () => { buttonWith('ยืนยันและเปิดใช้งาน')!.click(); });
        await flush(10);
        expect(bodyOf('/api/mfa/verify-setup')).toEqual({ code: '123456', backupCodesSaved: true });
        // Order 93 item 4: this device keeps working, so the page must adopt the re-issued session
        // before the next request (round 4 measured a 401 TOKEN_REVOKED on the notifications page without it).
        expect(mockSetStoredAccessToken).toHaveBeenCalledWith('fresh-session');
        expect(text()).toContain('ย้ายการยืนยันตัวตนสองชั้นไปเครื่องใหม่แล้ว');
        for (const backupCode of NEW_CODES) {
            expect(text()).not.toContain(backupCode);
        }
        mockGet.mockClear();
        await act(async () => { buttonWith('เสร็จสิ้น')!.click(); });
        await flush(10);
        expect(mockGet).toHaveBeenCalledWith('/api/mfa/status');
    });

    it('the status label keeps saying เปิดใช้งาน through the whole move, because /mfa/status says 2FA is on (review L3)', async () => {
        mockPost.mockImplementation(async (url: string) => (url === '/api/mfa/setup'
            ? { success: true, data: { ...REBIND, method: 'BACKUP_CODE' } }
            : { success: true, data: { message: 'moved', token: 'fresh-session', method: 'BACKUP_CODE' } }));
        await mount();
        expect(statusLine()).toBe('สถานะ:เปิดใช้งาน');
        await startWithBackupCode('A1B2-C3D4');
        expect(text()).toContain('ขั้นตอนที่ 1');
        expect(statusLine()).toBe('สถานะ:เปิดใช้งาน');
        type(qrCodeInput(), '123456');
        await tickSaved();
        await act(async () => { buttonWith('ยืนยันและเปิดใช้งาน')!.click(); });
        await flush(10);
        expect(text()).toContain('ย้ายการยืนยันตัวตนสองชั้นไปเครื่องใหม่แล้ว');
        expect(statusLine()).toBe('สถานะ:เปิดใช้งาน');
    });

    it.each([
        ['a wrong app code', async () => {
            type(card()!.querySelector<HTMLInputElement>('input[name="reenrolCurrentCode"]')!, '000000');
            await act(async () => { startButton().click(); });
            await flush(10);
        }],
        ['a wrong or used backup code', async () => { await startWithBackupCode('FFFF-FFFF'); }],
    ])('401 MFA_CODE_REQUIRED after %s shows one Thai message for both, and the officer stays signed in', async (_label, start) => {
        mockPost.mockResolvedValue({ success: false, status: 401, error: 'Invalid code', code: 'MFA_CODE_REQUIRED' });
        await mount();
        await start();
        expect(mockEndExpiredSession).not.toHaveBeenCalled();
        expect(text()).toContain('รหัสปัจจุบันไม่ถูกต้อง หรือรหัสสำรองผิดหรือถูกใช้ไปแล้ว');
        expect(text()).not.toContain('ขั้นตอนที่ 1');
        expect(card()).not.toBeNull();
    });

    it('429 from the limiter tells the officer to wait 15 minutes, not that the code is wrong', async () => {
        mockPost.mockResolvedValue({
            success: false,
            status: 429,
            error: 'คุณลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
            code: 'Too Many Requests',
            meta: { retryAfterSeconds: 900 },
        });
        await mount();
        await startWithBackupCode('A1B2-C3D4');
        expect(text()).toContain('รอ 15 นาที');
        expect(text()).not.toContain('รหัสปัจจุบันไม่ถูกต้อง');
    });

    it('a real-shaped 403 MFA_REENROL_SESSION_MISMATCH from setup asks the officer to sign in again', async () => {
        mockPost.mockResolvedValue({
            success: false,
            status: 403,
            error: 'คุณไม่มีสิทธิ์ดำเนินการนี้ กรุณาเข้าสู่ระบบใหม่หรือติดต่อเจ้าหน้าที่',
            code: 'Sign in again to move your 2FA to a new device.',
            errorCode: 'MFA_REENROL_SESSION_MISMATCH',
        });
        await mount();
        type(card()!.querySelector<HTMLInputElement>('input[name="reenrolCurrentCode"]')!, '123456');
        await act(async () => { startButton().click(); });
        await flush(10);
        expect(text()).toContain('กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่');
    });

    it('a real-shaped MFA_REENROL_RESTART from verify closes the QR step', async () => {
        mockPost.mockImplementation(async (url: string) => (url === '/api/mfa/setup'
            ? { success: true, data: { ...REBIND, method: 'BACKUP_CODE' } }
            : {
                success: false,
                status: 400,
                error: 'ข้อมูลไม่ถูกต้อง',
                code: 'Too many wrong codes. Start again with the code from your current app. Your current 2FA is unchanged.',
                errorCode: 'MFA_REENROL_RESTART',
            }));
        await mount();
        await startWithBackupCode('A1B2-C3D4');
        type(qrCodeInput(), '000000');
        await tickSaved();
        await act(async () => { buttonWith('ยืนยันและเปิดใช้งาน')!.click(); });
        await flush(20);
        expect(text()).not.toContain('ขั้นตอนที่ 1');
        expect(text()).toContain('กรุณาเริ่มย้ายใหม่');
    });
});

describe('/provider/profile/security — 2FA not enabled: first enrolment confirms the saved backup codes', () => {
    const CODES = Array.from({ length: 10 }, (_, i) => `CCCC-${String(i + 1).padStart(4, '0')}`);
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGet.mockResolvedValue({ success: true, data: { enabled: false } });
        mockPost.mockImplementation(async (url: string) => (url === '/api/mfa/setup'
            ? { success: true, data: { secret: 'FIRSTSECRETBASE32', qrCodeUri: 'otpauth://totp/x?secret=FIRSTSECRETBASE32', backupCodes: CODES } }
            : { success: true, data: { message: 'MFA enabled' } }));
    });

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        container?.remove();
        container = null;
        document.body.innerHTML = '';
    });

    async function flush(rounds = 20) {
        for (let i = 0; i < rounds; i++) {
            await act(async () => { await Promise.resolve(); });
        }
    }

    const text = () => container!.textContent ?? '';
    const buttonWith = (label: string) => Array.from(container!.querySelectorAll('button')).find((b) => (b.textContent || '').includes(label));

    it('the status label says ยังไม่เปิดใช้งาน before enrolment and เปิดใช้งาน once /mfa/status reports it on (review L3)', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<ProviderSecurityPage />);
        });
        await flush();
        const statusLine = () => Array.from(container!.querySelectorAll('span')).find((e) => e.textContent === 'สถานะ:')!.parentElement!.textContent;
        expect(statusLine()).toBe('สถานะ:ยังไม่เปิดใช้งาน');
        await act(async () => { buttonWith('เปิดใช้งาน MFA')!.click(); });
        await flush(10);
        expect(statusLine()).toBe('สถานะ:ยังไม่เปิดใช้งาน');
        const input = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find((i) => i.placeholder === '123456')!;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => {
            setter.call(input, '654321');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { container!.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(); });
        mockGet.mockResolvedValue({ success: true, data: { enabled: true } });
        await act(async () => { buttonWith('ยืนยันและเปิดใช้งาน')!.click(); });
        await flush(10);
        expect(text()).toContain('เปิดใช้งานการยืนยันตัวตนสองชั้นแล้ว');
        expect(statusLine()).toBe('สถานะ:เปิดใช้งาน');
    });

    it('the QR step shows the codes and the checkbox, verify sends backupCodesSaved: true, and the done card lists no code', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<ProviderSecurityPage />);
        });
        await flush();
        await act(async () => { buttonWith('เปิดใช้งาน MFA')!.click(); });
        await flush(10);
        expect(mockPost).toHaveBeenCalledWith('/api/mfa/setup', {});
        for (const backupCode of CODES) {
            expect(text().split(backupCode).length - 1).toBe(1);
        }
        expect(text()).not.toContain('รหัสสำรองชุดเดิม');

        const input = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find((i) => i.placeholder === '123456')!;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => {
            setter.call(input, '654321');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(buttonWith('ยืนยันและเปิดใช้งาน')!.disabled).toBe(true);
        await act(async () => { container!.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(); });
        await act(async () => { buttonWith('ยืนยันและเปิดใช้งาน')!.click(); });
        await flush(10);

        expect(mockPost.mock.calls.find(([u]) => u === '/api/mfa/verify-setup')?.[1]).toEqual({ code: '654321', backupCodesSaved: true });
        expect(mockSetStoredAccessToken).not.toHaveBeenCalled();
        expect(text()).toContain('เปิดใช้งานการยืนยันตัวตนสองชั้นแล้ว');
        for (const backupCode of CODES) {
            expect(text()).not.toContain(backupCode);
        }
    });
});


// Round 3 (review L3 and the brief's section 6): a wrong code at /mfa/disable answers 401, and the
// api client treats a bare 401 as an expired session. The page must mark that request as its own
// so the person stays signed in and reads the Thai error. While the staff flag is on the server
// refuses the disable for staff altogether, so the page hides the form and points at the move.
describe('/provider/profile/security — disabling 2FA', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => { jest.clearAllMocks(); });
    afterEach(() => {
        if (root) { act(() => { root?.unmount(); }); root = null; }
        container?.remove();
        container = null;
        document.body.innerHTML = '';
    });
    async function flush(rounds = 20) {
        for (let i = 0; i < rounds; i++) { await act(async () => { await Promise.resolve(); }); }
    }
    async function mount() {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => { root = createRoot(container!); root.render(<ProviderSecurityPage />); });
        await flush();
    }
    function type(input: HTMLInputElement, value: string) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
    }
    const buttonWith = (label: string) => Array.from(container!.querySelectorAll('button')).find((b) => (b.textContent || '').includes(label));
    const disableInput = () => Array.from(container!.querySelectorAll<HTMLInputElement>('input')).find((i) => i.placeholder === '123456' && !i.name)!;

    it('a wrong code shows the Thai error and keeps the person signed in on the same page', async () => {
        mockGet.mockResolvedValue({ success: true, data: { enabled: true, disableAllowed: true, rebindProofAvailable: false } });
        mockDelete.mockResolvedValue({ success: false, status: 401, error: 'Invalid code' });
        await mount();
        type(disableInput(), '000000');
        await act(async () => { buttonWith('ปิดใช้งาน MFA')!.click(); });
        await flush(10);
        expect(mockDelete).toHaveBeenCalledWith('/api/mfa/disable', expect.objectContaining({ suppressAuthRedirect: true }));
        expect(mockEndExpiredSession).not.toHaveBeenCalled();
        expect(container!.textContent).toContain('รหัสไม่ถูกต้อง');
        expect(buttonWith('ปิดใช้งาน MFA')).toBeDefined();
    });

    it('when the server says disabling is not allowed, the form is gone and the page points at moving to a new device', async () => {
        mockGet.mockResolvedValue({ success: true, data: { enabled: true, disableAllowed: false, rebindProofAvailable: false } });
        await mount();
        expect(buttonWith('ปิดใช้งาน MFA')).toBeUndefined();
        expect(container!.textContent).toContain('ปิดการยืนยันตัวตนสองชั้นเองไม่ได้');
        expect(container!.textContent).toContain('ย้ายไปเครื่องใหม่');
    });

    it('a sign-in with a backup code offers the move without a second code, and sends the proof flag', async () => {
        mockGet.mockResolvedValue({ success: true, data: { enabled: true, disableAllowed: false, rebindProofAvailable: true } });
        mockPost.mockResolvedValue({ success: true, data: { ...REBIND, method: 'BACKUP_CODE' } });
        await mount();
        const button = buttonWith('ย้ายด้วยรหัสสำรองที่ใช้เข้าสู่ระบบ');
        expect(button).toBeDefined();
        await act(async () => { button!.click(); });
        await flush(10);
        expect(mockPost).toHaveBeenCalledWith('/api/mfa/setup', { useSignInProof: true });
        expect(container!.textContent).toContain('ขั้นตอนที่ 1');
    });

    it('without that sign-in the button is not offered', async () => {
        mockGet.mockResolvedValue({ success: true, data: { enabled: true, disableAllowed: false, rebindProofAvailable: false } });
        await mount();
        expect(buttonWith('ย้ายด้วยรหัสสำรองที่ใช้เข้าสู่ระบบ')).toBeUndefined();
    });
});
