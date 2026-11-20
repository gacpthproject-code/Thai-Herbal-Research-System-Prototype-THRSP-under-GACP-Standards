export interface UploadReply<T> {
    success?: boolean;
    error?: string;
    status?: number;
    retryAfterMs?: number;
    transportFailure?: 'NETWORK' | 'TIMEOUT' | 'UNREADABLE_REPLY';
    data?: T | null;
}

const RATE_LIMIT_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000];
const WAIT_BUDGET_MS = 60_000;

export const UPLOAD_RATE_LIMITED_TH = 'ขณะนี้มีการอัปโหลดไฟล์จากเครือข่ายของคุณจำนวนมาก กรุณารอประมาณหนึ่งนาที แล้วอัปโหลดไฟล์นี้อีกครั้ง';

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export async function postWaitingOutRateLimit<T>(
    send: () => Promise<UploadReply<T>>,
    wait: (ms: number) => Promise<void> = sleep,
): Promise<UploadReply<T>> {
    let response = await send();
    let waited = 0;
    for (const backoffMs of RATE_LIMIT_BACKOFF_MS) {
        if (response?.status !== 429 || waited >= WAIT_BUDGET_MS) { break; }
        const waitMs = Math.min(response.retryAfterMs ?? backoffMs, WAIT_BUDGET_MS - waited);
        await wait(waitMs);
        waited += waitMs;
        response = await send();
    }
    return response;
}
