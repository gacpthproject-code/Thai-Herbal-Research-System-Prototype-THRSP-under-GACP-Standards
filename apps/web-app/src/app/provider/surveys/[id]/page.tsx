'use client';

/**
 * ผลลัพธ์แบบสำรวจรายฉบับ — สัญญา C05F680149 ต้นแบบที่ 2 + 3.1:
 * สรุปสถิติต่อคำถาม (คะแนนเฉลี่ย/สัดส่วนตัวเลือก/คำสำคัญจาก text-mining)
 * + แยกตาม 4 ภาค + export CSV (formula-guarded).
 * คำสั่ง 34(5): ข้อมูลดิบและการส่งออกเฉพาะผู้ดูแลระบบฝั่งกรม บทบาทอื่นเห็นสถิติรวม
 * เมื่อปิดรับคำตอบแล้วเท่านั้น ช่องที่ถูกปิดไม่มาถึงหน้านี้เลย และยอดรวมมาเป็นช่วง
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';

import { Button } from '@/components/ui/primitives/button';
import { Badge } from '@/components/ui/primitives/badge';
import { Spinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { apiClient } from '@/lib/api/api-client';
import ProviderLayout from '../../components/provider-layout';

interface QuestionStats {
  questionId: string;
  questionText: string;
  questionType: string;
  /** null when any cell was suppressed; countBand carries the range instead */
  count: number | null;
  countBand: string | null;
  average?: number | null;
  min?: number | null;
  max?: number | null;
  choiceCounts?: Record<string, number>;
  hasSuppressedCells?: boolean;
  /** count = respondents who used the word */
  topKeywords?: { word: string; count: number }[] | null;
}

interface SurveyStatsHeader {
  templateId: string;
  title: string;
  status: string;
  aggregateOnly: boolean;
}

/** Aggregate-only readers get no numbers until the survey is CLOSED. */
type SurveyStats =
  | (SurveyStatsHeader & { statisticsAvailable: false })
  | (SurveyStatsHeader & {
      statisticsAvailable: true;
      smallCountThreshold: number | null;
      totalResponses: number | null;
      totalResponsesBand: string | null;
      /** null when totals are banded; regionBreakdownBand carries the ranges instead */
      regionBreakdown: Record<string, number> | null;
      regionBreakdownBand: Record<string, string> | null;
      regionBreakdownHasSuppressedCells: boolean;
      questions: QuestionStats[];
    });

const REGION_LABELS: Record<string, string> = {
  NORTH: 'เหนือ',
  CENTRAL: 'กลาง',
  NORTHEAST: 'ตะวันออกเฉียงเหนือ',
  SOUTH: 'ใต้',
};

function shownTotal(count: number | null, band: string | null): string {
  return count === null ? `ประมาณ ${band ?? ''}`.trim() : String(count);
}

