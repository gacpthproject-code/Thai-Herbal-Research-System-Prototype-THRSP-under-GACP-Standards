'use strict';

// ผลตรวจน้ำและผลตรวจดินไม่บังคับตอนยื่น (คำสั่ง 159 ข้อ b, 2026-11-04) จึงไม่นับในภาพรวมความพร้อม
const DOCUMENTS_HREF = '/health/documents';
const LAB_REPORT_SLOTS = new Set(['WATER_TEST', 'SOIL_TEST']);

function buildApplicantReadiness({ user, farms, sopDocuments, documents }) {
    const filledSlots = documents.map((doc) => doc.documentType);
    const sopSlots = filledSlots.filter((slot) => slot.startsWith('SOP_'));
    const supportingSlots = filledSlots.filter((slot) => !slot.startsWith('SOP_') && !LAB_REPORT_SLOTS.has(slot));

    const items = [
        { id: 'profile', label: 'ข้อมูลโปรไฟล์ครบถ้วน', description: 'ชื่อ-นามสกุล, เลขบัตรประชาชน, ที่อยู่', ready: !!(user?.firstName && user?.lastName), actionHref: '/health/profile', actionLabel: 'แก้ไขโปรไฟล์' },
        { id: 'farm', label: 'ลงทะเบียนสถานประกอบการ/แปลงปลูก', description: 'มีสถานประกอบการหรือแปลงปลูกในทะเบียนของคุณอย่างน้อย 1 แห่ง', ready: farms.length > 0, actionHref: '/health/establishments/new', actionLabel: 'ลงทะเบียนสถานประกอบการ' },
        { id: 'sop', label: 'เตรียม SOP (มาตรฐานการปฏิบัติงาน)', description: 'จัดทำ SOP การปลูก, เก็บเกี่ยว, ตากแห้ง, สุขลักษณะ ด้วยเครื่องมือสร้าง SOP หรืออัปโหลดในคำขอ', ready: sopSlots.length > 0 || sopDocuments.length > 0, actionHref: '/health/sop-templates', actionLabel: 'ดาวน์โหลดแบบฟอร์ม SOP' },
        { id: 'documents', label: 'เอกสารประกอบ', description: 'สำเนาบัตรประชาชน, ทะเบียนบ้าน, แผนที่สถานที่ปลูก ที่อัปโหลดในคำขอที่เปิดอยู่', ready: supportingSlots.length >= 2, actionHref: DOCUMENTS_HREF, actionLabel: 'จัดการเอกสาร' },
        { id: 'water_test', label: 'ผลตรวจคุณภาพน้ำ', description: 'รายงานผลตรวจน้ำจากห้องปฏิบัติการที่ได้รับการรับรอง ไม่บังคับตอนยื่น', ready: filledSlots.includes('WATER_TEST'), optional: true, actionHref: DOCUMENTS_HREF, actionLabel: 'อัปโหลดผลตรวจ' },
        { id: 'soil_test', label: 'รายงานผลตรวจดินจากห้องปฏิบัติการ', description: 'รายงานผลวิเคราะห์ดินที่คุณส่งตัวอย่างไปตรวจเองแล้วอัปโหลด ไม่บังคับตอนยื่น ระบบไม่ถามจากผู้ที่ปลูกในอาคารระบบปิดแบบไม่ใช้ดินอย่างเดียว', ready: filledSlots.includes('SOIL_TEST'), optional: true, actionHref: DOCUMENTS_HREF, actionLabel: 'อัปโหลดผลตรวจ' },
    ];

    const counted = items.filter((item) => !item.optional);
    const readyCount = counted.filter((item) => item.ready).length;
    return { ready: readyCount === counted.length, items, readyCount, totalCount: counted.length };
}

module.exports = { buildApplicantReadiness };
