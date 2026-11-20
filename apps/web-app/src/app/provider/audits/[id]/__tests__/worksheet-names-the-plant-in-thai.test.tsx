import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/lib/api/api-client', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('@/lib/hooks/use-signed-file-url', () => ({ useSignedFileUrl: () => ({ url: null, loading: false, error: null }) }));

import { AuditApplicationTabPanel } from '../audit-application-tab-panel';

const base = { id: 'app-1', applicationNumber: 'APP-1', status: 'AUDIT_CONFIRMED', createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z', formData: { plantId: 'kratom', areaType: 'OUTDOOR' } };

async function summaryOf(application: React.ComponentProps<typeof AuditApplicationTabPanel>['application']): Promise<string> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(<AuditApplicationTabPanel application={application} attachments={[]} />);
    });
    const shown = container.textContent || '';
    act(() => root.unmount());
    container.remove();
    return shown;
}

describe('the worksheet summary names the plant by the herb register', () => {
    it('prints the register name, the cultivation type and the province from the server scope', async () => {
        const shown = await summaryOf({ ...base, scope: { plantName: 'กระท่อม', cultivationTypes: ['กลางแจ้ง'], province: 'นนทบุรี' } });
        expect(shown).toContain('กระท่อม');
        expect(shown).toContain('กลางแจ้ง');
        expect(shown).toContain('นนทบุรี');
        expect(shown).not.toContain('kratom');
        expect(shown).not.toContain('OUTDOOR');
    });

    it('a plant the register does not know reads as not recorded, never as the filed code', async () => {
        const shown = await summaryOf({ ...base, scope: { plantName: null, cultivationTypes: [], province: null } });
        expect(shown).toContain('ไม่ได้บันทึก');
        expect(shown).not.toContain('kratom');
    });
});
