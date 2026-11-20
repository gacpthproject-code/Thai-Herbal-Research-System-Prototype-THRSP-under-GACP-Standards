'use strict';

const path = require('path');

const mockWrite = jest.fn(async () => ({}));
const mockTxDeadlineUpdate = jest.fn(async () => ({}));
const mockNotifyParties = jest.fn(async () => ({}));

function loadChecker(deadline) {
    jest.resetModules();
    const tx = { revisionDeadline: { update: mockTxDeadlineUpdate } };
    const prisma = {
        revisionDeadline: { findMany: jest.fn(async () => [deadline]), update: jest.fn(async () => ({})) },
        user: { findMany: jest.fn(async () => []) },
        $transaction: jest.fn(async (fn) => fn(tx)),
    };
    jest.doMock('../../services/prisma-database', () => ({ prisma }));
    jest.doMock('../../services/notification-service', () => ({
        sendNotification: jest.fn(async () => ({})),
        NotifyType: { APPLICATION_EXPIRED: 'APPLICATION_EXPIRED', REVISION_DEADLINE_EXPIRED: 'REVISION_DEADLINE_EXPIRED' },
    }));
    jest.doMock('../../services/notification/application-parties', () => ({ notifyApplicationParties: mockNotifyParties }));
    jest.doMock('../../services/tenant-context', () => ({
        runWithTenantContext: (_ctx, fn) => fn(),
        withoutTenantScope: (fn) => fn(),
    }));
    jest.doMock('../../shared/logger', () => {
        const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        return { ...l, createLogger: jest.fn(() => l) };
    });
    jest.doMock('../../services/application-status-writer', () => ({ writeApplicationStatus: mockWrite }));
    jest.doMock('../../middleware/audit-logger', () => ({
        auditLogger: { log: jest.fn(async () => ({})) }, AuditCategory: { APPLICATION: 'APPLICATION' }, ResourceType: { APPLICATION: 'APPLICATION' },
    }));
    return require(path.resolve(__dirname, '../../jobs/revision-deadline-checker.js'));
}

const revisionDue = new Date('2026-10-30T16:59:59.999Z');
const overdueDeadline = {
    id: 'dl-1',
    status: 'PENDING',
    revisionDue,
    application: {
        id: 'app-1',
        applicationNumber: 'APP-2569-000001',
        status: 'REVISION_REQUESTED',
        healthId: 'health-1',
        organizationId: 'org-1',
        formData: { revisionRequestedAt: '2026-10-23T03:00:00.000Z', revisionDueAt: revisionDue.toISOString() },
        workflowHistory: [],
        applicant: { firstName: 'สมชาย', lastName: 'ใจดี' },
    },
};

const LEGACY = `Auto-cancelled: correction deadline exceeded. Original due: ${revisionDue.toISOString()}`;

describe('the auto-cancel note the applicant reads', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    test('the sweep writes the note in Thai, with the window and the due day, into the history event', async () => {
        const { checkExpiredDeadlines } = loadChecker(overdueDeadline);
        const stats = await checkExpiredDeadlines();
        expect(stats).toMatchObject({ expired: 1, errors: 0 });

        expect(mockWrite).toHaveBeenCalledTimes(1);
        const args = mockWrite.mock.calls[0][0];
        const event = args.additionalData.workflowHistory.at(-1);
        expect(event.toStatus).toBe('EXPIRED');
        expect(event.comment).toMatch(/^คำขอถูกยกเลิกอัตโนมัติ เนื่องจากไม่ส่งเอกสารแก้ไขภายใน \d+ วันทำการ \(ครบกำหนด 30 ต\.ค\. 2569\)$/);
        expect(args.reason).toBe(event.comment);
        expect(JSON.stringify(args)).not.toMatch(/Auto-cancelled/);
    });

    test('a stored English note is read back in Thai, naming the same due day', () => {
        const { buildApplicationHistoryPayload } = require('../../routes/api/helpers/application-payload-builders');
        const payload = buildApplicationHistoryPayload({
            id: 'app-1', applicationNumber: 'APP-2569-000001', status: 'EXPIRED', formData: {}, comments: [],
            workflowHistory: [
                { action: 'WORKFLOW_TRANSITION', fromStatus: 'REVISION_REQUESTED', toStatus: 'EXPIRED', actorRole: 'system', actorId: 'cron-revision-deadline-checker', timestamp: '2026-10-31T01:00:00.000Z', comment: LEGACY, reason: null },
                { action: 'REVIEW_NOTE', actorRole: 'document_reviewer', timestamp: '2026-10-23T03:00:00.000Z', comment: 'ขอโฉนด', reason: null },
            ],
        });
        const [expired, note] = payload.workflowHistory;
        expect(expired.comment).toBe('คำขอถูกยกเลิกอัตโนมัติ เนื่องจากพ้นกำหนดแก้ไข (ครบกำหนด 30 ต.ค. 2569)');
        expect(note.comment).toBe('ขอโฉนด');
        expect(JSON.stringify(payload)).not.toMatch(/Auto-cancelled/);
    });

    test('a legacy note in the reason field is read back in Thai too', () => {
        const { buildApplicationHistoryPayload } = require('../../routes/api/helpers/application-payload-builders');
        const payload = buildApplicationHistoryPayload({
            id: 'app-1', status: 'EXPIRED', formData: {}, comments: [],
            workflowHistory: [{ action: 'WORKFLOW_TRANSITION', toStatus: 'EXPIRED', actorRole: 'system', timestamp: '2026-10-31T01:00:00.000Z', reason: LEGACY }],
        });
        expect(payload.workflowHistory[0].reason).toMatch(/^คำขอถูกยกเลิกอัตโนมัติ/);
    });
});
