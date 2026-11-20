'use strict';

/**
 * The reads the field app's writers make under the application row lock, for suites that mock
 * prisma (security re-review 2026-10-09 L3-L5): the application's status and version, the
 * evidence row's inspector, and the application row a decision is laid over (its filing, status
 * and history, as the result writer services/inspection-result-service.js reads them). Answered from the audit row
 * `findAudit` returns, shaped like the one `auditChecklist.findFirst` returns (with `.application`),
 * so a stub keeps answering the question the code actually asks.
 *
 * @param {(key: { applicationId?: string, auditId?: string }) => object|null} findAudit
 * @returns {{ $queryRaw: Function, application: { findUnique: Function } }}
 */
function visitLockStub(findAudit) {
    return {
        $queryRaw: jest.fn(async (strings, id) => {
            const sql = strings.join('?');
            if (/FROM applications/.test(sql)) {
                const audit = findAudit({ applicationId: id });
                return audit && audit.application ? [{ status: audit.application.status, version: 0 }] : [];
            }
            if (/FROM audit_checklists/.test(sql)) {
                const audit = findAudit({ auditId: id });
                return audit ? [{ id: audit.id, auditorId: audit.auditorId }] : [];
            }
            return [];
        }),
        application: {
            findUnique: jest.fn(async ({ where }) => {
                const audit = findAudit({ applicationId: where.id });
                if (!audit || !audit.application) { return null; }
                const { id, applicationNumber, healthId, status, workflowHistory } = audit.application;
                return { id, applicationNumber, healthId, status, formData: audit.application.formData || {}, workflowHistory: workflowHistory || [] };
            }),
        },
    };
}

module.exports = { visitLockStub };
