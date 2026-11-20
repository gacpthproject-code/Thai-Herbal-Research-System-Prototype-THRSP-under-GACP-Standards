'use strict';

/**
 * คำไทยของบทบาทเจ้าหน้าที่ ตามมติ role vocabulary 2026-09-10 และคำสั่ง 27, 29 (ผู้จัดคิว ผู้ตรวจพื้นที่)
 * ที่เดียวสำหรับทะเบียนรายชื่อ สคริปต์ ops และข้อความแจ้งเตือนถึงผู้ดูแลระบบ
 */

const { CANONICAL_ROLES, normalizeRole } = require('./canonical-rbac');

const STAFF_ROLE_LABELS_TH = Object.freeze({
    [CANONICAL_ROLES.DOCUMENT_REVIEWER]: 'ผู้ตรวจเอกสาร',
    [CANONICAL_ROLES.DISPATCHER]: 'ผู้จัดคิว',
    [CANONICAL_ROLES.FIELD_INSPECTOR]: 'ผู้ตรวจพื้นที่',
    [CANONICAL_ROLES.CERTIFICATE_APPROVER]: 'ผู้อนุมัติใบรับรอง',
    [CANONICAL_ROLES.FINANCE_OFFICER_DTAM]: 'การเงินฝั่งกรม',
    [CANONICAL_ROLES.SYSTEM_ADMIN_DTAM]: 'ผู้ดูแลระบบฝั่งกรม',
    [CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM]: 'การเงินฝั่งบริษัท',
    [CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM]: 'ผู้ดูแลระบบฝั่งบริษัท',
});

const STAFF_ROLES = Object.freeze(Object.keys(STAFF_ROLE_LABELS_TH));

const staffRoleLabel = (role) => STAFF_ROLE_LABELS_TH[normalizeRole(role)] || String(role || '');

module.exports = { STAFF_ROLE_LABELS_TH, STAFF_ROLES, staffRoleLabel };
