import { because, itemsOf, renderPage } from './rendered-page';

const DEPARTMENT_STAFF =
  'เจ้าหน้าที่ของกรมการแพทย์แผนไทยและการแพทย์ทางเลือกที่ได้รับบัญชีผู้ใช้งานในระบบ สำหรับงานตรวจเอกสาร จัดคิว ตรวจพื้นที่ และพิจารณาคำขอ';
const INDEPENDENT_CONTROLLER =
  'กรมการแพทย์แผนไทยและการแพทย์ทางเลือกได้รับข้อมูลคำขอจากบริษัทเพื่อพิจารณาคำขอรับรอง และเป็นผู้ควบคุมข้อมูลส่วนบุคคลอิสระสำหรับข้อมูลที่ได้รับนั้น';
const CONTRACT_BASIS =
  'การปฏิบัติตามสัญญา (มาตรา 24(3)): สำหรับการดำเนินการตามคำขอรับรอง ซึ่งรวมถึงการเปิดเผยข้อมูลคำขอแก่กรมการแพทย์แผนไทยและการแพทย์ทางเลือกเพื่อพิจารณาคำขอตามที่ผู้ยื่นคำขอขอรับการรับรอง และการรับชำระค่าบริการ';
const DEPARTMENT_REQUESTS =
  'คำขอใช้สิทธิเกี่ยวกับข้อมูลที่กรมการแพทย์แผนไทยและการแพทย์ทางเลือกได้รับจากบริษัท ส่งได้ทางช่องทางนี้ และบริษัทจะส่งต่อคำขอถึงกรม';

const ORDER_85_5 = 'คำสั่ง 85(5): กรมเป็นผู้ควบคุมข้อมูลอิสระที่รับข้อมูลจากบริษัท บริษัทยังเป็นผู้ควบคุมข้อมูลในข้อ 1 และการออกใบรับรองของกรมยังเป็นรูปอนาคต (คำสั่ง 56(0))';

describe('the department receives application data from the company and controls what it receives (order 85(5))', () => {
  const root = renderPage();
  const recipients = itemsOf(root, 'recipients');

  it('§6 names the department staff by the work their accounts do, and the department as an independent controller', () => {
    because(`ข้อ 6 ${ORDER_85_5}`, () => {
      expect(recipients.slice(0, 2)).toEqual([DEPARTMENT_STAFF, INDEPENDENT_CONTROLLER]);
    });
  });

  it('§3 gives the company\'s own basis for disclosing to the department: the contract with the applicant who asked for certification', () => {
    because(`ข้อ 3 ${ORDER_85_5}`, () => {
      expect(itemsOf(root, 'lawful-basis').filter((item) => item.startsWith('การปฏิบัติตามสัญญา'))).toEqual([CONTRACT_BASIS]);
    });
  });

  it('§11 says requests about the department\'s processing reach it through the same channel, and names no official\'s position (order 83)', () => {
    because(`ข้อ 11 ${ORDER_85_5} ไม่มีช่องทางติดต่อของกรมสำหรับเรื่องข้อมูลส่วนบุคคลในบันทึก คำขอจึงส่งถึงกรมผ่านช่องทางของบริษัท`, () => {
      expect(itemsOf(root, 'privacy-contact')).toContain(DEPARTMENT_REQUESTS);
      expect(root.textContent).not.toContain('อธิบดี');
    });
  });
});
