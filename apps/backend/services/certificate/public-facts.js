'use strict';

/**
 * What a public scan may be told about a certificate in force: its scope and who will issue it.
 *
 * Both public doors speak through this module, GET /api/public/verify/:number
 * (routes/api/auth/public.js) and the buyer's lot door GET /api/trace/lot/:id
 * (routes/api/trace/trace-batch-lot-routes.js), so the answer cannot depend on the door a
 * scan arrives at. The select and the projection sit together because a column the
 * projection reads but the select never asks for comes back undefined, not as an error.
 */

const { AREA_TYPES, AREA_TYPE_SCOPE_LABEL_TH, asAreaWord } = require('../../validation/canonical-application-validator');

/**
 * Operator order 56(0): until the official arrangement with the department is complete, the
 * issuer is stated in the future tense. The web prints the same sentence from
 * apps/web-app/src/constants/service-facts.ts; frontend-service-facts-mirror.test.js pins the two.
 */
const CERTIFICATE_ISSUER_TH =
    'ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ';

/**
 * Every certificate column publicCertificateFacts reads. The cultivation types come from the
 * certificate's own scope rows, the record of what was decided (ISO/IEC 17065 7.7.1(d)), never
 * from the application, whose data can change after the decision.
 */
const PUBLIC_CERTIFICATE_FACTS_SELECT = Object.freeze({
    cropType: true,
    standardName: true,
    scopes: Object.freeze({ select: Object.freeze({ areaType: true, status: true }) }),
});

/**
 * Operator order 68(1): the scope is the crop, the cultivation type in Thai and the standard.
 * A scope row withdrawn from the certificate is not shown. The purposes on the application
 * (research, export, processing) belong to another agency's licence and are never part of it.
 */
function publicCertificateFacts(certificate) {
    const certified = new Set(certificate.scopes
        .filter((row) => row.status.toLowerCase() === 'active')
        .map((row) => asAreaWord(row.areaType)));
    return {
        scope: {
            crop: certificate.cropType,
            cultivationTypes: AREA_TYPES
                .filter((code) => certified.has(code))
                .map((code) => ({ code, labelTh: AREA_TYPE_SCOPE_LABEL_TH[code] })),
            standard: certificate.standardName,
        },
        issuingAuthority: CERTIFICATE_ISSUER_TH,
    };
}

module.exports = { CERTIFICATE_ISSUER_TH, PUBLIC_CERTIFICATE_FACTS_SELECT, publicCertificateFacts };
