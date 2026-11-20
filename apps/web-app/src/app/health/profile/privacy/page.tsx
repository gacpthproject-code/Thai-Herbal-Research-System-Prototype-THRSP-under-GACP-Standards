'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  ShieldCheck,
  Loader2,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';

import { apiClient } from '@/lib/api/api-client';
import { Button } from '@/components/ui/primitives/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives/card';
import { notifications } from '@/lib/notifications';
import { SummaryHeader } from '@/components/feature';

export default function HealthPrivacyPage() {
  const router = useRouter();

  // Export-flow state
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // The endpoint returns a JSON blob with Content-Disposition: attachment.
      // apiClient.getBlob handles the auth header so the cookie-protected
      // endpoint accepts the request even on browsers that don't auto-send
      // the auth_token cookie cross-origin.
      const blob = await apiClient.getBlob('/auth/health/me/export');
      if (!blob) {
        throw new Error('Empty response from server');
      }
      const filename = `gacp-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      notifications.show({
        title: 'ดาวน์โหลดสำเร็จ',
        message: `บันทึกเป็นไฟล์ ${filename} แล้ว`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'ดาวน์โหลดไม่สำเร็จ',
        message: err instanceof Error ? err.message : 'กรุณาลองใหม่อีกครั้ง',
        color: 'red',
      });
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    // Wave E.2-B (batch 9): SummaryHeader replaces inline back-button
    // + h1 + p row. Back button moves into actions slot using ghost
    // variant + ChevronLeft icon, matching the convention used on
    // other detail/sub pages.
    // B1 (audit 2026-06-10): DashboardLayout already provides the page <main>, so
    // this inner <main> was invalid landmark nesting. Swap to <div>.
    // Full-width carpet-sweep (2026-06-10): dropped mx-auto + max-w-2xl so the
    // page fills the screen on PC (owner directive — every in-app page full-width).
    <div className="w-full space-y-6 p-4 pb-20 md:p-6 md:pb-6">
      <SummaryHeader
        eyebrow="ผู้ขอรับรอง · ความเป็นส่วนตัว"
        title="ความเป็นส่วนตัว (PDPA)"
        description="สิทธิตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562"
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl"
            onClick={() => router.push('/health/profile')}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            กลับ
          </Button>
        }
      />

      {/* Section: Export */}
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="border-b border-border/50 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Download className="h-4 w-4 text-primary" />
            ดาวน์โหลดข้อมูลของคุณ (มาตรา 30)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            สำเนาข้อมูลส่วนบุคคลทั้งหมดที่ระบบเก็บไว้เกี่ยวกับคุณ รวมถึงโปรไฟล์ คำขอ
            ฟาร์ม ใบรับรอง ใบแจ้งหนี้ และประวัติการแจ้งเตือน ส่งออกเป็นไฟล์ JSON
            มาตรฐาน
          </p>
          <p className="text-xs text-muted-foreground">
            ข้อมูลที่ดาวน์โหลดได้จะไม่รวมรหัสผ่านหรือข้อมูล MFA
            (ไม่ต้องการให้ผู้รับไฟล์เข้าระบบแทนคุณได้)
          </p>
          <Button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-xl"
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            ดาวน์โหลดเป็น JSON
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-primary/30 bg-card">
        <CardHeader className="border-b border-primary/20 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-primary">
            <ShieldCheck className="h-4 w-4" />
            ขอลบข้อมูลส่วนบุคคล
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            ส่งคำขอ แล้วยืนยันด้วยลิงก์ในการแจ้งเตือนในระบบภายใน 24 ชั่วโมง
            ระบบแสดงผลกระทบให้อ่านก่อนยืนยัน เมื่อยืนยันแล้ว
            ระบบทำให้ข้อมูลบัญชีของคุณไม่สามารถระบุตัวบุคคลได้และปิดบัญชีนี้
          </p>
          <p className="text-sm text-muted-foreground">
            ลบแล้วกู้คืนบัญชีไม่ได้ เพราะระบบไม่มีการกู้บัญชี
          </p>
          <Link
            href="/health/account/erasure"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            ไปที่คำขอลบข้อมูล
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>

      {/* Footer note */}
      <Card className="rounded-2xl border-border bg-muted/30">
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            อ้างอิงทางกฎหมาย
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) มาตรา 30
            ให้สิทธิเจ้าของข้อมูลขอเข้าถึงและรับสำเนาข้อมูลส่วนบุคคล มาตรา 33
            ให้สิทธิขอให้ลบหรือทำลายข้อมูล หรือทำให้ข้อมูลส่วนบุคคลไม่สามารถระบุตัวบุคคลได้
            สำหรับคำถามเกี่ยวกับการคุ้มครองข้อมูลส่วนบุคคล{' '}
            ติดต่อเจ้าหน้าที่ DTAM
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
