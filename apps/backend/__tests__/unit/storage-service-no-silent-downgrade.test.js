/**
 * BE-#8 — storage must NOT silently downgrade to pod-local disk in production.
 *
 * When STORAGE_PROVIDER=minio and NODE_ENV=production, a missing-credentials
 * condition or a runtime upload failure must THROW (so cert/invoice issuance
 * surfaces the error) instead of quietly writing to a single replica's
 * ephemeral disk. Dev/test keep the convenient local fallback, and an explicit
 * STORAGE_ALLOW_LOCAL_FALLBACK=true escape hatch restores the old behaviour.
 *
 * The provider/cloud-enabled flags are read at module load, so each case loads
 * the module in isolation with the env it needs.
 */

let mockPutObject;
jest.mock('minio', () => ({
    Client: jest.fn().mockImplementation(() => ({
        putObject: (...args) => mockPutObject(...args),
    })),
}));
jest.mock('../../shared/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
// Keep the local-fallback cases from writing real files into public/uploads —
// stub the disk-write surface (the assertions only care about the returned
// `storage` field / thrown error, never the file's existence).
jest.mock('fs', () => {
    const real = jest.requireActual('fs');
    return {
        ...real,
        existsSync: () => true,
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        rmSync: jest.fn(),
    };
});

const ENV_KEYS = [
    'STORAGE_PROVIDER', 'NODE_ENV', 'STORAGE_ALLOW_LOCAL_FALLBACK',
    'S3_ACCESS_KEY', 'S3_SECRET_KEY',
];

function loadStorageWith(env) {
    const saved = {};
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; }
    for (const k of ENV_KEYS) { delete process.env[k]; }
    Object.assign(process.env, env);
    let mod;
    jest.isolateModules(() => { mod = require('../../services/storage-service'); });
    const restore = () => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) { delete process.env[k]; }
            else { process.env[k] = saved[k]; }
        }
    };
    return { mod, restore };
}

beforeEach(() => { mockPutObject = jest.fn(async () => ({ etag: 'ok' })); });

describe('BE-#8 storage-service — no silent downgrade in production', () => {
    it('THROWS STORAGE_CLOUD_UNAVAILABLE when prod+minio but credentials missing', async () => {
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'minio', NODE_ENV: 'production',
            // no S3 creds
        });
        try {
            await expect(mod.uploadBuffer('gacp-pdfs', 'a/b.pdf', Buffer.from('x')))
                .rejects.toMatchObject({ code: 'STORAGE_CLOUD_UNAVAILABLE' });
        } finally { restore(); }
    });

    it('THROWS STORAGE_UPLOAD_FAILED when prod+minio upload errors (no local fallback)', async () => {
        mockPutObject = jest.fn(async () => { throw new Error('connection refused'); });
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'minio', NODE_ENV: 'production',
            S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's',
        });
        try {
            await expect(mod.uploadBuffer('gacp-pdfs', 'a/b.pdf', Buffer.from('x')))
                .rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' });
        } finally { restore(); }
    });

    it('KEEPS local fallback in test/dev (provider=minio, no creds) — returns storage:local', async () => {
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'minio', NODE_ENV: 'test',
        });
        try {
            const res = await mod.uploadBuffer('gacp-pdfs', 'a/b.pdf', Buffer.from('x'));
            expect(res.storage).toBe('local');
        } finally { restore(); }
    });

    it('honours STORAGE_ALLOW_LOCAL_FALLBACK=true in production (opt-out escape hatch)', async () => {
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'minio', NODE_ENV: 'production',
            STORAGE_ALLOW_LOCAL_FALLBACK: 'true',
        });
        try {
            const res = await mod.uploadBuffer('gacp-pdfs', 'a/b.pdf', Buffer.from('x'));
            expect(res.storage).toBe('local');
        } finally { restore(); }
    });

    it('local provider (no cloud) is unaffected — returns storage:local', async () => {
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'local', NODE_ENV: 'production',
        });
        try {
            const res = await mod.uploadBuffer('gacp-pdfs', 'a/b.pdf', Buffer.from('x'));
            expect(res.storage).toBe('local');
        } finally { restore(); }
    });
});

