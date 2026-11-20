/**
 * The screen says, under the box, what กทล.1 still needs (order 143(4)).
 *
 * A value the applicant typed that is not what the paper asks for (a position that is not
 * two numbers, a plant count of zero, a variety row with no name) is named at once, in Thai,
 * next to the box. An asterisk alone sends a farmer hunting for a blank that does not exist.
 */
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step3SiteLand from '../step3-site-land';
import Step4VarietyPurpose from '../step4-variety-purpose';

const alerts = (html: string) => Array.from(html.matchAll(/role="alert"[^>]*>([^<]*)</g)).map((m) => m[1]);

const site = {
    siteName: 'แปลง', siteAddress: '1', subDistrict: 'ก', district: 'ข', province: 'ค',
    landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '1' }, areaTypes: ['OUTDOOR'], areaSqm: '800',
    siteContactName: 'ก ข', sitePhone: '0812345678', siteContactIsApplicant: true,
    coordinates: '18.7883, 98.9853', plantsPerCycle: '500', cyclesPerYear: '2',
};

function step3(farmData: Record<string, unknown>) {
    return renderToStaticMarkup(
        <Step3SiteLand farmData={farmData} slots={[]} appId="app-1" onChange={() => {}} onChanged={() => {}} />,
    );
}

describe('step 3 names the field under the box', () => {
    it('a position that is not ละติจูด, ลองจิจูด', () => {
        const html = step3({ ...site, coordinates: 'หน้าวัด' });
        expect(alerts(html).join(' ')).toContain('พิกัด');
        expect(html).toContain('id="coordinates-error"');
    });

    it('a plant count of zero', () => {
        expect(alerts(step3({ ...site, plantsPerCycle: '0' })).join(' ')).toContain('จำนวนต้น');
    });

    it('cycles per year that is not a whole number', () => {
        expect(alerts(step3({ ...site, cyclesPerYear: '1.5' })).join(' ')).toContain('จำนวนรอบ');
    });

    it('marks พิกัด, จำนวนต้น and จำนวนรอบ as required', () => {
        const html = step3(site);
        for (const id of ['coordinates', 'plants-per-cycle', 'cycles-per-year']) {
            expect(html).toMatch(new RegExp(`for="${id}"[^>]*>[^<]*<span aria-hidden="true"[^>]*>\\*`));
        }
    });

    it('says nothing against a complete site', () => {
        expect(alerts(step3(site))).toEqual([]);
    });

    it('a draft resumed with the site started shows every gap at once, so a dead ถัดไป is never silent (round 2, M4)', () => {
        const resumed = { siteName: 'แปลง', siteAddress: '1', areaSqm: '800' };
        const said = alerts(step3(resumed)).join(' ');
        for (const label of ['สิทธิในที่ดิน', 'ประเภทเอกสารสิทธิ์', 'เลขที่เอกสารสิทธิ์', 'พิกัด', 'จำนวนต้น', 'จำนวนรอบ']) {
            expect(said).toContain(label);
        }
    });

    it('a site not started yet keeps its asterisks and says nothing', () => {
        expect(alerts(step3({}))).toEqual([]);
    });

    it('while the draft is still loading, nothing is said yet', () => {
        const html = renderToStaticMarkup(
            <Step3SiteLand farmData={{ siteName: 'แปลง' }} slots={[]} appId="app-1" onChange={() => {}} onChanged={() => {}} hydrating />,
        );
        expect(alerts(html)).toEqual([]);
    });
});

function step4(varieties: unknown[], objectives: string[] = ['EXPORT']) {
    return renderToStaticMarkup(
        <Step4VarietyPurpose
            plantId="cannabis" objectives={objectives} varieties={varieties as never} varietiesNote=""
            certScope="PLANTING" processing={{}} onChange={() => {}}
        />,
    );
}

