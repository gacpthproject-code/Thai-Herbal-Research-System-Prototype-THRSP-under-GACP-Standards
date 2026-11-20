/**
 * คำตอบทุกแบบที่ประตูล็อกอินตอบได้ ต้องมีหน้าจอรองรับ
 *
 * เจอตอนเดินประตูจริงบน demo 2026-09-12: บัญชีเจ้าหน้าที่ที่ระบบบังคับให้มี 2FA แต่ยัง
 * ไม่เคยตั้ง (REQUIRE_MFA_FOR_PRIVILEGED=true บนทั้ง demo และ staging) ได้คำตอบ
 * `mfa_setup_required` + `setup_token` กลับมา — และ **ไม่มีอะไรบนหน้าจอรองรับคำตอบนั้น**
 *
 * ผลจริง: เจ้าหน้าที่กรอกรหัสผ่าน **ถูก** แล้วเห็นหน้าล็อกอินค้างอยู่เฉย ๆ ไม่มีข้อความ
 * ไม่มีทางรู้ว่าต้องทำอะไร ถ้าเขาคิดว่าพิมพ์ผิดแล้วลองซ้ำ บัญชีจะถูกล็อก 15 นาที
 * บนเครื่องจริงแปลว่า **ไม่มีเจ้าหน้าที่คนไหนเข้าระบบได้เลยสักคน**
 *
 * ── ทำไมเทสชุดเดิมมองไม่เห็น ────────────────────────────────────────────
 *
 * กิ่งพี่น้องของมัน (`mfa_required` สำหรับคนที่ตั้ง 2FA แล้ว) มีเทสอยู่ และ docstring ของ
 * MfaChallengeForm เขียนไว้เองว่า "closes the audit gap where mfa_required came back
 * with no FE screen" — ปิดไปกิ่งเดียว แล้วเทสก็ตรึงไว้กิ่งเดียว
 *
 * ใบนี้จึงตรึงที่ **ชนิดข้อมูลของคำตอบ** ไม่ใช่ที่กิ่งใดกิ่งหนึ่ง: ทุกช่องที่ LoginOutcome
 * ประกาศว่าเป็นไปได้ ต้องมีที่ไปบนหน้าจอ
 */
import fs from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { jest } from '@jest/globals';
import { providerApiPaths } from '@/lib/services/provider-api';

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
const mockPost = jest.fn<(url: string, body?: unknown, options?: unknown) => Promise<ApiResult>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { post: (url: string, body?: unknown, options?: unknown) => mockPost(url, body, options) },
}));

import MfaEnrolmentForm from '../mfa-enrolment-form';

const SRC = path.resolve(__dirname, '../../../..');

const read = (rel: string) => fs.readFileSync(path.resolve(SRC, rel), 'utf8');

describe('ชนิดข้อมูลของคำตอบล็อกอิน ประกาศครบทุกทาง', () => {
    const api = read('lib/services/auth-service-api.ts');

    it('LoginOutcome มีทางของการลงทะเบียน 2FA ครั้งแรก', () => {
        expect(api).toContain('mfaSetupRequired');
        expect(api).toContain('setupToken');
    });

    it('แปลงคำตอบ mfa_setup_required จากหลังบ้าน ไม่ปล่อยให้ไหลไปด่าน token', () => {
        const branch = api.slice(api.indexOf('mfa_setup_required'));
        expect(branch).toContain('setup_token');
        // ต้องอยู่ก่อนด่าน "ไม่ได้รับ Token" ไม่งั้นกิ่งนี้ไม่มีวันทำงาน
        expect(api.indexOf('mfa_setup_required')).toBeLessThan(api.indexOf('ไม่ได้รับ Token'));
    });
});

describe('หน้าล็อกอินเจ้าหน้าที่รองรับทุกคำตอบ', () => {
    const page = read('app/auth/_components/provider-login-page.tsx');

    it('มีกิ่งของการลงทะเบียน 2FA และเรนเดอร์ฟอร์มของมัน', () => {
        expect(page).toContain('mfaSetupRequired');
        expect(page).toContain('MfaEnrolmentForm');
    });

    it('ยังมีกิ่งเดิมของคนที่ตั้ง 2FA แล้ว — การเพิ่มกิ่งใหม่ต้องไม่ทับของเก่า', () => {
        expect(page).toContain('MfaChallengeForm');
        expect(page).toContain('mfaSession');
    });
});

