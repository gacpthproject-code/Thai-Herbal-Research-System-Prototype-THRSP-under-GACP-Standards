'use strict';

const { HOLDER_TYPES } = require('../shared/holder-registry');

const REGISTRATION = Object.freeze({
    INDIVIDUAL: '1101700203451',
    JURISTIC: '0105561000017',
    PARTNERSHIP: '0103561000017',
    COMMUNITY_ENTERPRISE: '1-10-01-01/1-0001',
});

const CONTACT = Object.freeze({ address: '99 หมู่ 1 ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540', phone: '0812345678' });
const PERSON = Object.freeze({ title: 'นาย', firstName: 'สมชาย', lastName: 'ปลูกดี', nationality: 'ไทย' });
const SIGNATORY = Object.freeze({ title: 'นาง', firstName: 'สมหญิง', lastName: 'ลงนาม', idCard: '3101700203452', nationality: 'ไทย' });

function completeHolderPayload(type) {
    const def = HOLDER_TYPES[type];
    const holder = { contact: { ...CONTACT } };
    if (def.signatory === 'SELF') { holder.person = { ...PERSON }; } else { holder.signatory = { ...SIGNATORY }; }
    if (def.houseCode) { holder.houseCode = '1001-000001-1'; }
    return { holder };
}

function completeHolderEntity(type, fields = {}) {
    const def = HOLDER_TYPES[type];
    return {
        type,
        displayName: def.signatory === 'SELF' ? 'นาย สมชาย ปลูกดี' : `${def.labelTh}ทดสอบ`,
        [def.registration.column]: REGISTRATION[type],
        payload: completeHolderPayload(type),
        ...fields,
    };
}

module.exports = { completeHolderEntity, completeHolderPayload };
