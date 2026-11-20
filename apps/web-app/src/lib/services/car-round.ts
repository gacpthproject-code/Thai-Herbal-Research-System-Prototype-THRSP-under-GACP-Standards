import { CAR_MAX_FILES } from '@/lib/services/car-file-upload';
import { formatThaiDate, formatThaiTime } from '@/lib/format/thai-date';

export interface CarDefect {
    no: number;
    nonConformity: string;
    correctiveAction: string;
}

export type CarFileState = 'waiting' | 'uploading' | 'uploaded' | 'failed';

export interface CarFileItem {
    key: string;
    findingNo: number;
    name: string;
    size: number;
    state: CarFileState;
    serverId: string | null;
    error: string | null;
    refused: boolean;
    deletesAt: string | null;
}

export const CAR_PAGE_COPY_TH = Object.freeze({
    howTo: 'เพิ่มไฟล์หลักฐานใต้ข้อบกพร่องที่ไฟล์นั้นใช้แก้ไข ระบบอัปโหลดทีละไฟล์ ไฟล์ที่อัปโหลดแล้วไม่ต้องส่งซ้ำ ถ้าไฟล์ใดไม่สำเร็จ กด "ลองใหม่" เฉพาะไฟล์นั้น เมื่อทุกไฟล์ขึ้นว่าอัปโหลดแล้ว จึงกด "ส่งหลักฐาน"',
    count: (n: number) => `ไฟล์ในรอบนี้ ${n} จาก ${CAR_MAX_FILES} ไฟล์`,
    overLimit: (room: number) => (room > 0
        ? `ส่งหลักฐานได้ไม่เกิน ${CAR_MAX_FILES} ไฟล์ต่อครั้ง ระบบเพิ่มให้ ${room} ไฟล์แรกที่เลือก หากต้องการส่งไฟล์อื่นแทน ให้ลบไฟล์ที่ไม่จำเป็นก่อน หรือรวมหลายหน้าเป็นไฟล์ PDF เดียว`
        : `ครบ ${CAR_MAX_FILES} ไฟล์แล้ว หากต้องการส่งไฟล์อื่นแทน ให้ลบไฟล์ที่ไม่จำเป็นก่อน หรือรวมหลายหน้าเป็นไฟล์ PDF เดียว`),
    defectHeading: (no: number) => `ข้อบกพร่องข้อ ${no}`,
    correctiveAction: 'แนวทางแก้ไข: ',
    addFiles: 'เพิ่มไฟล์หลักฐานของข้อนี้',
    noFileYet: 'ยังไม่มีไฟล์สำหรับข้อนี้',
    rules: 'รับไฟล์ PDF หรือรูปภาพ JPG และ PNG ไฟล์ละไม่เกิน 10 MB รวมไม่เกิน 20 ไฟล์',
    retry: 'ลองใหม่',
    remove: 'ลบไฟล์นี้',
    removeFailed: 'ลบไฟล์นี้ไม่สำเร็จ กรุณาลองกดลบอีกครั้ง',
    deletesAt: (at: string) => `ยังไม่ได้ส่ง หากไม่กดส่งหลักฐาน ระบบจะลบไฟล์นี้หลัง ${formatThaiDate(at)} เวลา ${formatThaiTime(at)} น.`,
    pickAgain: 'ไม่พบไฟล์นี้ในเครื่องแล้ว กรุณาลบรายการนี้ แล้วเลือกไฟล์ใหม่อีกครั้ง',
    state: {
        waiting: 'รออัปโหลด',
        uploading: 'กำลังอัปโหลด',
        uploaded: 'อัปโหลดแล้ว',
        failed: 'ไม่สำเร็จ',
    } satisfies Record<CarFileState, string>,
    blockEmpty: 'เพิ่มไฟล์หลักฐานอย่างน้อยหนึ่งไฟล์ก่อนกดส่งหลักฐาน',
    blockPending: (n: number) => `ยังอัปโหลดไม่ครบ เหลืออีก ${n} ไฟล์ ปุ่มส่งหลักฐานจะกดได้เมื่อทุกไฟล์ขึ้นว่าอัปโหลดแล้ว`,
    blockFailed: (n: number) => `มี ${n} ไฟล์ที่ไม่สำเร็จ กด "ลองใหม่" หรือ "ลบไฟล์นี้" ก่อนกดส่งหลักฐาน`,
    refusedTitle: 'ส่งหลักฐานไม่ได้ ข้อมูลในคำขอยังขาด',
    refusedIntro: 'กรอกข้อมูลต่อไปนี้ในคำขอให้ครบ แล้วกลับมากดส่งหลักฐานอีกครั้ง ไฟล์ที่อัปโหลดแล้วยังอยู่ ไม่ต้องอัปโหลดใหม่',
    editAnswersCta: 'แก้ไขข้อมูลในคำขอ',
});

const asObject = (value: unknown): Record<string, unknown> =>
    (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export function defectsOfRound(formData: Record<string, unknown> | undefined): CarDefect[] {
    const request = asObject(asObject(formData).carRequest);
    const items = Array.isArray(request.items) ? request.items : [];
    const defects = items.map((item, index) => ({
        no: index + 1,
        nonConformity: String(asObject(item).nonConformity || '').trim(),
        correctiveAction: String(asObject(item).correctiveAction || '').trim(),
    }));
    if (defects.length > 0) { return defects; }
    return [{ no: 1, nonConformity: String(request.message || '').trim(), correctiveAction: '' }];
}

export function sendBlocker(items: CarFileItem[]): string | null {
    if (items.length === 0) { return CAR_PAGE_COPY_TH.blockEmpty; }
    const failed = items.filter((item) => item.state === 'failed').length;
    if (failed > 0) { return CAR_PAGE_COPY_TH.blockFailed(failed); }
    const pending = items.filter((item) => item.state !== 'uploaded').length;
    return pending > 0 ? CAR_PAGE_COPY_TH.blockPending(pending) : null;
}
