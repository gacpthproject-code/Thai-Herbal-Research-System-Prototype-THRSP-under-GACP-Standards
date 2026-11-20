import { describe, expect, it, jest } from '@jest/globals';

import { CAR_UPLOAD_COPY_TH, refuseBeforeUpload, uploadCarFile } from '../car-file-upload';

const pdf = (name = 'ป้าย.pdf', size = 2048) => {
    const bytes = new Uint8Array(size);
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    return new File([bytes], name, { type: 'application/pdf' });
};
const args = (file = pdf()) => ({ applicationId: 'app-1', file, findingNo: 2 });
const staged = { id: 'CAR-1.pdf', findingNo: 2, originalName: 'ป้าย.pdf', size: 2048 };

describe('uploadCarFile', () => {
    it('posts one file with its defect to the staging door', async () => {
        const post = jest.fn(async (_path: string, _body: FormData) => ({ success: true, data: { file: staged } }));
        const result = await uploadCarFile(args(), { post: post as never });
        expect(result).toEqual({ file: staged, error: null });
        expect(post).toHaveBeenCalledTimes(1);
        const [path, body] = post.mock.calls[0]!;
        expect(path).toBe('/applications/app-1/car/files');
        expect(body.get('findingNo')).toBe('2');
        expect((body.get('file') as File).name).toBe('ป้าย.pdf');
        expect(body.getAll('file')).toHaveLength(1);
    });

    it('waits out a 429 and sends the same file again', async () => {
        const post = jest.fn<() => Promise<unknown>>()
            .mockResolvedValueOnce({ success: false, status: 429, retryAfterMs: 1000 })
            .mockResolvedValueOnce({ success: true, data: { file: staged } });
        const wait = jest.fn(async () => undefined);
        const result = await uploadCarFile(args(), { post: post as never, wait });
        expect(result.file).toEqual(staged);
        expect(wait).toHaveBeenCalledWith(1000);
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('says the connection dropped and that only this file needs retrying', async () => {
        const post = jest.fn(async () => ({ success: false, transportFailure: 'NETWORK' }));
        const result = await uploadCarFile(args(), { post: post as never });
        expect(result).toEqual({ file: null, error: CAR_UPLOAD_COPY_TH.network });
        expect(result.error).toMatch(/ลองใหม่.*เฉพาะไฟล์นี้/);
    });

    it('passes the server refusal through and never reports a 200 without an id as success', async () => {
        const refused = jest.fn(async () => ({ success: false, status: 409, error: 'ส่งหลักฐานได้ไม่เกิน 20 ไฟล์ต่อครั้ง' }));
        expect((await uploadCarFile(args(), { post: refused as never })).error).toBe('ส่งหลักฐานได้ไม่เกิน 20 ไฟล์ต่อครั้ง');
        const empty = jest.fn(async () => ({ success: true, data: {} }));
        expect(await uploadCarFile(args(), { post: empty as never })).toEqual({ file: null, error: CAR_UPLOAD_COPY_TH.failed });
    });
});

describe('refuseBeforeUpload', () => {
    it('refuses a file over 10 MB with how to make it smaller', async () => {
        expect(await refuseBeforeUpload(pdf('ใหญ่.pdf', 10 * 1024 * 1024 + 1))).toMatch(/ใหญ่เกิน 10 MB.*บีบอัด/);
    });

    it('refuses a type the door does not take, naming the types it does', async () => {
        expect(await refuseBeforeUpload(new File(['GIF89a'], 'ภาพ.gif', { type: 'image/gif' }))).toMatch(/PDF หรือรูปภาพ JPG และ PNG/);
    });

    it('lets a real PDF through', async () => {
        expect(await refuseBeforeUpload(pdf())).toBeNull();
    });
});
