'use strict';

/**
 * Finance integrity, round 2: the money, tax and privacy findings left after
 * fix/finance-integrity (security review 2026-10-09).
 *
 *   2   A milestone paid and fully refunded in the period adds nothing to net revenue.
 *   3   A purchase invoice's supplier tax id is full on every purchase-invoice door for the
 *       company's finance officer, who keeps the books (order 57), and masked (first digit +
 *       last 4) for every other reader (orders 10, 34).
 *   4   The sales tax export nets the month's credit notes: 1,000/70 less 100/7 is 900/63.
 *   5   A period close and a journal post of the same month never interleave: a post that
 *       found the month open cannot write into it after the close commits; writers of one
 *       month do not wait for each other.
 *   7   A reopen claims the close it checked: a period re-closed in between by the would-be
 *       reopener is not reopened by that same person.
 *   8   A refund transfer and a WHT certificate recorded on one invoice at once both survive.
 *   9   A refund transfer completes the refund block of a legacy string-encoded metadata.
 *   10  Adjustment entries and the period close refuse, by themselves, a caller who may not
 *       write the books or who belongs to another organization.
 *   11  Two identical purchase invoices created at once: one is saved, the other is told 409.
 *   12  A role without revenue never reads a field the analytics does not name for it.
 *   14  Counts on the report doors are the caller's organization's (order 17).
 *   15  The monthly CSV carries no retired wallet or revenue-type columns.
 *
 * Review of a46baa286 (security review 2026-10-09, second pass):
 *   HIGH-2  A purchase invoice dated in a closed month is refused, not booked into it (order 29).
 *   Close side of the month lock: a close waits for a journal writer of that month in flight.
 *   4 (controls) The sales tax export deducts no DRAFT, CANCELLED or other-month credit note.
 *   MEDIUM-3  The ภ.พ.30 preview counts a posted debit note once.
 *   MEDIUM-2  The ภ.พ.30 preview deducts a credit note in the month it is issued, as the export does.
 *   HIGH-1  The ภ.พ.30 preview, its CSV and the WHT certificate list print a tax id in full only
 *           to the company finance officer; DTAM roles read it masked (orders 10, 34).
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
const mockCache = { value: null };
jest.mock('../../services/redis-service', () => ({
    get: jest.fn(() => Promise.resolve(mockCache.value)),
    set: jest.fn().mockResolvedValue(true),
}));

const { createFinanceFixture } = require('./fixtures/finance-paid-fixture');
const { raceBehind, raceOnRow, raceOnInsert } = require('./fixtures/row-lock-race');
const { getZonedParts, localMonthRange } = require('../../utils/working-days');

const money = (n) => Math.round(Number(n) * 100) / 100;
const BUYER_TIN = '3100500000012';
const BUYER_TIN_MASKED = '3-XXXX-XXXX-X-0012';

/** The cells of one CSV line, quotes honoured (RFC 4180). */
function csvCells(line) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted && ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') { quoted = !quoted; }
        else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
        else { cell += ch; }
    }
    cells.push(cell);
    return cells;
}

/** The CSV as objects keyed by header. */
function csvRows(text) {
    const [header, ...lines] = text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    const keys = csvCells(header);
    return lines.map((line) => Object.fromEntries(csvCells(line).map((v, i) => [keys[i], v])));
}

