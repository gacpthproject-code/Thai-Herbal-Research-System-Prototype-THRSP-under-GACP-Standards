import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage from '../page';

function itemsOf(sectionId: string): string[] {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  return Array.from(root.querySelectorAll(`#${sectionId} li`), (li) => li.textContent ?? '');
}

describe('§6 names who reads the on-site contact, and when', () => {
  const recipients = itemsOf('recipients');
  const dispatcherClause = recipients.find((item) => item.startsWith('ผู้จัดคิว')) ?? '';

  it('names every dispatcher of the organization handling the application, not an assigned one', () => {
    expect(dispatcherClause).toContain('ผู้จัดคิวทุกคนของหน่วยงานที่ดูแลคำขอนั้น');
    expect(dispatcherClause).not.toContain('มอบหมาย');
  });

  it('says when a dispatcher can open it: while the visit waits to be booked or is booked, and when a second visit is asked for', () => {
    expect(recipients).toContain(
      'ผู้จัดคิวทุกคนของหน่วยงานที่ดูแลคำขอนั้นเปิดดูผู้ติดต่อหน้างานได้ตั้งแต่คำขอรอนัดตรวจพื้นที่จนกว่าผู้ตรวจพื้นที่จะบันทึกผลการตรวจ และเมื่อผู้ตรวจพื้นที่ขอให้นัดลงตรวจซ้ำ',
    );
  });

  it('holds the field inspector to the applications assigned to it, from the booked visit through the corrections', () => {
    expect(recipients).toContain(
      'ผู้ตรวจพื้นที่เปิดดูผู้ติดต่อหน้างานได้เฉพาะคำขอที่ได้รับมอบหมายให้ตรวจ ตั้งแต่มีนัดตรวจพื้นที่จนกว่าจะบันทึกผลการตรวจ และระหว่างขั้นตอนแก้ไขข้อบกพร่อง',
    );
  });

  it('says the on-site contact is the only contact both read, what they never read, and that every view is logged', () => {
    expect(recipients).toContain(
      'ช่องทางติดต่อที่ผู้จัดคิวและผู้ตรวจพื้นที่เห็นมีเพียงชื่อและเบอร์ของผู้ติดต่อหน้างาน ไม่เห็นอีเมลหรือเบอร์อื่นของผู้ยื่นคำขอ และระบบบันทึกทุกครั้งที่เปิดดูผู้ติดต่อหน้างาน',
    );
  });

  it('names the staff who read the whole application, contacts included, each inside its own organization', () => {
    expect(recipients).toContain(
      'ผู้ตรวจเอกสาร ผู้อนุมัติใบรับรอง ผู้ดูแลระบบ และผู้ดูแลแพลตฟอร์มเห็นคำขอฉบับเต็ม ซึ่งรวมผู้ติดต่อหน้างานและช่องทางติดต่อของผู้ยื่นคำขอ ภายในขอบเขตงานและหน่วยงานของตน',
    );
    expect(recipients.join(' ')).not.toContain('ทุกหน่วยงาน');
  });

  it('says what both finance roles read, and what only the company finance officer reads in full and on paper', () => {
    expect(recipients).toContain(
      'เจ้าหน้าที่การเงินและบัญชีของบริษัทและของกรมเห็นข้อมูลการเงินของคำขอในหน่วยงานของตน รวมถึงชื่อผู้ยื่นคำขอ และชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีหรือเลขทะเบียนวิสาหกิจชุมชนของผู้ชำระเงินบนเอกสารการเงิน โดยเจ้าหน้าที่การเงินและบัญชีของกรมเห็นเลขนั้นแบบปิดบางส่วน',
    );
    expect(recipients).toContain(
      'เจ้าหน้าที่การเงินและบัญชีของบริษัทเห็นเลขประจำตัวผู้เสียภาษีและเลขทะเบียนวิสาหกิจชุมชนแบบเต็ม และเปิดเอกสารการเงินฉบับพิมพ์ได้ ซึ่งใบเสนอราคาฉบับพิมพ์มีชื่อและเบอร์โทรศัพท์ผู้ติดต่อของผู้ยื่นคำขอด้วย',
    );
  });

  it('never says that anyone issues certificates now (order 56(0))', () => {
    expect(recipients.join(' ')).not.toContain('ออกใบรับรอง');
  });

  it('calls the correction stage what section 4 and the status labels call it', () => {
    expect(recipients.join(' ')).toContain('ขั้นตอนแก้ไขข้อบกพร่อง');
    expect(itemsOf('data-categories').join(' ')).toContain('คำสั่งให้แก้ไขข้อบกพร่อง');
  });
});
