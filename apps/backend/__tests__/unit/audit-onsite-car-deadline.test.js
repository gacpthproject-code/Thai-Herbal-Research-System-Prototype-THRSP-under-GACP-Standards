/**
 * The on-site corrective-action clock and the field result table (order 56(2)).
 *
 * submitDecision records PASS / MINOR / MAJOR / FAIL through the writer the job sheet uses
 * (services/inspection-result-service.js). A correction request (MINOR / MAJOR) opens the round
 * through services/onsite-correction.js: it seeds the deadline in the decision's transaction and
 * stamps carDueAt into the parent formData, preserving what was there; FAIL waits for the
 * certificate approver at AUDIT_NOT_PASSED with no deadline; PASS seeds nothing. Every result pins the decided visit (formData.onsiteAuditId, Task 3).
 *
 * The PASS case hands the mock enough evidence to clear the fail-closed evidence gate, since
 * this file is about the clock, not the gate (audit-onsite-service.test.js covers the gate).
 */

'use strict';

jest.mock('../../services/application-status-writer', () => ({
  writeApplicationStatus: jest.fn(async () => ({ ok: true })),
}));

const mockDeadlineUpsert = jest.fn(async () => ({}));
jest.mock('../../services/car-deadline-service', () => ({
  computeCarDueDate: jest.fn(() => new Date('2026-07-01T00:00:00.000Z')),
}));

jest.mock('../../services/decision-letter-service', () => ({
  mintCorrectionLetter: jest.fn(async () => ({ id: 'letter-1' })),
  CORRECTION_LETTER_STAGE: { FIELD_AUDIT_CAR: 'FIELD_AUDIT_CAR' },
}));

jest.mock('../../services/notification/application-parties', () => ({
  notifyApplicationParties: jest.fn(async () => ({ delivered: 1 })),
  fanoutToApplicationParties: jest.fn(async () => ({ delivered: 1 })),
}));

jest.mock('../../middleware/audit-logger', () => ({
  statusTransitionAuditHook: () => (async () => {}),
}));

jest.mock('../../shared/logger', () => {
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return Object.assign(l, { createLogger: () => l, default: l });
});

const { writeApplicationStatus } = require('../../services/application-status-writer');
const onsite = require('../../services/audit-onsite-service');
const { farmAuditPhotoStub } = require('../../test-support/farm-audit-photo-stub');
const { visitLockStub } = require('../../test-support/onsite-visit-lock-stub');

const auditRow = () => ({
  id: 'audit-1',
  status: 'IN_PROGRESS',
  auditorId: 'auditor-1',
  application: {
    id: 'app-1',
    status: 'AUDIT_CONFIRMED',
    applicationNumber: 'GACP-2026-001',
    healthId: 'health-1',
    formData: { existing: true },
  },
});

function makePrisma() {
  return {
    auditChecklist: {
      findFirst: jest.fn(async () => auditRow()),
    },
    // farmAuditPhoto / farmAuditChecklistItem intentionally omitted — fine for FAIL,
    // which needs no evidence; a PASS against this bare mock now throws fail-closed
    // (see makePrismaWithEvidence() below for the PASS test).
    $transaction: jest.fn(async (cb) => cb({
      ...visitLockStub(() => auditRow()),
      auditChecklist: { update: jest.fn(async () => ({ id: 'audit-1', status: 'COMPLETED' })) },
      revisionDeadline: { upsert: mockDeadlineUpsert },
    })),
  };
}

// PASS now requires provisioned + sufficient evidence models (fail-closed gate).
// This file's PASS test is about the CAR-deadline clock (it must NOT fire on PASS),
// not the evidence gate, so hand it enough evidence to clear the gate legitimately.
function makePrismaWithEvidence() {
  const p = makePrisma();
  p.farmAuditPhoto = farmAuditPhotoStub(5);
  p.farmAuditChecklistItem = { count: jest.fn(async () => onsite.CHECKLIST_TEMPLATE_2026.length) };
  return p;
}

