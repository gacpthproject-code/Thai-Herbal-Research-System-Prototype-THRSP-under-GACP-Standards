/**
 * ใบที่มอบหมายแล้ว มีเจ้าของคนเดียว
 *
 * reviewerId = someone -> คนนั้นเท่านั้น
 * reviewerId = null    -> ยังไม่มีใครได้รับมอบ จึงไม่มีใครตรวจได้ (ผู้จัดคิวมอบก่อน)
 * ผู้ดูแลระบบเปิดอ่าน (GET document-check) ได้ แต่บันทึกผลแทนผู้ตรวจไม่ได้ (คำสั่ง 31)
 *
 * routes/api/provider/document-reviews.js เป็นไฟล์เดียวในสามที่เดิน edge
 * ASSIGNED_FOR_REVIEW -> DOC_APPROVED / REVISION_REQUESTED ที่ข้ามการตรวจนี้
 *
 * วัดจริง 2026-09-09 ก่อนแก้: ผู้ตรวจเอกสารที่ไม่ได้รับมอบหมาย เรียก
 * GET /api/provider/applications/:id/document-check ได้ 200 พร้อมรายการเอกสารทั้งใบ
 * และ POST /document-decision ผ่านด่านสิทธิ์เข้าไปถึงกฎธุรกิจ
 *
 * ผลที่ตามมาไม่ใช่แค่การอ่านข้อมูลของคนอื่น — มันทำให้การมอบหมายของคนจัดคิวไม่มี
 * ความหมาย และไม่มีใครตอบได้ว่าใครควรเป็นคนตัดสินใบนั้น
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'routes', 'api', 'provider', 'document-reviews.js');

describe('document-reviews ตรวจการมอบหมายก่อนให้ทำอะไรกับใบ', () => {
    let src;
    beforeAll(() => { src = fs.readFileSync(FILE, 'utf8'); });

    it('มีตัวตรวจอยู่จริง', () => {
        expect(src).toContain('refuseIfNotTheAssignedReviewer');
    });

    it('ใบที่ยังไม่มอบหมาย ไม่มีใครตรวจได้: ผ่านเฉพาะเมื่อ reviewerId ตรงกับผู้เรียก', () => {
        expect(src).not.toMatch(/if \(!application\?\.reviewerId\) \{ return false; \}/);
        expect(src).toMatch(/if \(application\?\.reviewerId && application\.reviewerId === req\.user\?\.id\) \{ return false; \}/);
    });

    it('ผู้ดูแลระบบอ่านได้อย่างเดียว: ข้ามได้เฉพาะประตูอ่าน ไม่ข้ามประตูบันทึกผล', () => {
        expect(src).toMatch(/actorRole === CANONICAL_ROLES\.SYSTEM_ADMIN_DTAM/);
        expect(src).toMatch(/if \(isAdmin && !write\) \{ return false; \}/);
        const reads = (src.match(/refuseIfNotTheAssignedReviewer\(req, res, loaded\.application, \{ write: false \}\)/g) || []).length;
        const writes = (src.match(/refuseIfNotTheAssignedReviewer\(req, res, loaded\.application, \{ write: true \}\)/g) || []).length;
        expect({ reads, writes }).toEqual({ reads: 1, writes: 2 });
    });

    it('ทุกประตูที่เรียก loadCheck ต้องตรวจการมอบหมายต่อทันที', () => {
        // นับเฉพาะ "การเรียก" ไม่ใช่ "การประกาศ" — รอบแรกผมนับรวมบรรทัด
        // `function refuseIfNotTheAssignedReviewer(req, res, application) {` เข้าไปด้วย
        // เทสจึงผ่านทั้งที่ประตูที่สามยังไม่มีการตรวจ · เทสที่แดงไม่ได้ ไม่ได้เฝ้าอะไร
        const loads = (src.match(/await loadCheck\(req\.params\.id[,)]/g) || []).length;
        const guards = (src.match(/if \(refuseIfNotTheAssignedReviewer\(req, res,/g) || []).length;
        expect({ loads, guards }).toEqual({ loads, guards: loads });
    });

    it('มีอย่างน้อยสามประตูที่ถูกเฝ้า (อ่าน · ให้ผลรายเอกสาร · ตัดสินรวม)', () => {
        const guards = (src.match(/if \(refuseIfNotTheAssignedReviewer\(req, res,/g) || []).length;
        expect(guards).toBeGreaterThanOrEqual(3);
    });
});
