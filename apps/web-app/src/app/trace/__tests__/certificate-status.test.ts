/**
 * F-QA-02 (deep-qa 2026-09-06) — "ยังไม่เคยมีใบรับรอง" ต้องไม่ถูกพิมพ์เป็น
 * "หมดอายุหรือไม่มีผล"
 *
 * ที่เห็นบนเดโม: ล็อต LOT-2569-000019-A ไม่มีใบรับรองเลย (ระบบมีใบรับรอง 0 ใบ)
 * แต่หน้าสาธารณะขึ้นป้ายแดง "หมดอายุหรือไม่มีผล" + "เลขที่ใบรับรอง: -" ผู้ซื้ออ่านว่า
 * ฟาร์มนี้เคยได้ใบรับรองแล้วปล่อยให้ขาด ซึ่งเป็นคำกล่าวอ้างคนละเรื่องและเสียหายกว่า
 *
 * เทสนี้ตรึงตัวตัดสิน (pure function) — ทั้งสองทิศ: ห้ามทำให้ "ไม่มีใบ" ฟังดูเหมือน
 * "ใบขาด" และห้ามทำให้ "ใบขาดจริง" ฟังดูอ่อนลง
 */
import { describe, expect, it } from '@jest/globals';
import { describeCertificate, readCertificateState } from '../certificate-status';

const VALID = {
    reference: 'GACP-TH-2569-85B448',
    issuedDate: '2026-01-01',
    issuedDateTH: '1 ม.ค. 2569',
    expiryDate: '2029-01-01',
    expiryDateTH: '1 ม.ค. 2572',
    isValid: true,
};

describe('readCertificateState — สามสถานะ ไม่ใช่สอง', () => {
    it.each([
        ['null (เซิร์ฟเวอร์ตอบว่าไม่มีใบ)', null],
        ['undefined (ไม่ได้ส่งฟิลด์มาเลย)', undefined],
        ['อ็อบเจ็กต์เปล่า', {}],
        ['เลขที่ใบเป็นสตริงว่าง', { reference: '   ', isValid: false }],
    ])('%s → NONE', (_name, input) => {
        expect(readCertificateState(input as never)).toBe('NONE');
    });

    it('มีเลขที่ใบ + isValid true → VALID', () => {
        expect(readCertificateState(VALID)).toBe('VALID');
    });

    it('มีเลขที่ใบ แต่ isValid false → LAPSED (ใบมีอยู่จริงและขาดจริง)', () => {
        expect(readCertificateState({ ...VALID, isValid: false })).toBe('LAPSED');
    });

    it('มีเลขที่ใบ แต่ไม่ได้บอก isValid มา → LAPSED ไม่ใช่ VALID (ไม่เดาเข้าข้าง)', () => {
        expect(readCertificateState({ reference: 'GACP-TH-2569-000001' })).toBe('LAPSED');
    });
});

describe('describeCertificate — ถ้อยคำที่ผู้ซื้ออ่าน', () => {
    it('ไม่มีใบรับรอง: ป้ายเป็นกลาง บอกตรง ๆ ว่ายังไม่เคยออกใบ และไม่พูดคำว่าหมดอายุบนป้าย', () => {
        const cert = describeCertificate(null, 'ล็อต');

        expect(cert.state).toBe('NONE');
        expect(cert.hasCertificate).toBe(false);
        expect(cert.tone).toBe('neutral');
        expect(cert.badgeLabel).toBe('ยังไม่มีใบรับรองสำหรับล็อตนี้');
        expect(cert.badgeLabel).not.toMatch(/หมดอายุ|เพิกถอน|ไม่มีผล/);
        // บรรทัดอธิบายพูดถึงคำว่าหมดอายุได้ เพราะพูดเพื่อ "ปฏิเสธ" ว่าไม่ใช่กรณีนั้น
        expect(cert.note).toContain('ยังไม่เคยมีการออกใบรับรอง');
    });

    it('ใบหมดอายุ/ถูกเพิกถอนจริง: ยังเป็นสีแดงและยังใช้ถ้อยคำเดิม ไม่ถูกทำให้อ่อนลง', () => {
        const cert = describeCertificate({ ...VALID, isValid: false }, 'ล็อต');

        expect(cert.state).toBe('LAPSED');
        expect(cert.hasCertificate).toBe(true);
        expect(cert.tone).toBe('danger');
        expect(cert.badgeLabel).toBe('หมดอายุหรือไม่มีผล');
        expect(cert.note).toContain('เคยได้รับใบรับรอง');
    });

    it('ใบใช้ได้: เขียว และไม่ต้องมีบรรทัดอธิบาย', () => {
        const cert = describeCertificate(VALID, 'ล็อต');

        expect(cert.state).toBe('VALID');
        expect(cert.hasCertificate).toBe(true);
        expect(cert.tone).toBe('success');
        expect(cert.badgeLabel).toBe('ใช้งานได้ ยังไม่หมดอายุ');
        expect(cert.note).toBeNull();
    });

    it('คำเรียกเปลี่ยนตามประตูที่ถูกสแกน — หน้ารุ่นไม่พูดว่า "ล็อต"', () => {
        expect(describeCertificate(null, 'รุ่น').badgeLabel).toBe('ยังไม่มีใบรับรองสำหรับรุ่นนี้');
        expect(describeCertificate(null).badgeLabel).toBe('ยังไม่มีใบรับรองสำหรับรายการนี้');
    });

    it('สามสถานะให้ป้ายที่ต่างกันทั้งหมด — ผู้ซื้อต้องแยกออกด้วยตา', () => {
        const labels = [
            describeCertificate(null, 'ล็อต').badgeLabel,
            describeCertificate(VALID, 'ล็อต').badgeLabel,
            describeCertificate({ ...VALID, isValid: false }, 'ล็อต').badgeLabel,
        ];
        expect(new Set(labels).size).toBe(3);
    });
});

