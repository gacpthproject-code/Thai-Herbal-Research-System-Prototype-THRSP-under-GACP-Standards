'use client';

/**
 * สัญญา C05F680149 ต้นแบบที่ 3 — Text mining และสรุปความต้องการของผู้มีส่วนได้ส่วนเสีย
 * ข้อมูลและการวิเคราะห์มาจาก GET /api/surveys/insights (ผู้ดูแลระบบของกรม) หน้านี้แสดงอย่างเดียว
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/primitives/badge';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/api-client';
import { formatThaiDate } from '@/lib/format/thai-date';
import ProviderLayout from '../../components/provider-layout';

type Basis = 'SYSTEM' | 'CORPUS';

interface QuotedSentence {
  text: string;
  documentId: string;
  label: string;
  source: { title: string; publisher: string; published: string; url: string } | null;
}

interface Theme {
  id: string;
  label: string;
  need: string;
  lexicon: string[];
  documents: number;
  share: number;
  terms: { term: string; documents: number }[];
  example: QuotedSentence | null;
}

interface Insights {
  basis: Basis;
  available: { system: number; corpus: number };
  corpus: { readOn: string; sources: { title: string; publisher: string; published: string; url: string }[] };
  method: { runsOn: string; keywords: string; themes: string; summary: string };
  documentCount: number;
  sentenceCount: number;
  groups: { group: string; label: string; documents: number }[];
  keywords: { term: string; documents: number }[];
  themes: Theme[];
  summary: { lines: string[]; keySentences: QuotedSentence[] };
}

export default function StakeholderInsightsPage() {
  const [basis, setBasis] = useState<Basis | null>(null);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const query = basis ? `?basis=${basis}` : '';
        const res = await apiClient.get<Insights>(`/api/surveys/insights${query}`);
        if (!active) { return; }
        if (res.success && res.data?.themes) {
          setData(res.data);
        } else {
          setError('วิเคราะห์ข้อความไม่สำเร็จ บัญชีของคุณต้องเป็นผู้ดูแลระบบของกรม หรือรีเฟรชหน้าจอแล้วลองอีกครั้ง');
        }
      } catch {
        if (active) { setError('วิเคราะห์ข้อความไม่สำเร็จ รีเฟรชหน้าจอแล้วลองอีกครั้ง'); }
      } finally {
        if (active) { setIsLoading(false); }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [basis]);

  const maxThemeDocuments = Math.max(1, ...(data?.themes ?? []).map((theme) => theme.documents));

  return (
    <ProviderLayout heading title="ต้นแบบระบบ Text Mining วิเคราะห์ความต้องการ" subtitle="Text Mining & AI · THRSP ต้นแบบที่ 3">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <Link href="/provider/surveys" className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> กลับไปหน้าแบบสำรวจ
        </Link>
        <p className="mb-4 text-sm text-muted-foreground">
          อ่านคำตอบข้อความอิสระของแบบสำรวจและบทสัมภาษณ์ผู้เชี่ยวชาญ แล้วสกัดคำสำคัญ จัดเข้าประเด็นความต้องการ และสรุปอัตโนมัติ
        </p>

        {data ? (
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="แหล่งข้อความ">
            {(['SYSTEM', 'CORPUS'] as Basis[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={data.basis === value}
                disabled={value === 'SYSTEM' && data.available.system === 0}
                onClick={() => setBasis(value)}
                className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ${data.basis === value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card'}`}
              >
                {value === 'SYSTEM'
                  ? `ข้อมูลในระบบ (${data.available.system} ข้อความ)`
                  : `ชุดข้อความสาธารณะ (${data.available.corpus} ข้อความ)`}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
        {isLoading && !data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : null}

        {data ? (
          <div className="space-y-6">
            {data.basis === 'CORPUS' ? (
              <Alert variant="warning">
                {data.available.system === 0
                  ? 'ระบบยังไม่มีคำตอบแบบสำรวจหรือบทสัมภาษณ์จริง '
                  : ''}
                ผลด้านล่างมาจากชุดข้อความสาธารณะ {data.documentCount} ข้อความจาก {data.corpus.sources.length} แหล่ง
                ที่เผยแพร่แล้ว คัดคำต่อคำเมื่อ {formatThaiDate(data.corpus.readOn)} ไม่ใช่คำตอบของผู้ตอบแบบสำรวจ และไม่ใช่ข้อมูลภาคสนาม
              </Alert>
            ) : null}

            <section className="rounded-lg border border-border bg-card p-4 md:p-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">สรุปอัตโนมัติ</h2>
                <Badge tone="neutral">นับจากคลังคำ</Badge>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {data.summary.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="mb-2 mt-5 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">ประโยคที่เป็นแกนของข้อความทั้งชุด</h3>
                <Badge tone="neutral">คัดประโยค ไม่แต่งประโยคใหม่</Badge>
              </div>
              <ol className="space-y-3">
                {data.summary.keySentences.map((sentence) => (
                  <li key={`${sentence.documentId}-${sentence.text.slice(0, 20)}`} className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p>“{sentence.text}”</p>
                    <Attribution sentence={sentence} />
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-lg border border-border bg-card p-4 md:p-6">
              <h2 className="mb-1 text-base font-semibold">ประเด็นความต้องการ</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                จำนวนข้อความที่มีคำในคลังคำของประเด็น จากทั้งหมด {data.documentCount} ข้อความ ข้อความหนึ่งเข้าได้หลายประเด็น
              </p>
              <ul className="space-y-5">
                {data.themes.map((theme) => (
                  <li key={theme.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{theme.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {theme.documents} ข้อความ ({theme.share}%)
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full rounded-full bg-muted" aria-hidden>
                      <div
                        className="h-2.5 rounded-full bg-leaf-700"
                        style={{ width: `${(theme.documents / maxThemeDocuments) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">ความต้องการ: {theme.need}</p>
                    {theme.terms.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {theme.terms.map((term) => (
                          <span key={term.term} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                            {term.term} ({term.documents})
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {theme.example ? (
                      <div className="mt-2 border-l-2 border-leaf-300 pl-3 text-sm">
                        <p>“{theme.example.text}”</p>
                        <Attribution sentence={theme.example} />
                      </div>
                    ) : null}
                    <details className="mt-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">คลังคำของประเด็นนี้</summary>
                      <p className="mt-1">{theme.lexicon.join(' · ')}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <section className="rounded-lg border border-border bg-card p-4 md:p-6">
                <h2 className="mb-1 text-base font-semibold">คำสำคัญ</h2>
                <p className="mb-3 text-xs text-muted-foreground">ตัวเลขคือจำนวนข้อความที่ใช้คำนั้น</p>
                <div className="flex flex-wrap gap-2">
                  {data.keywords.map((keyword) => (
                    <span key={keyword.term} className="rounded-full border border-border px-3 py-1 text-sm">
                      {keyword.term} ({keyword.documents})
                    </span>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-border bg-card p-4 md:p-6">
                <h2 className="mb-3 text-base font-semibold">ผู้ให้ข้อมูล</h2>
                <ul className="space-y-1 text-sm">
                  {data.groups.map((group) => (
                    <li key={group.group} className="flex justify-between gap-2">
                      <span>{group.label}</span>
                      <span className="text-muted-foreground">{group.documents} ข้อความ</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="rounded-lg border border-border bg-card p-4 text-sm md:p-6">
              <h2 className="mb-2 text-base font-semibold">วิธีวิเคราะห์</h2>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{data.method.runsOn}</li>
                <li>คำสำคัญ: {data.method.keywords}</li>
                <li>ประเด็น: {data.method.themes}</li>
                <li>สรุป: {data.method.summary}</li>
              </ul>
            </section>

            {data.basis === 'CORPUS' ? (
              <section className="rounded-lg border border-border bg-card p-4 text-sm md:p-6">
                <h2 className="mb-2 text-base font-semibold">แหล่งของชุดข้อความสาธารณะ</h2>
                <ol className="space-y-2">
                  {data.corpus.sources.map((source) => (
                    <li key={source.url}>
                      <div className="font-medium">{source.title}</div>
                      <div className="text-muted-foreground">{source.publisher} · เผยแพร่ {publishedOn(source.published)}</div>
                      <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-2">
                        {source.url}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </ProviderLayout>
  );
}

function publishedOn(value: string) {
  return /^\d{4}$/.test(value) ? `พ.ศ. ${Number(value) + 543}` : formatThaiDate(value);
}

function Attribution({ sentence }: { sentence: QuotedSentence }) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {sentence.label}
      {sentence.source ? (
        <>
          {' · '}
          <a href={sentence.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            แหล่งที่มา
          </a>
        </>
      ) : null}
    </p>
  );
}
