/**
 * Read one QR code from the phone's back camera.
 *
 * Chrome on Android ships the BarcodeDetector API; Safari on iPhone does not,
 * so those phones decode frames with jsQR, loaded only when the camera opens.
 * Throws when there is no camera, the person refuses permission, or the scan
 * is cancelled through `signal`.
 */

type DetectFrame = (video: HTMLVideoElement) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}
interface BarcodeDetectorCtor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const FRAME_INTERVAL_MS = 200;
const MAX_DECODE_WIDTH = 640;

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

async function nativeDetector(): Promise<DetectFrame | null> {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code'];
    if (!formats.includes('qr_code')) return null;
    const detector = new Ctor({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

async function jsqrDetector(): Promise<DetectFrame> {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height)?.data ?? null;
  };
}

function abortError(): DOMException {
  return new DOMException('scan cancelled', 'AbortError');
}

export async function scanQrFromCamera(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  try {
    if (signal.aborted) throw abortError();
    video.srcObject = stream;
    await video.play();
    const detect = (await nativeDetector()) ?? (await jsqrDetector());
    while (!signal.aborted) {
      const text = await detect(video).catch(() => null);
      if (text) return text;
      await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
    }
    throw abortError();
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}
