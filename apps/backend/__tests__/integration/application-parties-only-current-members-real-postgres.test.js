/**
 * แจ้งเตือนฝั่งผู้ยื่นไปถึงเฉพาะคนที่ยังอยู่กับผู้ถือ (real Postgres)
 *
 * Security review 2026-10-07 M1: ผู้ยื่นได้รับทุกแจ้งเตือนเสมอ แม้ถูกถอดออกจากบริษัทผู้ถือแล้ว
 * (บันทึกผู้ตรวจ เงินคืน วันนัด เลขใบรับรอง ไหลไปหาคนนอก) · L5: บัญชีที่ถูกลบหรือถูกระงับยังได้รับ
 *
 * ผู้ยื่นได้รับเฉพาะเมื่อยังเป็นสมาชิก ACTIVE ของบริษัทผู้ถือ (หรือคำขอไม่มีผู้ถือ) · ทุกผู้รับต้องเป็น
 * บัญชีที่ยังถือ session ได้ (shared/account-status.js)
 */

'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

d('ผู้รับแจ้งเตือนของคำขอ = คนที่ยังอยู่กับผู้ถือและบัญชียังใช้ได้ (real Postgres)', () => {
    let raw;
    let fx;
    const { applicationPartyUserIds, notifyApplicationParties } = require('../../services/notification/application-parties');

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'cur');
    });

    afterAll(async () => {
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function applicantWith({ membership = 'ACTIVE', status = 'ACTIVE', isDeleted = false, entityId = fx.entityId } = {}) {
        const id = crypto.randomUUID();
        const canonicalId = `cur-x-${id.slice(0, 8)}-${fx.sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY', status, isDeleted,
                email: `${canonicalId}@example.test`, firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgId,
            },
        });
        fx.userIds.push(id);
        if (membership && entityId) {
            await raw.entityMembership.create({ data: { userId: id, entityId, role: 'ADMIN', status: membership, organizationId: fx.orgId } });
        }
        const application = await fx.makeApplication({ healthId: canonicalId, submitterId: id, entityId, status: 'PENDING_AUDIT_FEE' });
        return { id, application };
    }

    test('ผู้ยื่นยังเป็นสมาชิก ACTIVE → ได้รับพร้อมผู้ถือ', async () => {
        const { id, application } = await applicantWith();
        expect(await applicationPartyUserIds(application.id)).toEqual(expect.arrayContaining([...fx.expectedParties, id]));
    });

    test('ผู้ยื่นถูกถอดออกจากบริษัทผู้ถือ (REVOKED) → ไม่ได้รับอะไรเลย ผู้ถือยังได้รับ', async () => {
        const { id, application } = await applicantWith({ membership: 'REVOKED' });
        expect(await applicationPartyUserIds(application.id)).not.toContain(id);
        const { recipients } = await notifyApplicationParties(application.id, {
            type: 'INFO', title: 'วันนัดตรวจ', message: 'นัดตรวจแปลง', data: { certificateNumber: 'TH-GACP 9/2569' },
        });
        expect(recipients).toEqual(expect.arrayContaining(fx.expectedParties));
        expect(recipients).not.toContain(id);
        expect(await raw.notification.count({ where: { userId: id } })).toBe(0);
    });

    test('ผู้ยื่นไม่เคยเป็นสมาชิกของบริษัทผู้ถือ → ไม่ได้รับ', async () => {
        const { id, application } = await applicantWith({ membership: null });
        expect(await applicationPartyUserIds(application.id)).not.toContain(id);
    });

    test('บริษัทผู้ถือถูกลบแล้ว → ผู้ยื่นที่ยังมีสมาชิกภาพ ACTIVE ค้างอยู่ไม่ได้รับ', async () => {
        const gone = await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท ลบแล้ว ${fx.sfx} จำกัด`, juristicId: '0105561234594', organizationId: fx.orgId, isDeleted: true },
        });
        fx.entityIds.push(gone.id);
        const { id, application } = await applicantWith({ entityId: gone.id });
        expect(await applicationPartyUserIds(application.id)).not.toContain(id);
    });

    test('คำขอไม่มีผู้ถือ → ผู้ยื่นได้รับ', async () => {
        const { id, application } = await applicantWith({ membership: null, entityId: null });
        expect(await applicationPartyUserIds(application.id)).toEqual([id]);
    });

    test.each([
        ['บัญชีถูกลบ (isDeleted)', { isDeleted: true }],
        ['บัญชีถูกระงับ (INACTIVE)', { status: 'INACTIVE' }],
        ['บัญชีถูกพักใช้ (SUSPENDED)', { status: 'SUSPENDED' }],
    ])('%s → ไม่ได้รับ แม้ยังเป็นสมาชิก', async (_label, account) => {
        const { id, application } = await applicantWith(account);
        expect(await applicationPartyUserIds(application.id)).not.toContain(id);
        await notifyApplicationParties(application.id, { type: 'INFO', title: 'คืนเงิน', message: 'บันทึกการคืนเงิน' });
        expect(await raw.notification.count({ where: { userId: id } })).toBe(0);
    });

    test('สมาชิกผู้ถือที่บัญชีถูกลบ → ไม่ได้รับ', async () => {
        const { application } = await applicantWith();
        await raw.user.update({ where: { id: fx.granted.id }, data: { isDeleted: true } });
        try {
            expect(await applicationPartyUserIds(application.id)).not.toContain(fx.granted.id);
        } finally {
            await raw.user.update({ where: { id: fx.granted.id }, data: { isDeleted: false } });
        }
    });
});
