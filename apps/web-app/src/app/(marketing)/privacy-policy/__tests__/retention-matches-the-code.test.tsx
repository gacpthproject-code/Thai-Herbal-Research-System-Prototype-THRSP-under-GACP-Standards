import { because, itemsOf, renderPage } from './rendered-page';

const ACCOUNT_DATA =
  'ข้อมูลบัญชีผู้ใช้งาน: จัดเก็บไม่เกิน 5 ปีนับจากวันสร้างบัญชี เมื่อครบกำหนดระบบทำให้ข้อมูลบัญชีไม่สามารถระบุตัวบุคคลได้ และเมื่อผู้ใช้งานใช้สิทธิขอลบข้อมูลและยืนยันคำขอแล้ว ระบบทำให้ข้อมูลบัญชีไม่สามารถระบุตัวบุคคลได้ตามคำขอ เว้นแต่ข้อมูลที่กฎหมายกำหนดให้เก็บรักษาต่อตามระยะเวลาในข้อนี้';
const TAX_RECORDS =
  'ข้อมูลทางการเงินและภาษี (ใบเสร็จ ใบกำกับภาษี): จัดเก็บไม่น้อยกว่า 5 ปีตามประมวลรัษฎากร มาตรา 87/3 ชื่อผู้ชำระเงินที่เป็นบุคคลธรรมดาซึ่งพิมพ์บนเอกสารการเงินยังจัดเก็บต่อหลังข้อมูลบัญชีถูกทำให้ไม่สามารถระบุตัวบุคคลได้ จนครบ 5 ปีนับจากวันที่ระบบออกเอกสารการเงินฉบับล่าสุดของผู้ชำระเงินรายนั้น ได้แก่ ใบแจ้งหนี้ ใบเสร็จรับเงินหรือใบกำกับภาษี ใบลดหนี้ หรือใบเพิ่มหนี้ เมื่อครบกำหนดระบบลบชื่อนั้นออกโดยอัตโนมัติ';
const CERTIFICATE_RECORDS =
  'ข้อมูลใบรับรองและผลการตรวจประเมิน: จัดเก็บเพื่อการตรวจสอบย้อนหลัง ระบบไม่ลบข้อมูลเหล่านี้โดยอัตโนมัติ ส่วนชื่อและที่อยู่ของผู้ยื่นคำขอบนใบรับรองจัดเก็บไม่น้อยกว่า 5 ปีนับจากวันออกใบรับรอง และระบบลบชื่อและที่อยู่นั้นออกเฉพาะเมื่อผู้ยื่นคำขอใช้สิทธิขอลบข้อมูลและยืนยันคำขอหลังครบ 5 ปีแล้ว';
const AUDIT_AND_SECURITY_LOGS =
  'บันทึกการตรวจสอบและบันทึกเหตุการณ์ความปลอดภัยในฐานข้อมูล: จัดเก็บตลอดอายุการให้บริการของระบบเพื่อการตรวจสอบย้อนหลัง ระบบไม่ลบบันทึกเหล่านี้โดยอัตโนมัติ บันทึกการตรวจสอบเก็บหมายเลขไอพีไว้เพื่อความปลอดภัยและเพื่อพิสูจน์ว่าบันทึกไม่ถูกแก้ไข ตามระยะเวลาเดียวกันนี้ ผู้ที่เปิดดูหมายเลขไอพีในบันทึกการตรวจสอบได้มีเฉพาะผู้ดูแลระบบและผู้ดูแลแพลตฟอร์ม และระบบไม่ลบหมายเลขไอพีออกจากบันทึกการตรวจสอบเมื่อข้อมูลบัญชีถูกทำให้ไม่สามารถระบุตัวบุคคลได้';
const APPLICATION_RECORDS =
  'ข้อมูลคำขอ เอกสารประกอบคำขอ และข้อมูลฟาร์ม: จัดเก็บเพื่อการพิจารณาคำขอ การออกใบรับรอง และการตรวจสอบย้อนหลัง ระบบไม่ลบข้อมูลเหล่านี้โดยอัตโนมัติ ยกเว้นไฟล์หลักฐานการแก้ไขข้อบกพร่องที่อัปโหลดไว้แต่ยังไม่ได้กดส่ง ซึ่งระบบลบโดยอัตโนมัติเมื่อพ้นกำหนดส่งของรอบนั้น หรือเมื่อครบ 7 วันนับจากวันที่อัปโหลด แล้วแต่กรณีใดถึงก่อน';

