/**
 * Pin from the independent re-review of b99e0b4eb (item 5): avatar deletion stays inside the uploads
 * root, converges on retry, and the path mapper refuses every shape that is not one file at the
 * root. Runs on the real file system under the uploads folder.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { avatarFilePath, deleteAvatarFile } = require('../../services/account-avatar');
const { BASE_UPLOAD_DIR } = require('../../services/uploads-root');

const root = path.resolve(BASE_UPLOAD_DIR);

describe('avatar deletion is confined, idempotent and traversal-proof', () => {
    beforeAll(() => fs.mkdirSync(root, { recursive: true }));

    test('mapper refuses dot segments, encoded and backslash names, and nested paths', () => {
        for (const bad of ['/uploads/.', '/uploads/..', '/uploads/./x.png', '/uploads/a\\..\\b', '/uploads/x/../y.png',
            '/uploads/%2e%2e/x', '/uploads//x.png', '/uploads/x.png/', '//uploads/x.png', '/UPLOADS/x.png', '/uploads/x.png?x=1',
            ' /uploads/x.png', '/uploads/ ', 123, undefined, ['/uploads/x.png']]) {
            const got = avatarFilePath(bad);
            // either refused outright, or still one entry directly under the root
            if (got !== null) {
                expect(path.dirname(got)).toBe(root);
                expect(path.basename(got)).not.toMatch(/^\.\.?$/);
            }
        }
        expect(avatarFilePath('/uploads/..')).toBeNull();
        expect(avatarFilePath('/uploads/.')).toBeNull();
        expect(avatarFilePath('/uploads/x/../y.png')).toBeNull();
    });

    test('deletes once, then converges: second call reports false and throws nothing', async () => {
        const name = `rv-avatar-${process.pid}-${Date.now()}.png`;
        const file = path.join(root, name);
        fs.writeFileSync(file, 'x');
        expect(await deleteAvatarFile(`/uploads/${name}`)).toBe(true);
        expect(fs.existsSync(file)).toBe(false);
        expect(await deleteAvatarFile(`/uploads/${name}`)).toBe(false);
    });

    test('a symlink at the root pointing outside: only the link goes, the target stays', async () => {
        const target = path.join(os.tmpdir(), `rv-avatar-target-${process.pid}`);
        fs.writeFileSync(target, 'outside');
        const name = `rv-link-${process.pid}`;
        const link = path.join(root, name);
        fs.symlinkSync(target, link);
        expect(await deleteAvatarFile(`/uploads/${name}`)).toBe(true);
        expect(fs.existsSync(link)).toBe(false);
        expect(fs.readFileSync(target, 'utf8')).toBe('outside');
        fs.rmSync(target, { force: true });
    });

    test('a directory name at the root is not deleted (unlink refuses), the error surfaces', async () => {
        const name = `rv-dir-${process.pid}`;
        fs.mkdirSync(path.join(root, name), { recursive: true });
        await expect(deleteAvatarFile(`/uploads/${name}`)).rejects.toMatchObject({ code: expect.stringMatching(/EISDIR|EPERM/) });
        fs.rmdirSync(path.join(root, name));
    });
});
