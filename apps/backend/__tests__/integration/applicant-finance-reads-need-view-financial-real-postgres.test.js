'use strict';

/**
 * Operator order 41 (2026-10-07): a company member reads the company's money (amounts,
 * quotations, invoices, receipts, credit notes) only when the member holds VIEW_FINANCIAL on
 * the holder. Enforced on every applicant finance door; workflow reads stay open to every
 * member.
 *
 * Who holds VIEW_FINANCIAL is the permission engine's answer (entity-service
 * DEFAULT_PERMISSIONS_BY_ROLE ∪ the membership's own permissions[] ∪ grants): OWNER and ADMIN
 * by default, MANAGER and VIEWER not. The fixture's "manager+" is a MANAGER whose membership
 * lists VIEW_FINANCIAL, so the doors are seen to ask the engine, not the role name.
 *
 * Real Postgres: one company, five members, one renewal application in DOC_FEE_PAID with a
 * paid invoice and its receipt, a credit note and an issued quotation.
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
// The credit-note download renders through the headless browser; its bytes are not the subject.
jest.mock('../../services/pdf/pdf-generator.service', () => ({
    initialize: async () => {},
    warmUp: async () => {},
    close: async () => {},
    generatePDF: async () => Buffer.from('%PDF-1.4 vf'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 vf'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));

d('applicant finance reads need VIEW_FINANCIAL (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: {}, userIds: [] };

    async function member(label, role, permissions = []) {
        const id = crypto.randomUUID();
        const canonicalId = `vf-${label}-${sfx}`;
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
        const org = await raw.organization.create({ data: { name: `vf-${sfx}`, slug: `vf-${sfx}`, code: `VF_${sfx}`.toUpperCase() } });
        fx.orgId = org.id;
        fx.entityId = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: 'บริษัท สิทธิ์การเงิน จำกัด', juristicId: '0105561234586', organizationId: fx.orgId },
        })).id;
        await member('owner', 'OWNER');
        await member('admin', 'ADMIN');
        await member('manager', 'MANAGER');
        await member('viewer', 'VIEWER');
        await member('managerPlus', 'MANAGER', ['VIEW_FINANCIAL']);
        await member('submitterOnly', 'MANAGER', ['SUBMIT_APPLICATION']);
        const filer = fx.users.owner;
        fx.appId = (await raw.application.create({
            data: {
                applicationNumber: `APP-VF-${sfx}`, healthId: filer.canonicalId, areaType: 'OUTDOOR', organizationId: fx.orgId,
                entityId: fx.entityId, submitterId: filer.id, status: 'DOC_FEE_PAID', phase1Status: 'PAID',
                formData: { workflowState: 'DOC_FEE_PAID', renewalOf: 'TH-GACP 1/2568', cultivationMethods: ['outdoor'] },
            },
        })).id;
        fx.invoiceNumber = `INV-VF-${sfx}`;
        fx.invoiceId = (await raw.invoice.create({
            data: {
                invoiceNumber: fx.invoiceNumber, applicationId: fx.appId, healthId: filer.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 5500, vat: 385, totalAmount: 5885, dueDate: new Date(),
                organizationId: fx.orgId, status: 'RECEIPT_ISSUED', paidAt: new Date(), receiptNumber: `RC-VF-${sfx}`,
                receiptIssuedAt: new Date(), receiptIssuedBy: 'stripe-webhook', receiptStatus: 'ISSUED', paymentMethod: 'PromptPay',
            },
        })).id;
        fx.creditNoteNumber = `CN-VF-${sfx}`;
        fx.creditNoteId = (await raw.creditNote.create({
            data: {
                originalInvoiceId: fx.invoiceId, creditNoteNumber: fx.creditNoteNumber, reason: 'คืนเงินที่ชำระซ้ำ',
                reasonCode: 'CORRECTION', subtotal: 500, vat: 35, totalAmount: 535, status: 'POSTED', issuedAt: new Date(),
                postedAt: new Date(), organizationId: fx.orgId,
            },
        })).id;
        fx.quotationNumber = `QT-VF-${sfx}`;
        await raw.quotation.create({
            data: {
                applicationId: fx.appId, issuerType: 'PLATFORM', quotationNumber: fx.quotationNumber, subtotal: 5500, vat: 385,
                totalAmount: 5885, status: 'SENT', validUntil: new Date(Date.now() + 7 * 86400e3),
                installments: [{ phase: 'PHASE_2', amount: 5885, serviceFeeAmount: 5500, vatAmount: 385, scopeCount: 1 }],
                organizationId: fx.orgId,
            },
        });

        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        app.use('/api/applications/:applicationId/quotations', require('../../routes/api/applications/quotations'));
        app.use('/api/preview', require('../../routes/api/preview/preview'));
        app.use('/api/invoices', require('../../routes/api/finance/invoices'));
        app.use('/api/finance/credit-notes', require('../../routes/api/finance/credit-notes'));
        app.use('/api/entities', require('../../routes/api/entities'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.quotation.deleteMany({ where: { applicationId: fx.appId } }).catch(() => {});
        await raw.creditNote.deleteMany({ where: { originalInvoiceId: fx.invoiceId } }).catch(() => {});
        await raw.invoice.deleteMany({ where: { applicationId: fx.appId } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: fx.appId } }).catch(() => {});
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
    const get = (label, path) => { as(label); return request(app).get(path); };
    const mentionsMoney = (body) => {
        const json = JSON.stringify(body);
        return [fx.invoiceNumber, fx.creditNoteNumber, fx.quotationNumber, '5885', '5,885']
            .filter((needle) => json.includes(needle));
    };

    const SEES = ['owner', 'admin', 'managerPlus'];
    const BLIND = ['manager', 'viewer'];

    test.each([...SEES.map((l) => [l, true]), ...BLIND.map((l) => [l, false])])('GET /entities/mine tells %s viewFinancial=%s', async (label, expected) => {
        const res = await get(label, '/api/entities/mine');
        expect(res.status).toBe(200);
        const row = res.body.data.find((m) => m.id === fx.entityId);
        expect(row.can.viewFinancial).toBe(expected);
    });

    test('a member who may submit but not read money cannot accept the price it cannot see (403 VIEW_FINANCIAL)', async () => {
        as('submitterOnly');
        const res = await request(app).post(`/api/applications/${fx.appId}/quotations/PLATFORM/accept`).send({});
        expect(res.status).toBe(403);
        expect(res.body).toEqual(expect.objectContaining({ code: 'ENTITY_PERMISSION_DENIED', permission: 'VIEW_FINANCIAL' }));
        expect((await raw.quotation.findFirst({ where: { applicationId: fx.appId }, select: { status: true } })).status).toBe('SENT');
    });

    describe.each(SEES)('%s holds VIEW_FINANCIAL', (label) => {
        test('invoices, receipts, quotations, credit notes and the statement are readable', async () => {
            expect(JSON.stringify((await get(label, '/api/invoices/my')).body)).toContain(fx.invoiceNumber);
            const quotations = await get(label, `/api/applications/${fx.appId}/quotations`);
            expect(quotations.status).toBe(200);
            expect(quotations.body.data.platform.quotationNumber).toBe(fx.quotationNumber);
            const notes = await get(label, `/api/finance/credit-notes?originalInvoiceId=${fx.invoiceId}`);
            expect(notes.status).toBe(200);
            expect(notes.body.data.map((n) => n.creditNoteNumber)).toEqual([fx.creditNoteNumber]);
            expect((await get(label, `/api/applications/${fx.appId}/statement`)).status).toBe(200);
        });

        test('the credit note of the company invoice downloads', async () => {
            const res = await get(label, `/api/invoices/my/${fx.invoiceId}/credit-notes/${fx.creditNoteId}/pdf`);
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/application\/pdf/);
            expect(res.headers['content-disposition']).toContain(fx.creditNoteNumber);
        });

        test('the application detail and preview carry the amounts', async () => {
            const detail = await get(label, `/api/applications/${fx.appId}`);
            expect(detail.body.data.renewalPriceEstimate).toEqual(expect.any(Number));
            const preview = await get(label, `/api/preview/applications/${fx.appId}/preview`);
            expect(preview.status).toBe(200);
            expect(preview.body.preview.payment).toEqual(expect.objectContaining({ isRenewal: true }));
            expect(preview.body.preview.financialDocuments).not.toBeNull();
        });
    });

    describe.each(BLIND)('%s does not hold VIEW_FINANCIAL', (label) => {
        test('the invoice list answers empty and carries no document or amount', async () => {
            const res = await get(label, '/api/invoices/my');
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([]);
        });

        test.each([
            ['GET quotations', () => `/api/applications/${fx.appId}/quotations`],
            ['GET quotation PDF', () => `/api/applications/${fx.appId}/quotations/PLATFORM/pdf`],
            ['GET statement', () => `/api/applications/${fx.appId}/statement`],
            ['GET invoice PDF', () => `/api/invoices/${fx.invoiceId}/pdf`],
            ['GET receipt PDF', () => `/api/invoices/my/${fx.invoiceId}/receipt/pdf`],
            ['GET credit note PDF', () => `/api/invoices/my/${fx.invoiceId}/credit-notes/${fx.creditNoteId}/pdf`],
        ])('%s answers 404', async (_name, path) => {
            const res = await get(label, path());
            expect(res.status).toBe(404);
            expect(mentionsMoney(res.body)).toEqual([]);
        });

        test('credit notes of the company invoice are refused (403)', async () => {
            const res = await get(label, `/api/finance/credit-notes?originalInvoiceId=${fx.invoiceId}`);
            expect(res.status).toBe(403);
            expect(mentionsMoney(res.body)).toEqual([]);
        });

        test('accepting the quotation is refused and the quotation stays SENT', async () => {
            as(label);
            const res = await request(app).post(`/api/applications/${fx.appId}/quotations/PLATFORM/accept`).send({});
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('ENTITY_PERMISSION_DENIED');
            expect(mentionsMoney(res.body)).toEqual([]);
            const row = await raw.quotation.findFirst({ where: { applicationId: fx.appId }, select: { status: true } });
            expect(row.status).toBe('SENT');
        });

        test('the application detail and preview still open, without amounts or finance documents', async () => {
            const detail = await get(label, `/api/applications/${fx.appId}`);
            expect(detail.status).toBe(200);
            expect(detail.body.data.status).toBe('DOC_FEE_PAID');
            expect(detail.body.data.renewalPriceEstimate).toBeNull();
            const preview = await get(label, `/api/preview/applications/${fx.appId}/preview`);
            expect(preview.status).toBe(200);
            expect(preview.body.preview.applicationId).toBe(fx.appId);
            expect(preview.body.preview.payment).toBeNull();
            expect(preview.body.preview.financialDocuments).toBeNull();
            expect(mentionsMoney(preview.body)).toEqual([]);
        });
    });
});
