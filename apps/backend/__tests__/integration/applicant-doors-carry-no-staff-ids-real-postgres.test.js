'use strict';

/**
 * F6-R (security re-review of b93e1145d): no applicant-facing door sends a staff user id.
 * Staff are named by role or by display name on the applicant's screens, never by id.
 *
 * Fixture on a REAL Postgres: a CERTIFIED and a CAR_PENDING application whose staff
 * columns, history entries, staff-written formData records (the shapes the dispatcher,
 * scheduling and decision doors write), comment, work item and certificate columns name
 * one of five staff users (reviewer, dispatcher, inspector, approver, DTAM admin), plus a
 * quotation, a reviewed monthly report and a support ticket. Each
 * applicant door is read as the filer, and the raw JSON body must not contain any staff
 * id anywhere. The notification's staff-id metadata is a guard: no sender writes it into
 * an applicant's notice today, and the inbox drops it if one ever does.
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
    return {
        ...actual,
        authenticateAny: attach,
        authenticateHealth: attach,
        authenticateProvider: attach,
        authenticateToken: attach,
    };
});

const { buildApplicationDetailPayload } = require('../../routes/api/helpers/application-payload-builders');

d('applicant doors carry no staff user id (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: [], staff: {} };

    async function makeUser(label, role) {
        const id = crypto.randomUUID();
        const canonicalId = `nsi-${label}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: role === 'health' ? canonicalId : null, password: 'x', role,
                authType: 'EMAIL_LEGACY', email: `nsi-${label}-${sfx}@example.test`,
                firstName: 'ทดสอบ', lastName: label, organizationId: fx.orgId,
            },
        });
        fx.users.push(id);
        return { id, canonicalId };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({
            data: { name: `nsi-${sfx}`, slug: `nsi-${sfx}`, code: `NSI_${sfx}`.toUpperCase() },
        });
        fx.orgId = org.id;
        fx.filer = await makeUser('filer', 'health');
        for (const [label, role] of [
            ['reviewer', 'document_reviewer'], ['dispatcher', 'dispatcher'], ['inspector', 'field_inspector'],
            ['approver', 'certificate_approver'], ['admin', 'system_admin_dtam'], ['finance', 'finance_officer_platform'],
        ]) {
            fx.staff[label] = (await makeUser(label, role)).id;
        }
        const s = fx.staff;
        const entity = await raw.entity.create({
            data: { type: 'JURISTIC', displayName: 'บริษัท ไม่มีรหัสเจ้าหน้าที่ จำกัด', organizationId: fx.orgId },
        });
        fx.entityId = entity.id;
        await raw.entityMembership.create({
            data: { userId: fx.filer.id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId },
        });
        const history = (action, actorId, actorRole, extra = {}) => ({
            timestamp: new Date().toISOString(), action, actorId, actorRole, ...extra,
        });
        const makeApplication = async (label, status) => (await raw.application.create({
            data: {
                applicationNumber: `APP-NSI-${label}-${sfx}`, healthId: fx.filer.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: entity.id, submitterId: fx.filer.id, status,
                phase1Status: 'PAID', phase2Status: 'PAID',
                reviewerId: s.reviewer, schedulerId: s.dispatcher, auditorId: s.inspector, headAuditorId: s.approver,
                createdBy: fx.filer.id, updatedBy: s.admin, scheduledDate: new Date(),
                workflowHistory: [
                    history('SUBMIT', fx.filer.id, 'health'),
                    history('ASSIGN_REVIEWER', s.dispatcher, 'dispatcher', { reviewerId: s.reviewer }),
                    history('DOC_APPROVED', s.reviewer, 'document_reviewer', { metadata: { decidedBy: s.reviewer } }),
                    history('AUDIT_SCHEDULED', s.dispatcher, 'dispatcher', { auditorId: s.inspector }),
                    history('AUDIT_RESULT', s.inspector, 'field_inspector'),
                    history('DECISION', s.approver, 'certificate_approver', { decidedBy: s.approver }),
                ],
                formData: {
                    workflowState: status,
                    auditMode: 'ONSITE',
                    auditSchedule: { auditorId: s.inspector, auditorName: 'ทดสอบ inspector', scheduledBy: s.dispatcher },
                    PROVIDERAssignment: { reviewerId: s.reviewer, assignedBy: s.dispatcher },
                    certificationDecision: { outcome: 'APPROVED', decidedBy: s.approver },
                    _lastReviewComment: 'ok',
                },
            },
        })).id;
        fx.appId = await makeApplication('cert', 'CERTIFIED');
        fx.carAppId = await makeApplication('car', 'CAR_PENDING');
        for (const applicationId of [fx.appId, fx.carAppId]) {
            await raw.applicationComment.create({
                data: { applicationId, authorId: s.reviewer, role: 'document_reviewer', content: 'เอกสารครบ', organizationId: fx.orgId },
            });
            await raw.applicationComment.createMany({
                data: [
                    { applicationId, authorId: s.reviewer, role: 'document_reviewer', content: 'บันทึกภายในห้ามหลุด', internalOnly: true, organizationId: fx.orgId },
                    { applicationId, authorId: s.reviewer, role: 'document_reviewer', content: 'ข้อความที่ลบแล้ว', isDeleted: true, deletedAt: new Date(), organizationId: fx.orgId },
                ],
            });
            await raw.workActivity.create({
                data: {
                    applicationId, workType: 'DOCUMENT_REVIEW', candidateGroup: 'document_reviewer', state: 'DONE',
                assignedUserId: s.reviewer, completedBy: s.reviewer, triggeredAtStage: 'DOC_FEE_PAID', organizationId: fx.orgId,
                },
            });
        }
        const farm = await raw.farm.create({
            data: {
                ownerId: fx.filer.id, farmName: `ฟาร์ม nsi ${sfx}`, farmType: 'CULTIVATION', address: '1',
                province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540',
                totalArea: 1, cultivationArea: 1, cultivationMethod: 'OUTDOOR', organizationId: fx.orgId, entityId: entity.id,
            },
        });
        fx.farmId = farm.id;
        const cert = await raw.certificate.create({
            data: {
                certificateNumber: `TH-GACP NSI-${sfx}`, verificationCode: `V-${sfx}`, qrData: 'qr',
                applicationId: fx.appId, userId: fx.filer.id, submittedByUserId: fx.filer.id, farmId: farm.id,
                farmName: 'ฟาร์ม', applicantName: 'ทดสอบ', holderDisplayName: entity.displayName, holderType: 'JURISTIC',
                cropType: 'cannabis', farmSize: 1, province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่',
                standardId: 'std', standardName: 'GACP', validityMonths: 12, expiryDate: new Date(Date.now() + 365 * 86400e3),
                status: 'active', organizationId: fx.orgId,
                issuedBy: s.approver, signedBy: s.approver, revisedBy: s.admin, reinstatedBy: s.approver,
                createdBy: s.approver, updatedBy: s.admin,
            },
        });
        fx.certId = cert.id;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-NSI-${sfx}`, applicationId: fx.appId, healthId: fx.filer.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 5500, vat: 385, totalAmount: 5885,
                dueDate: new Date(), organizationId: fx.orgId, status: 'RECEIPT_ISSUED', paidAt: new Date(),
                receiptNumber: `RC-NSI-${sfx}`, receiptIssuedAt: new Date(), receiptIssuedBy: 'stripe-webhook',
                receiptStatus: 'ISSUED', paymentMethod: 'PromptPay', createdBy: s.finance, updatedBy: s.finance,
            },
        });
        fx.invoiceId = invoice.id;
        await raw.creditNote.create({
            data: {
                originalInvoiceId: invoice.id, creditNoteNumber: `CN-NSI-${sfx}`, reason: 'คืนเงินที่ชำระซ้ำ',
                reasonCode: 'CORRECTION', subtotal: 500, vat: 35, totalAmount: 535, status: 'POSTED',
                issuedAt: new Date(), issuedBy: s.finance, postedAt: new Date(), postedBy: s.finance, organizationId: fx.orgId,
            },
        });
        await raw.quotation.create({
            data: {
                applicationId: fx.appId, issuerType: 'PLATFORM', quotationNumber: `QT-NSI-${sfx}`,
                subtotal: 5500, vat: 385, totalAmount: 5885, status: 'PENDING', validUntil: new Date(Date.now() + 7 * 86400e3),
                installments: [{ phase: 'PHASE_1', amount: 5885, serviceFeeAmount: 5500, vatAmount: 385, scopeCount: 1 }],
                organizationId: fx.orgId, createdBy: s.reviewer, updatedBy: s.admin,
            },
        });
        fx.reportId = (await raw.reportSubmission.create({
            data: {
                certificateId: cert.id, userId: fx.filer.id, reportType: 'PT27', reportMonth: 1, reportYear: 2569,
                formData: { note: 'รายงานประจำเดือน' }, status: 'REVIEWED', submittedAt: new Date(),
                reviewedAt: new Date(), reviewedBy: s.reviewer, reviewNote: 'ครบถ้วน',
                createdBy: fx.filer.id, updatedBy: s.reviewer, organizationId: fx.orgId,
            },
        })).id;
        fx.ticketId = (await raw.ticket.create({
            data: {
                organizationId: fx.orgId, creatorId: fx.filer.id, title: 'สอบถามวันนัด', relatedApplication: fx.appId,
                messages: { create: [{ senderId: fx.filer.id, content: 'ขอเลื่อนนัดได้ไหม' }] },
            },
        })).id;
        await raw.notification.create({
            data: {
                userId: fx.filer.id, title: 'ผลการตรวจ', message: 'ผ่าน', type: 'INFO', organizationId: fx.orgId,
                metadata: {
                    applicationId: fx.appId, actionUrl: `/health/applications/${fx.appId}`,
                    auditorId: s.inspector, reviewerId: s.reviewer, decidedBy: s.approver, actorId: s.dispatcher,
                },
            },
        });

        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        app.use('/api/applications', require('../../routes/api/applications/audit-notes'));
        app.use('/api/preview', require('../../routes/api/preview/preview'));
        app.use('/api/dashboard', require('../../routes/api/system/dashboard'));
        app.use('/api/certificates', require('../../routes/api/certificates/certificates'));
        app.use('/api/notifications', require('../../routes/api/system/notifications'));
        app.use('/api/applications', require('../../routes/api/applications/requirements'));
        app.use('/api/applications/:applicationId/quotations', require('../../routes/api/applications/quotations'));
        app.use('/api/invoices', require('../../routes/api/finance/invoices'));
        app.use('/api/documents', require('../../routes/api/documents/documents'));
        app.use('/api/finance/credit-notes', require('../../routes/api/finance/credit-notes'));
        app.use('/api/report-submissions', require('../../routes/api/documents/report-submissions'));
        app.use('/api/tickets', require('../../routes/api/system/tickets'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.notification.deleteMany({ where: { userId: { in: fx.users } } }).catch(() => {});
        await raw.ticket.deleteMany({ where: { id: fx.ticketId } }).catch(() => {});
        await raw.reportSubmission.deleteMany({ where: { id: fx.reportId } }).catch(() => {});
        await raw.quotation.deleteMany({ where: { applicationId: fx.appId } }).catch(() => {});
        await raw.creditNote.deleteMany({ where: { originalInvoiceId: fx.invoiceId } }).catch(() => {});
        await raw.invoice.deleteMany({ where: { id: fx.invoiceId } }).catch(() => {});
        await raw.certificate.deleteMany({ where: { applicationId: fx.appId } }).catch(() => {});
        await raw.workActivity.deleteMany({ where: { applicationId: { in: [fx.appId, fx.carAppId] } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: [fx.appId, fx.carAppId] } } }).catch(() => {});
        await raw.farm.deleteMany({ where: { id: fx.farmId } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: fx.entityId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.users } } }).catch(() => {});
        if (fx.orgId) { await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {}); }
        await raw.$disconnect();
    });

    const asFiler = () => {
        mockActor.current = {
            id: fx.filer.id, canonicalId: fx.filer.canonicalId, healthId: fx.filer.canonicalId,
            role: 'health', canonicalRole: 'health', organizationId: fx.orgId,
        };
    };
    const staffIdsIn = (body) => {
        const json = JSON.stringify(body);
        return Object.entries(fx.staff).filter(([, id]) => json.includes(id)).map(([label]) => label);
    };

    const byIdDoors = [
        ['GET /applications/:id', (id) => `/api/applications/${id}`],
        ['GET /applications/:id/status', (id) => `/api/applications/${id}/status`],
        ['GET /applications/:id/history', (id) => `/api/applications/${id}/history`],
        ['GET /applications/:id/activities', (id) => `/api/applications/${id}/activities`],
        ['GET /applications/:id/audit-notes', (id) => `/api/applications/${id}/audit-notes`],
        ['GET /applications/:id/requirements', (id) => `/api/applications/${id}/requirements`],
        ['GET /applications/:id/statement', (id) => `/api/applications/${id}/statement`],
        ['GET /applications/:id/katorlor1', (id) => `/api/applications/${id}/katorlor1`],
        ['GET /applications/:id/quotations', (id) => `/api/applications/${id}/quotations`],
    ];
    const doors = [
        ...byIdDoors.map(([name, path]) => [`${name} (CERTIFIED)`, () => path(fx.appId)]),
        ...byIdDoors.map(([name, path]) => [`${name} (CAR_PENDING)`, () => path(fx.carAppId)]),
        ['GET /preview/applications/:id/preview (CAR_PENDING)', () => `/api/preview/applications/${fx.carAppId}/preview`],
        ['GET /applications/my', () => '/api/applications/my'],
        ['GET /applications/my/statuses', () => '/api/applications/my/statuses'],
        ['GET /applications', () => '/api/applications/'],
        ['GET /dashboard/stats', () => '/api/dashboard/stats'],
        ['GET /certificates/my', () => '/api/certificates/my'],
        ['GET /certificates', () => '/api/certificates/'],
        ['GET /certificates/:id', () => `/api/certificates/${fx.certId}`],
        ['GET /notifications', () => '/api/notifications'],
        ['GET /invoices/my', () => '/api/invoices/my'],
        ['GET /documents', () => '/api/documents'],
        ['GET /finance/credit-notes?originalInvoiceId=', () => `/api/finance/credit-notes?originalInvoiceId=${fx.invoiceId}`],
        ['GET /report-submissions', () => '/api/report-submissions'],
        ['GET /report-submissions/:id', () => `/api/report-submissions/${fx.reportId}`],
        ['GET /tickets', () => '/api/tickets'],
        ['GET /tickets/:id', () => `/api/tickets/${fx.ticketId}`],
        ['GET /tickets/application/:applicationId', () => `/api/tickets/application/${fx.appId}`],
    ];

    test.each(doors)('%s answers 200 and names no staff member by id', async (_name, path) => {
        asFiler();
        const res = await request(app).get(path());
        expect(res.status).toBe(200);
        expect(staffIdsIn(res.body)).toEqual([]);
    });

    // The applicant's write doors answer with what they wrote. Each one listed here
    // returns a stored row (or names one) that a staff action may have stamped.
    const writeDoors = [
        ['POST /applications/:id/quotations/PLATFORM/accept', 'post',
            () => `/api/applications/${fx.appId}/quotations/PLATFORM/accept`, {}],
        ['POST /tickets/:id/messages', 'post', () => `/api/tickets/${fx.ticketId}/messages`, { content: 'ขอบคุณครับ' }],
    ];

    test.each(writeDoors)('%s answers 2xx and names no staff member by id', async (_name, method, path, body) => {
        asFiler();
        const res = await request(app)[method](path()).send(body);
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        expect(staffIdsIn(res.body)).toEqual([]);
    });

    test('the seeded staff stamps reach the new doors: the reviewed report, the quotation the filer accepted, and the ticket are the ones read', async () => {
        asFiler();
        const report = await request(app).get(`/api/report-submissions/${fx.reportId}`);
        expect(report.body.data).toEqual(expect.objectContaining({ id: fx.reportId, status: 'REVIEWED', reviewNote: 'ครบถ้วน' }));
        const list = await request(app).get('/api/report-submissions');
        expect(list.body.data.map((r) => r.id)).toEqual([fx.reportId]);
        const quotations = await request(app).get(`/api/applications/${fx.appId}/quotations`);
        expect(quotations.body.data.platform).toEqual(expect.objectContaining({ quotationNumber: `QT-NSI-${sfx}` }));
        const accepted = await raw.quotation.findFirst({ where: { applicationId: fx.appId }, select: { status: true, createdBy: true } });
        expect(accepted).toEqual({ status: 'ACCEPTED', createdBy: fx.staff.reviewer });
        const ticket = await request(app).get(`/api/tickets/${fx.ticketId}`);
        expect(ticket.body.data.messages[0]).toEqual(expect.objectContaining({ senderId: fx.filer.id }));
    });

    test('the fixture reaches the doors: the filer reads its own application and certificate', async () => {
        asFiler();
        const detail = await request(app).get(`/api/applications/${fx.appId}`);
        expect(detail.body.data.id).toBe(fx.appId);
        expect(detail.body.data.comments).toHaveLength(1);
        const cert = await request(app).get(`/api/certificates/${fx.certId}`);
        expect(cert.body.data.id).toBe(fx.certId);
        const invoices = await request(app).get('/api/invoices/my');
        expect(JSON.stringify(invoices.body)).toContain(fx.invoiceId);
        const notes = await request(app).get(`/api/finance/credit-notes?originalInvoiceId=${fx.invoiceId}`);
        expect(notes.body.data).toHaveLength(1);
        const inbox = await request(app).get('/api/notifications');
        expect(inbox.body.data.map((n) => n.metadata?.applicationId)).toContain(fx.appId);
    });

    test('the detail builder drops a comment\'s auditorId and resolvedBy even when a row carries them', () => {
        const payload = buildApplicationDetailPayload({
            id: 'a', formData: {}, comments: [{
                id: 'c', role: 'document_reviewer', content: 't', createdAt: new Date(0),
                resolvedBy: fx.staff.reviewer, auditorId: fx.staff.inspector, authorId: fx.staff.reviewer,
            }],
        });
        expect(staffIdsIn(payload)).toEqual([]);
        expect(payload.comments[0]).toEqual({ id: 'c', authorRole: 'document_reviewer', commentText: 't', createdAt: new Date(0) });
    });

    test.each([
        ['GET /applications/:id', (id) => `/api/applications/${id}`],
        ['GET /applications/:id/history', (id) => `/api/applications/${id}/history`],
    ])('%s carries the officer comment text from the stored row, never an internal or deleted one', async (_name, path) => {
        asFiler();
        const res = await request(app).get(path(fx.appId));
        expect(res.status).toBe(200);
        expect(res.body.data.comments).toEqual([
            expect.objectContaining({ authorRole: 'document_reviewer', commentText: 'เอกสารครบ' }),
        ]);
        expect(JSON.stringify(res.body)).not.toContain('บันทึกภายในห้ามหลุด');
        expect(JSON.stringify(res.body)).not.toContain('ข้อความที่ลบแล้ว');
        expect(staffIdsIn(res.body)).toEqual([]);
    });
});
