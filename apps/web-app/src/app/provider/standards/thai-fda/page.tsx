'use client';

/**
 * สัญญา C05F680149 ต้นแบบที่ 1.2 — "ระบบวิเคราะห์มาตรฐาน Thai FDA"
 * (ต้นแบบระบบวิเคราะห์มาตรฐาน GACP 3 ระบบ · THRSP)
 *
 * ชื่อหน้าล็อกตามถ้อยคำสัญญา เนื้อหาเทียบมาตรฐานที่กรมการแพทย์แผนไทยฯ ยอมรับ (มกษ. 3502-2561 และ
 * ประกาศกรมฯ พ.ศ. 2568) จากตารางเทียบข้อกำหนดใน backend
 */

import Link from 'next/link';
import ProviderLayout from '../../components/provider-layout';
import StandardAnalyzeView from '../_components/standard-analyze-view';

export default function ThaiFdaStandardPage() {
  return (
    <ProviderLayout heading title="ระบบวิเคราะห์มาตรฐาน Thai FDA" subtitle="Thai GACP Readiness · THRSP ต้นแบบที่ 1.2">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <p className="mb-2 text-sm text-muted-foreground">
          วิเคราะห์คำขอเทียบมาตรฐานที่กรมการแพทย์แผนไทยและการแพทย์ทางเลือกยอมรับ คือ มกษ. 3502-2561
          และประกาศกรมฯ เรื่องแหล่งที่ได้รับรองมาตรฐาน GACP กัญชาทางการแพทย์ พ.ศ. 2568 ทีละหัวข้อ
        </p>
        <p className="mb-6 text-sm text-muted-foreground">
          checklist เอกสารบังคับรายคำขอดูได้ที่หน้า{' '}
          <Link href="/provider/applications" className="text-primary underline underline-offset-2">
            คำขอรับรอง
          </Link>{' '}
          เทียบกับ WHO และ ASEAN ได้ที่{' '}
          <Link href="/provider/standards/compare" className="text-primary underline underline-offset-2">
            ตารางเทียบข้อกำหนด
          </Link>
        </p>
        <StandardAnalyzeView standardCode="THAI_GACP" />
      </div>
    </ProviderLayout>
  );
}
