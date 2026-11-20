/**
 * Live walk 2026-10-07 F5: at DOC_FEE_PAID the applicant was told "กำลังตรวจเอกสาร" while
 * no officer had been assigned yet (and the applicant may still withdraw, order 32). The
 * copy says the true next step: waiting for a document reviewer to be assigned.
 */
import { applicantStatus } from '../health-dashboard-stage';

describe('DOC_FEE_PAID copy', () => {
  const view = applicantStatus('DOC_FEE_PAID');

  test('label, description and next step name the assignment that comes next', () => {
    expect(view.label).toBe('รอมอบหมายผู้ตรวจเอกสาร');
    expect(view.description).toContain('รอมอบหมายให้ผู้ตรวจเอกสาร');
    expect(view.nextAction).toBe('รอมอบหมายผู้ตรวจเอกสาร');
  });

  test('nothing claims the review has started', () => {
    for (const text of [view.label, view.description, view.nextAction]) {
      expect(text).not.toMatch(/กำลังตรวจ|อยู่ระหว่างตรวจ/);
    }
  });

  test('control: once assigned, the stage copy says review is under way', () => {
    expect(applicantStatus('ASSIGNED_FOR_REVIEW').description).toContain('กำลังตรวจสอบเอกสาร');
  });
});
