import { apiClient } from '@/lib/api/api-client';
import { checkUploadInBrowser } from '@/lib/services/client-upload-check';
import { postWaitingOutRateLimit, UPLOAD_RATE_LIMITED_TH, type UploadReply } from '@/lib/services/upload-rate-limit';

export const CAR_MAX_FILES = 20;
export const CAR_MAX_BYTES = 10 * 1024 * 1024;
const CAR_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const UPLOAD_TIMEOUT_MS = 180_000;

export interface StagedCarFile {
    id: string;
    findingNo: number;
    originalName: string;
    size: number;
    mimeType?: string;
    uploadedAt?: string;
    deletesAt?: string | null;
}

export const CAR_UPLOAD_COPY_TH = Object.freeze({
    tooLarge: (name: string) => `ไฟล์ "${name}" ใหญ่เกิน 10 MB คุณสามารถบีบอัดไฟล์ หรือถ่ายภาพหรือสแกนใหม่ที่ความละเอียดต่ำลง แล้วเพิ่มไฟล์อีกครั้ง`,
    wrongType: (name: string) => `ไฟล์ "${name}" ไม่ใช่ชนิดที่รับ ระบบรับเฉพาะไฟล์ PDF หรือรูปภาพ JPG และ PNG คุณสามารถบันทึกไฟล์เป็นชนิดเหล่านี้ แล้วเพิ่มไฟล์อีกครั้ง`,
    network: 'การเชื่อมต่อขาดระหว่างอัปโหลด ไฟล์อื่นที่อัปโหลดแล้วยังอยู่ครบ กรุณาตรวจสอบอินเทอร์เน็ต แล้วกด "ลองใหม่" เพื่อส่งเฉพาะไฟล์นี้',
    timeout: 'อัปโหลดไฟล์นี้นานเกินไปจนหมดเวลา ไฟล์อื่นที่อัปโหลดแล้วยังอยู่ครบ กรุณาย้ายไปที่สัญญาณดีขึ้น แล้วกด "ลองใหม่" เพื่อส่งเฉพาะไฟล์นี้',
    failed: 'อัปโหลดไฟล์นี้ไม่สำเร็จ กรุณากด "ลองใหม่" เพื่อส่งเฉพาะไฟล์นี้อีกครั้ง',
    rateLimited: UPLOAD_RATE_LIMITED_TH,
});

export async function refuseBeforeUpload(file: File): Promise<string | null> {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!CAR_EXTENSIONS.includes(ext)) { return CAR_UPLOAD_COPY_TH.wrongType(file.name); }
    if (file.size > CAR_MAX_BYTES) { return CAR_UPLOAD_COPY_TH.tooLarge(file.name); }
    const verdict = await checkUploadInBrowser(file, { slotId: 'car_evidence' });
    return !verdict.ok && verdict.message ? verdict.message : null;
}

interface CarUploadDeps {
    post: (path: string, body: FormData) => Promise<UploadReply<{ file?: StagedCarFile }>>;
    wait?: (ms: number) => Promise<void>;
}

const defaultDeps: CarUploadDeps = {
    post: (path, body) => apiClient.post(path, body, { timeout: UPLOAD_TIMEOUT_MS }),
};

export async function uploadCarFile(
    args: { applicationId: string; file: File; findingNo: number },
    deps: CarUploadDeps = defaultDeps,
): Promise<{ file: StagedCarFile | null; error: string | null }> {
    const body = new FormData();
    body.append('findingNo', String(args.findingNo));
    body.append('file', args.file);
    try {
        const reply = await postWaitingOutRateLimit(() => deps.post(`/applications/${args.applicationId}/car/files`, body), deps.wait);
        if (reply?.success && reply.data?.file?.id) { return { file: reply.data.file, error: null }; }
        if (reply?.status === 429) { return { file: null, error: CAR_UPLOAD_COPY_TH.rateLimited }; }
        if (reply?.transportFailure === 'NETWORK') { return { file: null, error: CAR_UPLOAD_COPY_TH.network }; }
        if (reply?.transportFailure === 'TIMEOUT') { return { file: null, error: CAR_UPLOAD_COPY_TH.timeout }; }
        return { file: null, error: reply?.error || CAR_UPLOAD_COPY_TH.failed };
    } catch {
        return { file: null, error: CAR_UPLOAD_COPY_TH.network };
    }
}

export function removeCarFile(applicationId: string, fileId: string) {
    return apiClient.delete(`/applications/${applicationId}/car/files/${encodeURIComponent(fileId)}`);
}

export function sendCarRound(applicationId: string, files: Array<{ id: string; findingNo: number }>, notes: string) {
    return apiClient.post(`/applications/${applicationId}/car`, { files, notes });
}
