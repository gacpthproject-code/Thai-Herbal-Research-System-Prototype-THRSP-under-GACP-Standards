'use strict';

const { isApplicantEditable } = require('../constants/applicant-editable-statuses');
const { assessPurposes, purposeRefusalBody } = require('../shared/certification-purposes');
const { validateFilingCompleteness } = require('../validation/application-submission-validator');
const {
    assertRequiredDocumentsPresent,
    buildRequirementSnapshot,
    isSubmitGateRefusal,
    submitGateRefusalBody,
    MODE_FIRST_SUBMIT,
    MODE_RESUBMIT,
} = require('./application-document-requirements');
const {
    resolveDeclarationsAcceptance,
    resolveRenewalChangeDeclaration,
    DECLARATIONS_REQUIRED,
    RENEWAL_CHANGE_DECLARATION_REQUIRED,
} = require('./application-declarations-gate');
const { assertCorrectionNotExpired } = require('./application-service/correction-deadline-guard');
const { refusalForPapersNotReplaced } = require('./application-service/requested-papers');

const APPLICATION_INCOMPLETE = 'APPLICATION_INCOMPLETE';
const INCOMPLETE_MESSAGE_TH = 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ';

const refuse = (httpStatus, body) => ({ refusal: { httpStatus, body } });

/** A correction filed past its deadline is expired here, in the deadline's name, and refused. */
async function judgeFiling({ prisma, application, fromStatus, payload = {}, holderScope = null }) {
    const from = String(fromStatus || '').toUpperCase();
    if (!isApplicantEditable(from)) {
        throw new TypeError(`judgeFiling: an application is not filed out of ${from || 'no status'}`);
    }
    const isFirstSubmit = from === 'DRAFT';
    // A CAR round sends evidence of a correction on site for a form review already accepted;
    // the other two doors file the form itself, and only they are asked its กทล.1 fields.
    const refilesTheForm = from !== 'CAR_PENDING';
    const formData = application && application.formData && typeof application.formData === 'object'
        ? application.formData
        : {};

    if (!isFirstSubmit) {
        const deadline = await assertCorrectionNotExpired(application, { prisma, fromStatus: from });
        if (deadline.expired) { return { refusal: deadline.refusal }; }
        if (from === 'REVISION_REQUESTED') {
            const papers = await refusalForPapersNotReplaced({ prisma, application, holderScope });
            if (papers) { return { refusal: papers }; }
        }
    }

    const purposes = assessPurposes(formData.certificationPurposes);
    if (!purposes.ok) { return refuse(400, purposeRefusalBody(purposes)); }

    const entity = application && application.entityId
        ? await prisma.entity.findUnique({ where: { id: application.entityId } })
        : null;
    const completeness = validateFilingCompleteness({ formData, application, entity, refilesTheForm });
    if (!completeness.isValid) {
        return refuse(422, {
            success: false,
            error: APPLICATION_INCOMPLETE,
            code: APPLICATION_INCOMPLETE,
            message: INCOMPLETE_MESSAGE_TH,
            messageTh: INCOMPLETE_MESSAGE_TH,
            errorsByStep: completeness.errorsByStep,
            missingFields: completeness.missingFields,
        });
    }

    let requirementStamp = null;
    try {
        const { appliedRules } = await assertRequiredDocumentsPresent({
            application, mode: isFirstSubmit ? MODE_FIRST_SUBMIT : MODE_RESUBMIT, holderScope,
        });
        if (isFirstSubmit) { requirementStamp = buildRequirementSnapshot(appliedRules); }
    } catch (error) {
        if (isSubmitGateRefusal(error)) { return refuse(422, submitGateRefusalBody(error)); }
        throw error;
    }

    try {
        const { acceptedAt } = resolveDeclarationsAcceptance({ formData, payload, isFirstSubmit });
        const renewalChangeDeclaration = resolveRenewalChangeDeclaration({ formData, payload, isFirstSubmit });
        return { refusal: null, requirementStamp, declarationsAcceptedAt: acceptedAt, renewalChangeDeclaration };
    } catch (error) {
        if (error && (error.code === DECLARATIONS_REQUIRED || error.code === RENEWAL_CHANGE_DECLARATION_REQUIRED)) {
            return refuse(422, {
                success: false, error: error.code, code: error.code, message: error.message, messageTh: error.messageTh,
            });
        }
        throw error;
    }
}

module.exports = { judgeFiling };
