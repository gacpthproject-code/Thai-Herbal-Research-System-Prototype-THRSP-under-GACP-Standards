const mockLogCalls = [];
jest.mock('../../shared/logger', () => {
    const record = (level) => jest.fn((...args) => mockLogCalls.push({ level, msg: String(args[0]) }));
    return { debug: record('debug'), info: record('info'), warn: record('warn'), error: record('error'), createLogger: jest.fn() };
});

const { createUploader } = require('../../services/storage-service');

const asBusboyLatin1 = (utf8Name) => Buffer.from(utf8Name, 'utf8').toString('latin1');

function filter(file) {
    const uploader = createUploader('test-folder');
    const req = {};
    return new Promise((resolve) => {
        uploader.fileFilter(req, file, (err, accepted) => resolve({ err, accepted, req }));
    });
}

beforeEach(() => { mockLogCalls.length = 0; });

test('an accepted Thai file name is logged as Thai', async () => {
    const { accepted } = await filter({ originalname: asBusboyLatin1('ใบแจ้งหนี้.pdf'), mimetype: 'application/pdf' });

    expect(accepted).toBe(true);
    expect(mockLogCalls).toEqual([{ level: 'info', msg: '[Upload] Accepted: ใบแจ้งหนี้.pdf (application/pdf)' }]);
});

test('a rejected Thai file name is logged and explained as Thai', async () => {
    const { accepted, req } = await filter({ originalname: asBusboyLatin1('สคริปต์.exe'), mimetype: 'application/x-msdownload' });

    expect(accepted).toBe(false);
    expect(mockLogCalls).toHaveLength(1);
    expect(mockLogCalls[0].msg).toContain('(สคริปต์.exe)');
    expect(req.uploadRejectionReason).toContain('(สคริปต์.exe)');
});
