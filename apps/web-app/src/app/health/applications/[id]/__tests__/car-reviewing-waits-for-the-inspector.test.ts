import { ACTION_META } from '../application-detail-page-config';
import { applicantStatus } from '@/lib/health-dashboard-stage';

describe('F-A8b-03: CAR_REVIEWING tells the applicant to wait, not to send evidence again', () => {
  test('the detail page action card WAIT_CAR_REVIEW names the inspector and offers no button', () => {
    const meta = ACTION_META.WAIT_CAR_REVIEW;
    expect(meta.title).toBe('รอผู้ตรวจพื้นที่พิจารณา');
    expect(meta.hint).toContain('ผู้ตรวจพื้นที่กำลังพิจารณา');
    expect(meta.hint).not.toMatch(/กรุณาส่ง/);
    expect(meta.buttonLabel).toBeUndefined();
  });

  test('the status page and the list say the same for CAR_REVIEWING', () => {
    const view = applicantStatus('CAR_REVIEWING');
    expect(view.needsUserAction).toBe(false);
    expect(view.description).toContain('ผู้ตรวจพื้นที่กำลังพิจารณา');
    expect(view.description).not.toMatch(/กรุณาส่ง/);
    expect(view.nextAction).toBe('รอผู้ตรวจพื้นที่พิจารณา');
  });

  test('control: CAR_PENDING still asks for the evidence', () => {
    expect(ACTION_META.SUBMIT_CAR_EVIDENCE.buttonLabel).toBe('ส่งหลักฐานการแก้ไข');
    expect(applicantStatus('CAR_PENDING').needsUserAction).toBe(true);
  });
});
