'use strict';

/**
 * Operator ruling 2026-10-08 (b): the payment reminder and the closure notice cannot be muted,
 * like official letters. Operator ruling 2026-10-09 (order 52): neither can the revision-deadline
 * reminder (DEADLINE_REMINDER), which warns before the 5-working-day auto-cancel of order 28.
 * The notice that a second factor moved to a new device (SECOND_FACTOR_MOVED) and the admin
 * notice that a staff second factor changed (STAFF_SECOND_FACTOR_CHANGED) are always on too: they
 * are the owner's and the admin's only warning of a takeover.
 * Saving a mute of any of them is ignored, a mute stored before the ruling is ignored at send time
 * (bell row and fanout alike), and the preferences answer names the always-on types so the screen
 * can show them as such. Other types still mute.
 *
 * Real Postgres.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const prefs = require('../../services/notification-preferences-service');
const { sendNotification } = require('../../services/notification-service');
const fanout = require('../../services/notification-fanout-service');

const ALWAYS_ON = ['PAYMENT_REMINDER', 'APPLICATION_EXPIRED', 'DEADLINE_REMINDER', 'AUDIT_VISIT_REMINDER', 'SECOND_FACTOR_MOVED', 'STAFF_SECOND_FACTOR_CHANGED'];

d('always-on notices cannot be muted (real Postgres)', () => {
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = {};

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgId = (await raw.organization.create({ data: { name: `mu-${sfx}`, slug: `mu-${sfx}`, code: `MU_${sfx}`.toUpperCase() } })).id;
        fx.userId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.userId, canonicalId: `mu-${sfx}`, healthId: `mu-${sfx}`, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `mu-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: 'ปิดแจ้งเตือน', organizationId: fx.orgId,
            },
        });
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.notification.deleteMany({ where: { userId: fx.userId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: fx.userId } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    const muteAll = {
        channels: {
            PAYMENT_REMINDER: { inApp: false }, APPLICATION_EXPIRED: { inApp: false }, DEADLINE_REMINDER: { inApp: false }, AUDIT_SCHEDULED: { inApp: false },
        },
    };
    const rows = (type) => raw.notification.count({ where: { userId: fx.userId, type } });

    test('saving a mute keeps only the mutable type, and the answer names the always-on types', async () => {
        const saved = await prefs.updatePrefs(fx.userId, muteAll);
        expect(saved.channels).toEqual({ AUDIT_SCHEDULED: { inApp: false } });
        expect(saved.alwaysOn).toEqual(ALWAYS_ON);
        const stored = (await raw.user.findUnique({ where: { id: fx.userId }, select: { notificationSettings: true } })).notificationSettings;
        expect(stored.channels).toEqual({ AUDIT_SCHEDULED: { inApp: false } });
        expect((await prefs.getPrefs(fx.userId)).alwaysOn).toEqual(ALWAYS_ON);
    });

    test('a mute stored before the ruling is ignored at send time, on both paths; another type stays muted', async () => {
        await raw.user.update({ where: { id: fx.userId }, data: { notificationSettings: muteAll } });
        await sendNotification(fx.userId, 'PAYMENT_REMINDER', { applicationNumber: 'APP-MU', milestone: 'M1', reminderType: 'PRE_DUE' });
        await sendNotification(fx.userId, 'APPLICATION_EXPIRED', { applicationNumber: 'APP-MU', reason: 'ไม่ชำระค่าบริการภายในกำหนด' });
        await sendNotification(fx.userId, 'DEADLINE_REMINDER', { applicationNumber: 'APP-MU', remaining: 2, unit: 'days' });
        await sendNotification(fx.userId, 'AUDIT_SCHEDULED', { scheduledDate: '1 ม.ค.', scheduledTime: '09:00' });
        await fanout.send({ userId: fx.userId, type: 'APPLICATION_EXPIRED', payload: { applicationId: crypto.randomUUID() } });
        await fanout.send({ userId: fx.userId, type: 'DEADLINE_REMINDER', payload: { applicationId: crypto.randomUUID() } });
        expect(await rows('PAYMENT_REMINDER')).toBe(1);
        expect(await rows('APPLICATION_EXPIRED')).toBe(2);
        expect(await rows('DEADLINE_REMINDER')).toBe(2);
        expect(await rows('AUDIT_SCHEDULED')).toBe(0);
    });
});
