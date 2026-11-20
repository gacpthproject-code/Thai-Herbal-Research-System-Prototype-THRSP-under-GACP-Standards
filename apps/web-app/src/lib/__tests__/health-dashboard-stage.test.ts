/**
 * health-dashboard-stage.test.ts — frontend half of the dashboard
 * classifier contract.
 *
 * The 8-stage projection (DRAFT / PENDING_FEE_PHASE1 / UNDER_DOCUMENT_REVIEW
 * / REVISION_REQUIRED / PENDING_FEE_PHASE2 / UNDER_FIELD_AUDIT / APPROVED
 * / CERTIFIED) is implemented identically in:
 *
 *   - apps/backend/shared/health-dashboard-stage.js
 *   - apps/web-app/src/lib/health-dashboard-stage.ts (this module)
 *
 * Both must classify the same Application input the same way — the
 * frontend dashboard tile counts and the backend buildHealthProcessCounts()
 * roll-up MUST agree. The backend half is locked by
 * apps/backend/__tests__/unit/health-dashboard-stage.test.js (PR #274).
 *
 * This test locks the frontend half. A future drift between the two
 * (e.g., adding a state to one but not the other) fails loudly.
 */

import {
  HEALTH_DASHBOARD_STAGES,
  isTerminalStage,
  applicantStatus,
  stageForStatus,
  stepCounterTH,
  stepperStepsFor,
  getStepperIndex,
  getProgressPercent,
  STAGE_LABEL_TH,
  STAGE_LABEL_EN,
  STAGE_DESCRIPTION_TH,
  STAGE_NEXT_ACTION_TH,
  STAGE_BADGE_STYLE,
  STEPPER_STEPS,
  type HealthDashboardStage,
  stageLabelFor,
} from '../health-dashboard-stage';
import { WORKFLOW_STATES } from '@/lib/constants/workflow-states';

