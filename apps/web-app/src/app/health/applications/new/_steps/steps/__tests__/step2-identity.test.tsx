/**
 * Step 2 shows the holder record chosen at step 1, read-only (order 142). Nothing about the
 * holder is typed into the application: the screen prints what กทล.1 and the certificate will
 * print, says which fields are still missing, and links to the holder page to change them.
 * The document cards are still the server's answer for this filing.
 */

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import Step2Identity, { holderPageHref } from '../step2-identity';
import { STEP2_COPY_TH } from '../step2-identity-config';
import { HOLDER_PAGE_COPY_TH, type HolderRecord } from '@/lib/holder/holder-registry';

const holder = (over: Partial<HolderRecord> = {}): HolderRecord => ({
    id: 'ent-1',
    type: 'PARTNERSHIP',
    typeLabelTh: 'ห้างหุ้นส่วน',
    identitySource: 'SELF_DECLARED',
    verified: false,
    legalName: 'ห้างหุ้นส่วนจำกัด สองพี่น้อง',
    registrationNo: '0103555123458',
    person: null,
    signatory: { title: 'นาง', firstName: 'มาลี', lastName: 'ศรีสุข', idCard: '3-XXXX-XXXX-X-3450', nationality: 'ไทย' },
    contact: { address: '1 หมู่ 2', phone: '0812345678', email: '' },
    houseCode: '',
    lockedFields: [],
    missing: [],
    complete: true,
    ...over,
});

const slot = (slotId: string, labelTH: string) => ({
    slotId, labelTH, description: null, sourceHint: null,
    required: true, requiredReason: 'HOLDER_TYPE', satisfied: false,
    fileUrl: null, fileName: null, uploadedAt: null,
});

function render(props: Partial<React.ComponentProps<typeof Step2Identity>> = {}): string {
    return renderToStaticMarkup(
        <Step2Identity
            holder={holder()}
            holderLoading={false}
            holderError={null}
            onRetryHolder={() => {}}
            slots={[]}
            appId="app-1"
            onChanged={() => {}}
            {...props}
        />,
    );
}

describe('step 2 shows the holder record, read-only', () => {
    it('prints what กทล.1 will print, with the signatory named in two fields', () => {
        const html = render();
        expect(html).toContain('ห้างหุ้นส่วนจำกัด สองพี่น้อง');
        expect(html).toContain('0103555123458');
        expect(html).toContain('ชื่อหุ้นส่วนผู้จัดการ');
        expect(html).toContain('มาลี');
        expect(html).toContain('นามสกุลหุ้นส่วนผู้จัดการ');
        expect(html).toContain('ศรีสุข');
    });

    it('has no input for the holder: identity is never typed into an application', () => {
        expect(render()).not.toContain('<input');
    });

    it('links to the holder page to change it, and back to this step', () => {
        const html = render();
        expect(html).toContain(HOLDER_PAGE_COPY_TH.editHolder);
        expect(html).toContain(`href="${holderPageHref('ent-1').replace('&', '&amp;')}"`);
        expect(holderPageHref('ent-1')).toBe('/health/holders/ent-1?from=application');
    });

    it('names what is missing instead of letting the applicant move on', () => {
        const html = render({
            holder: holder({
                signatory: { title: '', firstName: '', lastName: '', idCard: '', nationality: '' },
                missing: [{ path: 'signatory.firstName', labelTh: 'ชื่อหุ้นส่วนผู้จัดการ' }],
                complete: false,
            }),
        });
        expect(html).toContain(HOLDER_PAGE_COPY_TH.incomplete);
        expect(html).toContain(STEP2_COPY_TH.notFilled);
    });

    it('an individual verified by ThaiD says so', () => {
        const html = render({
            holder: holder({
                type: 'INDIVIDUAL', identitySource: 'THAID', verified: true, legalName: 'สมชาย ตามบัตร',
                person: { title: 'นาย', firstName: 'สมชาย', lastName: 'ตามบัตร', nationality: 'ไทย' }, signatory: null,
            }),
        });
        expect(html).toContain(HOLDER_PAGE_COPY_TH.verifiedBy.THAID);
        expect(html).toContain('คำนำหน้าชื่อ');
    });

    it('a failed read says so and offers a retry, never an empty holder', () => {
        const html = render({ holder: null, holderError: HOLDER_PAGE_COPY_TH.loadFailed });
        expect(html).toContain(HOLDER_PAGE_COPY_TH.loadFailed);
        expect(html).toContain(HOLDER_PAGE_COPY_TH.retry);
    });
});

describe('the document cards', () => {
    it('are the server\'s answer for this filing', () => {
        const html = render({
            slots: [
                slot('producer_supervision_letter', 'หนังสือกำกับโดยผู้รับอนุญาตผลิตยา'),
                slot('id_house_reg', 'สำเนาบัตรประชาชนและทะเบียนบ้าน'),
            ],
        });
        expect(html).toContain('หนังสือกำกับโดยผู้รับอนุญาตผลิตยา');
        expect(html).toContain('สำเนาบัตรประชาชนและทะเบียนบ้าน');
    });
});
