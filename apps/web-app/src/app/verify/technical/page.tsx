import type { Metadata } from 'next';
import TrustVerifierPortal from '@/components/feature/trust-verifier-portal';

export const metadata: Metadata = {
  title: 'เครื่องมือตรวจสอบทางเทคนิค | GACP Thailand',
  description: 'ทะเบียนความเชื่อถือ รายการเพิกถอน การตรวจลายเซ็นดิจิทัล และเหตุการณ์ตรวจสอบย้อนกลับ สำหรับหน่วยงานที่เชื่อมระบบ',
  robots: { index: false },
};

export default function TechnicalVerifyPage() {
  return <TrustVerifierPortal />;
}
