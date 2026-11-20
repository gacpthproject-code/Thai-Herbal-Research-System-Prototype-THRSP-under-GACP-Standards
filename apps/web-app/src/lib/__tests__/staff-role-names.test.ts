/**
 * One Thai name per staff role on every label source (operator orders 27 and 29): the dispatcher
 * is "ผู้จัดคิว" and the field inspector is "ผู้ตรวจพื้นที่". The superseded names ("ผู้จัดสรรงานและคิวตรวจ",
 * "ผู้จัดตาราง", "ผู้ประสานงาน", "ผู้ตรวจประเมินแปลง") must not come back on any of them.
 */
import { ROLE_LABELS_TH, ROLE_LABELS_WITH_ICON, getRoleDisplayName } from '@/lib/role-utils';
import { ADMIN_ROLE_OPTIONS } from '@/lib/constants/admin-role-options';

const NAMES: Record<string, string> = { dispatcher: 'ผู้จัดคิว', field_inspector: 'ผู้ตรวจพื้นที่', document_reviewer: 'ผู้ตรวจเอกสาร' };
const RETIRED = /ผู้จัดสรรงานและคิวตรวจ|ผู้จัดตาราง|ผู้ประสานงาน|ผู้ตรวจประเมินแปลง|ผู้ตรวจเอกสาร\/ตรวจประเมิน/;

describe('staff role names', () => {
    it.each(Object.entries(NAMES))('%s reads the same on every label source', (role, name) => {
        expect(ROLE_LABELS_TH[role]).toBe(name);
        expect(ROLE_LABELS_WITH_ICON[role].label).toBe(name);
        expect(getRoleDisplayName(role)).toBe(name);
        expect(ADMIN_ROLE_OPTIONS.find((option) => option.value === role)?.label).toBe(name);
    });

    it('no superseded name is left on a label source', () => {
        const labels = [
            ...Object.values(ROLE_LABELS_TH),
            ...Object.values(ROLE_LABELS_WITH_ICON).map((entry) => entry.label),
            ...ADMIN_ROLE_OPTIONS.map((option) => option.label),
        ];
        expect(labels.filter((label) => RETIRED.test(label))).toEqual([]);
    });
});
