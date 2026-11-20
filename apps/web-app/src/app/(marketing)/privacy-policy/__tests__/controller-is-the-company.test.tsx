import * as fs from 'fs';
import * as path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { CERTIFICATE_ISSUER_TH, PAYEE_TH, PLATFORM_ADDRESS_TH, PLATFORM_COMPANY_TH } from '@/constants/service-facts';
import { MINISTRY_CONTACT } from '@/lib/ministry-contact';
import PrivacyPolicyPage from '../page';

function renderPage(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  return root;
}

function itemsOf(root: HTMLElement, sectionId: string): string[] {
  return Array.from(root.querySelectorAll(`#${sectionId} li`), (li) => li.textContent ?? '');
}

describe('the company that runs the platform is the data controller (order 81)', () => {
  const root = renderPage();
  const controller = itemsOf(root, 'controller');

  it('§1 names the company by the name its finance documents carry, and the department only as the future issuer', () => {
    expect(controller).toEqual([
      `ผู้ควบคุมข้อมูลส่วนบุคคลคือ ${PLATFORM_COMPANY_TH} ซึ่งเป็น${PAYEE_TH}`,
      CERTIFICATE_ISSUER_TH,
      `ที่อยู่: ${PLATFORM_ADDRESS_TH}`,
      'อีเมล: contact@gacpth.com',
    ]);
  });

  it('§1 gives the department\'s address and phone nowhere as the controller\'s', () => {
    const section = controller.join(' ');
    expect(section).not.toContain(MINISTRY_CONTACT.address);
    expect(section).not.toContain(MINISTRY_CONTACT.phone);
  });

  it('§3 names the public-task basis only for the certificates the department will issue', () => {
    expect(itemsOf(root, 'lawful-basis').filter((item) => item.includes('มาตรา 24(4)'))).toEqual([
      `ภารกิจของรัฐ (มาตรา 24(4)): สำหรับการออกใบรับรอง ซึ่ง${CERTIFICATE_ISSUER_TH}`,
    ]);
  });

  it('shows version 1.4, with a changelog line that says what changed', () => {
    const label = Array.from(root.querySelectorAll('dt')).find((dt) => dt.textContent === 'เวอร์ชัน:');
    expect(label?.nextElementSibling?.textContent).toBe('1.4');
    const source = fs.readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');
    expect(source).toMatch(/\/\/\s+v1\.4 \(.+\) .*data controller/);
  });
});