describe('ฟอร์มลงทะเบียนเครื่องยืนยันตัวตน', () => {
    const form = read('app/auth/_components/mfa-enrolment-form.tsx');

    // เดิมตรึงว่าฟอร์มยิง '/identity/mfa/setup' ซึ่งหลังบ้านไม่ได้ mount — ทุกคำขอได้ 404 (security re-review
    // 2026-09-26-no-recovery-round34-review.md) เทสนั้นตรึงความผิดไว้ ใบนี้จึงตรึงที่ค่าคงที่ตัวเดียวกับหน้า
    // ความปลอดภัย และตรวจค่าคงที่นั้นกับ path ที่หลังบ้านประกาศจริง
    it('ยิงทั้งประตูขอรหัสลับ และประตูยืนยัน ผ่านค่าคงที่ตัวเดียวกับหน้าความปลอดภัย', () => {
        expect(form).toContain('providerApiPaths.mfaSetup');
        expect(form).toContain('providerApiPaths.mfaVerifySetup');
        expect(form).not.toMatch(/['"`]\/identity\/mfa\//);
    });

    it('ค่าคงที่นั้นคือ path ที่หลังบ้านเสิร์ฟจริง (อ่านจาก server.js + routes/api/index.js + identity/mfa.js)', () => {
        const BACKEND = path.resolve(SRC, '../../backend');
        const server = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');
        const apiIndex = fs.readFileSync(path.join(BACKEND, 'routes/api/index.js'), 'utf8');
        const mfaRouter = fs.readFileSync(path.join(BACKEND, 'routes/api/identity/mfa.js'), 'utf8');

        const apiPrefix = server.match(/app\.use\('([^']+)',\s*apiRoutes\)/)?.[1];
        const mfaMount = apiIndex.match(/router\.use\('([^']+)',\s*require\('\.\/identity\/mfa'\)\)/)?.[1];
        expect(apiPrefix).toBe('/api');
        expect(mfaMount).toBeTruthy();
        expect(mfaRouter).toMatch(/router\.post\('\/setup'/);
        expect(mfaRouter).toMatch(/router\.post\('\/verify-setup'/);

        expect(providerApiPaths.mfaSetup).toBe(`${apiPrefix}${mfaMount}/setup`);
        expect(providerApiPaths.mfaVerifySetup).toBe(`${apiPrefix}${mfaMount}/verify-setup`);
    });

    it('ส่งตั๋ว setup_token ไปกับคำขอ — ตอนนั้นยังไม่มี session ปกติ', () => {
        expect(form).toMatch(/Authorization: `Bearer \$\{setupToken\}`/);
    });

    /**
     * รหัสสำรองคือทางกลับเข้าระบบด้วยตัวเองถ้าทำเครื่องหาย และหลังบ้านแสดงครั้งเดียว หน้าจอที่ไม่แสดงมัน
     * เท่ากับทิ้งมันไป ตั้งแต่คำสั่ง 89 รหัสมากับคำตอบของ /setup คู่กับรหัสลับ ไม่ใช่กับ /verify-setup
     * (ดูเทสต์ที่เรนเดอร์จริงด้านล่าง)
     */
    it('แสดงรหัสสำรองที่หลังบ้านคืนมากับรหัสลับ และบอกว่าจะไม่แสดงอีก', () => {
        expect(form).toContain('backupCodes');
        expect(form).toContain('ระบบจะไม่แสดงอีก');
    });

    it('ช่องกรอกรหัสรับเฉพาะตัวเลข 6 หลัก และเรียกแป้นตัวเลขบนมือถือ', () => {
        expect(form).toContain("inputMode=\"numeric\"");
        expect(form).toContain('maxLength={6}');
        expect(form).toMatch(/replace\(\/\\D\/g, ''\)/);
    });

    it('เป้ากดไม่ต่ำกว่า 44px ตามเกณฑ์ของโปรเจกต์', () => {
        expect(form).toContain('min-h-[48px]');
        expect(form).toContain('min-w-[44px]');
    });

    /**
     * verify-setup ไม่คืน session ตามสัญญาของมัน — หน้าจอต้องบอกความจริงว่าต้อง
     * เข้าสู่ระบบอีกครั้ง ไม่ใช่แกล้งพาเข้าไปโดยเก็บรหัสผ่านไว้ยิงซ้ำ
     */
    it('บอกผู้ใช้ว่าต้องเข้าสู่ระบบอีกครั้ง', () => {
        expect(form).toContain('กลับไปเข้าสู่ระบบ');
    });
});

/**
 * คำสั่ง 89 ก ข้อ 1: ลงทะเบียนเสร็จได้ก็ต่อเมื่อผู้ใช้ติ๊กว่า "บันทึกรหัสสำรองแล้ว" และหลังบ้านปฏิเสธคำขอที่ไม่มี
 * backupCodesSaved: true รหัสสำรองมากับ /setup และแสดงครั้งเดียวคู่กับรหัสลับ
 */
describe('ฟอร์มลงทะเบียน: รหัสสำรองแสดงคู่กับรหัสลับ และต้องยืนยันว่าบันทึกแล้วก่อนเปิดใช้งาน', () => {
    const CODES = Array.from({ length: 10 }, (_, i) => `AAAA-${String(i + 1).padStart(4, '0')}`);
    const SETUP = {
        secret: 'ENROLSECRETBASE32',
        qrCodeUri: 'otpauth://totp/x?secret=ENROLSECRETBASE32',
        backupCodes: CODES,
        message: 'Scan the QR code',
    };
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;
    const onDone = jest.fn();
    const writeText = jest.fn<(text: string) => Promise<void>>();

    beforeEach(() => {
        mockPost.mockReset();
        writeText.mockReset();
        writeText.mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        mockPost.mockImplementation(async (url: string) => (url === providerApiPaths.mfaSetup
            ? { success: true, data: SETUP }
            : { success: true, data: { message: 'MFA enabled' } }));
    });

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        container?.remove();
        container = null;
    });

    async function flush(rounds = 10) {
        for (let i = 0; i < rounds; i++) {
            await act(async () => { await Promise.resolve(); });
        }
    }

    async function mount() {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<MfaEnrolmentForm setupToken="test-setup-ticket" onDone={onDone} />);
        });
        await flush();
    }

    function type(input: HTMLInputElement, value: string) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => {
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    const text = () => container!.textContent ?? '';
    const occurrences = (needle: string) => text().split(needle).length - 1;
    const codeInput = () => container!.querySelector<HTMLInputElement>('#mfa-setup-code')!;
    const submit = () => container!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const savedBox = () => container!.querySelector<HTMLButtonElement>('[role="checkbox"]');
    const buttonWith = (label: string) => Array.from(container!.querySelectorAll('button')).find((b) => (b.textContent || '').includes(label));
    const verifyBody = () => mockPost.mock.calls.find(([url]) => url === providerApiPaths.mfaVerifySetup)?.[1];

    async function tickSaved() {
        expect(savedBox()).not.toBeNull();
        await act(async () => { savedBox()!.click(); });
    }

    async function verifyWith(code: string) {
        type(codeInput(), code);
        await tickSaved();
        await act(async () => { submit().click(); });
        await flush();
    }

    it('รหัสสำรองทั้ง 10 รหัสจาก /setup แสดงรหัสละครั้ง ข้างรหัสลับ ก่อนมีการยืนยันใด ๆ', async () => {
        await mount();
        expect(mockPost).toHaveBeenCalledTimes(1);
        expect(mockPost.mock.calls[0][0]).toBe(providerApiPaths.mfaSetup);
        expect(text()).toContain('ENROLSECRETBASE32');
        for (const backupCode of CODES) {
            expect(occurrences(backupCode)).toBe(1);
        }
        expect(text()).toContain('ระบบจะไม่แสดงอีก');
        expect(text()).toContain('บันทึกรหัสสำรองแล้ว');
    });

    it('ปุ่มคัดลอกทั้งหมดคัดลอกรหัสสำรองทั้ง 10 รหัส บรรทัดละรหัส', async () => {
        await mount();
        await act(async () => { buttonWith('คัดลอกทั้งหมด')!.click(); });
        await flush(3);
        expect(writeText).toHaveBeenCalledWith(CODES.join('\n'));
    });

    it('ปุ่มยืนยันกดไม่ได้จนกว่าจะติ๊ก "บันทึกรหัสสำรองแล้ว" แม้กรอกรหัสครบ 6 หลัก', async () => {
        await mount();
        type(codeInput(), '123456');
        expect(submit().disabled).toBe(true);
        await tickSaved();
        expect(submit().disabled).toBe(false);
        type(codeInput(), '123');
        expect(submit().disabled).toBe(true);
    });

    it('คำขอยืนยันส่ง backupCodesSaved: true ไปกับรหัส 6 หลัก', async () => {
        await mount();
        await verifyWith('123456');
        expect(verifyBody()).toEqual({ code: '123456', backupCodesSaved: true });
    });

    it('หน้าจอเสร็จสิ้นไม่แสดงรหัสสำรองอีก บอกว่าแสดงไปแล้วในขั้นตอนก่อน และพากลับไปเข้าสู่ระบบ', async () => {
        await mount();
        await verifyWith('123456');
        for (const backupCode of CODES) {
            expect(text()).not.toContain(backupCode);
        }
        expect(text()).toContain('ระบบจะไม่แสดงอีก');
        expect(text()).not.toContain('ENROLSECRETBASE32');
        await act(async () => { buttonWith('กลับไปเข้าสู่ระบบ')!.click(); });
        expect(onDone).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['ประโยคไทยของหลังบ้าน', { errorTh: 'กรุณายืนยันว่าบันทึกรหัสสำรองแล้ว' }, 'กรุณายืนยันว่าบันทึกรหัสสำรองแล้ว'],
        ['ข้อความไทยสำรองของหน้าจอ เมื่อหลังบ้านไม่ส่งประโยคไทยมา', undefined, 'รหัสสำรอง'],
    ])('MFA_BACKUP_CODES_NOT_CONFIRMED แสดง%s ไม่ใช่ว่ารหัสผิด', async (_label, meta, expected) => {
        mockPost.mockImplementation(async (url: string) => (url === providerApiPaths.mfaSetup
            ? { success: true, data: SETUP }
            : {
                success: false,
                status: 400,
                error: 'ข้อมูลไม่ถูกต้อง',
                code: 'Confirm that you saved the backup codes',
                errorCode: 'MFA_BACKUP_CODES_NOT_CONFIRMED',
                ...(meta ? { meta } : {}),
            }));
        await mount();
        await verifyWith('123456');
        const alert = container!.querySelector('[role="alert"]');
        expect(alert?.textContent).toContain(expected);
        expect(alert?.textContent).not.toContain('รหัสไม่ถูกต้อง');
        expect(text()).toContain('AAAA-0001');
    });
});

