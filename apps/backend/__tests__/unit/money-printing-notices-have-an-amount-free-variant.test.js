'use strict';

/**
 * Operator order 41 (2026-10-07): a party of an application without VIEW_FINANCIAL never reads an
 * amount or a finance document number in a notice. Both notice registries (the bell templates of
 * notification-service and the fanout templates) are rendered with marker values for every money
 * and document field; a template that prints any of them must have an amount-free variant in
 * notification/application-parties WITHOUT_MONEY, and that variant, fed only the fields it keeps,
 * must print none of them. No staff-only template prints money today, so there is no exemption list.
 */

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const { NotifyTemplates } = require('../../services/notification-service');
const { _internals: { TEMPLATES } } = require('../../services/notification-fanout-service');
const { WITHOUT_MONEY } = require('../../services/notification/application-parties');

const MARKERS = Object.freeze({
    amount: 987654.32,
    totalAmount: 987654.32,
    subtotal: 987654.32,
    vat: 987654.32,
    acceptedPhaseTotal: 987654.32,
    livePhaseTotal: 987654.32,
    invoiceNumber: 'INV-MARKER-41',
    creditNoteNumber: 'CN-MARKER-41',
    receiptNumber: 'RC-MARKER-41',
    quotationNumber: 'QT-MARKER-41',
});
const NEEDLES = ['987654', '987,654', 'INV-MARKER-41', 'CN-MARKER-41', 'RC-MARKER-41', 'QT-MARKER-41'];
const PAYLOAD = Object.freeze({
    ...MARKERS, applicationNumber: 'APP-41', milestone: 'M1', reminderType: 'PRE_DUE',
    dueDate: '2026-10-09T00:00:00.000Z', scheduledDate: '9 ต.ค. 2569', scheduledTime: '09:00',
});

const printed = (rendered) => NEEDLES.filter((n) => JSON.stringify(rendered).includes(n));
const registries = [
    ...Object.entries(NotifyTemplates).map(([type, render]) => ['bell', type, render]),
    ...Object.entries(TEMPLATES).map(([type, render]) => ['fanout', type, render]),
];
const moneyPrinting = registries.filter(([, , render]) => printed(render({ ...PAYLOAD })).length > 0);

test('the registries are read (a broken import would pass every check below vacuously)', () => {
    expect(registries.length).toBeGreaterThan(20);
    expect(moneyPrinting.map(([, type]) => type)).toEqual(expect.arrayContaining(['REFUND_PROVIDER_CANCELLED', 'REFUND_DUPLICATE_CHARGE']));
});

test.each(moneyPrinting)('%s template %s prints money, so it has an amount-free variant', (_registry, type) => {
    expect(Object.keys(WITHOUT_MONEY)).toContain(type);
});

test.each(Object.entries(WITHOUT_MONEY))('the variant of %s prints no amount or document number', (_type, { type: variant, keep }) => {
    const render = TEMPLATES[variant];
    expect(render).toEqual(expect.any(Function));
    const kept = Object.fromEntries(keep.filter((k) => k in PAYLOAD).map((k) => [k, PAYLOAD[k]]));
    expect(printed(render(kept))).toEqual([]);
    expect(keep.filter((k) => k in MARKERS)).toEqual([]);
});
