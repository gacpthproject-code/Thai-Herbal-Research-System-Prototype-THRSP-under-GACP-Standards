import { because, itemsOf, renderPage } from './rendered-page';

const CONTACT_TITLE = '11. ช่องทางติดต่อเรื่องข้อมูลส่วนบุคคล';
const CONTACT_ITEMS = [
  'ผู้ใช้งานติดต่อบริษัทเพื่อใช้สิทธิหรือสอบถามเรื่องข้อมูลส่วนบุคคลได้ที่ช่องทางนี้',
  'อีเมล: contact@gacpth.com (หัวข้อ: "สิทธิเจ้าของข้อมูล")',
  'ระบบจะตอบกลับคำร้องขอใช้สิทธิภายใน 30 วันนับจากวันที่ได้รับคำร้องที่ครบถ้วน',
];
const UPDATES = [
  'นโยบายความเป็นส่วนตัวฉบับนี้อาจปรับปรุงตามกฎหมาย หลักเกณฑ์ของคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล หรือแนวปฏิบัติของหน่วยงาน',
  'หลังระบบเปิดให้บริการอย่างเป็นทางการ การเปลี่ยนแปลงสาระสำคัญจะประกาศฉบับใหม่ไว้ที่หน้านี้ล่วงหน้าไม่น้อยกว่า 30 วันก่อนวันมีผลบังคับใช้ พร้อมเลขรุ่นและวันที่มีผลบังคับใช้',
];

describe('§11 names a contact channel, not an officer, and §12 promises no email (orders 85(1) and 85(4))', () => {
  const root = renderPage();

  it('§11 is the personal-data contact channel at contact@gacpth.com, with the 30-day reply unchanged', () => {
    because('ข้อ 11 (คำสั่ง 85(1)): ไม่มีบันทึกการแต่งตั้งเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล contact@gacpth.com จึงเป็นช่องทางติดต่อของบริษัท (คำสั่ง 81)', () => {
      const section = root.querySelector('#privacy-contact');
      expect(section?.querySelector('h2')?.textContent).toBe(CONTACT_TITLE);
      expect(itemsOf(root, 'privacy-contact').slice(0, 3)).toEqual(CONTACT_ITEMS);
    });
  });

  it('names no data protection officer anywhere, in words or in an anchor', () => {
    because('คำสั่ง 85(1): ยังไม่มีการแต่งตั้ง ห้ามหน้านี้อ้างถึงเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคลจนกว่า operator ระบุผู้ได้รับแต่งตั้ง', () => {
      expect(root.innerHTML).not.toMatch(/เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล|\bDPO\b/i);
    });
  });

  it('§12 announces material changes on this page 30 days ahead once the service is officially open, and by no email', () => {
    because('ข้อ 12 (คำสั่ง 85(4)): ระบบไม่มีช่องทางอีเมล และฉบับ 1.4 เป็นฉบับแรกที่มีผลในวัน deploy การแจ้งล่วงหน้า 30 วันใช้หลังระบบเปิดให้บริการอย่างเป็นทางการ', () => {
      expect(itemsOf(root, 'updates')).toEqual(UPDATES);
      expect(root.textContent).not.toContain('ผ่านอีเมล');
    });
  });
});
