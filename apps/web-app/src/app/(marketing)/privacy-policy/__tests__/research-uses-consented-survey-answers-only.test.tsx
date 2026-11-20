import { because, itemsOf, renderPage } from './rendered-page';

const RESEARCH_USE =
  'เพื่องานวิจัยของโครงการที่ดำเนินการร่วมกับมหาวิทยาลัยราชภัฏสวนสุนันทา โดยใช้คำตอบแบบสำรวจที่ผู้ตอบให้ความยินยอมตามข้อความ "ข้อมูลก่อนตอบแบบสำรวจเพื่อการวิจัย" ซึ่งแยกจากนโยบายฉบับนี้ '
  + 'ก่อนส่งออกจากระบบ รหัสอ้างอิงคำตอบถูกแทนด้วยรหัสแฝงโดยไม่มีรหัสบัญชีของผู้ตอบ และภูมิภาคหรือจังหวัดที่มีผู้ตอบน้อยถูกปกปิด '
  + 'เมื่อผู้ตอบถอนความยินยอม รหัสแฝงของคำตอบนั้นจะอยู่ในรายการคำตอบที่ถอนความยินยอมแล้ว และคลังข้อมูลวิจัยของโครงการต้องลบคำตอบนั้นภายใน 90 วันนับจากวันที่ได้รับรายการ '
  + 'ข้อมูลคำขอ ข้อมูลฟาร์ม และข้อมูลการปลูกไม่นำไปใช้เพื่อการวิจัย';

const ORDER_85_6 =
  'ข้อ 2 (คำสั่ง 85(6) กับ 42, 49, 56(4)): บอกเฉพาะที่มีในบันทึกและในโค้ดส่งออกชุดข้อมูล (apps/backend/data/datasets/dataset-domains.js, services/dataset-export-service.js) '
  + 'ห้ามเขียนว่าทำให้ระบุตัวตนไม่ได้ เพราะผู้ถือกุญแจรหัสแฝงย้อนกลับได้ และห้ามเอ่ยถึง บพข. (คำสั่ง 40)';

describe('§2 says which data serves research, with whom, and how it leaves (order 85(6))', () => {
  const root = renderPage();
  const research = itemsOf(root, 'purpose').filter((item) => item.includes('วิจัย'));

  it('names consented survey answers, the university project, pseudonyms, small-group suppression, the withdrawn list and its 90 days, and what is never used', () => {
    because(ORDER_85_6, () => expect(research).toEqual([RESEARCH_USE]));
  });

  it('never claims the exported answers cannot identify anyone, and never names the funder', () => {
    because(ORDER_85_6, () => {
      expect(research.join(' ')).not.toMatch(/ระบุตัว/);
      expect(root.textContent).not.toContain('บพข');
    });
  });
});
