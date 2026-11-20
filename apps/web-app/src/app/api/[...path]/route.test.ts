/**
 * @jest-environment node
 *
 * C4-08 guard: the generic API proxy must NOT leak the raw upstream
 * error.message to the client and must return a gateway-class status
 * (503 BACKEND_UNREACHABLE) on transport failure — matching the
 * auth/health, auth/provider and change-password sibling proxies.
 */
import { jest } from '@jest/globals';
import { NextRequest } from 'next/server';

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
jest.mock('@/config/server.config', () => ({
  INTERNAL_BACKEND_URL: 'http://backend:8000',
}));

// jest.mock calls are hoisted above this import, so ./route picks up the mocks.
import { GET, POST } from './route';

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/some/path', { method: 'GET' });
}

describe('/api/[...path] generic proxy — transport failure', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('returns 503 BACKEND_UNREACHABLE without leaking the raw error.message', async () => {
    const secret = 'ECONNREFUSED 10.0.0.1:8000 connect to internal host';
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock.mockRejectedValue(new Error(secret));
    global.fetch = fetchMock;

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ path: ['some', 'path'] }),
    });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual(
      expect.objectContaining({ success: false, code: 'BACKEND_UNREACHABLE' }),
    );
    // The raw upstream/transport error must never reach the client body.
    expect(JSON.stringify(payload)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(payload)).not.toContain(secret);
    expect(fetchMock).toHaveBeenCalled();
  });
});

/**
 * R2 (remove workspace mode): the workspace header is retired. The proxy
 * must not carry `x-active-entity-id` to the backend even if an old browser
 * tab still sends it.
 */
describe('/api/[...path] generic proxy — retired active-entity header', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('the proxy does not forward x-active-entity-id', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const request = new NextRequest('http://localhost:3000/api/applications/my', {
      method: 'GET',
      headers: { 'x-active-entity-id': 'ent-juristic-123' },
    });

    await GET(request, { params: Promise.resolve({ path: ['applications', 'my'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-active-entity-id']).toBeUndefined();
  });
});

/**
 * Round 4 of staff 2FA: the backend binds an MFA challenge to the IP and
 * User-Agent of the password step. /api/auth/provider/login reaches it through
 * the auth proxy, which forwards those headers; /api/mfa/verify reaches it
 * through this proxy, which dropped them, so every verify through the web app
 * answered MFA_CHALLENGE_BINDING_MISMATCH (measured 2026-10-20, round 3 screens).
 */
describe('/api/[...path] generic proxy — caller identity headers', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('forwards User-Agent, X-Forwarded-For, X-Real-IP and Forwarded to the backend', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const request = new NextRequest('http://localhost:3000/api/mfa/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/153.0',
        'x-forwarded-for': '203.0.113.9',
        'x-real-ip': '203.0.113.9',
        forwarded: 'for=203.0.113.9;proto=https',
      },
      body: JSON.stringify({ mfa_session: 'x', code: '000000' }),
    });

    await POST(request, { params: Promise.resolve({ path: ['mfa', 'verify'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/153.0');
    expect(headers['X-Forwarded-For']).toBe('203.0.113.9');
    expect(headers['X-Real-IP']).toBe('203.0.113.9');
    expect(headers['Forwarded']).toBe('for=203.0.113.9;proto=https');
  });
});

describe('/api/[...path] generic proxy — session cookie re-issued by the backend', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('relays every Set-Cookie header, as the auth proxy does', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    const upstream = new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    upstream.headers.append('set-cookie', 'provider_token=fresh; Path=/; HttpOnly; SameSite=Lax');
    upstream.headers.append('set-cookie', 'other=1; Path=/');
    fetchMock.mockResolvedValue(upstream);
    global.fetch = fetchMock;

    const request = new NextRequest('http://localhost:3000/api/mfa/verify-setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456', backupCodesSaved: true }),
    });
    const response = await POST(request, { params: Promise.resolve({ path: ['mfa', 'verify-setup'] }) });

    const cookies = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? [response.headers.get('set-cookie') || ''];
    expect(cookies.join('\n')).toContain('provider_token=fresh');
    expect(cookies.join('\n')).toContain('other=1');
  });
});