describe('order 119: a certificate renewed since the goods were made', () => {
    const RENEWED = {
        ...VALID,
        isValid: false,
        renewal: { successorCertificateNumber: 'TH-GACP 9/2569', verifyUrl: 'https://example.test/verify/TH-GACP-9-2569' },
    };

    it('is its own state, not a lapse', () => {
        expect(readCertificateState(RENEWED)).toBe('RENEWED');
        const shown = describeCertificate(RENEWED, 'ล็อต');
        expect(shown).toMatchObject({ state: 'RENEWED', hasCertificate: true, badgeLabel: 'มีฉบับใหม่แทนแล้ว' });
        expect(`${shown.badgeLabel} ${shown.note}`).not.toMatch(/หมดอายุ|ไม่มีผล|เพิกถอน/);
    });
});

describe('order 126: what a lot says about the certificate it was produced under', () => {
    const RENEWAL = { successorCertificateNumber: 'TH-GACP 9/2569', verifyUrl: 'https://example.test/verify/TH-GACP-9-2569' };

    it('a lot harvested on a day its certificate was not in force is not certified, in a red badge', () => {
        const cert = describeCertificate({ ...VALID, isValid: false, producedInForce: false }, 'ล็อต');
        expect(cert.state).toBe('OUTSIDE');
        expect(cert.tone).toBe('danger');
        expect(cert.badgeLabel).toBe('เก็บเกี่ยวนอกช่วงที่ใบรับรองมีผล');
        expect(cert.note).toBe('ล็อตนี้เก็บเกี่ยวในวันที่ใบรับรองฉบับนี้ไม่มีผล จึงไม่นับว่าได้รับการรับรอง GACP');
    });

    it('renewed before expiry: replaced, as before', () => {
        const cert = describeCertificate({
            ...VALID, isValid: false, producedInForce: true,
            renewal: { ...RENEWAL, successorIssuedDate: '2026-08-01T03:00:00.000Z', lapsedBeforeRenewal: false, expiredOn: null },
        }, 'ล็อต');
        expect(cert.state).toBe('RENEWED');
        expect(cert.badgeLabel).toBe('มีฉบับใหม่แทนแล้ว');
        expect(cert.note).toBe('ล็อตนี้ผลิตภายใต้ใบรับรองฉบับนี้ ซึ่งต่ออายุแล้วและมีฉบับใหม่แทน');
    });

    it('expired first, renewed later: produced while the old one was in force, then the order 126(b) sentence', () => {
        const cert = describeCertificate({
            ...VALID, isValid: false, producedInForce: true,
            renewal: { ...RENEWAL, successorIssuedDate: '2026-10-21T03:00:00.000Z', lapsedBeforeRenewal: true, expiredOn: '2026-09-01T03:00:00.000Z' },
        }, 'ล็อต');
        expect(cert.state).toBe('RENEWED');
        expect(cert.badgeLabel).toBe('หมดอายุแล้ว มีฉบับใหม่');
        expect(cert.note).toBe('ล็อตนี้ผลิตในช่วงที่ใบรับรองฉบับนี้ยังมีผล หมดอายุเมื่อ 01 ก.ย. 2569 · มีใบรับรองฉบับใหม่ TH-GACP 9/2569 มีผลตั้งแต่ 21 ต.ค. 2569');
    });
});
