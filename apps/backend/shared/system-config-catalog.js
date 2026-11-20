'use strict';

/** system_configs has no group column, so the settings page's grouping lives here. */

const SYSTEM_CONFIG_GROUPS_TH = Object.freeze({
    certificateNumber: 'เลขที่ใบรับรอง',
    registration: 'การสมัครและการเข้าใช้',
    services: 'บริการที่เปิดให้ยื่น',
    features: 'หน้าจอและเครื่องมือของผู้ยื่น',
    contact: 'ข้อมูลติดต่อ',
    appeal: 'การอุทธรณ์',
    other: 'อื่น ๆ',
});

const G = SYSTEM_CONFIG_GROUPS_TH;

const SYSTEM_CONFIG_CATALOG = Object.freeze({
    'certificate.number.format': { group: G.certificateNumber, descriptionTh: null },
    'certificate.number.year-start': { group: G.certificateNumber, descriptionTh: null },
    'certificate.number.new-year-rule': { group: G.certificateNumber, descriptionTh: null },
    'appeal.setup': { group: G.appeal, descriptionTh: null },

    registration_open: { group: G.registration, descriptionTh: 'เปิดรับสมัครผู้ใช้รายใหม่' },
    feature_registration_enabled: { group: G.registration, descriptionTh: 'เปิดรับสมัครผู้ยื่นคำขอรายใหม่' },
    system_maintenance_mode: { group: G.registration, descriptionTh: 'โหมดปิดปรับปรุงระบบ (ผู้ใช้ที่ไม่ใช่ผู้ดูแลระบบเข้าใช้ไม่ได้)' },
    relaxed_validation: { group: G.registration, descriptionTh: 'ผ่อนปรนการตรวจความครบถ้วนของคำขอ (ใช้เฉพาะทดสอบ)' },

    service_gacp: { group: G.services, descriptionTh: 'เปิดให้ยื่นขอรับรอง GACP' },
    service_organic: { group: G.services, descriptionTh: 'เปิดให้ยื่นขอรับรองเกษตรอินทรีย์' },
    service_organic_enabled: { group: G.services, descriptionTh: 'เปิดให้ยื่นขอรับรองเกษตรอินทรีย์' },

    marketing_banner: { group: G.features, descriptionTh: 'แสดงแถบประชาสัมพันธ์บนหน้าหลักของผู้ยื่น' },
    marketing_banner_active: { group: G.features, descriptionTh: 'แสดงแถบประชาสัมพันธ์บนหน้าหลักของผู้ยื่น' },
    'feature.task_router': { group: G.features, descriptionTh: 'แสดงหน้าเลือกงานที่ต้องการทำก่อนเข้าบริการ' },
    'feature.readiness_check': { group: G.features, descriptionTh: 'แสดงการตรวจความพร้อมก่อนยื่นคำขอ' },
    'feature.document_repo': { group: G.features, descriptionTh: 'แสดงหน้าเอกสารของฉัน' },
    'feature.sop_library': { group: G.features, descriptionTh: 'แสดงคลังแบบฟอร์ม SOP 8 หมวดให้ดาวน์โหลด' },
    'feature.report_center': { group: G.features, descriptionTh: 'แสดงศูนย์รายงานสำหรับส่งรายงานรายเดือน ภ.ท.27/28' },
    'feature.official_templates': { group: G.features, descriptionTh: 'แสดงหน้าเอกสารทางการ' },
    'feature.export_documents': { group: G.features, descriptionTh: 'แสดงเอกสารส่งออก (ยังไม่เปิดใช้)' },
    'feature.permit_forms': { group: G.features, descriptionTh: 'แสดงแบบฟอร์มใบอนุญาต ภ.ท.09/10/11/12' },

    contact_support_phone: { group: G.contact, descriptionTh: 'หมายเลขโทรศัพท์ฝ่ายสนับสนุนที่แสดงท้ายหน้าเว็บ' },
});

const TRUE_WORDS = new Set(['true', '1', 'yes', 'on']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'off']);

/** The stored text as a value: a true/false word becomes a boolean, anything else stays as stored. */
function parseConfigValue(rawValue) {
    if (typeof rawValue === 'boolean' || typeof rawValue === 'number') { return rawValue; }
    const word = String(rawValue ?? '').trim().toLowerCase();
    if (TRUE_WORDS.has(word)) { return true; }
    if (FALSE_WORDS.has(word)) { return false; }
    return rawValue;
}

function descriptionTh(key, stored = null) {
    const entry = SYSTEM_CONFIG_CATALOG[key];
    return entry && entry.descriptionTh ? entry.descriptionTh : stored;
}

function presentSystemConfig(row) {
    const entry = SYSTEM_CONFIG_CATALOG[row.key];
    return {
        ...row,
        group: entry ? entry.group : G.other,
        description: descriptionTh(row.key, row.description),
        enabled: row.type === 'BOOLEAN' ? parseConfigValue(row.value) === true : null,
    };
}

module.exports = { SYSTEM_CONFIG_GROUPS_TH, SYSTEM_CONFIG_CATALOG, parseConfigValue, descriptionTh, presentSystemConfig };
