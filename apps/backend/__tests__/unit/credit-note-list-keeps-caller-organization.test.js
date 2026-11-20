'use strict';

/**
 * L1 (security review of fix/finance-tools, 2026-10-09): the credit-note list is read inside
 * the caller's own organization (order 17). The service already pins every reader to its
 * organization, so a `?organizationId=` in the query is a dead input; the door must not carry
 * a caller-chosen organization toward the read at all.
 */

const express = require('express');
const request = require('supertest');

const mockListCreditNotes = jest.fn().mockResolvedValue([]);
jest.mock('../../middleware/auth-middleware', () => {
    const attach = (req, _res, next) => {
        req.user = { id: 'fin-1', role: 'finance_officer_platform', canonicalRole: 'finance_officer_platform', organizationId: 'org-own' };
        next();
    };
    return { authenticateProvider: attach, authenticateAny: attach };
});
jest.mock('../../services/credit-note-service', () => ({
    listCreditNotes: (...args) => mockListCreditNotes(...args),
}));

test('a caller-chosen organizationId never reaches the credit-note list', async () => {
    const app = express();
    app.use('/api/finance/credit-notes', require('../../routes/api/finance/credit-notes'));

    const res = await request(app).get('/api/finance/credit-notes?organizationId=org-other&status=ISSUED');

    expect(res.status).toBe(200);
    expect(mockListCreditNotes).toHaveBeenCalledTimes(1);
    const [args] = mockListCreditNotes.mock.calls[0];
    expect(args.organizationId).not.toBe('org-other');
    expect(args).toEqual(expect.objectContaining({
        status: 'ISSUED', actor: expect.objectContaining({ organizationId: 'org-own' }),
    }));
});
