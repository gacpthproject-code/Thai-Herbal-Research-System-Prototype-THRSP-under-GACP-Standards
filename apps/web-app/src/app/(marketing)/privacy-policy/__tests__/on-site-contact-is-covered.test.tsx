import * as fs from 'fs';
import * as path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage from '../page';

describe('the privacy notice covers the person on site', () => {
  const html = renderToStaticMarkup(<PrivacyPolicyPage />);
  const source = fs.readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');

  it('says what is collected about them, why, who reads it, and how they come to know', () => {
    expect(html).toContain('ผู้ติดต่อหน้างาน');
    expect(html).toContain('ชื่อและเบอร์โทรศัพท์ของผู้ที่เจ้าหน้าที่จะโทรนัดและพบที่แปลง');
    expect(html).toContain('ผู้จัดคิวและผู้ตรวจพื้นที่');
    expect(html).toContain('ระบบบันทึกทุกครั้งที่เปิดดู');
    expect(html).toContain('ผู้ยื่นคำขอยืนยันว่าได้แจ้งบุคคลนั้นแล้ว');
  });

  it('keeps the changelog line of the version that added them', () => {
    expect(source).toMatch(/\/\/\s+v1\.3 \(.+\) .*ผู้ติดต่อหน้างาน/);
  });
});
