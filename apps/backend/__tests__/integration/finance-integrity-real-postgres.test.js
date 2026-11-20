'use strict';

/**
 * Finance integrity: the security review of fix/finance-tools (2026-10-09).
 *
 *   HIGH-1   A state change of the company books applies once. Two requests that meet one
 *            row at the same moment leave one transition and one journal entry; the later
 *            one is refused with 409. The race is forced on every run
 *            (fixtures/row-lock-race.js), not left to timing.
 *   MEDIUM-1 Money on the analytics and on the scheduler summary is shown only to the roles
 *            it belongs to (order 29): the DTAM admin reads the whole analytics, finance its
 *            revenue part, every other staff role none. Revenue shown is net of credit notes,
 *            inside the caller's organization (order 17).
 *   L2       Who made, approved or posted a books row is the signed-in actor, never a value
 *            a caller passes.
 *   L4       The WHT service refuses a caller who may not write the books by itself.
 *   L6       The holder's credit-note list shows issued and posted notes only, as its PDF door.
 *   L7       The monthly CSV says its amount is what was received, before credit notes.
 * Real Postgres, real HTTP doors; only authentication is attached by hand.
 */

process.env.PAYMENT_ADAPTER = 'mock';
process.env.STRIPE_CHECKOUT_ENABLED = 'true';

const crypto = require('crypto');
const request = require('supertest');
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
jest.mock('../../services/notification-fanout-service', () => ({ send: jest.fn().mockResolvedValue({ sent: true }) }));
jest.mock('../../services/redis-service', () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(true) }));

const { createFinanceFixture } = require('./fixtures/finance-paid-fixture');
const { raceOnRow, raceOnInsert } = require('./fixtures/row-lock-race');
const { getZonedParts, localMonthRange } = require('../../utils/working-days');

const money = (n) => Math.round(Number(n) * 100) / 100;
const sum = (rows) => money(rows.reduce((total, r) => total + Number(r.totalAmount || 0), 0));
const GROSS_LABEL = 'ยอดรับชำระ (ก่อนหักใบลดหนี้)';

