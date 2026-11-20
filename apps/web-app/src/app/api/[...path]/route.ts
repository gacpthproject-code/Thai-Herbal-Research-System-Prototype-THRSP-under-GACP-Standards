import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { INTERNAL_BACKEND_URL } from '@/config/server.config';
import { getSetCookieHeaders } from '../auth/_lib/proxy-forward';

const BACKEND_URL = INTERNAL_BACKEND_URL;
const API_PROXY_DEBUG = process.env.API_PROXY_DEBUG === 'true';

/**
 * Generic API Proxy for all /api/* endpoints (excluding /api/v2, /api/auth-*, /api/health, /api/proxy)
 * Forwards requests to backend with auth_token from httpOnly cookie
 */
async function proxyRequest(request: NextRequest, path: string, method: string) {
    try {
        const cookieStore = await cookies();
        const authToken = cookieStore.get('auth_token')?.value;
        const providerToken = cookieStore.get('provider_token')?.value;
        const incomingAuthorization = request.headers.get('authorization');

        // Start with empty headers
        const headers: Record<string, string> = {};

        // 1. Copy Content-Type (Essential for multipart/form-data boundaries)
        const contentType = request.headers.get('content-type');
        if (contentType) {
            headers['Content-Type'] = contentType;
        }

        // 2. Add Authorization header
        // Priority:
        //   1) Explicit Authorization header from caller (mobile/web localStorage token)
        //   2) Health auth cookie
        //   3) Provider auth cookie
        if (incomingAuthorization) {
            headers['Authorization'] = incomingAuthorization;
        } else if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        } else if (providerToken) {
            headers['Authorization'] = `Bearer ${providerToken}`;
        }

        // 3. Forward test headers if needed
        const testUserId = request.headers.get('X-User-ID');
        if (testUserId && !authToken) {
            headers['X-User-ID'] = testUserId;
        }

        // 4. Carry the caller's identity headers, as the auth/provider proxy does
        // (auth/_lib/proxy-forward.ts): the backend binds an MFA challenge to the
        // IP and User-Agent that passed the password step, and /api/mfa/verify goes
        // through this proxy. Without these the challenge is refused as hijacked.
        for (const [incoming, outgoing] of [
            ['user-agent', 'User-Agent'],
            ['x-forwarded-for', 'X-Forwarded-For'],
            ['x-real-ip', 'X-Real-IP'],
            ['forwarded', 'Forwarded'],
        ] as const) {
            const value = request.headers.get(incoming);
            if (value) {
                headers[outgoing] = value;
            }
        }

        const queryString = request.nextUrl.searchParams.toString();
        const backendUrl = `${BACKEND_URL}/api/${path}${queryString ? `?${queryString}` : ''}`;

        if (API_PROXY_DEBUG) {
            console.warn(`[API Proxy] ${method} ${backendUrl}`);
        }

        // 4. Forward Body as Stream (don't parse JSON)
        // For GET/HEAD, body must be undefined/null
        const body = (method === 'GET' || method === 'HEAD') ? undefined : request.body;

        const response = await fetch(backendUrl, {
            method,
            headers,
            body,
            // @ts-expect-error - Required for Node.js fetch with ReadableStream body
            duplex: 'half'
        });

        // 5. Return Response
        // Use blob() to handle both JSON and Binary responses correctly
        const responseBody = await response.blob();

        const contentDisposition = response.headers.get('Content-Disposition');
        const proxied = new NextResponse(responseBody, {
            status: response.status,
            statusText: response.statusText,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/json',
                ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
            }
        });
        // The backend re-issues the session cookie on some calls (/api/mfa/verify-setup after a
        // move, /api/mfa/verify at sign-in). The backend reads the cookie before the Bearer header,
        // so a cookie this proxy failed to relay would keep a revoked session in the browser.
        getSetCookieHeaders(response.headers).forEach((cookie) => proxied.headers.append('Set-Cookie', cookie));
        return proxied;

    } catch (error: unknown) {
        // Transport failure (backend down / ECONNREFUSED / DNS / aborted) — NOT an
        // upstream HTTP error (those pass through with their real status above).
        // Return a gateway-class status with a generic body; never leak the raw
        // upstream error.message to the client. Matches the auth/health, auth/provider
        // and change-password sibling proxies.
        console.error('[API Proxy] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Backend service unavailable', code: 'BACKEND_UNREACHABLE' },
            { status: 503 }
        );
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    return proxyRequest(request, path.join('/'), 'GET');
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    return proxyRequest(request, path.join('/'), 'POST');
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    return proxyRequest(request, path.join('/'), 'PUT');
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    return proxyRequest(request, path.join('/'), 'DELETE');
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    return proxyRequest(request, path.join('/'), 'PATCH');
}
