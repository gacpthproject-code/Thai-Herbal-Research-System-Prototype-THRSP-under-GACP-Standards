import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage from '../page';

function renderPage(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  return root;
}

describe('§2 and §4 name what the system keeps in words as wide as what it keeps', () => {
  const root = renderPage();

  it('§4 says the software that reached the system, a browser being one kind (the stored client string comes from any client)', () => {
    expect(Array.from(root.querySelectorAll('#data-categories li'), (li) => li.textContent)).toContain(
      'ข้อมูลทางเทคนิค: หมายเลขไอพี อุปกรณ์ ระบบปฏิบัติการ และชื่อซอฟต์แวร์ที่ใช้เข้าถึงระบบ เช่น เบราว์เซอร์',
    );
  });

  it('§4 lists no birth date among the identity data: no column or form field collects one (review F-6)', () => {
    expect(Array.from(root.querySelectorAll('#data-categories li'), (li) => li.textContent)).toContain(
      'ข้อมูลระบุตัวตน: ชื่อ-นามสกุล เลขประจำตัวประชาชน เลขทะเบียนนิติบุคคล',
    );
    expect(root.textContent).not.toContain('วันเดือนปีเกิด');
  });

  it('calls the tax invoice a tax invoice, with no electronic tax invoice claim (no e-Tax Invoice registration on record)', () => {
    expect(root.textContent).not.toMatch(/ใบกำกับภาษี\s*อิเล็กทรอนิกส์/);
  });
});