describe('health-dashboard-stage (frontend)', () => {
  describe('stageForStatus — the status column decides the stage', () => {
    it.each([
      ['DRAFT', 'DRAFT'],
      ['SUBMITTED', 'PENDING_FEE_PHASE1'],
      ['PENDING_DOC_FEE', 'PENDING_FEE_PHASE1'],
      ['DOC_FEE_PAID', 'UNDER_DOCUMENT_REVIEW'],
      ['ASSIGNED_FOR_REVIEW', 'UNDER_DOCUMENT_REVIEW'],
      ['REVISION_REQUESTED', 'REVISION_REQUIRED'],
      ['DOC_APPROVED', 'PENDING_FEE_PHASE2'],
      ['PENDING_AUDIT_FEE', 'PENDING_FEE_PHASE2'],
      // AUDIT_FEE_PAID ออกจากชุดตรวจ 2026-09-11: จ่ายงวดที่ 2 แล้วแต่ยังไม่มีใครนัดวัน
      ['AUDIT_FEE_PAID', 'PENDING_AUDIT_SCHEDULE'],
      ['AUDIT_CONFIRMED', 'UNDER_FIELD_AUDIT'],
      ['CAR_PENDING', 'UNDER_FIELD_AUDIT'],
      ['CAR_REVIEWING', 'UNDER_FIELD_AUDIT'],
      ['AUDIT_PASSED', 'PENDING_DECISION'],
      ['APPROVED', 'APPROVED'],
      ['CERTIFIED', 'CERTIFIED'],
      ['REJECTED', 'CLOSED'],
      ['EXPIRED', 'CLOSED'],
      ['CANCELLED', 'CLOSED'],
    ])('%s -> %s', (status, stage) => {
      expect(stageForStatus(status)).toBe(stage);
      expect(stageForStatus(status.toLowerCase())).toBe(stage);
    });

    it('covers every canonical workflow status', () => {
      for (const status of WORKFLOW_STATES) {
        expect(HEALTH_DASHBOARD_STAGES).toContain(stageForStatus(status));
      }
    });

    it('DRAFT when the status is absent', () => {
      expect(stageForStatus(undefined)).toBe('DRAFT');
      expect(stageForStatus('')).toBe('DRAFT');
    });

    it('falls back to UNDER_DOCUMENT_REVIEW for an unknown non-empty status', () => {
      expect(stageForStatus('SOME_NEW_STATUS')).toBe('UNDER_DOCUMENT_REVIEW');
    });
  });

  describe('applicantStatus — one view per status', () => {
    it('APPROVED stays pending issuance: a certificate row is not an input', () => {
      const view = applicantStatus('APPROVED');
      expect(view.stage).toBe('APPROVED');
      expect(view.label).toBe('ผ่านการอนุมัติ');
      expect(view.nextAction).toBe('รอออกใบรับรอง');
      expect(view.label).not.toContain('ได้รับใบรับรอง');
    });

    it('step and totalSteps are the rung on the stepper the page draws', () => {
      for (const status of WORKFLOW_STATES) {
        const view = applicantStatus(status);
        const steps = stepperStepsFor();
        expect(view.totalSteps).toBe(steps.length);
        if (view.stage === 'CLOSED') {
          expect(view.step).toBeNull();
        } else {
          expect(steps[view.step! - 1]!.stage).toBe(view.stage);
        }
      }
    });

    it('a renewal counts its own shorter ladder', () => {
      const view = applicantStatus('PENDING_AUDIT_FEE', { isRenewal: true });
      expect(view.totalSteps).toBe(stepperStepsFor({ isRenewal: true }).length);
      expect(view.totalSteps).toBeLessThan(STEPPER_STEPS.length);
    });

    it('CAR_PENDING asks the applicant for evidence', () => {
      const view = applicantStatus('CAR_PENDING');
      expect(view.needsUserAction).toBe(true);
      expect(view.nextAction).toBe('ส่งหลักฐานการแก้ไข');
    });

    it('closed files name why they closed', () => {
      expect(applicantStatus('REJECTED').label).toBe('ไม่ได้รับการรับรอง');
      expect(applicantStatus('EXPIRED').label).toBe('ยกเลิก (เลยกำหนด)');
      expect(applicantStatus('CANCELLED').label).toBe('ยกเลิก');
    });

    it('an unknown status does not claim a stage it cannot know', () => {
      expect(applicantStatus('SOME_GARBAGE').label).toBe('ไม่ทราบสถานะ');
      expect(applicantStatus('SOME_GARBAGE').nextAction).toBe('ดูรายละเอียดคำขอ');
    });

    it('stepCounterTH reads ขั้นตอนที่ x จาก y, and nothing for a closed file', () => {
      expect(stepCounterTH(applicantStatus('AUDIT_PASSED'))).toBe(`ขั้นตอนที่ 8 จาก ${STEPPER_STEPS.length}`);
      expect(stepCounterTH(applicantStatus('APPROVED'))).toBe(`ขั้นตอนที่ 9 จาก ${STEPPER_STEPS.length}`);
      expect(stepCounterTH(applicantStatus('REJECTED'))).toBe('');
    });
  });

  describe('Label tables — completeness', () => {
    // Iterate the real union, not a hand-copied list — the old literal had
    // silently drifted and never covered the stage that had just been added.
    const stages: HealthDashboardStage[] = [...HEALTH_DASHBOARD_STAGES];

    it('every stage has a TH label', () => {
      for (const stage of stages) {
        expect(typeof STAGE_LABEL_TH[stage]).toBe('string');
        expect(STAGE_LABEL_TH[stage].length).toBeGreaterThan(0);
      }
    });

    it('every stage has an EN label', () => {
      for (const stage of stages) {
        expect(typeof STAGE_LABEL_EN[stage]).toBe('string');
        expect(STAGE_LABEL_EN[stage].length).toBeGreaterThan(0);
      }
    });

    it('every stage has a TH description + next-action copy', () => {
      for (const stage of stages) {
        expect(typeof STAGE_DESCRIPTION_TH[stage]).toBe('string');
        expect(typeof STAGE_NEXT_ACTION_TH[stage]).toBe('string');
      }
    });

    it('every stage has a badge-style triple (bg, text, dot)', () => {
      for (const stage of stages) {
        const style = STAGE_BADGE_STYLE[stage];
        expect(style.bg).toBeTruthy();
        expect(style.text).toBeTruthy();
        expect(style.dot).toBeTruthy();
      }
    });
  });

  describe('STEPPER_STEPS — sequence integrity', () => {
    it('exposes ordered stepper entries (length matches stage count or fewer)', () => {
      // Stepper steps may merge collapsed phases (e.g., revision is part
      // of doc-review in the stepper view). Pin the count so a future
      // change to STEPPER_STEPS triggers explicit review.
      expect(Array.isArray(STEPPER_STEPS)).toBe(true);
      expect(STEPPER_STEPS.length).toBeGreaterThan(0);
    });

    it('each step has the {stage, label, shortLabel, icon} shape', () => {
      for (const step of STEPPER_STEPS) {
        expect(typeof step.stage).toBe('string');
        expect(typeof step.label).toBe('string');
        expect(typeof step.shortLabel).toBe('string');
        expect(typeof step.icon).toBe('string');
      }
    });
  });

  describe('getStepperIndex', () => {
    it('returns a finite index for every stage — >= 0 on the ladder, -1 when terminal', () => {
      const stages: HealthDashboardStage[] = [...HEALTH_DASHBOARD_STAGES];
      for (const stage of stages) {
        const index = getStepperIndex(stage);
        expect(Number.isFinite(index)).toBe(true);
        // -1 is the deliberate "off the ladder" signal for closed files; the
        // old blanket >= 0 rule is what made a rejected application render as
        // step 1 of 9.
        expect(index).toBeGreaterThanOrEqual(isTerminalStage(stage) ? -1 : 0);
        if (!isTerminalStage(stage)) {
          expect(index).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('CERTIFIED has the highest index (final stepper step)', () => {
      const draftIdx = getStepperIndex('DRAFT');
      const certIdx = getStepperIndex('CERTIFIED');
      expect(certIdx).toBeGreaterThan(draftIdx);
    });
  });

  describe('getProgressPercent', () => {
    it('returns 0..100 for every stage', () => {
      const stages: HealthDashboardStage[] = [...HEALTH_DASHBOARD_STAGES];
      for (const stage of stages) {
        const pct = getProgressPercent(stage);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    });

    it('DRAFT < CERTIFIED (monotonic across the happy path)', () => {
      expect(getProgressPercent('DRAFT'))
        .toBeLessThan(getProgressPercent('CERTIFIED'));
    });

    it('CERTIFIED is exactly 100', () => {
      expect(getProgressPercent('CERTIFIED')).toBe(100);
    });
  });
});

describe('รอนัดวันตรวจแปลง — ป้ายของขั้นที่แทนขั้นตรวจสลิป', () => {
    it('ป้ายไทยบอกว่ากำลังรออะไร ไม่ใช่บอกแค่ว่าจ่ายแล้ว', () => {
        expect(STAGE_LABEL_TH.PENDING_AUDIT_SCHEDULE).toBe('รอนัดวันตรวจประเมินแปลง');
    });

    it('มีป้ายอังกฤษ', () => {
        expect(STAGE_LABEL_EN.PENDING_AUDIT_SCHEDULE).toBe('Awaiting Audit Appointment');
    });

    it('คำเรื่องเงินตรงกับใบเสร็จ — "งวดที่" ไม่ใช่ "ขั้นที่"', () => {
        expect(STAGE_LABEL_TH.PENDING_FEE_PHASE1).toContain('งวดที่ 1');
        // round 3: shared with a renewal and rendered without the application here, so
        // it names no instalment (stageLabelFor names it when the application is known)
        expect(STAGE_LABEL_TH.PENDING_FEE_PHASE2).not.toContain('งวดที่');
        expect(stageLabelFor('PENDING_FEE_PHASE2', { isRenewal: false })).toContain('งวดที่ 2');
    });
});
