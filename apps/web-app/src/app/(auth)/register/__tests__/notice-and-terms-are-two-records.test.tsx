import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockRegister = jest.fn(async (_data: unknown) => ({ success: true }));
jest.mock('@/lib/services/auth-service', () => ({
    AuthService: { register: (data: unknown) => mockRegister(data) },
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { LanguageProvider } from '@/lib/i18n/language-context';
import RegisterPage from '@/app/(auth)/register/page';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockRegister.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
});

async function type(id: string, value: string) {
    const input = document.getElementById(id) as HTMLInputElement;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
}

async function click(el: Element | null) {
    expect(el).not.toBeNull();
    await act(async () => { (el as HTMLElement).click(); });
}

const nextButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('ถัดไป')) ?? null;
const submitButton = () => container.querySelector('button[type="submit"]');

async function reachConfirmStep() {
    await act(async () => {
        root = createRoot(container);
        root.render(<LanguageProvider><RegisterPage /></LanguageProvider>);
    });
    await type('reg-identifier', '1101400100795');
    await type('reg-firstName', 'สมชาย');
    await type('reg-lastName', 'ใจดี');
    await click(nextButton());
    await type('reg-email', 'somchai@example.com');
    await type('reg-phone', '0812345678');
    await click(nextButton());
    await type('reg-password', 'Abcdef12345!');
    await type('reg-confirm-password', 'Abcdef12345!');
    await click(nextButton());
}

describe('registration: the notice and the terms are two boxes, two records', () => {
    it('shows two boxes, each linking to the real page it names', async () => {
        await reachConfirmStep();
        const privacy = document.getElementById('reg-privacy-ack');
        const terms = document.getElementById('reg-terms-accept');
        expect(privacy).not.toBeNull();
        expect(terms).not.toBeNull();
        const privacyLabel = container.querySelector('label[for="reg-privacy-ack"]');
        const termsLabel = container.querySelector('label[for="reg-terms-accept"]');
        expect(privacyLabel?.textContent).toContain('รับทราบ');
        expect(privacyLabel?.textContent).not.toContain('ยินยอม');
        expect(container.querySelector('a[href="/privacy-policy"]')).not.toBeNull();
        expect(container.querySelector('a[href="/terms-of-service"]')).not.toBeNull();
        expect(termsLabel?.textContent).toContain('ยอมรับ');
    });

    it('ticking only the notice does not register, and says the terms are missing', async () => {
        await reachConfirmStep();
        await click(document.getElementById('reg-privacy-ack'));
        await click(submitButton());
        expect(mockRegister).not.toHaveBeenCalled();
        expect(document.getElementById('reg-terms-accept-error')?.textContent).toBeTruthy();
        expect(document.getElementById('reg-privacy-ack-error')).toBeNull();
    });

    it('ticking both sends each answer from its own box', async () => {
        await reachConfirmStep();
        await click(document.getElementById('reg-privacy-ack'));
        await click(document.getElementById('reg-terms-accept'));
        await click(submitButton());
        expect(mockRegister).toHaveBeenCalledTimes(1);
        expect(mockRegister.mock.calls[0][0]).toMatchObject({ acceptedTermsOfService: true, acceptedPrivacyPolicy: true });
    });
});
