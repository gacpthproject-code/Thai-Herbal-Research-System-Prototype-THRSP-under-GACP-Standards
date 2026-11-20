'use strict';

/**
 * Operator order 41 (2026-10-07) on the refund notices: every party of an application is told a
 * refund was recorded, but only a party holding VIEW_FINANCIAL on the holder reads the amount and
 * the invoice and credit-note numbers. Everyone else gets the same event without them, title,
 * message and stored data alike.
 *
 * Real Postgres: one company, the filer (OWNER), a MANAGER who may submit but not read money, and
 * a MANAGER whose membership lists both.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { fanoutToApplicationParties, notifyApplicationParties } = require('../../services/notification/application-parties');
const { REFUND_KINDS } = require('../../shared/refund-kinds');

d('refund notices respect VIEW_FINANCIAL (real Postgres)', () => {
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: {}, userIds: [], moreAppIds: [] };
    const money = { amount: 5885, invoiceNumber: `INV-RN-${sfx}`, creditNoteNumber: `CN-RN-${sfx}` };

    async function member(label, role, permissions = []) {
        const id = crypto.randomUUID();
        const canonicalId = `rn-${label}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: label, organizationId: fx.orgId,
            },
        });
        await raw.entityMembership.create({
            data: { userId: id, entityId: fx.entityId, role, permissions, status: 'ACTIVE', organizationId: fx.orgId },
        });
        fx.userIds.push(id);
        fx.users[label] = { id, canonicalId };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgId = (await raw.organization.create({ data: { name: `rn-${sfx}`, slug: `rn-${sfx}`, code: `RN_${sfx}`.toUpperCase() } })).id;
        fx.entityId = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: 'บริษัท แจ้งคืนเงิน จำกัด', juristicId: '0105561234608', organizationId: fx.orgId },
        })).id;
        await member('owner', 'OWNER');
        await member('submitterOnly', 'MANAGER', ['SUBMIT_APPLICATION']);
        await member('managerPlus', 'MANAGER', ['SUBMIT_APPLICATION', 'VIEW_FINANCIAL']);
        fx.applicationNumber = `APP-RN-${sfx}`;
        fx.appId = (await raw.application.create({
            data: {
                applicationNumber: fx.applicationNumber, healthId: fx.users.owner.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entityId, submitterId: fx.users.owner.id, status: 'CANCELLED',
                formData: { workflowState: 'CANCELLED' },
            },
        })).id;
    });

    async function anotherApplication(label) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-RN-${label}-${sfx}`, healthId: fx.users.owner.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entityId, submitterId: fx.users.owner.id, status: 'CANCELLED',
                formData: { workflowState: 'CANCELLED' },
            },
        });
        fx.moreAppIds.push(row.id);
        return row;
    }

    afterAll(async () => {
        if (!raw) { return; }
        await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: [fx.appId, ...fx.moreAppIds] } } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: fx.entityId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    const leaks = (row) => {
        const text = JSON.stringify({ title: row.title, message: row.message, metadata: row.metadata });
        return [money.invoiceNumber, money.creditNoteNumber, '5,885', '5885'].filter((n) => text.includes(n));
    };
    const rowFor = (label, type) => raw.notification.findFirst({
        where: { userId: fx.users[label].id, metadata: { path: ['applicationId'], equals: fx.appId }, type: { startsWith: type } },
    });

    describe.each([
        ['REFUND_PROVIDER_CANCELLED', REFUND_KINDS.PROVIDER_CANCELLED],
        ['REFUND_DUPLICATE_CHARGE', REFUND_KINDS.DUPLICATE],
    ])('%s', (type) => {
        beforeAll(async () => {
            const out = await fanoutToApplicationParties(fx.appId, {
                type,
                payload: { applicationNumber: fx.applicationNumber, invoiceId: crypto.randomUUID(), ...money, reasonCode: null, priority: 'HIGH' },
            });
            expect(out.delivered).toBe(3);
        });

        test.each(['owner', 'managerPlus'])('%s (VIEW_FINANCIAL) reads the amount and both document numbers', async (label) => {
            const row = await rowFor(label, type);
            expect(row.type).toBe(type);
            expect(row.message).toContain('5,885.00');
            expect(row.message).toContain(money.invoiceNumber);
            expect(row.message).toContain(money.creditNoteNumber);
        });

        test('a member without VIEW_FINANCIAL is told a refund was recorded, without amount or numbers', async () => {
            const row = await rowFor('submitterOnly', type);
            expect(row).not.toBeNull();
            expect(row.message).toContain(fx.applicationNumber);
            expect(row.message).toContain('คืนเงิน');
            expect(row.message).toContain('ผู้มีสิทธิ์ดูข้อมูลการเงิน');
            expect(leaks(row)).toEqual([]);
        });
    });

    test('two refunds on two invoices of one application within the dedupe window both reach a member without VIEW_FINANCIAL', async () => {
        const application = await anotherApplication('TWO');
        const invoiceIds = [crypto.randomUUID(), crypto.randomUUID()];
        for (const invoiceId of invoiceIds) {
            await fanoutToApplicationParties(application.id, {
                type: 'REFUND_DUPLICATE_CHARGE',
                payload: { applicationNumber: application.applicationNumber, invoiceId, ...money, priority: 'HIGH' },
            });
        }
        const rows = await raw.notification.findMany({
            where: { userId: fx.users.submitterOnly.id, metadata: { path: ['applicationId'], equals: application.id } },
        });
        expect(rows.map((r) => r.type)).toEqual(['REFUND_DUPLICATE_CHARGE_NO_AMOUNT', 'REFUND_DUPLICATE_CHARGE_NO_AMOUNT']);
        expect(rows.map((r) => r.metadata.invoiceId).sort()).toEqual([...invoiceIds].sort());
        rows.forEach((row) => expect(leaks(row)).toEqual([]));
    });

    describe('notifyApplicationParties applies the same filter as the fanout path', () => {
        let application;
        beforeAll(async () => {
            application = await anotherApplication('BELL');
            await notifyApplicationParties(application.id, {
                type: 'REFUND_DUPLICATE_CHARGE',
                title: `คืนเงิน ${money.amount} บาท ตามใบกำกับภาษี ${money.invoiceNumber}`,
                message: `ใบลดหนี้ ${money.creditNoteNumber} ยอด 5,885.00 บาท`,
                data: { applicationNumber: application.applicationNumber, invoiceId: crypto.randomUUID(), ...money },
            });
        });
        const bellRow = (label) => raw.notification.findFirst({
            where: { userId: fx.users[label].id, metadata: { path: ['applicationId'], equals: application.id } },
        });

        test('owner (VIEW_FINANCIAL) gets the notice as sent', async () => {
            const row = await bellRow('owner');
            expect(row.type).toBe('REFUND_DUPLICATE_CHARGE');
            expect(row.message).toContain(money.creditNoteNumber);
        });

        test('a member without VIEW_FINANCIAL gets the amount-free notice in its own wording', async () => {
            const row = await bellRow('submitterOnly');
            expect(row.type).toBe('REFUND_DUPLICATE_CHARGE_NO_AMOUNT');
            expect(row.message).toContain(application.applicationNumber);
            expect(row.message).toContain('ผู้มีสิทธิ์ดูข้อมูลการเงิน');
            expect(leaks(row)).toEqual([]);
        });
    });
});
