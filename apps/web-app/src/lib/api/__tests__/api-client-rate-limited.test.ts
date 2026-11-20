import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApiClient } from '../api-client';

function rateLimited(retryAfter: string | null): Response {
    return {
        ok: false,
        status: 429,
        headers: {
            get: (name: string) => {
                const key = name.toLowerCase();
                if (key === 'content-type') { return 'text/html'; }
                if (key === 'retry-after') { return retryAfter; }
                return null;
            },
        },
        json: () => Promise.reject(new Error('not json')),
        text: () => Promise.resolve('<html>429 Too Many Requests</html>'),
    } as unknown as Response;
}

const realFetch = globalThis.fetch;

describe('a 429 carries how long the server asked to wait', () => {
    let client: ApiClient;

    beforeEach(() => {
        client = new ApiClient();
    });

    afterEach(() => {
        (globalThis as { fetch: typeof fetch }).fetch = realFetch;
    });

    it('reads Retry-After seconds', async () => {
        (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => rateLimited('7')) as unknown as typeof fetch;
        const res = await client.post('/applications/draft-documents', new FormData());
        expect(res).toMatchObject({ success: false, status: 429, retryAfterMs: 7000 });
    });

    it('leaves the wait to the caller when the server names none', async () => {
        (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => rateLimited(null)) as unknown as typeof fetch;
        const res = await client.post('/applications/draft-documents', new FormData());
        expect(res.status).toBe(429);
        expect(res.retryAfterMs).toBeUndefined();
    });
});
