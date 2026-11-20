import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage from '../page';

function recipientsSection(): string {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  return root.querySelector('#recipients')?.textContent ?? '';
}

describe('§6 names the payment provider in Thai words', () => {
  const recipients = recipientsSection();

  it('drops "Payment Gateway" and "PCI-DSS"', () => {
    expect(recipients).not.toMatch(/Payment Gateway|PCI/i);
  });

  it('says in Thai what the provider does: takes the service fee by PromptPay (order 80(2))', () => {
    expect(recipients).toContain('ผู้ให้บริการรับชำระเงิน เพื่อประมวลผลการชำระค่าบริการผ่านพร้อมเพย์');
  });
});
