'use strict';

/**
 * คำสั่ง 105 ข้อ 4: การตัด session ทั้งชุดรันได้เฉพาะเหตุการณ์ที่อนุมัติ (flag-on, mfa-clear, mfa-move) และสคริปต์เปิดธง
 * เป็นผู้เรียก flag-on เท่านั้น
 */

const { refusal, parseArgs, SESSION_REVOKE_EVENTS } = require('../../scripts/ops/staff-sessions-revoke-at-flag-on');

const on = { REQUIRE_MFA_FOR_PRIVILEGED: 'true' };

describe('approved session-revoke events', () => {
    test('are exactly the three the operator named, each owned by one place', () => {
        expect(SESSION_REVOKE_EVENTS).toEqual({
            'flag-on': 'scripts/ops/staff-sessions-revoke-at-flag-on.js',
            'mfa-clear': 'scripts/ops/staff-2fa-emergency-reset.js',
            'mfa-move': 'routes/api/identity/mfa.js',
        });
    });

    test('flag-on with the flag on is the only run this script accepts', () => {
        expect(refusal(on, 'flag-on')).toBeNull();
        expect(refusal({ REQUIRE_MFA_FOR_PRIVILEGED: 'false' }, 'flag-on')).toMatch(/REQUIRE_MFA_FOR_PRIVILEGED ยังไม่เปิด/);
    });

    test.each([
        ['', /ต้องระบุ --event/],
        ['deploy', /deploy ไม่อยู่ในรายการที่อนุมัติ/],
        ['mfa-clear', /mfa-clear ตัด session ที่ scripts\/ops\/staff-2fa-emergency-reset\.js ไม่ใช่สคริปต์นี้/],
        ['mfa-move', /mfa-move ตัด session ที่ routes\/api\/identity\/mfa\.js ไม่ใช่สคริปต์นี้/],
    ])('event %j is refused even with the flag on', (event, reason) => {
        expect(refusal(on, event)).toMatch(reason);
    });

    test('order 108(1): flag-off records a rollback only once the flag reads off, and is not a session-revoke event', () => {
        expect(refusal({ REQUIRE_MFA_FOR_PRIVILEGED: 'false' }, 'flag-off')).toBeNull();
        expect(refusal({}, 'flag-off')).toBeNull();
        expect(refusal(on, 'flag-off')).toMatch(/REQUIRE_MFA_FOR_PRIVILEGED ยังเปิดอยู่/);
        expect(SESSION_REVOKE_EVENTS['flag-off']).toBeUndefined();
    });

    test('--event and --note are the only options and both need a value', () => {
        expect(parseArgs(['--event', 'flag-on', '--note', 'deploy ref'])).toEqual({ args: { event: 'flag-on', note: 'deploy ref' } });
        expect(parseArgs([]).args).toEqual({ event: '', note: '' });
        expect(parseArgs(['--event']).error).toMatch(/--event ต้องมีค่า/);
        expect(parseArgs(['--force']).error).toMatch(/ไม่รู้จักตัวเลือก --force/);
    });
});