describe('step 4 names the variety row that has no name', () => {
    it('a row the applicant started without naming the variety', () => {
        const html = step4([{ kind: 'SEED', name: '', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }]);
        expect(alerts(html).join(' ')).toContain('สายพันธุ์');
    });

    it('marks ชื่อสายพันธุ์ as required', () => {
        expect(step4([])).toMatch(/for="variety-name-0"[^>]*>[^<]*<span aria-hidden="true"[^>]*>\*/);
    });

    it('says nothing against a named variety', () => {
        expect(alerts(step4([{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'x', quantity: '1', unit: 'ต้น' }]))).toEqual([]);
    });

    it('a draft resumed with a purpose chosen and no variety says so at once (round 2, M4)', () => {
        expect(alerts(step4([], ['EXPORT'])).join(' ')).toContain('สายพันธุ์');
    });

    it('a step not started yet says nothing', () => {
        expect(alerts(step4([], []))).toEqual([]);
    });
});

const statuses = (html: string) => Array.from(html.matchAll(/role="status"[^>]*>([^<]*)</g)).map((m) => m[1]);
const CARRIED_OVER = 'ข้อมูลยกมาจากคำขอครั้งก่อน';
const asterisk = (id: string) => new RegExp(`for="${id}"[^>]*>[^<]*<span aria-hidden="true"[^>]*>\\*`);

function step3Of(farmData: Record<string, unknown>, extra: Record<string, unknown>) {
    const props = { farmData, slots: [], appId: 'app-1', onChange: () => {}, onChanged: () => {}, ...extra };
    return renderToStaticMarkup(<Step3SiteLand {...(props as unknown as ComponentProps<typeof Step3SiteLand>)} />);
}

function step4Of(varieties: unknown[], extra: Record<string, unknown>) {
    const props = {
        plantId: 'cannabis', objectives: ['EXPORT'], varieties, varietiesNote: '', certScope: 'PLANTING', processing: {}, onChange: () => {}, ...extra,
    };
    return renderToStaticMarkup(<Step4VarietyPurpose {...(props as unknown as ComponentProps<typeof Step4VarietyPurpose>)} />);
}

describe('a replacement (ใบแทน) is asked none of ส่วนที่ ๒; a renewal shows what it carried over (order 147)', () => {
    const started = { siteName: 'แปลง', siteAddress: '1', areaSqm: '800' };

    it('step 3 of a replacement names no gap and marks none of the ข้อ ๒ boxes required', () => {
        const html = step3Of(started, { requestType: 'REPLACEMENT' });
        expect(alerts(html)).toEqual([]);
        for (const id of ['coordinates', 'plants-per-cycle', 'cycles-per-year', 'land-doc-type', 'land-doc-number']) {
            expect(html).not.toMatch(asterisk(id));
        }
        expect(html).not.toMatch(/id="land-ownership-label"[^>]*>ที่ดินนี้คุณใช้โดยสิทธิใด<span aria-hidden="true"/);
        expect(statuses(html).join(' ')).not.toContain(CARRIED_OVER);
    });

    it('step 3 of a renewal still names every gap, under the carried-over line', () => {
        const html = step3Of(started, { requestType: 'RENEWAL' });
        expect(alerts(html).join(' ')).toContain('พิกัด');
        expect(html).toMatch(asterisk('coordinates'));
        expect(html).toMatch(/id="land-ownership-label"[^>]*>ที่ดินนี้คุณใช้โดยสิทธิใด<span aria-hidden="true"/);
        expect(statuses(html).join(' ')).toContain(CARRIED_OVER);
    });

    it('step 3 of a new filing has no carried-over line', () => {
        expect(statuses(step3Of(started, { requestType: 'NEW' })).join(' ')).not.toContain(CARRIED_OVER);
    });

    it('step 4 of a replacement with a purpose chosen and no variety says nothing', () => {
        const html = step4Of([], { requestType: 'REPLACEMENT' });
        expect(alerts(html)).toEqual([]);
        expect(html).not.toMatch(asterisk('variety-name-0'));
    });

    it('step 4 of a renewal still asks the variety, under the carried-over line', () => {
        const html = step4Of([], { requestType: 'RENEWAL' });
        expect(alerts(html).join(' ')).toContain('สายพันธุ์');
        expect(statuses(html).join(' ')).toContain(CARRIED_OVER);
        expect(statuses(step4Of([], { requestType: 'NEW' })).join(' ')).not.toContain(CARRIED_OVER);
    });
});
