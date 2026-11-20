'use client';

/**
 * รายการแบบสำรวจที่บัญชีนี้ตอบได้ (ACTIVE, กลุ่มเป้าหมายตรงกับบัญชี) —
 * สัญญา C05F680149 ต้นแบบที่ 2 (ระบบสำรวจความต้องการ, แบบสอบถามดิจิทัล 4 ภาค)
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClipboardList, ChevronRight, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/primitives/button';
import { Card, CardContent } from '@/components/ui/primitives/card';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/feature/confirm-dialog';
import { EmptyState } from '@/components/feature/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/api-client';

interface SurveyTemplate {
  id: string;
  title: string;
  description?: string | null;
  targetGroup: string;
  questions?: { id: string }[];
  alreadyAnswered: boolean;
}

export default function ClientView() {
  const [surveys, setSurveys] = useState<SurveyTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const withdraw = async () => {
    const res = await apiClient.post<{ withdrawnResponses: number }>('/api/surveys/research-consent/withdraw', {});
    setIsConfirmOpen(false);
    if (!res.success || !res.data) {
      setWithdrawResult({ tone: 'error', text: 'ถอนความยินยอมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
      return;
    }
    setWithdrawResult({
      tone: 'success',
      text: res.data.withdrawnResponses > 0
        ? `ถอนความยินยอมแล้ว คำตอบ ${res.data.withdrawnResponses} ชุดไม่ผูกกับบัญชีของท่านและจะไม่ถูกใช้เพื่อการวิจัยอีก`
        : 'ไม่มีคำตอบของท่านที่ยังผูกกับบัญชีนี้',
    });
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiClient.get<SurveyTemplate[]>('/api/surveys/active');
        if (active && res.success && Array.isArray(res.data)) {
          setSurveys(res.data);
        }
      } catch {
        // list stays empty — EmptyState below explains
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full px-4 py-6 md:px-6">
      <h1 className="text-xl font-semibold">แบบสำรวจความต้องการ</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ความเห็นของท่านช่วยพัฒนาระบบและบริการสำหรับเกษตรกรผู้ปลูกสมุนไพรทั่วประเทศ
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : surveys.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={ClipboardList}
            title="ยังไม่มีแบบสำรวจที่เปิดรับคำตอบ"
            hint="เมื่อมีแบบสำรวจใหม่จะแสดงที่หน้านี้"
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {surveys.map((survey) => {
            const summary = (
              <div>
                <div className="font-medium">{survey.title}</div>
                {survey.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{survey.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {survey.alreadyAnswered
                    ? 'ท่านตอบแบบสำรวจนี้แล้ว แบบสำรวจแต่ละชุดตอบได้บัญชีละหนึ่งครั้ง'
                    : `${survey.questions?.length ?? 0} คำถาม`}
                </p>
              </div>
            );
            return survey.alreadyAnswered ? (
              <Card key={survey.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  {summary}
                  <CheckCircle2 className="size-5 shrink-0 text-leaf-700" aria-label="ตอบแล้ว" />
                </CardContent>
              </Card>
            ) : (
              <Link key={survey.id} href={`/health/surveys/${survey.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    {summary}
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <section className="mt-10 rounded-lg border border-border p-4">
        <h2 className="text-base font-semibold">ถอนความยินยอมเพื่อการวิจัย</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          คำตอบที่ท่านเคยส่งจะไม่ผูกกับบัญชีของท่าน ข้อความที่ท่านพิมพ์เองจะถูกลบ และจะไม่ถูกส่งออกเพื่อการวิจัยอีก
        </p>
        {withdrawResult ? (
          <div className="mt-3">
            <Alert variant={withdrawResult.tone}>{withdrawResult.text}</Alert>
          </div>
        ) : null}
        <Button className="mt-3" variant="outline" onClick={() => setIsConfirmOpen(true)}>
          ถอนความยินยอม
        </Button>
      </section>

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        onConfirm={withdraw}
        title="ถอนความยินยอมเพื่อการวิจัย"
        description="เมื่อถอนแล้วจะย้อนกลับไม่ได้ ข้อความที่ท่านพิมพ์ในคำตอบทุกชุดจะถูกลบ ส่วนสถิติรวมที่ไม่ระบุตัวบุคคลยังคงอยู่"
        confirmLabel="ถอนความยินยอม"
        cancelLabel="ยกเลิก"
        variant="destructive"
      />
    </div>
  );
}