describe('§7 states the retention the code applies', () => {
  const retention = itemsOf(renderPage(), 'retention');

  it('item 1: account data only, at most 5 years from account creation, then anonymised, and anonymised on a confirmed erasure request (review F-4, F-A)', () => {
    because(
      'ข้อ 7 รายการที่ 1 (ผลตรวจ F-4 และ F-A): ระบบเก็บบัญชีผู้ใช้งาน 5 ปีนับจากวันสร้างบัญชี (User.retainUntil ใน apps/backend/prisma/schema/auth.prisma) งานกวาดทุกคืนทำให้ข้อมูลบัญชีไม่สามารถระบุตัวบุคคลได้เมื่อครบกำหนด และประตูขอลบข้อมูลทำเช่นเดียวกันเมื่อยืนยันคำขอ งานกวาดเขียนเฉพาะแถวบัญชี (apps/backend/jobs/pdpa-retention-job.js) จึงห้ามเขียนว่า "ข้อมูลทั่วไป" ถูกทำให้ไม่สามารถระบุตัวบุคคลได้',
      () => {
        expect(retention).toContain(ACCOUNT_DATA);
        expect(retention.join(' ')).not.toContain('หลังจากปิดบัญชี');
        expect(retention.join(' ')).not.toContain('ข้อมูลทั่วไป');
      },
    );
  });

  it('item 2: tax documents at least 5 years under Revenue Code s.87/3; a person\'s payer name outlives the anonymized account until 5 years after the latest finance document (orders 85(2), 64 ค9, 96(1), 100)', () => {
    because('ข้อ 7 รายการที่ 2 (คำสั่ง 85(2), 64 ค9, 96(1) และ 100): เอกสารภาษีเก็บไม่น้อยกว่า 5 ปีตามประมวลรัษฎากร มาตรา 87/3 · ชื่อผู้ชำระเงินบน entities.displayName ของแฟ้มบุคคลคงอยู่ขณะที่ใบแจ้งหนี้ ใบเสร็จ ใบลดหนี้ หรือใบเพิ่มหนี้ใบใดออกไม่เกิน 5 ปี (services/account-anonymization.js payerNameOnTaxDocumentInRetention) งานกวาดทุกคืน 02:30 ลบชื่อเมื่อพ้นกำหนด (jobs/pdpa-retention-job.js รอบที่สอง, jobs/scheduler.js)', () => {
      expect(retention).toContain(TAX_RECORDS);
      expect(retention.join(' ')).not.toContain('7 ปี');
    });
  });

  it('item 3: certificates and audit results are never deleted automatically; the applicant name and address on a certificate stay at least 5 years from issue and go only on an erasure request confirmed after that', () => {
    because(
      'ข้อ 7 รายการที่ 3: Certificate.retainUntil = วันออกใบรับรอง + 5 ปี (apps/backend/prisma/schema/certification.prisma) ประตูขอลบข้อมูลลบชื่อและที่อยู่บนใบรับรองเฉพาะใบที่พ้น retainUntil แล้วในวันที่ยืนยันคำขอ (apps/backend/services/pdpa-erasure-service.js) และไม่มีงานใดลบใบรับรองหรือผลตรวจ',
      () => {
        expect(retention).toContain(CERTIFICATE_RECORDS);
        expect(retention.join(' ')).not.toContain('10 ปี');
      },
    );
  });

  it('item 4: audit and security-event logs in the database for the life of the service, never deleted automatically; the IP address they keep, who reads it, and that anonymization leaves it (review F-5, F-B, order 100)', () => {
    because(
      'ข้อ 7 รายการที่ 4 (ผลตรวจ F-5 และ F-B, คำสั่ง 100): ไม่มีงานใดในระบบลบบันทึกการตรวจสอบหรือบันทึกเหตุการณ์ความปลอดภัยในฐานข้อมูล ส่วน log ข้อความของ container หมุนและลบตามขนาด (docker-compose.production.yml) ประโยคจึงพูดเฉพาะบันทึกในฐานข้อมูล · ipAddress อยู่ในข้อมูลที่ hash chain แฮช (middleware/audit-logger.js buildHashPayload) ประตูอ่านบันทึกการตรวจสอบเปิดให้ผู้ดูแลระบบและผู้ดูแลแพลตฟอร์มเท่านั้น จุดตรึงฝั่งโค้ดคือ apps/backend/__tests__/unit/privacy-notice-audit-log-ip.test.js',
      () => {
        expect(retention).toContain(AUDIT_AND_SECURITY_LOGS);
        expect(retention.join(' ')).not.toContain('จัดเก็บ 1 ปี');
      },
    );
  });

  it('item 5: application data, supporting documents and farm data are kept and never deleted automatically, except unsent CAR evidence files at the round deadline or 7 days after upload (review F-A, order 129(3))', () => {
    because(
      'ข้อ 7 รายการที่ 5 (ผลตรวจ F-A, คำสั่ง 129(3)): ไม่มีงานใดลบแบบคำขอ เอกสารประกอบคำขอ (ApplicationDocument) หรือข้อมูลฟาร์ม (apps/backend/jobs/) งานกวาดบัญชีล้างเพียงข้อความที่การตรวจเอกสารเบื้องต้นอ่านไว้ ไม่ใช่ตัวเอกสาร · งานกวาดทุกชั่วโมง (apps/backend/services/car-staged-files-sweep.js) ลบเฉพาะไฟล์ใน formData.carStagedFiles คือไฟล์ CAR ที่อัปโหลดแล้วแต่ยังไม่ได้ส่ง เมื่อพ้น carDueAt ของรอบหรือครบ 7 วันนับจาก uploadedAt แล้วแต่ถึงก่อน ไฟล์ที่ส่งแล้วไม่ถูกแตะ',
      () => {
        expect(retention).toContain(APPLICATION_RECORDS);
      },
    );
  });

  it('has no catch-all line saying data is deleted or anonymised once its period ends, and item 5 comes last so items 1-4 keep their numbers', () => {
    because(
      'ข้อ 7: งานกวาดตามระยะเก็บมีเฉพาะบัญชีผู้ใช้งาน (apps/backend/jobs/pdpa-retention-job.js) ใบแจ้งหนี้ ใบรับรอง ผลตรวจ บันทึก ข้อมูลคำขอ เอกสารประกอบคำขอ และข้อมูลฟาร์มไม่มีงานใดลบเมื่อพ้นระยะ แต่ละรายการจึงบอกเองว่าครบกำหนดแล้วเกิดอะไร · รายการที่ 5 ต่อท้าย เพราะด่าน backend และ BACKLOG-FOUND อ้างเลขรายการ 1-4',
      () => {
        expect(retention).toEqual([ACCOUNT_DATA, TAX_RECORDS, CERTIFICATE_RECORDS, AUDIT_AND_SECURITY_LOGS, APPLICATION_RECORDS]);
      },
    );
  });
});
