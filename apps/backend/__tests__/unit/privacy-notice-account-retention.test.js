'use strict';

const fs = require('fs');
const path = require('path');

const REWRITE_SECTION_7 =
    'ระยะเก็บบัญชีผู้ใช้งานเปลี่ยนไปแล้ว ต้องแก้ข้อ 7 รายการที่ 1 ของหน้านโยบายความเป็นส่วนตัว '
    + '(apps/web-app/src/app/(marketing)/privacy-policy/page.tsx "จัดเก็บไม่เกิน 5 ปีนับจากวันสร้างบัญชี") ในการเปลี่ยนแปลงเดียวกัน';

function userRetainUntilDefault() {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema/auth.prisma'), 'utf8');
    const user = /^model User \{\n([\s\S]*?)^\}/m.exec(schema);
    if (!user) {
        throw new Error('model User is no longer in prisma/schema/auth.prisma');
    }
    const column = /^\s*retainUntil\s+DateTime\s+(.+)$/m.exec(user[1]);
    if (!column) {
        throw new Error('User.retainUntil is no longer declared in prisma/schema/auth.prisma');
    }
    return column[1].trim();
}

describe('privacy notice section 7 item 1: account data is kept 5 years from account creation', () => {
    test('User.retainUntil defaults to five years after the row is created', () => {
        try {
            expect(userRetainUntilDefault()).toBe(`@default(dbgenerated("(now() + '5 years'::interval)"))`);
        } catch (err) {
            err.message = `${REWRITE_SECTION_7}\n\n${err.message}`;
            throw err;
        }
    });
});
