/**
 * Live walk 2026-10-07 F12: the applicant's timeline printed the raw action
 * ("application draft saved") 114 times, and named actors by raw role id ("dispatcher")
 * or as "เกษตรกร". The server now folds repeats (repeatCount / firstTimestamp); the
 * screen says what happened in Thai, how many times, and who by role word.
 */
import { buildOfficerComments, buildTimeline, formatActor, mapTimelineTitle } from '../application-detail-page-helpers';
import type { ApplicationHistoryPayload } from '../application-detail-page-config';

const history = (workflowHistory: ApplicationHistoryPayload['workflowHistory'], comments: ApplicationHistoryPayload['comments'] = []): ApplicationHistoryPayload => ({
  applicationId: 'a', status: 'PENDING_DOC_FEE', workflowHistory, comments,
});

describe('applicant timeline', () => {
  test('a folded autosave run is one Thai entry that says how many times and since when', () => {
    const items = buildTimeline(history([{
      index: 114, action: 'APPLICATION_DRAFT_SAVED', actorRole: 'health', timestamp: '2026-10-06T04:00:00Z',
      repeatCount: 114, firstTimestamp: '2026-10-06T03:00:00Z',
    }]));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('บันทึกร่างคำขอ');
    expect(items[0].description).toMatch(/^ทำซ้ำ 114 ครั้ง ตั้งแต่ /);
    expect(items[0].actor).toBe('ผู้ยื่นคำขอ');
  });

  test('a single event keeps its own note', () => {
    const [item] = buildTimeline(history([{ index: 1, action: 'REVIEW_NOTE', actorRole: 'document_reviewer', comment: 'ขอโฉนด', repeatCount: 1 }]));
    expect(item.description).toBe('ขอโฉนด');
  });

  test.each([
    ['UNKNOWN_ACTION', null, 'อัปเดตคำขอ'],
    ['WORKFLOW_TRANSITION', 'DOC_FEE_PAID', 'รอมอบหมายผู้ตรวจเอกสาร'],
    ['SOMETHING_NEW', 'CANCELLED', 'ยกเลิก'],
  ])('an unmapped action (%s → %s) never prints English', (action, toStatus, title) => {
    expect(mapTimelineTitle({ index: 1, action, toStatus })).toBe(title);
  });

  test.each([
    ['health', 'ผู้ยื่นคำขอ'],
    ['dispatcher', 'ผู้จัดคิว'],
    ['field_inspector', 'ผู้ตรวจพื้นที่'],
    ['document_reviewer', 'ผู้ตรวจเอกสาร'],
    ['certificate_approver', 'เจ้าหน้าที่'],
    ['WEBHOOK', 'ระบบ'],
    ['cron', 'ระบบ'],
    ['finance_officer_platform', 'เจ้าหน้าที่'],
    ['someone_new', 'เจ้าหน้าที่'],
    ['', 'ระบบ'],
  ])('actor %s reads as %s', (role, label) => {
    expect(formatActor(role)).toBe(label);
  });

  test('the system\'s auto-cancel note is a timeline entry, not an officer comment, so it reads once', () => {
    const note = 'คำขอถูกยกเลิกอัตโนมัติ เนื่องจากพ้นกำหนดแก้ไข (ครบกำหนด 30 ต.ค. 2569)';
    const payload = history([
      { index: 1, action: 'REVIEW_NOTE', actorRole: 'document_reviewer', comment: 'ขอโฉนด', timestamp: '2026-10-23T03:00:00Z', repeatCount: 1 },
      { index: 2, action: 'WORKFLOW_TRANSITION', fromStatus: 'REVISION_REQUESTED', toStatus: 'EXPIRED', actorRole: 'system', comment: note, timestamp: '2026-10-31T01:00:00Z', repeatCount: 1 },
    ]);
    const timeline = buildTimeline(payload);
    expect(timeline.map((item) => item.description)).toEqual(['ขอโฉนด', note]);
    const comments = buildOfficerComments(payload);
    expect(comments.map((c) => c.message)).toEqual(['ขอโฉนด']);
  });

  test('an officer comment shows its text and its author by role', () => {
    const [comment] = buildOfficerComments(history([], [{ id: 'c1', authorRole: 'document_reviewer', commentText: 'เอกสารครบ', createdAt: '2026-10-06T03:00:00Z' }]));
    expect(comment).toEqual(expect.objectContaining({ author: 'ผู้ตรวจเอกสาร', message: 'เอกสารครบ' }));
  });
});
