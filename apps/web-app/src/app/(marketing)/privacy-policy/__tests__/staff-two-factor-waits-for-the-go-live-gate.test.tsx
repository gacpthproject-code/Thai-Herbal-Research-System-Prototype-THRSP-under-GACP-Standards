import { because, itemsOf, renderPage } from './rendered-page';

const STAFF_TWO_FACTOR = 'เจ้าหน้าที่ทุกบัญชีต้องลงทะเบียนและใช้การยืนยันตัวตนสองปัจจัยด้วยแอปยืนยันตัวตนก่อนเข้าใช้งาน';

const GO_LIVE_GATE =
  'ข้อ 10 รายการที่ 3 (คำสั่ง 86): ก่อนเผยแพร่หน้านี้ในสภาพแวดล้อมใด ด่าน go-live ของคำสั่ง 86 (docs/runbooks/go-live-gate.md) ต้องผ่านในสภาพแวดล้อมนั้น '
  + 'คือเปิด REQUIRE_MFA_FOR_PRIVILEGED แล้ว และทดสอบแล้วว่าบัญชีเจ้าหน้าที่ที่ยังไม่ลงทะเบียนการยืนยันตัวตนสองปัจจัยเข้าระบบไม่ได้ '
  + 'ถ้าด่านไม่ผ่านในสภาพแวดล้อมใด ให้ลบประโยคนี้ออกจากหน้าก่อนเผยแพร่ แล้วแก้เทสต์นี้ในการเปลี่ยนแปลงเดียวกัน';

describe('§10 says every staff account uses two-factor sign-in, a sentence the go-live gate of order 86 makes true', () => {
  it('states the order-86 sentence word for word', () => {
    because(GO_LIVE_GATE, () => expect(itemsOf(renderPage(), 'security')).toContain(STAFF_TWO_FACTOR));
  });
});
