'use strict';
/**
 * A quotation door that answers 500 leaves the cause in the log (review of 163f352e9, L4).
 * The doors logged `logger.error('<label>:', error?.message || error)`; the shared winston
 * logger keeps an object's keys but drops a second string argument, so the PDF door's 500
 * during the review left only "[Quotations] pdf error:" with no cause. The REAL logger runs
 * here, with a stream that captures exactly the JSON line it writes.
 *
 * The cause stops at its first line, and a Prisma validation error leaves only its name (check of
 * f45c9a987, Low-3; order 5): that message quotes the call's arguments, such as the buyer snapshot
 * the accept door writes.
 */

const request = require('supertest');
const express = require('express');
const { Writable } = require('stream');
const winston = require('winston');
const { Prisma } = require('@prisma/client');

jest.mock('../../middleware/auth-middleware', () => {
    const applicant = (req, _res, next) => {
        req.user = { id: 'user-1', canonicalId: 'h-1', canonicalRole: 'health' };
        next();
    };
    return { authenticateAny: applicant, authenticateHealth: applicant, authenticateProvider: (_req, _res, next) => next() };
});

jest.mock('../../services/entity-effective-permissions-service', () => ({
    ...jest.requireActual('../../services/entity-effective-permissions-service'),
    assertEntityActionPermission: async () => ({ allowed: true }),
}));

const mockGetApplicationSlice = jest.fn();
jest.mock('../../services/application-service', () => ({
    getApplicationSlice: (...a) => mockGetApplicationSlice(...a),
    findOwnedApplicationForApplicant: jest.fn(async (id, options) => (
        options?.holderScope?.userId === 'user-1' ? { id, isDeleted: false, entityId: 'ent-1' } : null
    )),
    resolveHealthIdentity: jest.fn(async () => ({ healthId: 'h-1', userId: 'user-1' })),
}));

const mockQuotationFindMany = jest.fn();
const mockQuotationFindFirst = jest.fn();
const mockQuotationUpdate = jest.fn();
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        quotation: {
            findMany: (...a) => mockQuotationFindMany(...a),
            findFirst: (...a) => mockQuotationFindFirst(...a),
            update: (...a) => mockQuotationUpdate(...a),
        },
    },
}));

const logger = require('../../shared/logger');
const invoiceTemplateService = require('../../services/pdf/invoice-template-service');
const quotationsRouter = require('../../routes/api/applications/quotations');

const APP_ID = 'app-1';
const ROW = {
    id: 'qt-1',
    applicationId: APP_ID,
    quotationNumber: 'QT-PRD-2026-000001',
    issuerType: 'PLATFORM',
    status: 'PENDING',
    subtotal: '33000.00',
    vat: '2310.00',
    totalAmount: '35310.00',
    installments: [
        { phase: 'PHASE_1', amount: 5885, serviceFeeAmount: 5500, vatAmount: 385, scopeCount: 1 },
        { phase: 'PHASE_2', amount: 29425, serviceFeeAmount: 27500, vatAmount: 1925, scopeCount: 1 },
    ],
    acceptedSnapshot: null,
};

const written = [];
const capture = new winston.transports.Stream({
    stream: new Writable({
        write(chunk, _encoding, done) { written.push(String(chunk)); done(); },
    }),
});
let renderQuotationPdf;
beforeAll(() => {
    logger.add(capture);
    renderQuotationPdf = jest.spyOn(invoiceTemplateService, 'generateQuotationPdf');
});
afterAll(() => {
    logger.remove(capture);
    renderQuotationPdf.mockRestore();
});

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/applications/:applicationId/quotations', quotationsRouter);
    return app;
}

/** The JSON line the logger wrote for `label`, parsed. */
function loggedLine(label) {
    const lines = written.map((line) => JSON.parse(line)).filter((entry) => String(entry.message).startsWith(label));
    expect(lines).toHaveLength(1);
    return lines[0];
}

const failure = (message, code) => Object.assign(new Error(message), { code });

