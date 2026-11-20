'use strict';

const { makeDb, loadStack, member, applicant } = require('../support/renewal-reminder-stack');
const { getZonedParts, startOfLocalCalendarDay } = require('../../utils/working-days');

const now = new Date('2026-12-16T02:00:00.000Z');
const bangkokDaysFromNow = (d) => {
    const { year, month, day } = getZonedParts(now);
    return startOfLocalCalendarDay(year, month, day + d);
};
const certificate = (daysLeft, partial = {}) => ({
    id: 'cert-1',
    userId: 'user-1',
    applicationId: 'app-1',
    certificateNumber: 'TH-GACP 87/2568',
    farmName: 'ไร่ตัวอย่าง',
    expiryDate: bangkokDaysFromNow(daysLeft),
    ...partial,
});
const holderOf = (cert, reminders = []) => ({
    certificates: [cert],
    applications: [{ id: 'app-1', entityId: 'entity-1', applicant: applicant('user-1'), formData: { renewalReminders: reminders } }],
    memberships: [member({ id: 'm-1', userId: 'user-1', entityId: 'entity-1' })],
});
const tiers = (result) => Object.fromEntries(result.summary.map((t) => [t.tier, { found: t.found, sent: t.sent, skipped: t.skipped }]));

describe('จดหมายเตือนต่ออายุตามหลังขั้นที่พลาด', () => {
    beforeEach(() => { process.env.APP_PUBLIC_URL = 'https://web.example.test'; });
    afterEach(() => { delete process.env.APP_PUBLIC_URL; });

    it('cron หยุดไป 3 วัน: ใบที่เหลือ 27 วันยังได้ D30 หนึ่งครั้ง และบอกจำนวนวันจริง', async () => {
        const db = makeDb(holderOf(certificate(27)));
        const { run, send } = loadStack({ db });

        const first = await run({ now });
        const second = await run({ now });

        expect(tiers(first)).toEqual({ 60: { found: 0, sent: 0, skipped: 0 }, 30: { found: 1, sent: 1, skipped: 0 }, 15: { found: 0, sent: 0, skipped: 0 } });
        expect(tiers(second)[30]).toEqual({ found: 1, sent: 0, skipped: 1 });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].payload).toMatchObject({ daysLeft: 27, priority: 'NORMAL' });
        expect(db.reminders('app-1')).toEqual([expect.objectContaining({ type: 'D30', certId: 'cert-1' })]);
    });

    it('ใบที่เหลือ 14 วันและยังไม่เคยได้ขั้นไหน: ได้ D15 เท่านั้น D30 ไม่ส่งตามหลัง', async () => {
        const db = makeDb(holderOf(certificate(14)));
        const { run, send } = loadStack({ db });

        const result = await run({ now });

        expect(tiers(result)).toEqual({ 60: { found: 0, sent: 0, skipped: 0 }, 30: { found: 0, sent: 0, skipped: 0 }, 15: { found: 1, sent: 1, skipped: 0 } });
        expect(send.mock.calls[0][0].payload).toMatchObject({ daysLeft: 14, priority: 'HIGH' });
        expect(db.reminders('app-1').map((r) => r.type)).toEqual(['D15']);
    });

    it('D15 ออกไปแล้ว: D30 ไม่ส่งอีกเลย', async () => {
        const db = makeDb(holderOf(certificate(15), [{ type: 'D15', certId: 'cert-1', sentAt: now.toISOString() }]));
        const { run, send } = loadStack({ db });

        const result = await run({ now });

        expect(send).not.toHaveBeenCalled();
        expect(tiers(result)[30]).toEqual({ found: 0, sent: 0, skipped: 0 });
        expect(tiers(result)[15]).toEqual({ found: 1, sent: 0, skipped: 1 });
    });

    it('ใบที่หมดอายุวันนี้ หมดไปแล้ว หรือถูกเพิกถอน: ไม่ส่งขั้นไหนเลย', async () => {
        for (const cert of [certificate(0), certificate(-3), certificate(20, { status: 'revoked' }), certificate(20, { status: 'expired' })]) {
            const db = makeDb(holderOf(cert));
            const { run, send } = loadStack({ db });

            const result = await run({ now });

            expect({ cert: `${cert.status || 'active'}:${cert.expiryDate.toISOString()}`, totals: result.totals, sends: send.mock.calls.length })
                .toEqual({ cert: `${cert.status || 'active'}:${cert.expiryDate.toISOString()}`, totals: expect.objectContaining({ found: 0, sent: 0 }), sends: 0 });
        }
    });
});