// Round 3 (brief section 6): the setup ticket now lives 15 minutes, and when it runs out the server
// answers MFA_SETUP_TICKET_EXPIRED with a Thai sentence. The form must show that sentence, never
// "code wrong" (the person would retype codes until the login lock).
describe('ฟอร์มลงทะเบียน: ตั๋วหมดเวลาบอกว่าหมดเวลา ไม่ใช่รหัสผิด', () => {
    const SETUP = { secret: 'ENROLSECRETBASE32', qrCodeUri: 'otpauth://totp/x?secret=ENROLSECRETBASE32', backupCodes: ['AAAA-0001'] };
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        mockPost.mockReset();
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn() }, configurable: true });
    });
    afterEach(() => {
        if (root) { act(() => { root?.unmount(); }); root = null; }
        container?.remove();
        container = null;
    });
    async function flush(rounds = 10) {
        for (let i = 0; i < rounds; i++) { await act(async () => { await Promise.resolve(); }); }
    }
    function type(input: HTMLInputElement, value: string) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
    }

    it.each([
        ['ประโยคไทยของหลังบ้าน', { errorTh: 'หมดเวลาลงทะเบียนแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง' }, 'หมดเวลาลงทะเบียนแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง'],
        ['ข้อความไทยสำรองของหน้าจอ', undefined, 'หมดเวลา'],
    ])('MFA_SETUP_TICKET_EXPIRED แสดง%s', async (_label, meta, expected) => {
        mockPost.mockImplementation(async (url: string) => (url === providerApiPaths.mfaSetup
            ? { success: true, data: SETUP }
            : { success: false, status: 401, error: 'Unauthorized', code: 'MFA_SETUP_TICKET_EXPIRED', errorCode: 'MFA_SETUP_TICKET_EXPIRED', ...(meta ? { meta } : {}) }));
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => { root = createRoot(container!); root.render(<MfaEnrolmentForm setupToken="expired-ticket" onDone={jest.fn()} />); });
        await flush();
        type(container!.querySelector<HTMLInputElement>('#mfa-setup-code')!, '123456');
        await act(async () => { container!.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(); });
        await act(async () => { container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); });
        await flush();
        const alert = container!.querySelector('[role="alert"]');
        expect(alert?.textContent).toContain(expected);
        expect(alert?.textContent).not.toContain('รหัสไม่ถูกต้อง');
        expect(container!.textContent).toContain('เข้าสู่ระบบ');
    });
});