export default function ProviderSurveyDetailPage() {
  const params = useParams<{ id: string }>();
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiClient.get<SurveyStats>(`/api/surveys/templates/${params.id}/stats`);
        if (active && res.success && res.data?.templateId) {
          setStats(res.data);
        } else if (active) {
          setError('โหลดสถิติไม่สำเร็จ');
        }
      } catch {
        if (active) {
          setError('โหลดสถิติไม่สำเร็จ');
        }
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
  }, [params.id]);

  return (
    <ProviderLayout heading title="ผลลัพธ์แบบสำรวจ" subtitle="Survey Results · THRSP ต้นแบบที่ 2 + 3.1">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/provider/surveys" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="size-4" /> กลับไปรายการแบบสำรวจ
          </Link>
          {stats && !stats.aggregateOnly ? (
            <Button asChild variant="outline">
              <a href={`/api/surveys/templates/${params.id}/export`} download>
                <Download className="mr-1 size-4" /> ส่งออก CSV
              </a>
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error || !stats ? (
          <Alert variant="error">{error ?? 'ไม่พบข้อมูล'}</Alert>
        ) : !stats.statisticsAvailable ? (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{stats.title}</h2>
            <Alert variant="info">
              สถิติของแบบสำรวจนี้เปิดดูได้เมื่อปิดรับคำตอบแล้ว ระหว่างที่ยังรับคำตอบอยู่ ตัวเลขที่เปลี่ยนหลังคำตอบใหม่แต่ละชุดจะชี้ไปที่ผู้ตอบคนนั้นได้
            </Alert>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{stats.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                คำตอบทั้งหมด {shownTotal(stats.totalResponses, stats.totalResponsesBand)} ชุด · สถานะ {stats.status}
              </p>
              {stats.aggregateOnly ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  บัญชีของคุณเห็นเฉพาะสถิติรวม ช่องที่มีคำตอบน้อยกว่า {stats.smallCountThreshold} ชุดถูกปิดไว้ และปิดช่องเล็กถัดไปเพิ่มจนช่องที่ปิดรวมกันมีอย่างน้อย {stats.smallCountThreshold} ชุด
                  เพื่อไม่ให้คำนวณย้อนได้ เมื่อมีช่องถูกปิด ยอดรวมและยอดรายภาคจะแสดงเป็นช่วง
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Object.entries(REGION_LABELS).map(([region, label]) => (
                <div key={region} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-sm text-muted-foreground">ภาค{label}</div>
                  <div className="mt-1 text-2xl font-semibold">{stats.regionBreakdown
                      ? stats.regionBreakdown[region] ?? '-'
                      : stats.regionBreakdownBand?.[region] ?? '-'}</div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              {stats.questions.map((question, index) => (
                <div key={question.questionId} className="rounded-lg border border-border bg-card p-4 md:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{index + 1}. {question.questionText}</span>
                    <Badge tone="neutral">{question.questionType}</Badge>
                    <span className="text-sm text-muted-foreground">({shownTotal(question.count, question.countBand)} คำตอบ)</span>
                  </div>

                  {question.average !== undefined && question.average !== null ? (
                    <p className="mt-2 text-sm">
                      ค่าเฉลี่ย <span className="text-lg font-semibold">{question.average}</span>
                      {question.min !== null && question.min !== undefined ? (
                        <span className="ml-2 text-muted-foreground">(ต่ำสุด {question.min} · สูงสุด {question.max})</span>
                      ) : null}
                    </p>
                  ) : null}

                  {question.choiceCounts ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {Object.entries(question.choiceCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([choice, count]) => (
                          <li key={choice} className="flex items-center gap-2">
                            <span className="min-w-32">{choice}</span>
                            {question.count !== null ? (
                              <span className="h-2 rounded bg-primary/60" style={{ width: `${Math.min(100, (count / Math.max(1, question.count)) * 100)}px` }} />
                            ) : null}
                            <span className="text-muted-foreground">{count}</span>
                          </li>
                        ))}
                      {question.hasSuppressedCells ? (
                        <li className="text-xs text-muted-foreground">ตัวเลือกที่มีผู้ตอบน้อยถูกปิดไว้</li>
                      ) : null}
                    </ul>
                  ) : null}

                  {!question.topKeywords && stats.aggregateOnly && (question.questionType === 'TEXT' || question.questionType === 'TEXTAREA') ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      คำสำคัญจากคำตอบข้อความแสดงเฉพาะผู้ดูแลระบบฝั่งกรม เพราะเมื่อผู้ตอบถอนความยินยอม ข้อความของเขาจะถูกลบ และคำที่หายไปจะบอกได้ว่าเขาเขียนอะไร
                    </p>
                  ) : null}

                  {question.topKeywords ? (
                    question.topKeywords.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {question.topKeywords.map((keyword) => (
                          <span key={keyword.word} className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                            {keyword.word} ({keyword.count} คน)
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        ยังไม่มีคำตอบข้อความ
                      </p>
                    )
                  ) : null}
                </div>
              ))}
            </div>

            {stats.aggregateOnly ? null : (
              <p className="text-xs text-muted-foreground">
                คำสำคัญสกัดด้วยการตัดคำภาษาไทย แล้วนับจำนวนผู้ตอบที่ใช้คำนั้น (text-mining ระดับต้นแบบ ตามข้อเสนอโครงการ 3.1)
              </p>
            )}
          </div>
        )}
      </div>
    </ProviderLayout>
  );
}
