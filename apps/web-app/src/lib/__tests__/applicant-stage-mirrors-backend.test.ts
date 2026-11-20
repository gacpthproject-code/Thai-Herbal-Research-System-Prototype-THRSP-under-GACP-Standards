import {
  HEALTH_DASHBOARD_STAGES,
  STAGE_LABEL_TH,
  applicantStatus,
  stageForStatus,
} from '../health-dashboard-stage';
import { WORKFLOW_STATES } from '../constants/workflow-states';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const backend = require('../../../../backend/shared/health-dashboard-stage.js');

describe('the applicant stage mirrors the backend', () => {
  it.each(WORKFLOW_STATES)('%s sits in the stage the backend gives it', (status) => {
    const expected = backend.normalizeHealthDashboardStage({ status }, { hasCertificate: status === 'CERTIFIED' });
    expect(stageForStatus(status)).toBe(expected);
  });

  it('both sides know the same stages and name each one in the same words', () => {
    expect([...HEALTH_DASHBOARD_STAGES].sort()).toEqual(Object.keys(backend.HEALTH_DASHBOARD_STAGES).sort());
    for (const stage of HEALTH_DASHBOARD_STAGES) {
      expect([stage, STAGE_LABEL_TH[stage]]).toEqual([stage, backend.STAGE_LABEL_TH[stage]]);
    }
  });

  it('a passed inspection reads as passed and awaiting the certification decision, never as approved', () => {
    const view = applicantStatus('AUDIT_PASSED');
    expect(view.stage).toBe('PENDING_DECISION');
    expect(view.label).toBe(backend.STAGE_LABEL_TH.PENDING_DECISION);
    expect(view.nextAction).toBe(backend.STAGE_NEXT_ACTION_TH.PENDING_DECISION);
    expect(view.description).toContain('ผ่านการตรวจประเมินแปลง');
    expect(`${view.label} ${view.description} ${view.nextAction}`).not.toMatch(/อนุมัติแล้ว|ผ่านการอนุมัติ|รอออกใบรับรอง/);
  });
});
