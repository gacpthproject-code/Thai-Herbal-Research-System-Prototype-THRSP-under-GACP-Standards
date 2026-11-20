/**
 * The dispatcher queue predicates in queue-utils.js (order 27, operator 2026-10-06).
 *
 * A major on-site finding no longer sends an application back to the dispatcher by itself: the
 * applicant sends correction evidence first, and the dispatcher books a second visit only after
 * the field inspector asked for one (formData.reinspection REQUESTED while CAR_REVIEWING). The
 * predicate that read MAJOR out of the history (isMajorRescheduleCandidate) is gone with that
 * design; these pin its replacements, and that every visit is on site.
 */

const path = require('path');

jest.mock('../../services/prisma-database', () => ({
    prisma: {},
}));

const queueUtils = require(path.join(__dirname, '..', '..', 'routes', 'api', 'provider', 'handlers', 'queue-utils.js'));

const {
    isReinspectionRequested, isRetiredInspectionMode, isReadyToSchedule, resolveAuditSchedule, buildAuditorQueueItem,
} = queueUtils;

const app = (status, formData = {}) => ({ id: 'a1', status, formData: { workflowState: status, ...formData } });

describe('isReinspectionRequested: the one state a second visit is booked from', () => {
    test('CAR_REVIEWING with the request of the inspector on the file open', () => {
        const asked = { ...app('CAR_REVIEWING', { reinspection: { status: 'REQUESTED', requestedBy: 'insp-1' } }), auditorId: 'insp-1' };
        expect(isReinspectionRequested(asked)).toBe(true);
    });

    test('a request left by an inspector since replaced on the file asks for nothing', () => {
        const replaced = { ...app('CAR_REVIEWING', { reinspection: { status: 'REQUESTED', requestedBy: 'insp-1' } }), auditorId: 'insp-2' };
        expect(isReinspectionRequested(replaced)).toBe(false);
        expect(isReinspectionRequested(app('CAR_REVIEWING', { reinspection: { status: 'REQUESTED' } }))).toBe(false);
    });

    test('a MAJOR finding alone does not queue a visit: evidence comes first', () => {
        expect(isReinspectionRequested(app('CAR_REVIEWING', { auditDecisions: [{ decision: 'MAJOR' }] }))).toBe(false);
        expect(isReinspectionRequested(app('CAR_PENDING', { auditDecisions: [{ decision: 'MAJOR' }] }))).toBe(false);
    });

    test('once booked, or outside CAR_REVIEWING, it is no longer waiting', () => {
        expect(isReinspectionRequested(app('CAR_REVIEWING', { reinspection: { status: 'BOOKED' } }))).toBe(false);
        expect(isReinspectionRequested(app('AUDIT_CONFIRMED', { reinspection: { status: 'REQUESTED' } }))).toBe(false);
        expect(isReinspectionRequested(null)).toBe(false);
    });
});

describe('isReadyToSchedule: one predicate for every dispatcher queue', () => {
    test('AUDIT_FEE_PAID with the second milestone paid', () => {
        expect(isReadyToSchedule({ workflowState: 'AUDIT_FEE_PAID', phase2Paid: true })).toBe(true);
    });

    test('unpaid, or another state, is not ready', () => {
        expect(isReadyToSchedule({ workflowState: 'AUDIT_FEE_PAID', phase2Paid: false })).toBe(false);
        expect(isReadyToSchedule({ workflowState: 'DOC_APPROVED', phase2Paid: true })).toBe(false);
    });
});

describe('every inspection is on site', () => {
    test('asking for an online or unknown mode is a retired request; on site or nothing is fine', () => {
        expect(isRetiredInspectionMode('ONLINE_MEET')).toBe(true);
        expect(isRetiredInspectionMode('online')).toBe(true);
        expect(isRetiredInspectionMode('VIDEO')).toBe(true);
        expect(isRetiredInspectionMode('ONSITE')).toBe(false);
        expect(isRetiredInspectionMode(undefined)).toBe(false);
    });

    test('a stored schedule reads as a place and a date, never a meeting link', () => {
        const schedule = resolveAuditSchedule(app('AUDIT_CONFIRMED', {
            auditSchedule: { scheduledDate: '2026-11-02T02:00:00.000Z', inspectionMode: 'ONLINE_MEET', meetingLink: 'https://meet.example/x', location: 'แปลง' },
        }));
        expect(schedule.scheduledDateISO).toBe('2026-11-02T02:00:00.000Z');
        expect(schedule.location).toBe('แปลง');
        expect(schedule).not.toHaveProperty('meetingLink');
        expect(schedule).not.toHaveProperty('inspectionMode');
    });
});

describe('the inspector dashboard still counts open major findings', () => {
    test('the latest decision in the corrective loop is MAJOR', () => {
        const item = buildAuditorQueueItem(app('CAR_PENDING', { auditDecisions: [{ decision: 'MINOR' }, { decision: 'MAJOR' }] }), new Map(), new Map());
        expect(item.hasOpenMajorFinding).toBe(true);
    });

    test('a MAJOR that was later answered, or outside the loop, is not open', () => {
        expect(buildAuditorQueueItem(app('CAR_REVIEWING', { auditDecisions: [{ decision: 'MAJOR' }, { decision: 'REINSPECT' }] }), new Map(), new Map()).hasOpenMajorFinding).toBe(false);
        expect(buildAuditorQueueItem(app('AUDIT_PASSED', { auditDecisions: [{ decision: 'MAJOR' }] }), new Map(), new Map()).hasOpenMajorFinding).toBe(false);
    });
});
