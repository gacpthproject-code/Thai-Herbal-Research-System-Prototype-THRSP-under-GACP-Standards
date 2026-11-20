import { renderToStaticMarkup } from 'react-dom/server';
import { PAYMENT_CHANNEL_TH } from '@/constants/service-facts';
import PrivacyPolicyPage from '../page';

function renderPage(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  return root;
}

describe('the notice says the platform takes PromptPay only, and nothing that suggests cards (order 80(2))', () => {
  const root = renderPage();
  const dataCategories = Array.from(root.querySelectorAll('#data-categories li'), (li) => li.textContent ?? '');
  const paymentData = dataCategories.find((line) => line.startsWith('ข้อมูลการชำระเงิน:')) ?? '';

  it('names cards only to say they are not accepted', () => {
    const rest = (root.textContent ?? '').split('ไม่รับบัตร').join(' ');
    expect(Array.from(rest.matchAll(/\S*(บัตร|PCI)\S*/g), (m) => m[0])).toEqual([]);
  });

  it('§4 says which payment data is kept, and that paying the service fee stores no bank account number', () => {
    expect(paymentData).toBe(
      'ข้อมูลการชำระเงิน: หมายเลขอ้างอิงการชำระเงินจากผู้ให้บริการรับชำระเงิน ใบเสร็จ และใบกำกับภาษี ระบบรับชำระเงินผ่านพร้อมเพย์เท่านั้น ไม่รับบัตร และไม่จัดเก็บเลขบัญชีธนาคารของผู้ชำระเงินจากการชำระค่าบริการ',
    );
  });

  it('§4 says a refund needs a bank account the applicant sends by email, used for that transfer only (payment terms v1.3 §7.4)', () => {
    expect(dataCategories).toContain(
      'ข้อมูลการคืนเงิน: เมื่อมีการคืนเงิน ผู้ยื่นคำขอแจ้งข้อมูลบัญชีธนาคารสำหรับรับเงินคืนแก่บริษัททางอีเมล และบริษัทใช้ข้อมูลนั้นเพื่อโอนเงินคืนรายการนั้นเท่านั้น',
    );
  });

  it('states the channel the payment step states, which the backend pins to the checkout', () => {
    for (const words of ['พร้อมเพย์', 'ไม่รับบัตร']) {
      expect(paymentData).toContain(words);
      expect(PAYMENT_CHANNEL_TH).toContain(words);
    }
  });
});