d('finance integrity (real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'fi', mockActor });
    const { fx } = F;

    const post = (url, body = {}) => request(F.app).post(url).send(body);
    const get = (url) => request(F.app).get(url);
    /** A request as `who`, sent when called (supertest sends nothing until awaited). */
    const fire = (who, url, body = {}) => () => {
        F.as(who);
        return post(url, body).then((res) => res);
    };
    const actorOf = (user) => ({
        id: user.id, canonicalId: user.canonicalId, role: user.role, canonicalRole: user.role,
        organizationId: user.organizationId,
    });

    const journalBody = {
        description: 'ปรับปรุงค่าใช้จ่ายค้างจ่าย', reason: 'ปรับปรุงสิ้นเดือนตามใบแจ้งหนี้ผู้ขาย',
        postingDate: '2026-09-30',
        lines: [
            { accountCode: '5110', debit: 500, credit: 0 },
            { accountCode: '1110-001', debit: 0, credit: 500 },
        ],
    };
    const adjustment = (invoiceId) => ({ originalInvoiceId: invoiceId, reason: 'ปรับยอดตามที่ตกลงกับผู้ซื้อ', subtotal: 100, vat: 7 });

    /** A paid invoice the WHT service accepts (a platform tax invoice). */
    async function whtEligibleInvoice(label) {
        const { invoice } = await F.paidM1(label);
        return F.raw.invoice.update({ where: { id: invoice.id }, data: { serviceType: 'PHASE_1_PLATFORM_FEE' } });
    }
    const whtBody = (invoiceId, certificateNumber) => ({
        invoiceId, certificateNumber, issuedByTaxId: '0105500000001', issuedByName: 'บริษัท ผู้ซื้อ จำกัด',
        certificateDate: '2026-10-01', whtAmount: 150,
    });

    async function issuedNote(kind, invoiceId) {
        const reasonCode = kind === 'credit-notes' ? 'PRICE_REDUCTION' : 'ADDITIONAL_CHARGE';
        F.as(fx.F);
        const made = await post(`/api/finance/${kind}`, { ...adjustment(invoiceId), reasonCode });
        expect(made.status).toBe(201);
        expect((await post(`/api/finance/${kind}/${made.body.data.id}/issue`)).status).toBe(200);
        return made.body.data;
    }

    beforeAll(async () => {
        await F.setup();
        F.state.app.use('/api/provider/reports', require('../../routes/api/provider/reports'));
        for (const [key, role] of [['DS', 'dispatcher'], ['FI', 'field_inspector']]) {
            const id = crypto.randomUUID();
            const canonicalId = `fi-${role}-${F.sfx}`;
            await F.raw.user.create({
                data: {
                    id, canonicalId, healthId: canonicalId, password: 'x', role, authType: 'EMAIL_LEGACY',
                    email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: role, organizationId: fx.org,
                },
            });
            fx.userIds.push(id);
            fx[key] = { id, canonicalId, role, organizationId: fx.org };
        }
    }, 120000);
    afterAll(() => F.cleanup());

    describe('HIGH-1: a books transition applies once', () => {

        test.each([
            ['credit-notes', 'credit_notes', 'creditNote', 'Credit note'],
            ['debit-notes', 'debit_notes', 'debitNote', 'Debit note'],
        ])('%s: two posts at once write one adjustment entry', async (kind, table, model, entryWord) => {
            const { invoice } = await F.paidM1(`post-${table}`);
            const note = await issuedNote(kind, invoice.id);
            const url = `/api/finance/${kind}/${note.id}/post`;
            const adjustmentEntries = () => F.raw.journalEntry.count({
                where: { invoiceId: invoice.id, description: { startsWith: entryWord } },
            });
            expect(await adjustmentEntries()).toBe(0);

            const answers = await raceOnRow(F.raw, { table, id: note.id }, [fire(fx.F, url), fire(fx.F, url)]);

            expect(await adjustmentEntries()).toBe(1);
            expect(answers.map((r) => r.status)).toEqual([200, 409]);
            expect((await F.raw[model].findUnique({ where: { id: note.id } })).status).toBe('POSTED');
        });

        test('WHT: two different certificates at once record the first; the second is refused, not written over it', async () => {
            const invoice = await whtEligibleInvoice('wht-race');

            const answers = await raceOnRow(F.raw, { table: 'invoices', id: invoice.id }, [
                fire(fx.F, '/api/finance/wht/certificate', whtBody(invoice.id, 'WHT-A')),
                fire(fx.F, '/api/finance/wht/certificate', whtBody(invoice.id, 'WHT-B')),
            ]);

            const row = await F.raw.invoice.findUnique({ where: { id: invoice.id } });
            expect(row.metadata.whtCertificate.certificateNumber).toBe('WHT-A');
            expect(answers.map((r) => r.status)).toEqual([201, 409]);
        });
    });

    describe('MEDIUM-1: money shows only to the roles it belongs to', () => {
        const monthStart = () => {
            const now = getZonedParts(new Date());
            return localMonthRange(now.year, now.month).start;
        };

        beforeAll(async () => {
            // A credit note this month, so net and gross differ; an application of another
            // organization this month, so an unscoped count shows.
            const { invoice } = await F.paidM1('MONEY');
            await issuedNote('credit-notes', invoice.id);
            const other = await F.raw.application.create({
                data: {
                    applicationNumber: `APP-fi-OTHER-${F.sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                    organizationId: fx.otherOrg, status: 'SUBMITTED', formData: {},
                },
            });
            fx.appIds.push(other.id);
        }, 120000);

        test.each(['DS', 'FI'])('%s reads the analytics without any money', async (who) => {
            F.as(fx[who]);
            const res = await get('/api/reports/analytics?period=90');
            expect(res.status).toBe(200);
            expect(res.body.data).not.toHaveProperty('financial');
            expect(res.body.data.dailyStats.length).toBeGreaterThan(0);
            expect(res.body.data.dailyStats.filter((day) => 'revenue' in day)).toEqual([]);
        });

        test('the DTAM admin reads the whole analytics; finance reads its revenue part only', async () => {
            F.as(fx.AD);
            const admin = await get('/api/reports/analytics?period=90');
            expect(admin.body.data).toEqual(expect.objectContaining({
                financial: expect.objectContaining({ revenue: expect.any(Number) }),
                applications: expect.any(Object),
            }));
            F.as(fx.F);
            const finance = await get('/api/reports/analytics?period=90');
            expect(Object.keys(finance.body.data).sort()).toEqual(['dailyStats', 'financial', 'period']);
        });

        test('the dispatcher reads the scheduler summary without revenue', async () => {
            F.as(fx.DS);
            const res = await get('/api/provider/reports/summary');
            expect(res.status).toBe(200);
            expect(res.body.data).not.toHaveProperty('revenue');
            expect(res.body.data.applications).toEqual(expect.objectContaining({ total: expect.any(Number) }));
        });

        test('the DTAM admin\'s summary is its organization\'s, and its revenue is net of credit notes', async () => {
            const from = monthStart();
            const [paid, credits, ownApplications] = await Promise.all([
                F.raw.invoice.findMany({
                    where: {
                        organizationId: fx.org, isDeleted: false, paidAt: { gte: from },
                        status: { in: ['paid', 'PAID', 'PAID_PENDING_RECEIPT', 'RECEIPT_ISSUED'] },
                    },
                    select: { totalAmount: true },
                }),
                F.raw.creditNote.findMany({
                    where: {
                        organizationId: fx.org, isDeleted: false, status: { in: ['ISSUED', 'POSTED'] },
                        issuedAt: { gte: from }, originalInvoice: { isDeleted: false },
                    },
                    select: { totalAmount: true },
                }),
                F.raw.application.count({ where: { organizationId: fx.org, isDeleted: false, createdAt: { gte: from } } }),
            ]);
            expect(credits.length).toBeGreaterThan(0);

            F.as(fx.AD);
            const res = await get('/api/provider/reports/summary');
            expect(res.status).toBe(200);
            expect(res.body.data.revenue).toEqual({
                gross: sum(paid), credited: sum(credits), net: money(sum(paid) - sum(credits)),
            });
            expect(res.body.data.applications.total).toBe(ownApplications);
        });
    });

    describe('L2: the books record the signed-in actor, never a caller\'s word', () => {
        const manualJournalEntryService = require('../../services/manual-journal-entry-service');

        test('adjustment entries are listed inside the signed-in officer\'s organization only, and never without one', async () => {
            const ours = await manualJournalEntryService.createDraftManualEntry({ ...journalBody, actor: actorOf(fx.F) });

            const own = await manualJournalEntryService.listDrafts({ actor: actorOf(fx.F2) });
            expect(own.map((row) => row.id)).toContain(ours.id);
            expect(own.filter((row) => row.organizationId !== fx.org)).toEqual([]);
            const other = await manualJournalEntryService.listDrafts({ actor: actorOf(fx.FX) });
            expect(other.filter((row) => row.organizationId !== fx.otherOrg)).toEqual([]);
            await expect(manualJournalEntryService.listDrafts({ status: 'DRAFT' }))
                .rejects.toMatchObject({ statusCode: 403 });
        });

        test('adjustment entry: maker, approver and poster are the signed-in officers, whatever ids are passed', async () => {
            const draft = await manualJournalEntryService.createDraftManualEntry({
                ...journalBody, actorId: fx.F2.id, organizationId: fx.otherOrg, actor: actorOf(fx.F),
            });
            expect(draft).toEqual(expect.objectContaining({ createdBy: fx.F.id, organizationId: fx.org }));

            await expect(manualJournalEntryService.approveManualEntry(draft.id, {
                approverId: fx.F2.id, actor: actorOf(fx.F),
            })).rejects.toMatchObject({ code: 'SELF_APPROVAL_FORBIDDEN' });
            expect((await F.raw.manualJournalEntryDraft.findUnique({ where: { id: draft.id } })).status).toBe('DRAFT');

            const approved = await manualJournalEntryService.approveManualEntry(draft.id, {
                approverId: fx.F.id, actor: actorOf(fx.F2),
            });
            expect(approved.approvedBy).toBe(fx.F2.id);
            const { entry } = await manualJournalEntryService.postManualEntry(draft.id, {
                actorId: fx.F.id, actor: actorOf(fx.F2),
            });
            expect(entry.createdBy).toBe(fx.F2.id);
        });
    });

    test('L4: the WHT service refuses the DTAM finance officer by itself and writes nothing', async () => {
        const whtService = require('../../services/wht-service');
        const invoice = await whtEligibleInvoice('wht-role');

        await expect(whtService.recordWhtCertificate({
            ...whtBody(invoice.id, 'WHT-DTAM'), actorId: fx.FD.id, actor: actorOf(fx.FD),
        })).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE', statusCode: 403 });
        expect((await F.raw.invoice.findUnique({ where: { id: invoice.id } })).metadata?.whtCertificate).toBeUndefined();
    });

    test('L6: the holder lists the issued and posted credit notes of its invoice, never a draft or a cancelled one', async () => {
        const { invoice } = await F.paidM1('HOLDER');
        F.as(fx.F);
        const reasonCode = 'PRICE_REDUCTION';
        const draft = await post('/api/finance/credit-notes', { ...adjustment(invoice.id), reasonCode });
        const cancelled = await post('/api/finance/credit-notes', { ...adjustment(invoice.id), reasonCode });
        expect((await post(`/api/finance/credit-notes/${cancelled.body.data.id}/cancel`, { reason: 'ซ้ำ' })).status).toBe(200);
        const issued = await issuedNote('credit-notes', invoice.id);

        F.as(fx.A);
        const holder = await get(`/api/finance/credit-notes?originalInvoiceId=${invoice.id}`);
        expect(holder.status).toBe(200);
        expect(holder.body.data.map((n) => n.id)).toEqual([issued.id]);

        F.as(fx.F);
        const finance = await get(`/api/finance/credit-notes?originalInvoiceId=${invoice.id}`);
        expect(finance.body.data.map((n) => n.id).sort())
            .toEqual([draft.body.data.id, cancelled.body.data.id, issued.id].sort());
    });

    test('L7: the monthly CSV names its amount as received before credit notes', async () => {
        F.as(fx.F);
        const res = await get('/api/invoices/export?type=monthly');
        expect(res.status).toBe(200);
        const header = res.text.replace(/^\uFEFF/, '').split('\r\n')[0].split(',');
        expect(header).toContain(GROSS_LABEL);
        expect(header).not.toContain('ยอดเงิน');
    });
});
