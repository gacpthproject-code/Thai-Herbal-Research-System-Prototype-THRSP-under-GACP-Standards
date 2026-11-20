/**
 * /health/profile/privacy offers one way to have account data erased: the two-step request at
 * /health/account/erasure. The older one-step "ลบบัญชีของฉัน" card is gone; its door only set
 * isDeleted and cleared nothing (privacy notice v1.4 §7 item 1).
 *
 * The page still says what erasure means: the confirm link arrives as an in-app notification
 * (no email is sent), and an erased account cannot be recovered (operator 2026-09-17
 * "เราไม่มีการกู้บัญชี").
 */
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/lib/api/api-client', () => ({ apiClient: { getBlob: jest.fn(), delete: jest.fn() } }));

import HealthPrivacyPage from '../page';

describe('HealthPrivacyPage — one erasure path', () => {
  const html = renderToStaticMarkup(<HealthPrivacyPage />);

  it('links to the two-step erasure request', () => {
    expect(html).toContain('href="/health/account/erasure"');
  });

  it('has no one-step delete card, password field or delete button', () => {
    expect(html).not.toContain('วิธีเดิม');
    expect(html).not.toContain('delete-password');
    expect(html).not.toContain('เริ่มขั้นตอนลบบัญชี');
  });

  it('says the confirm link comes as an in-app notification, not an email', () => {
    expect(html).toContain('การแจ้งเตือนในระบบ');
    expect(html).not.toContain('อีเมล');
  });

  it('says an erased account cannot be recovered', () => {
    expect(html).toContain('ระบบไม่มีการกู้บัญชี');
  });
});