// putUploadsObject records bytes at the key the signed-url mint and the /uploads mount read
// back (inspection photos, 2026-10-13). The defect it guards: an object written under another
// bucket or a flattened name, so the url on the Attachment row names nothing that serves.
describe('storage-service — putUploadsObject keeps the /uploads key in both backends', () => {
    const path = require('path');

    it('MinIO: puts the object in the uploads bucket under the SAME key the mint will presign', async () => {
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'minio', NODE_ENV: 'production',
            S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's',
        });
        try {
            const bytes = Buffer.from('jpeg bytes');
            const res = await mod.putUploadsObject('audits/audit-1/1-abc.jpg', bytes, 'image/jpeg');
            expect(mockPutObject).toHaveBeenCalledWith(
                mod.BUCKETS.uploads, 'audits/audit-1/1-abc.jpg', bytes, bytes.length, { 'Content-Type': 'image/jpeg' },
            );
            expect(res).toEqual({ key: 'audits/audit-1/1-abc.jpg', url: '/uploads/audits/audit-1/1-abc.jpg', storage: 'minio' });
        } finally { restore(); }
    });

    it('local: writes <BASE_UPLOAD_DIR>/<key> unflattened, the path express.static serves as /uploads/<key>', async () => {
        const fs = require('fs');
        fs.writeFileSync.mockClear();
        const { mod, restore } = loadStorageWith({ STORAGE_PROVIDER: 'local', NODE_ENV: 'production' });
        try {
            const bytes = Buffer.from('jpeg bytes');
            const res = await mod.putUploadsObject('audits/audit-1/1-abc.jpg', bytes, 'image/jpeg');
            expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(mod.BASE_UPLOAD_DIR, 'audits', 'audit-1', '1-abc.jpg'), bytes);
            expect(res).toEqual({ key: 'audits/audit-1/1-abc.jpg', url: '/uploads/audits/audit-1/1-abc.jpg', storage: 'local' });
        } finally { restore(); }
    });

    it.each([
        '../etc/passwd', 'audits/../../x.jpg', 'bare.jpg', '',
        'audits/../slips/x.jpg', 'audits/x/../../gacp-certificates/x.pdf',
        'audits//x.jpg', 'audits/./x.jpg', 'audits/x/', 'slips/x.jpg',
    ])('refuses a key that is not audits/<segment>/... with every segment non-empty and not a dot: %j', async (key) => {
        const fs = require('fs');
        fs.writeFileSync.mockClear();
        const { mod, restore } = loadStorageWith({ STORAGE_PROVIDER: 'local', NODE_ENV: 'production' });
        try {
            await expect(mod.putUploadsObject(key, Buffer.from('x'), 'image/jpeg')).rejects.toMatchObject({ code: 'STORAGE_BAD_KEY' });
            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockPutObject).not.toHaveBeenCalled();
        } finally { restore(); }
    });

    it('MinIO put fails outside production: THROWS STORAGE_UPLOAD_FAILED and writes nothing locally', async () => {
        const fs = require('fs');
        fs.writeFileSync.mockClear();
        mockPutObject = jest.fn(async () => { throw new Error('The specified bucket does not exist'); });
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'minio', NODE_ENV: 'test',
            S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's',
        });
        try {
            await expect(mod.putUploadsObject('audits/audit-1/1-abc.jpg', Buffer.from('x'), 'image/jpeg'))
                .rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' });
            expect(fs.writeFileSync).not.toHaveBeenCalled();
        } finally { restore(); }
    });

    it('MinIO put fails with STORAGE_ALLOW_LOCAL_FALLBACK=true: still THROWS (the escape hatch covers missing cloud, not a put that lost the bytes)', async () => {
        const fs = require('fs');
        fs.writeFileSync.mockClear();
        mockPutObject = jest.fn(async () => { throw new Error('connection refused'); });
        const { mod, restore } = loadStorageWith({
            STORAGE_PROVIDER: 'minio', NODE_ENV: 'production', STORAGE_ALLOW_LOCAL_FALLBACK: 'true',
            S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's',
        });
        try {
            await expect(mod.putUploadsObject('audits/audit-1/1-abc.jpg', Buffer.from('x'), 'image/jpeg'))
                .rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' });
            expect(fs.writeFileSync).not.toHaveBeenCalled();
        } finally { restore(); }
    });

    it('local write fails: THROWS STORAGE_UPLOAD_FAILED carrying the fs error as cause', async () => {
        const fs = require('fs');
        fs.writeFileSync.mockImplementationOnce(() => {
            throw Object.assign(new Error("EACCES: permission denied, open '/srv/uploads/audits/audit-1/1-abc.jpg'"), { code: 'EACCES' });
        });
        const { mod, restore } = loadStorageWith({ STORAGE_PROVIDER: 'local', NODE_ENV: 'production' });
        try {
            await expect(mod.putUploadsObject('audits/audit-1/1-abc.jpg', Buffer.from('x'), 'image/jpeg'))
                .rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED', statusCode: 500, cause: { code: 'EACCES' } });
        } finally { restore(); }
    });

    it('shares the no-silent-downgrade policy: prod+minio without credentials THROWS', async () => {
        const { mod, restore } = loadStorageWith({ STORAGE_PROVIDER: 'minio', NODE_ENV: 'production' });
        try {
            await expect(mod.putUploadsObject('audits/audit-1/1-abc.jpg', Buffer.from('x'), 'image/jpeg'))
                .rejects.toMatchObject({ code: 'STORAGE_CLOUD_UNAVAILABLE' });
        } finally { restore(); }
    });

    it('deleteUploadsObject removes the local file at <BASE_UPLOAD_DIR>/<key> and tolerates a missing one', async () => {
        const fs = require('fs');
        fs.rmSync.mockClear();
        const { mod, restore } = loadStorageWith({ STORAGE_PROVIDER: 'local', NODE_ENV: 'production' });
        try {
            await mod.deleteUploadsObject('audits/audit-1/1-abc.jpg');
            expect(fs.rmSync).toHaveBeenCalledWith(path.join(mod.BASE_UPLOAD_DIR, 'audits', 'audit-1', '1-abc.jpg'), { force: true });
        } finally { restore(); }
    });

    it.each([
        '../etc/passwd', 'bare.jpg', '',
        'audits/../slips/x.jpg', 'audits/x/../../gacp-certificates/x.pdf', 'audits//x.jpg', 'slips/x.jpg',
    ])('deleteUploadsObject refuses the same keys: %j', async (key) => {
        const fs = require('fs');
        fs.rmSync.mockClear();
        const { mod, restore } = loadStorageWith({ STORAGE_PROVIDER: 'local', NODE_ENV: 'production' });
        try {
            await expect(mod.deleteUploadsObject(key)).rejects.toMatchObject({ code: 'STORAGE_BAD_KEY' });
            expect(fs.rmSync).not.toHaveBeenCalled();
        } finally { restore(); }
    });
});
