/**
 * สถานะใบรับรองบนประตูสาธารณะ — "ยังไม่เคยมีใบรับรอง" กับ "เคยมีแล้วหมดอายุ/ถูกเพิกถอน"
 * เป็นคนละคำกล่าวอ้าง และคำกล่าวอ้างที่สองเสียหายกว่ามาก
 *
 * F-QA-02 (deep-qa 2026-09-06): หน้าล็อตสาธารณะพิมพ์ป้ายแดง "หมดอายุหรือไม่มีผล" กับ
 * "เลขที่ใบรับรอง: -" ให้ล็อต LOT-2569-000019-A ซึ่งไม่เคยมีใบรับรองเลย (ทั้งระบบเดโมมี
 * ใบรับรอง 0 ใบ) ผู้ซื้ออ่านแล้วเข้าใจว่า "ฟาร์มนี้เคยได้ใบรับรอง แล้วปล่อยให้ขาด" ซึ่งไม่จริง
 * ต้นเหตุคือหน้าจอตัดสินด้วย `certificate?.isValid` อย่างเดียว — เป็นเท็จทั้งตอนไม่มีใบ
 * และตอนใบหมดอายุ
 *
 * โมดูลนี้เป็นตัวตัดสินร่วมของทุกประตูสาธารณะ (หน้าล็อต + หน้ารุ่นเก็บเกี่ยว) เพื่อไม่ให้
 * ถ้อยคำสองหน้าจอแยกกันเดินอีก · เป็นฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ต้องเรนเดอร์
 *
 * ความซื่อสัตย์เดินสองทาง: ห้ามบอกเป็นนัยว่ามีใบรับรองทั้งที่ไม่มี และห้ามทำให้ใบที่
 * หมดอายุ/ถูกเพิกถอนจริงฟังดูอ่อนลง
 */

import { CERTIFICATE_VERDICTS } from '@/lib/verify/certificate-verdict';
import { lapsedRenewalSentence, type RenewalPointer } from '@/lib/verify/renewal-wording';

export type TraceCertificate = {
    reference?: string | null;
    issuedDate?: string | null;
    issuedDateTH?: string | null;
    expiryDate?: string | null;
    expiryDateTH?: string | null;
    isValid?: boolean | null;
    producedInForce?: boolean | null;
    renewal?: RenewalPointer;
} | null | undefined;

export type CertificateState = 'NONE' | 'VALID' | 'OUTSIDE' | 'LAPSED' | 'RENEWED';

export type CertificatePresentation = {
    state: CertificateState;
    /** มีใบรับรองอยู่จริงหรือไม่ — ใช้ตัดสินว่าจะพิมพ์แถวเลขที่ใบ/วันหมดอายุไหม */
    hasCertificate: boolean;
    /** ข้อความบนป้าย */
    badgeLabel: string;
    /** โทนสี: เทา = ยังไม่มีข้อมูลให้ตัดสิน ไม่ใช่คำเตือน */
    tone: 'neutral' | 'success' | 'danger';
    /** บรรทัดอธิบายให้ผู้ซื้อ — null เมื่อแถวข้อมูลพูดครบแล้ว */
    note: string | null;
};

/** คำเรียกสิ่งที่ถูกสแกน — หน้าล็อตกับหน้ารุ่นเก็บเกี่ยวใช้คนละคำ */
export type CertificateSubject = 'ล็อต' | 'รุ่น' | 'แปลง' | 'รายการ';

type Builder = (subject: CertificateSubject, certificate: TraceCertificate) => Omit<CertificatePresentation, 'state' | 'hasCertificate'>;

