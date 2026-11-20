'use strict';
// คำบนจอของสถานะปิดของคำขอ (operator 2026-10-07): EXPIRED = "ยกเลิก (เลยกำหนด)", CANCELLED = "ยกเลิก"
const { STATUS_PRESENTATION } = require('../../shared/status-machine-contract');

describe('status-machine-contract closed-state labels', () => {
    it('pins the two Thai labels and never uses "หมดอายุ" for an application', () => {
        expect(STATUS_PRESENTATION.EXPIRED.label).toBe('ยกเลิก (เลยกำหนด)');
        expect(STATUS_PRESENTATION.CANCELLED.label).toBe('ยกเลิก');
    });
});
