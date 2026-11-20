'use strict';

const { RESEARCH_CONSENT_NOTICE } = require('../../shared/research-consent-notice');
const { RESEARCH_USE_BASES } = require('../../data/datasets/research-use-bases');
const {
    RESEARCH_BASIS, PUBLISH, ACCEPTED_RESEARCH_CONSENT_VERSIONS, DATASET_DOMAINS, DATASET_LISTS, WITHDRAWN_DELETION_DUTY,
} = require('../../data/datasets/dataset-domains');

const REWRITE_SECTION_2 =
    'ข้อมูลที่ส่งออกเพื่อการวิจัยเปลี่ยนไปแล้ว ต้องแก้รายการวิจัยในข้อ 2 ของหน้านโยบายความเป็นส่วนตัว '
    + '(apps/web-app/src/app/(marketing)/privacy-policy/page.tsx) ในการเปลี่ยนแปลงเดียวกัน และถ้อยคำใหม่ต้องได้รับอนุมัติจาก operator (คำสั่ง 85(6), 49)';

function asSection2Says(check) {
    try {
        check();
    } catch (err) {
        err.message = `${REWRITE_SECTION_2}\n\n${err.message}`;
        throw err;
    }
}

const surveyAnswers = DATASET_DOMAINS.find((domain) => domain.key === 'survey-responses');

describe('privacy notice section 2: research uses consented survey answers only, and they leave under pseudonyms', () => {
    test('answers leave only when consented under the separate notice the page names, with the university it names, and not withdrawn', () => {
        asSection2Says(() => {
            expect(RESEARCH_CONSENT_NOTICE.title).toBe('ข้อมูลก่อนตอบแบบสำรวจเพื่อการวิจัย');
            expect(RESEARCH_CONSENT_NOTICE.sections[0].body).toContain('งานวิจัยของโครงการที่ดำเนินการร่วมกับมหาวิทยาลัยราชภัฏสวนสุนันทา');
            expect(ACCEPTED_RESEARCH_CONSENT_VERSIONS).toEqual([RESEARCH_CONSENT_NOTICE.version]);
            expect(surveyAnswers.where).toEqual({
                response: {
                    researchConsentAt: { not: null },
                    researchConsentVersion: { in: [...ACCEPTED_RESEARCH_CONSENT_VERSIONS] },
                    researchConsentWithdrawnAt: null,
                },
            });
        });
    });

    test('reference ids leave as pseudonyms, the account id never leaves, and region and province pass the small-group rule', () => {
        asSection2Says(() => {
            const publishOf = Object.fromEntries(surveyAnswers.fields.map((field) => [field.field, field.publish]));
            expect(publishOf).toMatchObject({
                responseId: PUBLISH.PSEUDONYM,
                templateId: PUBLISH.PSEUDONYM,
                questionId: PUBLISH.PSEUDONYM,
                region: PUBLISH.REGION,
                province: PUBLISH.PROVINCE,
            });
            expect(surveyAnswers.withheld.map((entry) => entry.column)).toContain('SurveyResponse.respondentUserId');
        });
    });

    test('a withdrawal lands on the withdrawn list, which the research store must clear within 90 days', () => {
        asSection2Says(() => {
            expect(DATASET_LISTS.find((list) => list.key === 'survey-responses/withdrawn')?.thaiName).toBe('รายการคำตอบที่ถอนความยินยอมแล้ว');
            expect(WITHDRAWN_DELETION_DUTY).toContain('ให้เสร็จภายใน 90 วันนับจากวันที่ได้รับชุดข้อมูลที่มีรหัสแฝงนั้นในรายการ');
        });
    });

    test('application, farm and planting data do not leave: farm-operation data has no ruling, and only survey data leaves without one', () => {
        asSection2Says(() => {
            expect(RESEARCH_USE_BASES[RESEARCH_BASIS.FARM_OPERATION]).toEqual([]);
            expect(DATASET_DOMAINS.filter((domain) => domain.basis !== RESEARCH_BASIS.FARM_OPERATION).map((domain) => domain.key))
                .toEqual(['survey-responses', 'survey-questions']);
        });
    });
});
