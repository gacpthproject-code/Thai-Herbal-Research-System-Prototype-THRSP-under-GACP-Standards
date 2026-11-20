'use strict';

/**
 * The edit view (apps/web-app/.../[id]/edit/client-view.tsx) rebuilds the wizard store from
 * GET /api/applications/:id → `buildApplicationDetailPayload(app).formData`, and the wizard's
 * next save posts that whole store back through POST /draft's allowlist
 * (WIZARD_OWNED_FORM_DATA_KEYS). A wizard-owned key this echo leaves out therefore comes
 * back as its blank, and the first edit made in the edit view writes the blank over the
 * stored answer. Found by reading in the renewal-prefill re-review (2026-10-28): the echo
 * was a hand-typed list that had drifted from the allowlist by five keys, among them the
 * whole of step 4 (varieties, varietiesNote, processing).
 *
 * So the echo is judged against the allowlist itself: every key an applicant may write is
 * read back as stored.
 */

const { buildApplicationDetailPayload } = require('../../routes/api/helpers/application-payload-builders');
const { WIZARD_OWNED_FORM_DATA_KEYS } = require('../../routes/api/helpers/application-constants');

/** A distinct, non-blank stored value per key, so a key the echo drops cannot pass by coincidence. */
function storedAnswers() {
    const stored = {};
    WIZARD_OWNED_FORM_DATA_KEYS.forEach((key, index) => {
        stored[key] = { answeredAs: key, nth: index + 1 };
    });
    return stored;
}

function draftApplication(formData) {
    return {
        id: 'app-1',
        applicationNumber: 'APP-2569-MUJZVOTO-80E5FE',
        healthId: 'health-1',
        serviceType: 'NEW',
        status: 'DRAFT',
        consentedPDPA: false,
        createdAt: new Date('2026-10-28T00:00:00Z'),
        updatedAt: new Date('2026-10-28T00:00:00Z'),
        workflowHistory: [],
        comments: [],
        formData,
    };
}

describe('buildApplicationDetailPayload — the edit view reads back every answer the wizard may write', () => {
    it('echoes each key of WIZARD_OWNED_FORM_DATA_KEYS exactly as stored', () => {
        const stored = storedAnswers();
        const echoed = buildApplicationDetailPayload(draftApplication({ ...stored, workflowState: 'DRAFT' })).formData;

        const dropped = WIZARD_OWNED_FORM_DATA_KEYS.filter((key) => JSON.stringify(echoed[key]) !== JSON.stringify(stored[key]));
        expect(dropped).toEqual([]);
    });

    it('the whole of step 4 and the previous certificate number come back as stored', () => {
        const varieties = [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์วิจัยสกลนคร', quantity: '400', unit: 'เมล็ด' }];
        const processing = { plantPart: 'ช่อดอก', quantity: '120', unit: 'กิโลกรัม' };
        const echoed = buildApplicationDetailPayload(draftApplication({
            plantId: 'cannabis', varieties, varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป', processing, previousCertificateNumber: '61/2569',
        })).formData;

        expect({
            varieties: echoed.varieties,
            varietiesNote: echoed.varietiesNote,
            processing: echoed.processing,
            previousCertificateNumber: echoed.previousCertificateNumber,
        }).toEqual({ varieties, varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป', processing, previousCertificateNumber: '61/2569' });
    });

    it('a key the draft never answered is echoed as null, and the server-owned facts the edit page shows stay', () => {
        const echoed = buildApplicationDetailPayload(draftApplication({
            plantId: 'cannabis', requestType: 'RENEWAL', applicantType: 'JURISTIC', certScope: 'PLANTING', _lastReviewComment: 'แก้ที่อยู่แปลง',
        })).formData;

        expect(echoed).toMatchObject({
            plantId: 'cannabis', varieties: null, varietiesNote: null, processing: null,
            requestType: 'RENEWAL', applicantType: 'JURISTIC', certScope: 'PLANTING', _lastReviewComment: 'แก้ที่อยู่แปลง',
        });
        expect(Object.keys(echoed).filter((key) => !WIZARD_OWNED_FORM_DATA_KEYS.includes(key)).sort())
            .toEqual(['_lastReviewComment', 'applicantType', 'certScope', 'requestType']);
    });
});
