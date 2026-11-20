import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { HolderRecord } from '@/lib/holder/holder-registry';
import HolderRecordPage from '../page';

const record = (over: Partial<HolderRecord> = {}): HolderRecord => ({
    id: 'ent-1',
    type: 'JURISTIC',
    typeLabelTh: 'นิติบุคคล',
    identitySource: 'SELF_DECLARED',
    verified: false,
    legalName: 'บริษัท ทดสอบ จำกัด',
    registrationNo: '0105555123456',
    person: null,
    signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '3-XXXX-XXXX-X-3450', nationality: 'ไทย' },
    contact: { address: '1 หมู่ 2', phone: '0812345678', email: '' },
    houseCode: '',
    lockedFields: [],
    missing: [],
    complete: true,
    ...over,
});

const INCOMPLETE = record({ contact: { address: '1 หมู่ 2', phone: '', email: '' }, missing: [{ path: 'contact.phone', labelTh: 'โทรศัพท์' }], complete: false });

const state: { holder: HolderRecord; afterSave: HolderRecord } = { holder: record(), afterSave: record() };

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'ent-1' }),
    useRouter: () => ({ push: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { put: jest.fn(async () => ({ success: true, data: {} })) },
}));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ refresh: async () => undefined }),
}));
jest.mock('@/components/holder/holder-form', () => ({
    HolderForm: () => <div data-testid="holder-form" />,
}));
const answers = new Map<HolderRecord, object>();
const reload = async () => { state.holder = state.afterSave; };
jest.mock('@/lib/holder/use-holder-record', () => ({
    useHolderRecord: () => {
        if (!answers.has(state.holder)) {
            answers.set(state.holder, {
                entity: { id: 'ent-1', type: 'JURISTIC', slug: null, displayName: 'บริษัท ทดสอบ จำกัด', role: 'OWNER', permissions: [], holder: state.holder },
                holder: state.holder,
                loading: false,
                error: null,
                reload,
            });
        }
        return answers.get(state.holder);
    },
}));


describe('the holder page says which required fields are missing', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    async function open(holder: HolderRecord, afterSave: HolderRecord = holder) {
        state.holder = holder;
        state.afterSave = afterSave;
        await act(async () => { root.render(<HolderRecordPage />); });
    }
    async function save() {
        const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'บันทึก');
        await act(async () => { button!.click(); });
    }
    const incompleteNotice = () => container.querySelector('[data-testid="holder-incomplete"]');
    const savedStatus = () => container.querySelector('[data-testid="holder-saved"]');

    it('on load, an incomplete record names each missing field', async () => {
        await open(INCOMPLETE);
        expect(incompleteNotice()?.textContent).toContain('ข้อมูลผู้ถือยังไม่ครบ');
        expect(incompleteNotice()?.textContent).toContain('โทรศัพท์');
    });

    it('a save that leaves a required field empty says saved and still incomplete, not a plain success', async () => {
        await open(record(), INCOMPLETE);
        expect(incompleteNotice()).toBeNull();
        await save();
        expect(savedStatus()?.textContent).toContain('บันทึกแล้ว');
        expect(savedStatus()?.textContent).toContain('ยังไม่ครบ');
        expect(incompleteNotice()?.textContent).toContain('โทรศัพท์');
    });

    it('an incomplete answer without the missing list still renders the notice instead of crashing', async () => {
        const { missing: _omitted, ...withoutMissing } = INCOMPLETE;
        await open(withoutMissing as HolderRecord);
        expect(incompleteNotice()?.textContent).toContain('ข้อมูลผู้ถือยังไม่ครบ');
    });

    it('a save that completes the record says saved, with no missing-field notice', async () => {
        await open(INCOMPLETE, record());
        await save();
        expect(savedStatus()?.textContent).toBe('บันทึกแล้ว');
        expect(incompleteNotice()).toBeNull();
    });
});
