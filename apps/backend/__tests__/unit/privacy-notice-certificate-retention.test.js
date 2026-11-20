'use strict';

const fs = require('fs');
const path = require('path');

const REWRITE_SECTION_7 =
    'ระยะเก็บใบรับรองเปลี่ยนไปแล้ว ต้องแก้ข้อ 7 รายการที่ 3 ของหน้านโยบายความเป็นส่วนตัว '
    + '(apps/web-app/src/app/(marketing)/privacy-policy/page.tsx "จัดเก็บไม่น้อยกว่า 5 ปีนับจากวันออกใบรับรอง") ในการเปลี่ยนแปลงเดียวกัน';

function certificateRetainUntilDefault() {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema/certification.prisma'), 'utf8');
    const certificate = /^model Certificate \{\n([\s\S]*?)^\}/m.exec(schema);
    if (!certificate) {
        throw new Error('model Certificate is no longer in prisma/schema/certification.prisma');
    }
    const column = /^\s*retainUntil\s+DateTime\s+(.+)$/m.exec(certificate[1]);
    if (!column) {
        throw new Error('Certificate.retainUntil is no longer declared in prisma/schema/certification.prisma');
    }
    return column[1].trim();
}

describe('privacy notice section 7 item 3: the name and address on a certificate are kept 5 years from issue', () => {
    test('Certificate.retainUntil defaults to five years after the certificate row is created at issuance', () => {
        try {
            expect(certificateRetainUntilDefault()).toBe(`@default(dbgenerated("(now() + '5 years'::interval)"))`);
        } catch (err) {
            err.message = `${REWRITE_SECTION_7}\n\n${err.message}`;
            throw err;
        }
    });
});
