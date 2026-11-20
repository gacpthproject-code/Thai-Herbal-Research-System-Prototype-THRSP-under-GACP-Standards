'use strict';

const { renderKatorlor1Html } = require('../../services/pdf/katorlor1-template-service');

const filing = (purposes, plantId = 'cannabis') => ({
    id: 'app-1',
    applicationNumber: 'GACP-TEST-02',
    formData: {
        applicantType: 'INDIVIDUAL', requestType: 'NEW', certScope: 'PLANTING', plantId,
        certificationPurposes: purposes,
        farmData: { siteName: 'สวน', siteAddress: '1', landOwnership: 'OWNED', areaTypes: ['OUTDOOR'], areaSqm: '10' },
    },
});

const sectionTwo = (html) => html.split('ส่วนที่ ๒')[1].split('ส่วนที่ ๓')[0];
const purposeRow = (html) => {
    const s2 = sectionTwo(html);
    const at = s2.indexOf('<span class="lbl">วัตถุประสงค์</span>');
    return s2.slice(at, s2.indexOf('</div>', at) + 6);
};
const ticked = (html) => [...purposeRow(html).matchAll(/☑\s*([^☐☑<]+)/g)].map((m) => m[1].trim());
const LINE = 'วัตถุประสงค์ตามใบอนุญาต:';

describe('กทล.1 section 2 purposes', () => {
    test('the row prints the three purposes an applicant can choose, and no medical box', () => {
        const row = purposeRow(renderKatorlor1Html(filing(['RESEARCH']), null));
        expect(row).toContain('ศึกษาวิจัย');
        expect(row).toContain('ส่งออกเพื่อการค้า');
        expect(row).toContain('แปรรูปหรือจำหน่ายเพื่อการค้า');
        expect(row).not.toContain('การแพทย์');
    });

    test.each([
        [['RESEARCH'], ['ศึกษาวิจัย']],
        [['EXPORT'], ['ส่งออกเพื่อการค้า']],
        [['PROCESSING'], ['แปรรูปหรือจำหน่ายเพื่อการค้า']],
        [['PROCESSING', 'RESEARCH'], ['ศึกษาวิจัย', 'แปรรูปหรือจำหน่ายเพื่อการค้า']],
    ])('%j ticks exactly %j', (purposes, expected) => {
        expect(ticked(renderKatorlor1Html(filing(purposes), null))).toEqual(expected);
    });

    test('a turmeric research filing ticks its purpose (walk round 2)', () => {
        expect(ticked(renderKatorlor1Html(filing(['RESEARCH'], 'turmeric'), null))).toEqual(['ศึกษาวิจัย']);
    });

    test('a retired word ticks nothing and prints no licence line', () => {
        const html = renderKatorlor1Html(filing(['MEDICAL']), null);
        expect(ticked(html)).toEqual([]);
        expect(sectionTwo(html)).not.toContain(LINE);
    });

    test('cannabis names the licence behind every chosen purpose', () => {
        const html = renderKatorlor1Html(filing(['EXPORT', 'RESEARCH']), null);
        expect(sectionTwo(html)).toContain(`${LINE} ศึกษาวิจัย (ภ.ท. 09), ส่งออกเพื่อการค้า (ภ.ท. 10)`);
    });

    test('a non-cannabis herb has no ภ.ท. licence line', () => {
        expect(sectionTwo(renderKatorlor1Html(filing(['RESEARCH', 'PROCESSING'], 'turmeric'), null))).not.toContain(LINE);
        expect(sectionTwo(renderKatorlor1Html(filing(['RESEARCH'], 'kratom'), null))).not.toContain(LINE);
    });

    test('kratom EXPORT names the section-10 licence', () => {
        expect(sectionTwo(renderKatorlor1Html(filing(['EXPORT'], 'kratom'), null)))
            .toContain(`${LINE} ส่งออก (ใบอนุญาตตามมาตรา 10 พ.ร.บ.พืชกระท่อม พ.ศ. 2565)`);
    });
});
