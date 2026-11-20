/**
 * The admin recovery form (orders 31 and 35, operator 2026-10-07). It offers no status that
 * is another role's decision, REJECTED included. Closing an application the applicant cannot
 * fix is ยกเลิก (CANCELLED) with a reason from the fixed list, sent as closureReasonCode.
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { ForceStatusModal, FORCE_STATUS_OPTIONS } from '../ForceStatusModal';
import { APPLICATION_CLOSURE_REASONS } from '@/constants/application-closure-reasons';

type Payload = { applicationId: string; toStatus: string; reasonCode: string; reason: string; closureReasonCode?: string };
const submit = jest.fn<(p: Payload) => Promise<{ success: boolean }>>();

let container: HTMLDivElement;
let root: Root;

const confirmButton = () => container.querySelector('[data-testid="force-status-submit"]') as HTMLButtonElement;

async function type(selector: string, value: string) {
    const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!el) throw new Error(`${selector} not found`);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value);
    await act(async () => {
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
}

async function fillCommon(toStatus: string) {
    await type('#force-status-new', toStatus);
    await type('#force-status-reason', 'ผู้ถือเลิกกิจการแล้วตามหนังสือรับรอง');
    await type('#force-status-confirm', 'app-1');
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    submit.mockReset().mockResolvedValue({ success: true });
    act(() => {
        root.render(
            <ForceStatusModal applicationId="app-1" currentStatus="AUDIT_CONFIRMED" open onClose={() => {}} submitHandler={submit} />,
        );
    });
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('what the form offers', () => {
    it('no status that is another role\'s decision, and no retired value', () => {
        const offered = FORCE_STATUS_OPTIONS.map((o) => o.value);
        for (const decision of ['DOC_APPROVED', 'REVISION_REQUESTED', 'AUDIT_PASSED', 'CAR_PENDING', 'REJECTED', 'APPROVED', 'CERTIFIED', 'REGISTERED']) {
            expect(offered).not.toContain(decision);
        }
        expect(offered).toContain('CANCELLED');
    });

    it('no closure reason list until ยกเลิก is chosen', async () => {
        expect(container.querySelector('#force-status-closure-reason')).toBeNull();
        await type('#force-status-new', 'CAR_REVIEWING');
        expect(container.querySelector('#force-status-closure-reason')).toBeNull();
    });
});

describe('closing as ยกเลิก', () => {
    it('lists the fixed reasons and keeps confirm disabled until one is picked', async () => {
        await fillCommon('CANCELLED');
        const options = Array.from(container.querySelectorAll('#force-status-closure-reason option'))
            .map((o) => (o as HTMLOptionElement).value).filter(Boolean);
        expect(options).toEqual(Object.keys(APPLICATION_CLOSURE_REASONS));
        expect(options).toContain('PURPOSE_NOT_IN_SCOPE');
        expect(container.textContent).toContain(APPLICATION_CLOSURE_REASONS.HOLDER_DISSOLVED);
        expect(confirmButton().disabled).toBe(true);
        await type('#force-status-closure-reason', 'HOLDER_DISSOLVED');
        expect(confirmButton().disabled).toBe(false);
    });

    it('sends the picked code as closureReasonCode', async () => {
        await fillCommon('CANCELLED');
        await type('#force-status-closure-reason', 'HOLDER_DISSOLVED');
        await act(async () => { confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit.mock.calls[0][0]).toMatchObject({ toStatus: 'CANCELLED', closureReasonCode: 'HOLDER_DISSOLVED' });
    });

    it('a recovery to another status sends no closure reason', async () => {
        await fillCommon('CAR_REVIEWING');
        await act(async () => { confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit.mock.calls[0][0]).not.toHaveProperty('closureReasonCode');
    });
});
