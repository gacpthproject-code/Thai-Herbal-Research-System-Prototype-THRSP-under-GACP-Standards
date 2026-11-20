/**
 * Step 2 never leaves the document section silent.
 *
 * Staging walk ccc4f707d (F13): the first visit to step 2 showed no document cards and no
 * sentence about them. The server had answered the requirements call with zero slots and a
 * blocking issue (the filing could not be judged yet), and the page dropped both.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import Step2Identity from '../step2-identity';
import { STEP2_COPY_TH } from '../step2-identity-config';
import type { HolderRecord } from '@/lib/holder/holder-registry';

const holder: HolderRecord = {
    id: 'ent-1', type: 'INDIVIDUAL', typeLabelTh: 'บุคคลธรรมดา', identitySource: 'SELF_DECLARED', verified: false,
    legalName: '', registrationNo: '', person: { title: 'นาย', firstName: 'ทดสอบ', lastName: 'ผู้ยื่น', idCard: '1-XXXX-XXXX-X-0001', nationality: 'ไทย' },
    signatory: null, contact: { address: '1 หมู่ 2', phone: '0812345678', email: '' }, houseCode: '', lockedFields: [], missing: [], complete: true,
};

const UNREADABLE_TH = 'คำขอนี้ระบุลักษณะพื้นที่ปลูกด้วยค่าที่ระบบอ่านไม่ออก ระบบจึงยังไม่ทราบว่าต้องใช้เอกสารชุดใด';

function render(props: Partial<React.ComponentProps<typeof Step2Identity>> = {}): string {
    return renderToStaticMarkup(
        <Step2Identity
            holder={holder} holderLoading={false} holderError={null} onRetryHolder={() => {}}
            slots={[]} appId="app-1" onChanged={() => {}}
            {...props}
        />,
    );
}

describe('step 2 with no qualification papers to show', () => {
    it('repeats the server\'s reason when the filing cannot be judged yet', () => {
        const html = render({ blockingIssues: [{ code: 'AREA_TYPE_UNREADABLE', messageTH: UNREADABLE_TH, detail: { areaTypes: [], accepted: [] } }] });
        expect(html).toContain(STEP2_COPY_TH.documentsHeading);
        expect(html).toContain(UNREADABLE_TH);
    });

    it('says plainly that this holder owes no qualification paper when the server asked none', () => {
        const html = render({ blockingIssues: [] });
        expect(html).toContain(STEP2_COPY_TH.documentsHeading);
        expect(html).toContain(STEP2_COPY_TH.noQualificationPapers);
    });
});
