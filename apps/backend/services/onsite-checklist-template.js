'use strict';

const DEFAULT_MIN_PHOTOS = 5;

/**
 * GACP-PRD §6 checklist template (versioned).  Each item has:
 *   - itemCode    : stable identifier (e.g. '4.1' = cultivation practices)
 *   - section     : top-level section
 *   - prompt      : Thai-language prompt shown to the auditor
 *   - isCritical  : a single FAIL on a critical item forces overall FAIL
 *   - maxPoints   : scoring weight (used by the upstream scoring service)
 *
 * The dataset below is the GACP-PRD §6 reduced template (24 items).
 */
const CHECKLIST_TEMPLATE_2026 = Object.freeze([
    // 1. Site selection (เลือกที่ตั้งฟาร์ม) — GACP-PRD §6.1
    { itemCode: '1.1', section: 'SITE_SELECTION', prompt: 'พื้นที่ปลอดจากแหล่งปนเปื้อน', isCritical: true, maxPoints: 5 },
    { itemCode: '1.2', section: 'SITE_SELECTION', prompt: 'แปลงปลูกห่างจากแหล่งน้ำเสีย', isCritical: false, maxPoints: 3 },
    // 2. Water source (แหล่งน้ำ) — GACP-PRD §6.2
    { itemCode: '2.1', section: 'WATER_SOURCE', prompt: 'แหล่งน้ำมีผลตรวจคุณภาพ', isCritical: true, maxPoints: 5 },
    { itemCode: '2.2', section: 'WATER_SOURCE', prompt: 'ระบบกรองน้ำได้รับการบำรุงรักษา', isCritical: false, maxPoints: 3 },
    // 3. Seed source (แหล่งพันธุ์) — GACP-PRD §6.3
    { itemCode: '3.1', section: 'SEED_SOURCE', prompt: 'แหล่งพันธุ์มีเอกสารรับรอง', isCritical: true, maxPoints: 5 },
    { itemCode: '3.2', section: 'SEED_SOURCE', prompt: 'มีการจดทะเบียน ภพ.4', isCritical: false, maxPoints: 3 },
    // 4. Cultivation practices (การปลูก) — GACP-PRD §6.4
    { itemCode: '4.1', section: 'CULTIVATION', prompt: 'มีบันทึกการปลูกตามรอบ', isCritical: true, maxPoints: 5 },
    { itemCode: '4.2', section: 'CULTIVATION', prompt: 'การจัดการศัตรูพืชเป็นไปตาม IPM', isCritical: false, maxPoints: 3 },
    { itemCode: '4.3', section: 'CULTIVATION', prompt: 'การใช้ปุ๋ยมีบันทึกครบถ้วน', isCritical: false, maxPoints: 3 },
    // 5. Harvesting (การเก็บเกี่ยว) — GACP-PRD §6.5
    { itemCode: '5.1', section: 'HARVESTING', prompt: 'การเก็บเกี่ยวเป็นไปตามมาตรฐาน', isCritical: true, maxPoints: 5 },
    { itemCode: '5.2', section: 'HARVESTING', prompt: 'เครื่องมือเก็บเกี่ยวสะอาด', isCritical: false, maxPoints: 3 },
    // 6. Post-harvest (หลังเก็บเกี่ยว) — GACP-PRD §6.6
    { itemCode: '6.1', section: 'POST_HARVEST', prompt: 'มีการตากแห้งในสภาพที่ควบคุม', isCritical: true, maxPoints: 5 },
    { itemCode: '6.2', section: 'POST_HARVEST', prompt: 'การคัดแยกตามคุณภาพ', isCritical: false, maxPoints: 3 },
    // 7. Storage (จัดเก็บ) — GACP-PRD §6.7
    { itemCode: '7.1', section: 'STORAGE', prompt: 'ห้องจัดเก็บแห้งและสะอาด', isCritical: true, maxPoints: 5 },
    { itemCode: '7.2', section: 'STORAGE', prompt: 'มีระบบควบคุมศัตรูพืชในที่จัดเก็บ', isCritical: false, maxPoints: 3 },
    // 8. Documentation (เอกสาร) — GACP-PRD §6.8
    { itemCode: '8.1', section: 'DOCUMENTATION', prompt: 'มีบันทึกการดำเนินงานครบถ้วน', isCritical: true, maxPoints: 5 },
    { itemCode: '8.2', section: 'DOCUMENTATION', prompt: 'เอกสารผ่านการตรวจสอบย้อนหลัง', isCritical: false, maxPoints: 3 },
    // 9. Personnel hygiene (สุขอนามัยบุคลากร) — GACP-PRD §6.9
    { itemCode: '9.1', section: 'PERSONNEL_HYGIENE', prompt: 'บุคลากรมีการฝึกอบรม', isCritical: true, maxPoints: 5 },
    { itemCode: '9.2', section: 'PERSONNEL_HYGIENE', prompt: 'ไม่มีการสูบบุหรี่ในแปลงปลูก', isCritical: false, maxPoints: 3 },
    // 10. Traceability (ตรวจสอบย้อนกลับ) — GACP-PRD §6.10
    { itemCode: '10.1', section: 'TRACEABILITY', prompt: 'รหัสติดตามล็อตผลิตชัดเจน', isCritical: true, maxPoints: 5 },
    { itemCode: '10.2', section: 'TRACEABILITY', prompt: 'มี QR หรือเลขอ้างอิงทุกชุดสินค้า', isCritical: false, maxPoints: 3 },
    // 11. Facilities (อาคารและสิ่งอำนวยความสะดวก) — GACP-PRD §6.11
    { itemCode: '11.1', section: 'FACILITIES', prompt: 'มีห้องน้ำและสุขาที่ถูกสุขลักษณะ', isCritical: false, maxPoints: 3 },
    { itemCode: '11.2', section: 'FACILITIES', prompt: 'จัดการของเสียอย่างเหมาะสม', isCritical: false, maxPoints: 3 },
    // 12. Training records (บันทึกฝึกอบรม) — GACP-PRD §6.12
    { itemCode: '12.1', section: 'TRAINING', prompt: 'มีบันทึกการฝึกอบรมประจำปี', isCritical: false, maxPoints: 3 },
]);

const TEMPLATE_VERSION = '2026-05';

module.exports = { DEFAULT_MIN_PHOTOS, CHECKLIST_TEMPLATE_2026, TEMPLATE_VERSION };
