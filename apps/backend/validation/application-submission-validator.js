'use strict';

/**
 * Shared submission-completeness gate.
 *
 * A กทล.1 filing names its holder at step 1 and types no identity of its own: ส่วนที่ ๑ is
 * judged on the holder record (shared/holder-registry.js), the same record the form and
 * the certificate print. A legacy filing keeps its step-4 applicantData check.
 */
const { normalizeDocuments } = require('../routes/api/preview/preview-utils');
const { validateCanonicalSubmission, isKatorlor1Filing } = require('./canonical-application-validator');
const { readHolder, missingHolderFields } = require('../shared/holder-registry');

function validateFilingCompleteness({ formData, application, entity, refilesTheForm = true }) {
    const normalizedDocuments = normalizeDocuments(formData, application);
    const canonicalResult = validateCanonicalSubmission(formData, normalizedDocuments, { refilesTheForm });
    const errorsByStep = { ...canonicalResult.errorsByStep };
    const missingFields = [...canonicalResult.missingFields];

    // The holder record is กทล.1 ส่วนที่ ๑: asked where the form is filed, not of CAR evidence (F-A8c-06).
    if (isKatorlor1Filing(formData) && refilesTheForm) {
        const missing = missingHolderFields(readHolder(entity));
        if (missing.length > 0) {
            errorsByStep.holder = missing.map((f) => ({ path: f.path, message: `${f.labelTh} จำเป็น`, code: 'HOLDER_INCOMPLETE' }));
            missingFields.push(...missing.map((f) => `holder.${f.path}`));
        }
    }

    return Object.keys(errorsByStep).length === 0
        ? { isValid: true }
        : { isValid: false, errorsByStep, missingFields };
}

module.exports = { validateFilingCompleteness };
