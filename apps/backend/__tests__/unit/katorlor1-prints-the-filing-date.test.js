'use strict';

const { renderKatorlor1Html } = require('../../services/pdf/katorlor1-template-service');
const { mapHealthApplication } = require('../../routes/api/helpers/applications-helpers');

const SUBMITTED_AT = '2026-10-30T08:10:55.327Z';

const row = (formData, status) => ({
    id: 'cd15ff15',
    applicationNumber: 'APP-2569-MVUOY4RI-746DB8',
    status,
    createdAt: new Date('2026-10-29T17:09:11.073Z'),
    formData: { applicantType: 'JURISTIC', requestType: 'NEW', plantId: 'turmeric', farmData: {}, ...formData },
});

const meta = (html) => html.slice(html.indexOf('<div class="meta">'), html.indexOf('ส่วนที่ ๑'));

describe('กทล.1 prints the day the filing was submitted', () => {
    test('a certified filing prints its submission day, in Bangkok', () => {
        const html = meta(renderKatorlor1Html(row({ submittedAt: SUBMITTED_AT }, 'CERTIFIED'), null));
        expect(html).toContain('วันที่ยื่น 30 ตุลาคม 2569');
        expect(html).not.toContain('ยังไม่ได้ยื่น');
    });

    test('a draft never submitted says so and invents no date', () => {
        const html = meta(renderKatorlor1Html(row({}, 'DRAFT'), null));
        expect(html).toContain('วันที่ยื่น ยังไม่ได้ยื่น');
    });

    test('a filed row without a stamp says the day is not recorded, not that it was never filed', () => {
        const html = meta(renderKatorlor1Html(row({}, 'ASSIGNED_FOR_REVIEW'), null));
        expect(html).toContain('วันที่ยื่น ไม่มีบันทึก');
        expect(html).not.toContain('ยังไม่ได้ยื่น');
        expect(html).not.toContain('29 ตุลาคม 2569');
    });
});

describe('the applicant list carries the same submission day', () => {
    test('submittedAt is the stamped day, not undefined and not the draft day', () => {
        const mapped = mapHealthApplication({ ...row({ submittedAt: SUBMITTED_AT }, 'CERTIFIED'), certificates: [] });
        expect(mapped.submittedAt).toBe(SUBMITTED_AT);
    });

    test('a draft has no submission day', () => {
        const mapped = mapHealthApplication({ ...row({}, 'DRAFT'), certificates: [] });
        expect(mapped.submittedAt).toBeNull();
    });
});

describe('staff screens carry the submission day too', () => {
    const { buildApplicationSummary } = require('../../services/certification-decision-file-service');
    const { toReviewerQueueItem } = require('../../routes/api/provider/handlers/queue-utils');

    test('the approver file dates the filing by its submission', async () => {
        const summary = await buildApplicationSummary({ prisma: { plantSpecies: { findUnique: async () => null } }, application: row({ submittedAt: SUBMITTED_AT }, 'AUDIT_PASSED') });
        expect(summary.submittedAt).toBe(SUBMITTED_AT);
    });

    test('the reviewer queue orders by the submission day', () => {
        expect(toReviewerQueueItem(row({ submittedAt: SUBMITTED_AT }, 'ASSIGNED_FOR_REVIEW')).submittedAt).toBe(SUBMITTED_AT);
    });
});
