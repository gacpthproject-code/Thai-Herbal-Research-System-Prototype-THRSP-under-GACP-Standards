'use strict';

/**
 * Operator ruling 2026-10-08 (a): VIEW_FINANCIAL is grantable per member by the holder OWNER,
 * exactly like SUBMIT_APPLICATION. Defaults stay: OWNER and ADMIN hold it, MANAGER and VIEWER do
 * not. Only the OWNER grants or revokes, never on itself, and every change writes an
 * EntityMembershipEvent. The grant reaches the money doors: GET /entities/mine reports
 * viewFinancial and the applicant invoice list starts answering with the company's invoice.
 *
 * Real Postgres.
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const mockActor = { current: null };
jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const { tenantContextMiddleware } = jest.requireActual('../../middleware/tenant-context-middleware');
    const bindTenant = tenantContextMiddleware();
    const attach = (req, res, next) => {
        req.user = { ...mockActor.current };
        return bindTenant(req, res, next);
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});

d('VIEW_FINANCIAL is grantable by the OWNER (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: {}, userIds: [] };

    async function member(label, role) {
        const id = crypto.randomUUID();
        const canonicalId = `vg-${label}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: label, organizationId: fx.orgId,
            },
        });
        await raw.entityMembership.create({
            data: { userId: id, entityId: fx.entityId, role, permissions: [], status: 'ACTIVE', organizationId: fx.orgId },
        });
        fx.userIds.push(id);
        fx.users[label] = { id, canonicalId };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgId = (await raw.organization.create({ data: { name: `vg-${sfx}`, slug: `vg-${sfx}`, code: `VG_${sfx}`.toUpperCase() } })).id;
        fx.entityId = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: 'บริษัท ให้สิทธิ์การเงิน จำกัด', juristicId: '0105561234616', organizationId: fx.orgId },
        })).id;
        await member('owner', 'OWNER');
        await member('admin', 'ADMIN');
        await member('manager', 'MANAGER');
        await member('viewer', 'VIEWER');
        fx.appId = (await raw.application.create({
            data: {
                applicationNumber: `APP-VG-${sfx}`, healthId: fx.users.owner.canonicalId, areaType: 'OUTDOOR', organizationId: fx.orgId,
                entityId: fx.entityId, submitterId: fx.users.owner.id, status: 'DOC_FEE_PAID', phase1Status: 'PAID',
                formData: { workflowState: 'DOC_FEE_PAID' },
            },
        })).id;
        fx.invoiceNumber = `INV-VG-${sfx}`;
        await raw.invoice.create({
            data: {
                invoiceNumber: fx.invoiceNumber, applicationId: fx.appId, healthId: fx.users.owner.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 5500, vat: 385, totalAmount: 5885, dueDate: new Date(),
                organizationId: fx.orgId, status: 'RECEIPT_ISSUED', paidAt: new Date(), receiptNumber: `RC-VG-${sfx}`,
                receiptIssuedAt: new Date(), receiptIssuedBy: 'stripe-webhook', receiptStatus: 'ISSUED', paymentMethod: 'PromptPay',
            },
        });

        app = express();
        app.use(express.json());
        app.use('/api/entities', require('../../routes/api/entities'));
        app.use('/api/invoices', require('../../routes/api/finance/invoices'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.invoice.deleteMany({ where: { applicationId: fx.appId } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: fx.appId } }).catch(() => {});
        await raw.entityMembershipEvent.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entityMemberPermissionGrant.deleteMany({ where: { membership: { entityId: fx.entityId } } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: fx.entityId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    const as = (label) => {
        const u = fx.users[label];
        mockActor.current = {
            id: u.id, canonicalId: u.canonicalId, healthId: u.canonicalId, role: 'health', canonicalRole: 'health', organizationId: fx.orgId,
        };
    };
    const permissionsOf = (target) => `/api/entities/${fx.entityId}/members/${fx.users[target].id}/permissions`;
    const sees = async (label) => {
        as(label);
        const mine = await request(app).get('/api/entities/mine');
        const row = mine.body.data.find((m) => m.id === fx.entityId);
        const invoices = await request(app).get('/api/invoices/my');
        return { flag: row.can.viewFinancial, listsInvoice: JSON.stringify(invoices.body).includes(fx.invoiceNumber) };
    };
    const put = (actor, target, effect) => {
        as(actor);
        return request(app).put(permissionsOf(target)).send({ permission: 'VIEW_FINANCIAL', effect });
    };
    const events = (target) => raw.entityMembershipEvent.findMany({
        where: { entityId: fx.entityId, targetUserId: fx.users[target].id },
        select: { eventType: true, actorUserId: true, metadata: true },
        orderBy: { createdAt: 'asc' },
    });

    test.each([['owner', true], ['admin', true], ['manager', false], ['viewer', false]])('default: %s viewFinancial=%s', async (label, expected) => {
        expect(await sees(label)).toEqual({ flag: expected, listsInvoice: expected });
    });

    test('the catalog offers VIEW_FINANCIAL with its Thai label', async () => {
        as('owner');
        const res = await request(app).get(permissionsOf('manager'));
        expect(res.status).toBe(200);
        expect(res.body.data.catalog).toContainEqual({ key: 'VIEW_FINANCIAL', label: 'ดูข้อมูลการเงินและชำระเงิน' });
        expect(res.body.data.catalog).toContainEqual({ key: 'SUBMIT_APPLICATION', label: 'ยื่นคำขอรับรอง' });
    });

    test('the OWNER grants it to a MANAGER: the money doors open, and the grant is audited', async () => {
        const res = await put('owner', 'manager', 'GRANT');
        expect(res.status).toBe(200);
        expect(res.body.data.effective).toContain('VIEW_FINANCIAL');
        expect(await sees('manager')).toEqual({ flag: true, listsInvoice: true });
        expect(await events('manager')).toContainEqual(expect.objectContaining({
            eventType: 'ENTITY_PERMISSION_GRANTED', actorUserId: fx.users.owner.id,
            metadata: expect.objectContaining({ permission: 'VIEW_FINANCIAL', effect: 'GRANT' }),
        }));
    });

    test('removing the grant returns the MANAGER to its role default (no money), audited', async () => {
        as('owner');
        const res = await request(app).delete(`${permissionsOf('manager')}/VIEW_FINANCIAL`);
        expect(res.status).toBe(200);
        expect(await sees('manager')).toEqual({ flag: false, listsInvoice: false });
        expect((await events('manager')).length).toBe(2);
    });

    test('the OWNER revokes it from an ADMIN: the role default no longer reads money', async () => {
        const res = await put('owner', 'admin', 'REVOKE');
        expect(res.status).toBe(200);
        expect(await sees('admin')).toEqual({ flag: false, listsInvoice: false });
        expect(await events('admin')).toContainEqual(expect.objectContaining({ eventType: 'ENTITY_PERMISSION_REVOKED' }));
    });

    test('an ADMIN cannot grant it, and the target stays without it', async () => {
        const res = await put('admin', 'viewer', 'GRANT');
        expect(res.status).toBe(403);
        expect(await sees('viewer')).toEqual({ flag: false, listsInvoice: false });
        expect(await events('viewer')).toEqual([]);
    });

    test('a member cannot grant it to themselves', async () => {
        const res = await put('manager', 'manager', 'GRANT');
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SELF_PERMISSION_CHANGE_FORBIDDEN');
        expect(await sees('manager')).toEqual({ flag: false, listsInvoice: false });
    });
});