const BUILDERS: Record<CertificateState, Builder> = {
    NONE: (subject) => ({
        badgeLabel: `ยังไม่มีใบรับรองสำหรับ${subject}นี้`,
        tone: 'neutral',
        note: `ยังไม่เคยมีการออกใบรับรอง GACP ให้${subject}นี้ — ไม่ใช่ใบรับรองที่หมดอายุหรือถูกเพิกถอน`,
    }),
    VALID: () => ({
        badgeLabel: 'ใช้งานได้ ยังไม่หมดอายุ',
        tone: 'success',
        note: null,
    }),
    OUTSIDE: (subject) => ({
        badgeLabel: 'เก็บเกี่ยวนอกช่วงที่ใบรับรองมีผล',
        tone: 'danger',
        note: `${subject}นี้เก็บเกี่ยวในวันที่ใบรับรองฉบับนี้ไม่มีผล จึงไม่นับว่าได้รับการรับรอง GACP`,
    }),
    RENEWED: (subject, certificate) => {
        const lapsed = lapsedRenewalSentence(certificate?.renewal);
        return lapsed
            ? { badgeLabel: 'หมดอายุแล้ว มีฉบับใหม่', tone: 'neutral', note: `${subject}นี้ผลิตในช่วงที่ใบรับรองฉบับนี้ยังมีผล ${lapsed}` }
            : {
                badgeLabel: CERTIFICATE_VERDICTS.RENEWED.word,
                tone: 'neutral',
                note: `${subject}นี้ผลิตภายใต้ใบรับรองฉบับนี้ ซึ่งต่ออายุแล้วและมีฉบับใหม่แทน`,
            };
    },
    LAPSED: (subject) => ({
        badgeLabel: 'หมดอายุหรือไม่มีผล',
        tone: 'danger',
        note: `${subject}นี้เคยได้รับใบรับรอง แต่ปัจจุบันหมดอายุหรือถูกเพิกถอนแล้ว`,
    }),
};

/**
 * ใบรับรอง "มีอยู่จริง" เมื่อเซิร์ฟเวอร์ส่งอ็อบเจ็กต์มาพร้อมเลขที่ใบ · null (หรืออ็อบเจ็กต์
 * ที่ไม่มีเลขที่ใบเลย) = ไม่เคยออก · ไม่ใช้ `isValid` ตัดสินการมีอยู่ เพราะ false ของมัน
 * ตอบได้ทั้งสองเรื่อง ซึ่งเป็นตัวบั๊กเอง
 */
export function readCertificateState(certificate: TraceCertificate): CertificateState {
    const reference = typeof certificate?.reference === 'string' ? certificate.reference.trim() : '';
    if (!certificate || reference === '') {
        return 'NONE';
    }
    if (certificate.isValid === true) {
        return 'VALID';
    }
    if (certificate.producedInForce === false) {
        return 'OUTSIDE';
    }
    return certificate.renewal?.successorCertificateNumber ? 'RENEWED' : 'LAPSED';
}

export function describeCertificate(
    certificate: TraceCertificate,
    subject: CertificateSubject = 'รายการ',
): CertificatePresentation {
    const state = readCertificateState(certificate);
    return {
        state,
        hasCertificate: state !== 'NONE',
        ...BUILDERS[state](subject, certificate),
    };
}

/**
 * สถานะใบรับรองที่ "ป้ายกลางแปลง" ได้รับ
 *
 * ประตูของป้ายแปลงส่งมาแค่ `{ status, isValid }` โดยตั้งใจ — ไม่มีเลขที่ใบ ไม่มีวันที่ ไม่มี id
 * เพราะป้ายตั้งอยู่กลางทุ่งและตอบใครก็ได้ที่ถ่ายรูปมัน (resolve-plot-cycle.js:118-121)
 * ⇒ readCertificateState ซึ่งตัดสิน "มีใบอยู่จริงไหม" จากเลขที่ใบ ใช้กับรูปร่างนี้ไม่ได้
 * มันจะตอบ NONE เสมอ แม้แปลงนั้นมีใบรับรองที่ใช้ได้อยู่
 *
 * ที่นี่จึงอ่านจาก `status` ตรง ๆ ตามความหมายที่ฝั่งเซิร์ฟเวอร์ประกาศไว้:
 *   NONE            ไม่เคยออกใบให้รอบปลูกนี้
 *   ACTIVE + isValid ใบใช้ได้
 *   อื่น ๆ            เคยมีใบ แต่หมดอายุ/ถูกระงับ/ถูกเพิกถอน
 * ถ้อยคำบนป้ายยังมาจากชุดเดียวกับหน้าล็อต เพื่อไม่ให้ประตูสาธารณะสองบานพูดคนละภาษา
 */
export type SignCertificate = {
    status?: string | null;
    isValid?: boolean | null;
} | null | undefined;

export function readSignCertificateState(certificate: SignCertificate): CertificateState {
    const status = String(certificate?.status || '').trim().toUpperCase();
    if (!certificate || status === '' || status === 'NONE') {
        return 'NONE';
    }
    return certificate.isValid === true ? 'VALID' : 'LAPSED';
}

export function describeSignCertificate(
    certificate: SignCertificate,
    subject: CertificateSubject = 'แปลง',
): CertificatePresentation {
    const state = readSignCertificateState(certificate);
    return {
        state,
        hasCertificate: state !== 'NONE',
        ...BUILDERS[state](subject, null),
    };
}
