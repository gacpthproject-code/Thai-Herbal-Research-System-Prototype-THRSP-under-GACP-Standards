/**
 * "ต้องมีเซสชัน" ไม่ใช่ "ต้องเป็นของคุณ"
 *
 * วัดจริงบนระบบที่รันอยู่ 2026-09-09 ก่อนแก้ (evidence/step4-security/REPORT.md):
 *
 *   GET /uploads/car/secret.txt   ไม่มีโทเคน:401   ผู้ยื่นคนอื่น:200   <- อ่านได้ทั้งไฟล์
 *   GET /uploads/root2.txt        ไม่มีโทเคน:401   ผู้ยื่นคนอื่น:200
 *
 * car/ คือเอกสารที่เกษตรกรยื่นตอบข้อบกพร่องหลังถูกตรวจพบ audits/ คือภาพถ่ายหลักฐาน
 * การตรวจแปลง ทั้งสองไม่มีผู้บริโภคสาธารณะ
 *
 * เทสนี้ขับ middleware ตัวจริง ไม่ได้ grep ข้อความในไฟล์ — ถ้าใครหดเงื่อนไขกลับไป
 * เป็นรายชื่อ prefix เทสจะแดงทันที · prisma ถูก mock ที่นี่เพราะสิ่งที่เฝ้าคือ "ประตู
 * ถามเจ้าของหรือไม่" ส่วน "ถามแล้วได้คำตอบถูกไหม" พิสูจน์ด้วยการยิงจริงข้างบน
 */

'use strict';

const mockPrisma = {
    application: { findFirst: jest.fn() },
    attachment: { findFirst: jest.fn() },
    auditChecklist: { findUnique: jest.fn() },
    applicationDocument: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
};

jest.mock('../../services/prisma-database', () => ({ prisma: mockPrisma }));
const mockMemberships = new Map();
jest.mock('../../services/holder-access', () => ({
    holderScopeForUser: jest.fn(async (userId) => ({ userId, readIds: mockMemberships.get(userId) || [], editIds: [] })),
    holderReadWhere: jest.fn((scope) => ({ holderOf: [...scope.readIds] })),
}));
const mockVisible = new Set();
jest.mock('../../middleware/require-visible-application', () => ({
    isApplicationVisibleTo: jest.fn(async (user, applicationId) => mockVisible.has(`${user.id}:${applicationId}`)),
}));
jest.mock('../../shared/logger', () => {
    const noop = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    return { ...noop, createLogger: () => noop };
});

const { gateUploadsObjectAccess, classifyUploadsPath } = require('../../middleware/uploads-access');

/** ผู้ยื่นเจ้าของแฟ้ม */
const OWNER = { id: 'u-owner', canonicalId: '1101700200111', role: 'health', organizationId: 'org-1' };
/** ผู้ยื่นอีกคน — เซสชันถูกต้องทุกประการ แต่ไม่ใช่แฟ้มของเขา */
const STRANGER = { id: 'u-stranger', canonicalId: '1102001504001', role: 'health', organizationId: 'org-1' };
const INSPECTOR = { id: 'u-inspector', role: 'field_inspector', organizationId: 'org-1' };

function drive(url, user) {
    const req = { originalUrl: url, user, query: {} };
    const res = {
        statusCode: null, body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    const next = jest.fn();
    return gateUploadsObjectAccess(req, res, next).then(() => ({ res, next }));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockMemberships.clear();
    mockVisible.clear();
    mockPrisma.application.findFirst.mockResolvedValue(null);
    mockPrisma.attachment.findFirst.mockResolvedValue(null);
    mockPrisma.auditChecklist.findUnique.mockResolvedValue(null);
    mockPrisma.applicationDocument.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
});

