/**
 * Every photograph carries its own capture moment, not the check-in's.
 *
 * staging 110d5ed96 (2026-10-29): the approver's file flagged every inspection photo
 * "ถ่ายนอกช่วงเวลาตรวจ". The inspect page kept the GPS fix it took for the check-in and
 * reused the WHOLE payload for each upload, capturedAt included. That timestamp was
 * stamped on the device before the server wrote the check-in (the start of the capture
 * window), so each photograph was reported as taken before the visit began.
 *
 * The photograph may reuse the position. Its capturedAt is the moment the file was
 * handed over, and a retried upload keeps the moment of the first attempt.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetOnsiteContext = jest.fn();
const mockStartInspection = jest.fn();
const mockUploadPhoto = jest.fn();

jest.mock('@/lib/services/audit-service', () => ({
    AuditService: {
        getOnsiteContext: (...args: unknown[]) => mockGetOnsiteContext(...args),
        startInspection: (...args: unknown[]) => mockStartInspection(...args),
        verifyGps: jest.fn().mockResolvedValue({ success: false }),
        submitChecklistItem: jest.fn().mockResolvedValue({ success: true }),
        uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
        submitDecision: jest.fn(),
    },
}));

jest.mock('@/lib/notifications', () => ({
    notifications: { show: jest.fn() },
}));

import InspectClient from '../client-view';

const CHECK_IN_AT = new Date('2026-10-29T03:00:00.000Z');
const FIRST_PHOTO_AT = new Date('2026-10-29T03:07:00.000Z');
const RETRY_AT = new Date('2026-10-29T03:09:00.000Z');

const context = {
    audit: {
        id: 'aud-1',
        applicationId: 'app-1',
        applicationNumber: 'GACP-2026-0042',
        applicantName: 'นาย เกษตรกร ทดสอบ',
        farmAddress: '123 ม.4',
        farmLat: 13.8621,
        farmLng: 100.5144,
    },
    checklist: [{ itemId: 'item-a', title: 'การใช้สารเคมีเกษตร', description: 'ไม่มีการใช้สารเคมีต้องห้าม' }],
    savedAnswers: [],
};

async function flushAsync(rounds = 8): Promise<void> {
    for (let i = 0; i < rounds; i += 1) {
        await act(async () => {
            await Promise.resolve();
        });
    }
}

function stubGeoSuccess(lat: number, lng: number): void {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
        configurable: true,
        value: {
            getCurrentPosition: (success: PositionCallback) => {
                success({ coords: { latitude: lat, longitude: lng, accuracy: 5 } } as GeolocationPosition);
            },
        },
    });
}

function attachPhoto(container: HTMLElement, file: File): void {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) throw new Error('no file input found');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] as unknown as FileList });
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickButton(container: HTMLElement, text: string): void {
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!btn) throw new Error(`no button containing "${text}"`);
    btn.click();
}

const gpsOf = (call: unknown[]) => (call[2] as { gps: { capturedAt: string; latitude: number } }).gps;

describe('InspectClient: a photograph carries its own capturedAt', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask'], now: CHECK_IN_AT });
        stubGeoSuccess(13.8622, 100.5144);
        mockGetOnsiteContext.mockResolvedValue({ success: true, data: context });
        mockStartInspection.mockResolvedValue({ success: true, data: { sessionId: 's-1', startedAt: CHECK_IN_AT.toISOString() } });
    });

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        if (container) {
            container.remove();
            container = null;
        }
        jest.useRealTimers();
    });

    it('after a check-in in the same session, the upload is stamped when the file arrives, not with the check-in time', async () => {
        mockUploadPhoto.mockResolvedValue({ success: true, data: { photoId: 'p-1', url: '/p-1.jpg' } });
        container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => {
            root = createRoot(container!);
            root.render(<InspectClient applicationId="aud-1" />);
        });
        await flushAsync();

        await act(async () => { clickButton(container!, 'เริ่มตรวจ'); });
        await flushAsync();
        expect(mockStartInspection).toHaveBeenCalledTimes(1);
        expect((mockStartInspection.mock.calls[0][1] as { capturedAt: string }).capturedAt).toBe(CHECK_IN_AT.toISOString());

        jest.setSystemTime(FIRST_PHOTO_AT);
        await act(async () => { attachPhoto(container!, new File(['x'], 'farm-1.jpg', { type: 'image/jpeg' })); });
        await flushAsync();

        expect(mockUploadPhoto).toHaveBeenCalledTimes(1);
        const gps = gpsOf(mockUploadPhoto.mock.calls[0]);
        expect(gps.latitude).toBeCloseTo(13.8622);
        expect(gps.capturedAt).toBe(FIRST_PHOTO_AT.toISOString());
    });

    it('a retried upload keeps the moment of the first attempt', async () => {
        mockUploadPhoto
            .mockResolvedValueOnce({ success: false, error: 'network timeout' })
            .mockResolvedValueOnce({ success: true, data: { photoId: 'p-1', url: '/p-1.jpg' } });
        container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => {
            root = createRoot(container!);
            root.render(<InspectClient applicationId="aud-1" />);
        });
        await flushAsync();
        await act(async () => { clickButton(container!, 'เริ่มตรวจ'); });
        await flushAsync();

        jest.setSystemTime(FIRST_PHOTO_AT);
        await act(async () => { attachPhoto(container!, new File(['x'], 'farm-1.jpg', { type: 'image/jpeg' })); });
        await flushAsync();

        jest.setSystemTime(RETRY_AT);
        const retryBtn = container!.querySelector('button[data-testid^="retry-photo-"]') as HTMLButtonElement | null;
        expect(retryBtn).toBeTruthy();
        await act(async () => { retryBtn!.click(); });
        await flushAsync();

        expect(mockUploadPhoto).toHaveBeenCalledTimes(2);
        expect(gpsOf(mockUploadPhoto.mock.calls[0]).capturedAt).toBe(FIRST_PHOTO_AT.toISOString());
        expect(gpsOf(mockUploadPhoto.mock.calls[1]).capturedAt).toBe(FIRST_PHOTO_AT.toISOString());
    });
});
