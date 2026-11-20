import { deriveApplicationSummary, type ApplicationDetailPayload } from '../application-detail-page-config';
import { resolveActionTarget } from '../application-detail-page-helpers';
import { ACTION_META } from '../application-detail-page-config';

const stored = (): ApplicationDetailPayload => ({
  id: 'cd15ff15', applicationId: 'cd15ff15', status: 'ASSIGNED_FOR_REVIEW', createdAt: '', updatedAt: '',
  entityId: 'ent-1',
  formData: {
    applicantType: 'JURISTIC',
    plantId: 'turmeric',
    plots: [],
    farmData: { siteName: 'สวนขมิ้นทดสอบ', areaSqm: '200', province: 'นนทบุรี' },
  },
});

describe('the ข้อมูลคำขอ box reads the filing the wizard writes', () => {
  it('names the holder and its type, the site, and the area', () => {
    const s = deriveApplicationSummary(stored(), 'th', { displayName: 'บริษัท ทดสอบ จำกัด', type: 'JURISTIC' });
    expect(s.operatorName).toBe('บริษัท ทดสอบ จำกัด');
    expect(s.operatorType).toBe('นิติบุคคล');
    expect(s.plotName).toBe('สวนขมิ้นทดสอบ');
    expect(s.areaText).toBe('200 ตร.ม.');
    expect(s.plantName).toBe('ขมิ้นชัน');
    expect(s.province).toBe('นนทบุรี');
  });

  it('names the holder type from the filing before the holder list has loaded', () => {
    expect(deriveApplicationSummary(stored(), 'th').operatorType).toBe('นิติบุคคล');
  });

  it.each([
    ['PARTNERSHIP', 'ห้างหุ้นส่วน'],
    ['COMMUNITY_ENTERPRISE', 'วิสาหกิจชุมชน'],
    ['INDIVIDUAL', 'บุคคลธรรมดา'],
  ])('a %s holder reads %s', (type, label) => {
    expect(deriveApplicationSummary(stored(), 'th', { displayName: 'x', type }).operatorType).toBe(label);
  });
});

describe('F-A8c-03: the revision button opens the per-paper revision page', () => {
  it('SUBMIT_REVISION goes to /revision, not the whole wizard', () => {
    expect(resolveActionTarget('SUBMIT_REVISION', 'app-1', ACTION_META.SUBMIT_REVISION)?.href)
      .toBe('/health/applications/app-1/revision');
  });

  it('a draft still resumes in the wizard', () => {
    expect(resolveActionTarget('CONTINUE_DRAFT', 'app-1', ACTION_META.CONTINUE_DRAFT)?.href)
      .toBe('/health/applications/app-1/edit');
  });
});
