'use strict';

const path = require('path');

const logLines = [];
const logger = {
    debug: (...args) => logLines.push(args), info: (...args) => logLines.push(args),
    warn: (...args) => logLines.push(args), error: (...args) => logLines.push(args),
};

function loadService() {
    jest.resetModules();
    jest.doMock('../../shared/logger', () => ({ ...logger, createLogger: () => logger }));
    jest.doMock('../../services/prisma-database', () => ({
        prisma: { user: { findUnique: jest.fn(async () => ({ id: 'user-1', email: 'a@example.com', notificationSettings: null, organizationId: 'org-1' })) } },
    }));
    jest.doMock('../../services/notification-service', () => ({
        createNotification: jest.fn(async ({ userId, type }) => ({ id: 'notif-1', userId, type })),
    }));
    jest.doMock('../../services/redis-service', () => ({ isAvailable: () => false }));
    return require(path.resolve(__dirname, '../../services/notification-fanout-service.js'));
}

const HEX64 = /[0-9a-f]{64}/;

test('a deduped send logs the key by prefix only; no log line carries the 64-hex key', async () => {
    const svc = loadService();
    await svc._internals._clearDedupeForTests();
    logLines.length = 0;

    const args = { userId: 'user-1', type: 'REFUND_DUPLICATE_CHARGE', payload: { invoiceId: 'inv-1', amount: 535 }, channels: ['IN_APP'] };
    const first = await svc.send(args);
    const second = await svc.send(args);
    expect(first.dedupeKey).toMatch(/^[0-9a-f]{64}$/);
    expect(second.deduped).toBe(true);

    const dedupeLines = logLines.filter((line) => String(line[0]).includes('[fanout] DEDUPE'));
    expect(dedupeLines.length).toBeGreaterThan(0);
    for (const line of logLines) {
        expect(JSON.stringify(line)).not.toMatch(HEX64);
    }
    expect(JSON.stringify(dedupeLines[0])).toContain(first.dedupeKey.slice(0, 8));
});
