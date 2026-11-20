'use strict';

/**
 * The system-settings page reads each row's group heading and Thai description from the
 * catalog the platform owns, not from whatever text was seeded into the row.
 *
 * Staging walk ccc4f707d (F9): the one group heading read "undefined" (the page grouped by a
 * `group` column the table has never had) and most descriptions were the English seed strings.
 */

const { presentSystemConfig, SYSTEM_CONFIG_GROUPS_TH } = require('../../shared/system-config-catalog');

describe('presentSystemConfig', () => {
    it('groups a known key and describes it in Thai, whatever the row says', () => {
        const row = presentSystemConfig({ key: 'feature_registration_enabled', value: 'true', type: 'BOOLEAN', description: 'Allow new Applicant registrations' });
        expect(row.group).toBe(SYSTEM_CONFIG_GROUPS_TH.registration);
        expect(row.description).toBe('เปิดรับสมัครผู้ยื่นคำขอรายใหม่');
        expect(row.description).not.toMatch(/[A-Za-z]{3,}/);
    });

    it('groups the certificate-number keys the number script sets, keeping the script\'s own Thai text', () => {
        const row = presentSystemConfig({ key: 'certificate.number.year-start', value: '61', type: 'STRING', description: 'ค่าตั้งเลขใบรับรอง (คำสั่ง 134)' });
        expect(row.group).toBe(SYSTEM_CONFIG_GROUPS_TH.certificateNumber);
        expect(row.description).toBe('ค่าตั้งเลขใบรับรอง (คำสั่ง 134)');
    });

    it('never hands the page an undefined group: an unknown key lands in อื่น ๆ with its stored text', () => {
        const row = presentSystemConfig({ key: 'some.future_key', value: 'x', type: 'STRING', description: 'stored text' });
        expect(row.group).toBe(SYSTEM_CONFIG_GROUPS_TH.other);
        expect(row.description).toBe('stored text');
    });

    it('speaks to the DTAM admin, never in the team\'s own notes (review M5)', () => {
        const { SYSTEM_CONFIG_CATALOG } = require('../../shared/system-config-catalog');
        for (const entry of Object.values(SYSTEM_CONFIG_CATALOG)) {
            expect(entry.descriptionTh || '').not.toMatch(/รอทีม|ทีมอื่น|TODO/);
        }
        expect(SYSTEM_CONFIG_CATALOG['feature.permit_forms'].descriptionTh).toBe('แสดงแบบฟอร์มใบอนุญาต ภ.ท.09/10/11/12');
    });

    it('tells the page a BOOLEAN row\'s switch state from the stored text, by the words the public door accepts', () => {
        const stored = (value, type = 'BOOLEAN') => presentSystemConfig({ key: 'feature.task_router', value, type, description: null }).enabled;
        expect(['true', 'on', '1', 'yes'].map((v) => stored(v))).toEqual([true, true, true, true]);
        expect(['false', 'off', '0', 'maybe'].map((v) => stored(v))).toEqual([false, false, false, false]);
        expect(stored('02-123-4567', 'STRING')).toBeNull();
    });

    it('keeps the row\'s own fields', () => {
        const row = presentSystemConfig({ key: 'feature.task_router', value: 'false', type: 'BOOLEAN', description: null, updatedAt: 'x' });
        expect(row).toMatchObject({ key: 'feature.task_router', value: 'false', type: 'BOOLEAN', updatedAt: 'x' });
    });
});
