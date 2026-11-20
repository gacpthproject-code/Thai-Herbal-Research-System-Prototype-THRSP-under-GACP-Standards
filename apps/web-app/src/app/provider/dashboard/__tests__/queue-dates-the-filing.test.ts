import { describe, expect, it } from '@jest/globals';
import { toQueueItem, formatDateShort } from '../dashboard-utils';

const OPENED = '2026-09-27T03:00:00.000Z';
const UPDATED = '2026-10-29T03:00:00.000Z';

describe('provider dashboard queue: filing date', () => {
  it('a filed case shows its filing day', () => {
    const item = toQueueItem({ id: 'a1', status: 'ASSIGNED_FOR_REVIEW', submittedAt: '2026-10-06T03:00:00.000Z', createdAt: OPENED, updatedAt: UPDATED });
    expect(item.submittedDate).toBe(formatDateShort('2026-10-06T03:00:00.000Z'));
  });

  it('a case with no stamp says so and borrows no other day', () => {
    const item = toQueueItem({ id: 'a2', status: 'ASSIGNED_FOR_REVIEW', submittedAt: null, createdAt: OPENED, updatedAt: UPDATED });
    expect(item.submittedDate).toBe('ไม่มีบันทึกวันที่ยื่น');
  });

  it('a draft says it was not filed', () => {
    const item = toQueueItem({ id: 'a3', status: 'DRAFT', createdAt: OPENED, updatedAt: UPDATED });
    expect(item.submittedDate).toBe('ยังไม่ได้ยื่น');
  });
});