describe('audit-onsite-service.submitDecision — CAR deadline SLA clock', () => {
  beforeEach(() => jest.clearAllMocks());

  it('MAJOR → seeds the RevisionDeadline in the transaction + stamps formData.carDueAt + transitions CAR_PENDING', async () => {
    const prisma = makePrisma();
    await onsite.submitDecision({
      auditId: 'audit-1', decision: 'MAJOR', summary: 'ซ่อมรั้วแปลงปลูก',
      findings: [{ nonConformity: 'รั้วชำรุด', correctiveAction: 'ซ่อมรั้วแปลงปลูก' }], actorId: 'auditor-1', prisma,
    });

    expect(mockDeadlineUpsert).toHaveBeenCalledTimes(1);
    expect(mockDeadlineUpsert.mock.calls[0][0]).toMatchObject({
      where: { applicationId: 'app-1' },
      create: { revisionDue: new Date('2026-07-01T00:00:00.000Z'), status: 'PENDING', createdBy: 'auditor-1' },
    });

    const writeArgs = writeApplicationStatus.mock.calls[0][0];
    expect(writeArgs.toStatus).toBe('CAR_PENDING');
    expect(writeArgs.additionalData.formData.carDueAt).toBe('2026-07-01T00:00:00.000Z');
    expect(writeArgs.additionalData.formData.car_due_at).toBe('2026-07-01T00:00:00.000Z');
    expect(writeArgs.additionalData.formData.workflowState).toBe('CAR_PENDING');
    expect(writeArgs.additionalData.formData.existing).toBe(true);
    expect(writeArgs.additionalData.formData.onsiteAuditId).toBe('audit-1');
    expect(writeArgs.additionalData.auditResult).toBe('MAJOR');
  });

  it('FAIL → AUDIT_NOT_PASSED for the approver: no deadline, no carDueAt, the visit pinned', async () => {
    const prisma = makePrisma();
    await onsite.submitDecision({
      auditId: 'audit-1', decision: 'FAIL', summary: 'แปลงยังไม่พร้อม',
      findings: [{ nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ย', correctiveAction: 'จัดทำสมุดบันทึก' }], actorId: 'auditor-1', prisma,
    });

    expect(mockDeadlineUpsert).not.toHaveBeenCalled();
    const writeArgs = writeApplicationStatus.mock.calls[0][0];
    expect(writeArgs.toStatus).toBe('AUDIT_NOT_PASSED');
    expect(writeArgs.additionalData.auditResult).toBe('FAIL');
    expect(writeArgs.additionalData.formData).toMatchObject({ existing: true, onsiteAuditId: 'audit-1', auditResult: 'FAIL' });
    expect(writeArgs.additionalData.formData).not.toHaveProperty('carDueAt');
  });

  it('FAIL without a finding is refused with FINDINGS_REQUIRED and writes nothing', async () => {
    const prisma = makePrisma();
    await expect(onsite.submitDecision({
      auditId: 'audit-1', decision: 'FAIL', summary: 'ไม่ผ่าน', actorId: 'auditor-1', prisma,
    })).rejects.toMatchObject({ code: 'FINDINGS_REQUIRED' });
    expect(writeApplicationStatus).not.toHaveBeenCalled();
  });

  it('PASS → does NOT seed a CAR deadline; formData is preserved and pinned with onsiteAuditId (Task 3), not clobbered', async () => {
    const prisma = makePrismaWithEvidence();
    await onsite.submitDecision({
      auditId: 'audit-1', decision: 'PASS', actorId: 'auditor-1', prisma,
    });

    expect(mockDeadlineUpsert).not.toHaveBeenCalled();
    const writeArgs = writeApplicationStatus.mock.calls[0][0];
    expect(writeArgs.toStatus).toBe('AUDIT_PASSED');
    // Task 3: PASS pins the decided visit; the pre-existing formData survives, and no
    // CAR-only field leaks onto the PASS write.
    expect(writeArgs.additionalData.formData).toMatchObject({ existing: true, onsiteAuditId: 'audit-1', auditResult: 'PASS' });
    expect(writeArgs.additionalData.formData).not.toHaveProperty('carDueAt');
  });
});
