'use strict';

const crypto = require('crypto');

function certificateRow({ applicationId, userId, farmId, organizationId }, overrides = {}) {
    const unique = crypto.randomUUID().slice(0, 8);
    return {
        certificateNumber: `TH-GACP ${unique}`,
        verificationCode: `V-${unique}`,
        qrData: 'qr',
        applicationId,
        userId,
        farmId,
        organizationId,
        farmName: 'ฟาร์มทดสอบ',
        applicantName: 'ทดสอบ',
        cropType: 'cannabis',
        farmSize: 1,
        province: 'สมุทรปราการ',
        district: 'บางพลี',
        subDistrict: 'บางพลีใหญ่',
        standardId: 'std',
        standardName: 'GACP',
        validityMonths: 12,
        expiryDate: new Date(Date.now() + 60 * 86400e3),
        issuedBy: 'SYSTEM',
        status: 'active',
        ...overrides,
    };
}

module.exports = { certificateRow };