describe('ทุกชนิดที่ถูกจัดว่าเป็นข้อมูลส่วนบุคคล ต้องผ่านการตรวจเจ้าของ', () => {
    const SENSITIVE = [
        ['car/finding-response.pdf', 'car'],
        ['audits/a-1/plot-photo.jpg', 'audit'],
        ['id-card-front.png', 'root'],
        ['application-drafts/x.pdf', 'draft'],
    ];

    it.each(SENSITIVE)('%s ถูกจัดเป็นชนิด %s และเป็นข้อมูลส่วนบุคคล', (rel, kind) => {
        expect(classifyUploadsPath(rel)).toEqual({ kind, sensitive: true });
    });

    it.each(SENSITIVE)('/uploads/%s — คนที่ไม่ใช่เจ้าของไม่ได้ไฟล์', async (rel) => {
        // ไม่มีแถวไหนชี้ว่าไฟล์นี้เป็นของ STRANGER (mock คืน null ทุกตัว)
        const { res, next } = await drive(`/uploads/${rel}`, STRANGER);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(404);
    });
});

describe('คนที่กติกาการอ่านให้เห็นคำขอ ยังเปิดแฟ้มได้', () => {
    it('car/ — สมาชิก ACTIVE ของนิติบุคคลผู้ถือคำขอ', async () => {
        mockMemberships.set(OWNER.id, ['entity-1']);
        mockPrisma.application.findFirst.mockImplementation(async ({ where }) => (
            (where.AND[0].holderOf || []).includes('entity-1') ? { id: 'app-1' } : null));
        const { res, next } = await drive('/uploads/car/finding-response.pdf', OWNER);
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
    });

    it('audits/ — ผู้ตรวจที่เห็นคำขอนั้น ส่วนผู้ยื่นไม่มีประตูดูภาพหลักฐานการตรวจ', async () => {
        mockPrisma.attachment.findFirst.mockResolvedValue({ resId: 'audit-1' });
        mockPrisma.auditChecklist.findUnique.mockResolvedValue({ applicationId: 'app-1' });
        mockVisible.add(`${INSPECTOR.id}:app-1`);
        mockMemberships.set(OWNER.id, ['entity-1']);
        expect((await drive('/uploads/audits/a-1/plot-photo.jpg', INSPECTOR)).next).toHaveBeenCalled();
        const applicant = await drive('/uploads/audits/a-1/plot-photo.jpg', OWNER);
        expect(applicant.next).not.toHaveBeenCalled();
        expect(applicant.res.statusCode).toBe(404);
    });

    it('ไฟล์ที่ราก — เฉพาะรูปประจำตัวของเขาเอง', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
            privacySettings: { avatar: '/uploads/avatar-9.png' },
        });
        const { next } = await drive('/uploads/avatar-9.png', OWNER);
        expect(next).toHaveBeenCalled();
    });

    it('ไฟล์ที่รากของคนอื่น ไม่ได้ แม้จะมีรูปประจำตัวของตัวเองอยู่', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
            privacySettings: { avatar: '/uploads/avatar-9.png' },
        });
        const { res, next } = await drive('/uploads/avatar-1.png', STRANGER);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(404);
    });
});

describe('สิ่งที่ตั้งใจให้เปิดสาธารณะ ยังเปิดได้ และไม่ถูกถามฐานข้อมูลเปล่า ๆ', () => {
    it('lab-results/ ผ่านโดยไม่ต้องมีเซสชัน', async () => {
        const { res, next } = await drive('/uploads/lab-results/r-1.pdf', null);
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
        expect(mockPrisma.application.findFirst).not.toHaveBeenCalled();
    });
});

describe('ล้มแบบปิด', () => {
    it('หาเจ้าของไม่เจอ = ปฏิเสธ ไม่ใช่ปล่อยผ่าน', async () => {
        const { res, next } = await drive('/uploads/car/orphan.pdf', OWNER);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(404);
    });

    it('ไม่มีเซสชันเลยกับไฟล์ส่วนบุคคล = 401', async () => {
        const { res, next } = await drive('/uploads/car/finding-response.pdf', null);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
    });

    it('ฐานข้อมูลล่ม ไม่ได้แปลว่าให้ไฟล์', async () => {
        mockPrisma.application.findFirst.mockRejectedValue(new Error('connection refused'));
        const { res, next } = await drive('/uploads/car/finding-response.pdf', OWNER);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(500);
    });

    it('เดินย้อนขึ้นไปจากโฟลเดอร์สาธารณะเข้าหาแฟ้มส่วนบุคคล ถูกปฏิเสธ', async () => {
        const { res, next } = await drive('/uploads/lab-results/../car/finding-response.pdf', STRANGER);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });
});
