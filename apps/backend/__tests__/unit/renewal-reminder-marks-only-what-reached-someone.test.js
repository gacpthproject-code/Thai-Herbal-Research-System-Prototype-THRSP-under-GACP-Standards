'use strict';

const { makeDb, loadStack, member, applicant } = require('../support/renewal-reminder-stack');

const now = new Date('2026-12-16T02:00:00.000Z');
const certificate = {
    id: 'cert-1',
    userId: 'user-1',
    applicationId: 'app-1',
    certificateNumber: 'TH-GACP 87/2568',
    farmName: 'ไร่ตัวอย่าง',
    expiryDate: '2027-01-15T00:00:00.000Z',
};
const holder = {
    certificates: [certificate],
    applications: [{ id: 'app-1', entityId: 'entity-1', applicant: applicant('user-1') }],
    memberships: [
        member({ id: 'm-1', userId: 'user-1', entityId: 'entity-1' }),
        member({ id: 'm-2', userId: 'user-2', entityId: 'entity-1' }),
    ],
};
const failedWrite = { dedupeKey: 'k', deduped: false, inApp: { ok: false, error: 'insert failed' } };
const optedOut = { dedupeKey: 'k', deduped: false, inApp: { ok: false, skipped: 'OPT_OUT' } };
const reached = { dedupeKey: 'k', deduped: false, inApp: { ok: true, id: 'row' } };

describe('จดหมายเตือนต่ออายุ: เขียนว่าส่งแล้วเฉพาะที่ถึงมือ (application-parties ของจริง)', () => {
    beforeEach(() => { process.env.APP_PUBLIC_URL = 'https://web.example.test'; });
    afterEach(() => { delete process.env.APP_PUBLIC_URL; });

    it('หาผู้รับไม่ได้ (ฐานข้อมูลล่ม): นับเป็นล้มเหลว ไม่เขียนว่าส่งแล้ว รอบถัดไปลองใหม่', async () => {
        const db = makeDb(holder);
        db.application.findUnique.mockRejectedValue(new Error('connection refused'));
        const { processTier } = loadStack({ db });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect({ ...summary, marks: db.reminders('app-1') }).toMatchObject({ found: 1, sent: 0, failed: 1, marks: [] });
    });

    it('เขียนแถวกระดิ่งไม่ได้ (send คืน inApp.ok=false ไม่ throw): นับเป็นล้มเหลว ไม่เขียนว่าส่งแล้ว', async () => {
        const db = makeDb(holder);
        const { processTier, send } = loadStack({ db, send: async () => failedWrite });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect(send).toHaveBeenCalledTimes(2);
        expect({ ...summary, marks: db.reminders('app-1') }).toMatchObject({ found: 1, sent: 0, failed: 1, marks: [] });
    });

    it('ถึงมือคนหนึ่ง อีกคนเขียนไม่ได้: ยังไม่เขียนว่าส่งแล้ว เพื่อให้รอบถัดไปส่งถึงคนที่ยังไม่ได้', async () => {
        const db = makeDb(holder);
        const { processTier } = loadStack({ db, send: async ({ userId }) => (userId === 'user-1' ? reached : failedWrite) });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect({ ...summary, marks: db.reminders('app-1') }).toMatchObject({ found: 1, sent: 0, failed: 1, marks: [] });
    });

    it('ผู้รับคนหนึ่งปิดรับแจ้งเตือน (skipped): ถือว่าจบแล้ว ส่งถึงอีกคนก็นับว่าส่งแล้ว', async () => {
        const db = makeDb(holder);
        const { processTier } = loadStack({ db, send: async ({ userId }) => (userId === 'user-1' ? optedOut : reached) });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect(summary).toMatchObject({ found: 1, sent: 1, failed: 0 });
        expect(db.reminders('app-1')).toEqual([expect.objectContaining({ type: 'D30', certId: 'cert-1' })]);
    });

    it('ไม่มีผู้รับเลย (ผู้ยื่นออกจากบริษัท สมาชิกที่เหลือไม่มีสิทธิ์ยื่น): ไม่เขียนว่าส่งแล้ว นับว่าไม่ถึงใคร และบันทึก log', async () => {
        const db = makeDb({
            ...holder,
            applications: [{ id: 'app-1', entityId: 'entity-1', applicant: applicant('user-gone') }],
            memberships: [member({ id: 'm-3', userId: 'user-3', entityId: 'entity-1', role: 'WORKER', permissions: [] })],
        });
        const { processTier, send, logger } = loadStack({ db });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect(send).not.toHaveBeenCalled();
        expect({ ...summary, marks: db.reminders('app-1') }).toMatchObject({ found: 1, sent: 0, failed: 0, unreachable: 1, marks: [] });
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no recipient'), expect.objectContaining({ certificateId: 'cert-1' }));
    });

    it('ทุกคนปิดรับแจ้งเตือน: ไม่มีใครได้แถวกระดิ่ง นับว่าไม่ถึงใคร ไม่เขียนว่าส่งแล้ว', async () => {
        const db = makeDb(holder);
        const { processTier } = loadStack({ db, send: async () => optedOut });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect({ ...summary, marks: db.reminders('app-1') }).toMatchObject({ found: 1, sent: 0, failed: 0, unreachable: 1, marks: [] });
    });

    it('ถึงมือทุกคน: เขียนว่าส่งแล้วด้วยใบและขั้นเตือนนั้น หลังส่งถึงผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่น', async () => {
        const db = makeDb(holder);
        const { processTier, send } = loadStack({ db });

        const summary = await processTier({ daysBeforeExpiry: 30, now });

        expect(summary).toMatchObject({ found: 1, sent: 1, failed: 0 });
        expect(send.mock.calls.map(([call]) => call.userId).sort()).toEqual(['user-1', 'user-2']);
        expect(send.mock.calls[0][0]).toMatchObject({
            type: 'CERTIFICATE_EXPIRING_SOON',
            payload: expect.objectContaining({ applicationId: 'app-1', certNumber: 'TH-GACP 87/2568' }),
        });
        expect(db.reminders('app-1')).toEqual([expect.objectContaining({ type: 'D30', certId: 'cert-1' })]);
        expect(send.mock.invocationCallOrder[1]).toBeLessThan(db.application.update.mock.invocationCallOrder[0]);
    });
});