describe('a quotation door that answers 500 logs why', () => {
    beforeEach(() => {
        written.length = 0;
        renderQuotationPdf.mockReset();
        mockGetApplicationSlice.mockReset().mockResolvedValue({
            id: APP_ID, applicationNumber: 'GACP-TH-2569-000123', formData: { cultivationMethods: ['outdoor'] },
            totalAreaTypes: 1, cultivationScopeCount: 1,
        });
        mockQuotationFindMany.mockReset().mockResolvedValue([ROW]);
        mockQuotationFindFirst.mockReset().mockResolvedValue(ROW);
        mockQuotationUpdate.mockReset();
    });

    test.each([
        ['list', '[Quotations] list error', failure('Connection terminated unexpectedly', 'P1017'),
            (err) => { mockGetApplicationSlice.mockRejectedValue(err); },
            (app) => request(app).get(`/api/applications/${APP_ID}/quotations`)],
        ['PDF', '[Quotations] pdf error', failure('ENOSPC: no space left on device, write', 'ENOSPC'),
            (err) => { renderQuotationPdf.mockRejectedValue(err); },
            (app) => request(app).get(`/api/applications/${APP_ID}/quotations/PLATFORM/pdf`)],
        ['accept', '[Quotations] accept error', failure('Transaction failed due to a write conflict', 'P2034'),
            (err) => { mockQuotationUpdate.mockRejectedValue(err); },
            (app) => request(app).post(`/api/applications/${APP_ID}/quotations/PLATFORM/accept`).send({})],
    ])('the %s door', async (_door, label, err, breakIt, call) => {
        breakIt(err);

        const res = await call(buildApp());

        expect(res.status).toBe(500);
        const line = loggedLine(label);
        expect({ level: line.level, errMessage: line.errMessage, code: line.code })
            .toEqual({ level: 'error', errMessage: err.message, code: err.code });
    });

    // The shape a real Prisma 5.22 message has (measured on a real database): an empty first line, the
    // invocation line, a code frame, then the arguments with their values.
    const BUYER = { name: 'บริษัท ผู้ซื้อตัวอย่าง จำกัด', address: '99 ถนนตัวอย่าง แขวงทดสอบ' };
    const invocationFailure = (head, tail) => [
        '',
        head,
        '/app/routes/api/applications/quotations.js:500:41',
        '',
        '→ 500 await prisma.quotation.update({',
        '        where: { id: "qt-1" },',
        `        data: { acceptedSnapshot: { payer: { name: "${BUYER.name}", address: "${BUYER.address}" } } }`,
        '      })',
        '',
        tail,
    ].join('\n');
    const leaked = (line) => [BUYER.name, BUYER.address].filter((value) => JSON.stringify(line).includes(value));

    test('a Prisma validation error leaves only its name, never the arguments it quotes', async () => {
        mockQuotationUpdate.mockRejectedValue(new Prisma.PrismaClientValidationError(
            invocationFailure('Invalid `prisma.quotation.update()` invocation in', 'Unknown argument `bogusField`.'),
            { clientVersion: Prisma.prismaVersion.client },
        ));

        const res = await request(buildApp()).post(`/api/applications/${APP_ID}/quotations/PLATFORM/accept`).send({});

        expect(res.status).toBe(500);
        const line = loggedLine('[Quotations] accept error');
        expect({ errName: line.errName, errMessage: line.errMessage, leaked: leaked(line) })
            .toEqual({ errName: 'PrismaClientValidationError', errMessage: undefined, leaked: [] });
    });

    test('any other error leaves the first line of its message', async () => {
        mockQuotationUpdate.mockRejectedValue(Object.assign(new Error(invocationFailure(
            'Invalid `prisma.quotation.update()` invocation in',
            'An operation failed because it depends on one or more records that were required but not found.',
        )), { code: 'P2025' }));

        const res = await request(buildApp()).post(`/api/applications/${APP_ID}/quotations/PLATFORM/accept`).send({});

        expect(res.status).toBe(500);
        const line = loggedLine('[Quotations] accept error');
        expect({ errMessage: line.errMessage, code: line.code, leaked: leaked(line) })
            .toEqual({ errMessage: 'Invalid `prisma.quotation.update()` invocation in', code: 'P2025', leaked: [] });
    });
});
