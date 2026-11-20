/**
 * The research dataset page: only system_admin_dtam may export (criteria G10).
 * The exporter needs a way in, and a tile shown to a role that cannot export
 * must not promise an export.
 */
import { describe, expect, it } from '@jest/globals';

import { getNavForRole } from '../nav-config';

const tileOf = (role: Parameters<typeof getNavForRole>[0]) => getNavForRole(role).find((i) => i.path === '/provider/datasets');

describe('datasets tile matches who may export', () => {
    it('system_admin_dtam, the only exporter, has the tile and it says export', () => {
        const tile = tileOf('system_admin_dtam');
        expect(tile?.tier).toBe('secondary');
        expect(tile?.descTH).toContain('ส่งออก');
    });

    it.each(['field_inspector', 'document_reviewer'] as const)('%s keeps the reference tile, which does not promise an export', (role) => {
        const tile = tileOf(role);
        expect(tile).toBeDefined();
        expect(tile?.descTH).not.toContain('ส่งออก');
    });
});