/** A printed amount as a number: "1,000" is 1000, "(100)" and "-100" are -100, "-" is 0. */
function amountOf(cell) {
    const text = String(cell || '').replace(/^'/, '').replace(/,/g, '').trim();
    if (!text || text === '-') { return 0; }
    const negative = /^\((.*)\)$/.exec(text);
    return negative ? -Number(negative[1]) : Number(text);
}

d('finance integrity round 2 (real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'fr', mockActor });
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
    const today = () => getZonedParts(new Date()).isoDate;

    const journalBody = (postingDate) => ({
        description: 'ปรับปรุงค่าใช้จ่ายค้างจ่าย', reason: 'ปรับปรุงสิ้นเดือนตามใบแจ้งหนี้ผู้ขาย',
        postingDate,
        lines: [
            { accountCode: '5110', debit: 500, credit: 0 },
            { accountCode: '1110-001', debit: 0, credit: 500 },
        ],
    });
    const adjustment = (invoiceId, subtotal = 100, vat = 7) => ({
        originalInvoiceId: invoiceId, reason: 'ปรับยอดตามที่ตกลงกับผู้ซื้อ', subtotal, vat,
    });
    const whtBody = (invoiceId, certificateNumber) => ({
        invoiceId, certificateNumber, issuedByTaxId: '0105500000001', issuedByName: 'บริษัท ผู้ซื้อ จำกัด',
        certificateDate: '2026-10-01', whtAmount: 150,
    });

    async function issuedCreditNote(invoiceId, subtotal, vat) {
        F.as(fx.F);
        const made = await post('/api/finance/credit-notes', { ...adjustment(invoiceId, subtotal, vat), reasonCode: 'PRICE_REDUCTION' });
        expect(made.status).toBe(201);
        const issued = await post(`/api/finance/credit-notes/${made.body.data.id}/issue`);
        expect(issued.status).toBe(200);
        return issued.body.data;
    }

    /** A paid platform invoice (the WHT service accepts it) with a posted credit note documenting its refund. */
    async function refundedPlatformInvoice(label) {
        const { invoice } = await F.paidM1(label);
        await F.raw.invoice.update({ where: { id: invoice.id }, data: { serviceType: 'PHASE_1_PLATFORM_FEE' } });
        const note = await issuedCreditNote(invoice.id, 100, 7);
        F.as(fx.F);
        expect((await post(`/api/finance/credit-notes/${note.id}/post`)).status).toBe(200);
        const refund = { kind: 'PROVIDER_CANCELLED', status: 'INITIATED', creditNoteId: note.id, amount: 107 };
        return { invoice, note, refund };
    }

    const manualJournalEntryService = require('../../services/manual-journal-entry-service');
    const draftManualEntry = (postingDate) => manualJournalEntryService.createDraftManualEntry({
        ...journalBody(postingDate), actor: actorOf(fx.F),
    });
    async function approvedJournalDraft(postingDate) {
        const draft = await draftManualEntry(postingDate);
        await manualJournalEntryService.approveManualEntry(draft.id, { actor: actorOf(fx.F2) });
        return draft;
    }

    async function mkUser(key, role, organizationId) {
        const id = crypto.randomUUID();
        const canonicalId = `fr-${key}-${F.sfx}`;
        await F.raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role, authType: 'EMAIL_LEGACY',
                email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: key, organizationId,
            },
        });
        fx.userIds.push(id);
        fx[key] = { id, canonicalId, role, organizationId };
    }

    async function mkApplication(label, organizationId, status) {
        const row = await F.raw.application.create({
            data: {
                applicationNumber: `APP-fr-${label}-${F.sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                organizationId, status, formData: {},
            },
        });
        fx.appIds.push(row.id);
        return row;
    }

    beforeAll(async () => {
        await F.setup();
        F.state.app.use('/api/provider/reports', require('../../routes/api/provider/reports'));
        F.state.app.use('/api/finance/tax-reports', require('../../routes/api/finance/tax-reports'));
        await mkUser('DS', 'dispatcher', fx.org);
        await mkUser('PA', 'system_admin_platform', fx.org);
        await mkUser('AX', 'health', fx.otherOrg);
        await mkApplication('CERT-OWN', fx.org, 'CERTIFIED');
        await mkApplication('CERT-OTHER', fx.otherOrg, 'CERTIFIED');
    }, 120000);
    afterAll(() => F.cleanup());

    test('4: the sales tax export nets the month\'s credit notes: 1,000/70 less 100/7 is 900/63', async () => {
        const { invoice } = await F.paidM1('TAXCN');
        await F.raw.invoice.update({ where: { id: invoice.id }, data: { subtotal: 1000, vat: 70, totalAmount: 1070 } });
        const note = await issuedCreditNote(invoice.id, 100, 7);

        F.as(fx.F);
        const res = await get('/api/invoices/export?type=tax');
        expect(res.status).toBe(200);
        const docNo = invoice.receiptNumber || invoice.invoiceNumber;
        const rows = csvRows(res.text).filter((r) => [docNo, note.creditNoteNumber].includes(r['เลขที่ใบกำกับภาษี']));
        const total = (key) => money(rows.reduce((sum, r) => sum + amountOf(r[key]), 0));
        expect({
            documents: rows.length,
            taxable: total('มูลค่าสินค้า/บริการ (ไม่รวม VAT)'),
            vat: total('ภาษีมูลค่าเพิ่ม 7%'),
            amount: total('ยอดรวมทั้งสิ้น'),
        }).toEqual({ documents: 2, taxable: 900, vat: 63, amount: 963 });
    });

    test('15: the monthly CSV has no retired wallet or revenue-type column', async () => {
        F.as(fx.F);
        const res = await get('/api/invoices/export?type=monthly');
        expect(res.status).toBe(200);
        const header = csvCells(res.text.replace(/^\uFEFF/, '').split('\r\n')[0]);
        expect(header.filter((h) => /Wallet|ประเภทรายได้/.test(h))).toEqual([]);
        expect(header).toContain('ยอดรับชำระ (ก่อนหักใบลดหนี้)');
    });

    test('2: a milestone paid and fully refunded in the period adds nothing to net revenue', async () => {
        F.as(fx.AD);
        const before = (await get('/api/provider/reports/summary')).body.data.revenue;
        const { invoice } = await F.paidM1('FULLREFUND');
        F.as(fx.F);
        const cancelled = await post(`/api/finance/refunds/${invoice.id}/provider-cancellation`, {
            reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทปิดบริการรับรองในพื้นที่นี้',
        });
        expect(cancelled.status).toBe(201);

        F.as(fx.AD);
        const after = (await get('/api/provider/reports/summary')).body.data.revenue;
        const paid = money(invoice.totalAmount);
        expect(after).toEqual({
            gross: money(before.gross + paid), credited: money(before.credited + paid), net: before.net,
        });
    });

    describe('5: a period close and a journal post of the same month never interleave', () => {

        test('a credit-note post waits while a close holds the month, then books the reversal', async () => {
            const { lockAccountingPeriodForClose } = require('../../services/finance/books-locks');
            const { invoice } = await F.paidM1('CNLOCK');
            const note = await issuedCreditNote(invoice.id, 100, 7);
            const { year, month } = getZonedParts(new Date());

            const [answer] = await raceBehind(
                F.raw,
                (tx) => lockAccountingPeriodForClose(tx, { organizationId: fx.org, year, month }),
                [fire(fx.F, `/api/finance/credit-notes/${note.id}/post`)],
            );
            expect(answer.status).toBe(200);
        });

        test('journal writers of one month do not wait for each other', async () => {
            const { lockAccountingPeriodForEntry } = require('../../services/finance/books-locks');
            const { invoice } = await F.paidM1('CNSHARED');
            const note = await issuedCreditNote(invoice.id, 100, 7);
            const { year, month } = getZonedParts(new Date());

            const answer = await F.raw.$transaction(async (tx) => {
                await lockAccountingPeriodForEntry(tx, { organizationId: fx.org, year, month });
                F.as(fx.F);
                const posted = post(`/api/finance/credit-notes/${note.id}/post`).then((res) => res.status);
                const waited = new Promise((resolve) => { setTimeout(() => resolve('still waiting after 5 s'), 5000); });
                return Promise.race([posted, waited]);
            }, { timeout: 20000 });
            expect(answer).toBe(200);
        });
    });

    test('8: a WHT certificate and a refund transfer recorded at once on one invoice both survive', async () => {
        const { invoice, note, refund } = await refundedPlatformInvoice('WHT-REFUND');
        await F.raw.invoice.update({ where: { id: invoice.id }, data: { metadata: { refund } } });

        const answers = await raceOnRow(F.raw, { table: 'invoices', id: invoice.id }, [
            fire(fx.F, '/api/finance/wht/certificate', whtBody(invoice.id, 'WHT-R')),
            fire(fx.F, `/api/finance/credit-notes/${note.id}/refund-transfer`, { transferredOn: today(), bankReference: 'KBANK-778899' }),
        ]);

        const { metadata } = await F.raw.invoice.findUnique({ where: { id: invoice.id } });
        expect({
            answers: answers.map((r) => r.status),
            refund: metadata?.refund?.status,
            wht: metadata?.whtCertificate?.certificateNumber,
        }).toEqual({ answers: [201, 200], refund: 'COMPLETED', wht: 'WHT-R' });
    });

    test('9: a refund transfer completes the refund block of a legacy string-encoded metadata', async () => {
        const { invoice, note, refund } = await refundedPlatformInvoice('LEGACY-META');
        await F.raw.invoice.update({ where: { id: invoice.id }, data: { metadata: JSON.stringify({ refund, note: 'legacy' }) } });

        F.as(fx.F);
        const res = await post(`/api/finance/credit-notes/${note.id}/refund-transfer`, { transferredOn: today(), bankReference: 'SCB-445566' });
        expect(res.status).toBe(200);

        const { metadata } = await F.raw.invoice.findUnique({ where: { id: invoice.id } });
        expect({ type: typeof metadata, refund: metadata?.refund?.status, kept: metadata?.note })
            .toEqual({ type: 'object', refund: 'COMPLETED', kept: 'legacy' });
    });

    describe('10: the books services refuse a caller who may not write them, by themselves', () => {

        test.each([
            ['the DTAM finance officer', 'FD', 'FORBIDDEN_ROLE'],
            ['a company finance officer of another organization', 'FX', 'FORBIDDEN_TENANT'],
        ])('adjustment entry: %s cannot approve, post or reject it', async (_who, key, code) => {
            const draft = await draftManualEntry('2026-09-30');
            const approved = await approvedJournalDraft('2026-09-30');
            const reason = 'ยอดไม่ตรงกับใบแจ้งหนี้ผู้ขาย';

            await expect(manualJournalEntryService.approveManualEntry(draft.id, { actor: actorOf(fx[key]) }))
                .rejects.toMatchObject({ code, statusCode: 403 });
            await expect(manualJournalEntryService.rejectManualEntry(draft.id, { reason, actor: actorOf(fx[key]) }))
                .rejects.toMatchObject({ code, statusCode: 403 });
            await expect(manualJournalEntryService.postManualEntry(approved.id, { actor: actorOf(fx[key]) }))
                .rejects.toMatchObject({ code, statusCode: 403 });
            const statuses = await F.raw.manualJournalEntryDraft.findMany({
                where: { id: { in: [draft.id, approved.id] } }, select: { id: true, status: true },
            });
            expect(Object.fromEntries(statuses.map((r) => [r.id, r.status])))
                .toEqual({ [draft.id]: 'DRAFT', [approved.id]: 'APPROVED' });
        });

    });

    test('12: a role without revenue reads only the analytics fields named for it, whatever the cache holds', async () => {
        F.as(fx.AD);
        const whole = (await get('/api/reports/analytics?period=30')).body.data;
        mockCache.value = {
            ...whole,
            revenueByPayer: [{ payer: 'บริษัท ก', amount: 35310 }],
            dailyStats: whole.dailyStats.map((day) => ({ ...day, refunds: 107 })),
        };
        try {
            F.as(fx.DS);
            const res = await get('/api/reports/analytics?period=30');
            expect(res.status).toBe(200);
            expect({
                keys: Object.keys(res.body.data).sort(),
                dayKeys: [...new Set(res.body.data.dailyStats.flatMap((day) => Object.keys(day)))].sort(),
            }).toEqual({
                keys: ['applications', 'dailyStats', 'performance', 'period', 'plantTypeDistribution', 'topProvinces', 'users'],
                dayKeys: ['applications', 'approved', 'date'],
            });
        } finally {
            mockCache.value = null;
        }
    });

    describe('14: the report doors count the caller\'s organization only (order 17)', () => {
        /** The doors scope by themselves: the tenant read extension's kill-switch is thrown. */
        async function withoutTenantReadScope(work) {
            const saved = process.env.TENANT_READ_ORG_SCOPE;
            process.env.TENANT_READ_ORG_SCOPE = 'false';
            try {
                return await work();
            } finally {
                if (saved === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = saved; }
            }
        }

        test('KPI: the dispatcher\'s certificates and reviews are its organization\'s', async () => {
            const { year, month } = getZonedParts(new Date());
            const monthStart = localMonthRange(year, month).start;
            const own = (status) => F.raw.application.count({
                where: { organizationId: fx.org, isDeleted: false, updatedAt: { gte: monthStart }, status },
            });
            F.as(fx.DS);
            const res = await withoutTenantReadScope(() => get('/api/provider/reports/kpi'));
            expect(res.status).toBe(200);
            expect({
                certificatesIssued: res.body.data.overall.certificatesIssued,
                reviewedThisMonth: res.body.data.reviewer.reviewedThisMonth,
            }).toEqual({
                certificatesIssued: await own('CERTIFIED'),
                reviewedThisMonth: await own({ in: ['DOC_APPROVED', 'APPROVED', 'CERTIFIED'] }),
            });
        });

        test('analytics: the applicants counted are the organization\'s', async () => {
            const applicants = (where = {}) => F.raw.user.count({
                where: { organizationId: fx.org, isDeleted: false, role: 'health', ...where },
            });
            F.as(fx.AD);
            const res = await withoutTenantReadScope(() => get('/api/reports/analytics?period=30'));
            expect(res.status).toBe(200);
            const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            expect({
                totalApplicants: res.body.data.users.totalApplicants,
                newApplicants: res.body.data.users.newApplicants,
            }).toEqual({
                totalApplicants: await applicants(),
                newApplicants: await applicants({ createdAt: { gte: windowStart } }),
            });
        });

        test.each([
            '/api/reports/dashboard', '/api/reports/farms', '/api/reports/applications', '/api/provider/reports/kpi',
        ])('%s refuses a caller with no organization', async (door) => {
            // An id with no user row: the tenant middleware cannot fill the organization in.
            F.as({ ...fx.DS, id: crypto.randomUUID() }, { organizationId: null });
            const res = await get(door);
            expect([res.status, res.body.code]).toEqual([400, 'NO_ORGANIZATION']);
        });

        test.each([
            ['with', {}], ['without', { organizationId: null }],
        ])('the platform admin %s an organization is not refused (order 17) and reads no money (order 47)', async (_w, overrides) => {
            F.as(fx.PA, overrides);
            const answers = await Promise.all(['dashboard', 'farms', 'applications', 'analytics'].map((door) => get(`/api/reports/${door}`)));
            expect(answers.map((res) => res.status)).toEqual([200, 200, 200, 200]);
            expect(answers[3].body.data).not.toHaveProperty('financial');
        });
    });

    describe('review of a46baa286', () => {

        test('4, negative controls: the sales tax export deducts a month\'s issued or posted credit notes only', async () => {
            const { invoice } = await F.paidM1('CNCONTROLS');
            const docNo = invoice.receiptNumber || invoice.invoiceNumber;
            F.as(fx.F);
            const draft = await post('/api/finance/credit-notes', { ...adjustment(invoice.id, 10, 0.7), reasonCode: 'PRICE_REDUCTION' });
            expect(draft.status).toBe(201);
            const cancelled = await issuedCreditNote(invoice.id, 20, 1.4);
            F.as(fx.F);
            expect((await post(`/api/finance/credit-notes/${cancelled.id}/cancel`, { reason: 'ออกผิดใบ ยกเลิกก่อนลงบัญชี' })).status).toBe(200);
            const now = getZonedParts(new Date());
            const thisMonth = localMonthRange(now.year, now.month);
            const before = getZonedParts(new Date(thisMonth.start.getTime() - 1));
            const issuedLastMonth = await issuedCreditNote(invoice.id, 30, 2.1);
            await F.raw.creditNote.update({ where: { id: issuedLastMonth.id }, data: { issuedAt: new Date(thisMonth.start.getTime() - 3600000) } });
            const counted = await issuedCreditNote(invoice.id, 100, 7);

            const deductionsOf = async ({ year, month }) => {
                F.as(fx.F);
                const res = await get(`/api/invoices/export?type=tax&year=${year}&month=${month}`);
                expect(res.status).toBe(200);
                return csvRows(res.text).filter((r) => String(r['หมายเหตุ']).endsWith(` ${docNo}`)).map((r) => r['เลขที่ใบกำกับภาษี']);
            };
            expect({ thisMonth: await deductionsOf(now), lastMonth: await deductionsOf(before) })
                .toEqual({ thisMonth: [counted.creditNoteNumber], lastMonth: [issuedLastMonth.creditNoteNumber] });
        });

        describe('the ภ.พ.30 preview counts each tax document once', () => {
            /** This month's net output VAT on the preview door, as the company finance officer reads it. */
            const previewVat = async () => {
                F.as(fx.F);
                const res = await get('/api/finance/tax-reports/output-vat');
                expect(res.status).toBe(200);
                return res.body.data.totals.vatAmount;
            };

            test('MEDIUM-3: posting a 100 / 7 debit note raises the month\'s output VAT by 7, once', async () => {
                const { invoice } = await F.paidM1('DNONCE');
                const before = await previewVat();
                F.as(fx.F);
                const made = await post('/api/finance/debit-notes', {
                    originalInvoiceId: invoice.id, reasonCode: 'CORRECTION', reason: 'เรียกเก็บส่วนที่คิดขาดตามข้อตกลง', subtotal: 100, vat: 7,
                });
                expect(made.status).toBe(201);
                expect((await post(`/api/finance/debit-notes/${made.body.data.id}/issue`)).status).toBe(200);
                expect((await post(`/api/finance/debit-notes/${made.body.data.id}/post`)).status).toBe(200);
                expect(money((await previewVat()) - before)).toBe(7);
            });

            test('MEDIUM-2: an issued credit note lowers this month\'s preview as it lowers the export, before it is posted; a draft or cancelled one lowers neither', async () => {
                const { invoice } = await F.paidM1('CNMONTH');
                const exportVat = async () => {
                    F.as(fx.F);
                    const res = await get('/api/invoices/export?type=tax');
                    expect(res.status).toBe(200);
                    return money(csvRows(res.text).reduce((sum, r) => sum + amountOf(r['ภาษีมูลค่าเพิ่ม 7%']), 0));
                };
                const before = { preview: await previewVat(), export: await exportVat() };
                F.as(fx.F);
                expect((await post('/api/finance/credit-notes', { ...adjustment(invoice.id, 10, 0.7), reasonCode: 'PRICE_REDUCTION' })).status).toBe(201);
                const cancelled = await issuedCreditNote(invoice.id, 20, 1.4);
                F.as(fx.F);
                expect((await post(`/api/finance/credit-notes/${cancelled.id}/cancel`, { reason: 'ออกผิดใบ ยกเลิกก่อนลงบัญชี' })).status).toBe(200);
                await issuedCreditNote(invoice.id, 100, 7);

                const after = { preview: await previewVat(), export: await exportVat() };
                expect({ preview: money(after.preview - before.preview), export: money(after.export - before.export) })
                    .toEqual({ preview: -7, export: -7 });
            });
        });

        describe('HIGH-1: a tax id leaves the tax-report doors in full only to the company finance officer', () => {
            // The fixture's buyer company and the payer named on its WHT certificates (whtBody).
            const COMPANY_TIN = '0105500000001';
            const COMPANY_TIN_MASKED = '0-XXXX-XXXX-X-0001';
            const byRole = async (read) => ({ F: await read(fx.F), FD: await read(fx.FD), AD: await read(fx.AD) });

            test('the ภ.พ.30 preview and its RD e-Filing CSV', async () => {
                const { invoice } = await F.paidM1('VATTIN');
                const buyerIds = async (who) => {
                    F.as(who);
                    const json = await get('/api/finance/tax-reports/output-vat');
                    const csv = await get('/api/finance/tax-reports/output-vat?format=csv');
                    expect([json.status, csv.status]).toEqual([200, 200]);
                    return {
                        json: json.body.data.rows.find((r) => r.invoiceNumber === invoice.invoiceNumber).buyerTaxId,
                        csv: csvRows(csv.text).find((r) => r['เลขที่ใบกำกับภาษี'] === invoice.invoiceNumber)['เลขประจำตัวผู้เสียภาษีผู้ซื้อ'],
                    };
                };
                expect(await byRole(buyerIds)).toEqual({
                    F: { json: COMPANY_TIN, csv: COMPANY_TIN },
                    FD: { json: COMPANY_TIN_MASKED, csv: COMPANY_TIN_MASKED },
                    AD: { json: COMPANY_TIN_MASKED, csv: COMPANY_TIN_MASKED },
                });
            });

            test('the WHT certificate list', async () => {
                const { invoice } = await F.paidM1('WHTTIN');
                await F.raw.invoice.update({ where: { id: invoice.id }, data: { serviceType: 'PHASE_1_PLATFORM_FEE' } });
                F.as(fx.F);
                expect((await post('/api/finance/wht/certificate', whtBody(invoice.id, `WHT-${F.sfx}-TIN`))).status).toBe(201);
                const issuerId = async (who) => {
                    F.as(who);
                    const res = await get('/api/finance/wht/certificates');
                    expect(res.status).toBe(200);
                    return res.body.data.certificates.find((c) => c.invoiceId === invoice.id).issuedByTaxId;
                };
                expect(await byRole(issuerId)).toEqual({ F: COMPANY_TIN, FD: COMPANY_TIN_MASKED, AD: COMPANY_TIN_MASKED });
            });
        });
    });
});
