'use client';

/**
 * สัญญา C05F680149 ต้นแบบที่ 1 — ตารางเทียบข้อกำหนด GACP ไทย · WHO · ASEAN ทีละหัวข้อ
 * พร้อมเลขข้อของเอกสารต้นทาง และสิ่งที่ผู้ผ่านมาตรฐานไทยต้องทำเพิ่ม เนื้อหามาจาก
 * GET /api/standards/comparison (backend เป็นเจ้าของข้อมูล หน้านี้แสดงอย่างเดียว)
 */

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/primitives/badge';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/api-client';
import { formatThaiDate } from '@/lib/format/thai-date';
import ProviderLayout from '../../components/provider-layout';

type Level = 'REQUIRED' | 'RECOMMENDED' | 'ABSENT';
type Gap = 'THAI_COVERS' | 'ADD' | 'RECOMMENDS' | 'NOT_IN_STANDARD';

interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string;
  fileUrl: string;
  readOn: string;
  note: string;
}

interface StandardInfo {
  code: string;
  name: string;
  fullName: string;
  scopeNote: string;
  sources: Source[];
}

interface Cell {
  standardCode: string;
  level: Level;
  ref: string;
  text: string;
  sourceId: string;
  gap: Gap | null;
  extraRequired: string | null;
  extraRecommended: string | null;
}

interface Topic {
  id: string;
  title: string;
  cells: Cell[];
}

interface Comparison {
  baseline: string;
  standards: StandardInfo[];
  sources: Source[];
  topics: Topic[];
  summary: Record<string, { topics: number; add: number; recommends: number; thaiCovers: number; notInStandard: number }>;
}

const LEVEL_LABEL: Record<Level, string> = {
  REQUIRED: 'ข้อกำหนด',
  RECOMMENDED: 'ข้อแนะนำ',
  ABSENT: 'ไม่มีข้อนี้',
};

const GAP_BADGE: Record<Gap, { label: string; className: string }> = {
  ADD: { label: 'ต้องทำเพิ่ม', className: 'border border-caution-edge bg-caution-soft text-foreground' },
  RECOMMENDS: { label: 'แนะนำให้ทำเพิ่ม', className: 'bg-primary/10 text-primary' },
  THAI_COVERS: { label: 'ไทยครอบคลุมแล้ว', className: 'bg-leaf-soft text-leaf-onSoft' },
  NOT_IN_STANDARD: { label: 'มาตรฐานนี้ไม่กำหนด', className: 'bg-muted text-muted-foreground' },
};

type Filter = 'ALL' | 'ADD';

export default function StandardsComparePage() {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiClient.get<Comparison>('/api/standards/comparison');
        if (!active) { return; }
        if (res.success && res.data?.topics) {
          setData(res.data);
        } else {
          setError('โหลดตารางเทียบไม่สำเร็จ รีเฟรชหน้าจอแล้วลองอีกครั้ง');
        }
      } catch {
        if (active) { setError('โหลดตารางเทียบไม่สำเร็จ รีเฟรชหน้าจอแล้วลองอีกครั้ง'); }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const standardsByCode = useMemo(
    () => new Map((data?.standards ?? []).map((standard) => [standard.code, standard])),
    [data],
  );

  const topics = useMemo(() => {
    if (!data) { return []; }
    if (filter === 'ALL') { return data.topics; }
    return data.topics.filter((topic) => topic.cells.some((cell) => cell.gap === 'ADD' || cell.gap === 'RECOMMENDS'));
  }, [data, filter]);

  return (
    <ProviderLayout heading title="ตารางเทียบข้อกำหนด GACP 3 มาตรฐาน" subtitle="ไทย · WHO · ASEAN · THRSP ต้นแบบที่ 1">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <p className="mb-2 text-sm text-muted-foreground">
          เทียบข้อกำหนดทีละหัวข้อ ใช้มาตรฐานไทยเป็นฐาน แล้วบอกว่าเกษตรกรที่ผ่านมาตรฐานไทยต้องทำหรือควรทำอะไรเพิ่มเพื่อให้ครบตาม WHO
          หรือ ASEAN ทุกช่องอ้างเลขข้อของเอกสารต้นทาง ข้อความเป็นการสรุปความภาษาไทย ไม่ใช่คำแปลทางการ
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          ระดับของแต่ละช่องตามถ้อยคำของเอกสารนั้น: ข้อกำหนด = ข้อที่มาตรฐานเขียนให้ทำ (ประโยคบอกเล่า หรือเขียนว่าต้อง must) เป็นข้อของมาตรฐานอ้างอิง ไม่ใช่กฎหมาย ·
          ข้อแนะนำ = เขียนว่าควร (should) ประโยคที่ระดับต่างจากช่องกำกับไว้ในข้อความ ตัวเลข &quot;ต้องทำเพิ่ม&quot; นับเฉพาะข้อกำหนดหรือประโยค must ของมาตรฐานนั้นที่มาตรฐานไทยไม่มี
          ส่วน &quot;แนะนำให้ทำเพิ่ม&quot; นับข้อแนะนำที่ไทยไม่มี
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {!data && !error ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : null}

        {data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 print:hidden">
              <a
                href="/api/standards/comparison/export.csv"
                className="inline-flex items-center rounded-lg bg-leaf-700 px-4 py-2 text-sm font-medium text-white hover:bg-leaf-800"
              >
                ดาวน์โหลด CSV
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium"
              >
                พิมพ์หรือบันทึกเป็น PDF
              </button>
              <div className="ml-auto flex gap-2" role="group" aria-label="กรองหัวข้อ">
                {(['ALL', 'ADD'] as Filter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${filter === value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card'}`}
                  >
                    {value === 'ALL' ? `ทุกหัวข้อ (${data.topics.length})` : 'เฉพาะหัวข้อที่ต้องทำหรือแนะนำให้ทำเพิ่ม'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.entries(data.summary).map(([code, summary]) => (
                <div key={code} className="rounded-lg border border-border bg-card p-4">
                  <div className="font-semibold">{standardsByCode.get(code)?.name} เทียบกับมาตรฐานไทย</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <SummaryCount value={summary.add} label="ต้องทำเพิ่ม" tone="text-foreground" />
                    <SummaryCount value={summary.recommends} label="แนะนำให้ทำเพิ่ม" tone="text-primary" />
                    <SummaryCount value={summary.thaiCovers} label="ไทยครอบคลุมแล้ว" tone="text-leaf-700" />
                    <SummaryCount value={summary.notInStandard} label="ไม่กำหนด" tone="text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{standardsByCode.get(code)?.scopeNote}</p>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block print:block">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left align-bottom">
                    <th className="w-44 px-4 py-3 font-medium">หัวข้อ</th>
                    {data.standards.map((standard) => (
                      <th key={standard.code} className="px-4 py-3 font-medium">
                        {standard.name}
                        <div className="text-xs font-normal text-muted-foreground">{standard.fullName}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topics.map((topic) => (
                    <tr key={topic.id} className="align-top">
                      <td className="px-4 py-3 font-medium">{topic.title}</td>
                      {topic.cells.map((cell) => (
                        <td key={cell.standardCode} className="px-4 py-3">
                          <CellBody cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-4 lg:hidden print:hidden">
              {topics.map((topic) => (
                <li key={topic.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 font-semibold">{topic.title}</div>
                  <div className="space-y-4">
                    {topic.cells.map((cell) => (
                      <div key={cell.standardCode} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                        <div className="mb-1 text-sm font-medium">{standardsByCode.get(cell.standardCode)?.name}</div>
                        <CellBody cell={cell} />
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <section className="rounded-lg border border-border bg-card p-4 md:p-6">
              <h2 className="mb-3 text-base font-semibold">เอกสารต้นทาง</h2>
              <ol className="space-y-3 text-sm">
                {data.sources.map((source) => (
                  <li key={source.id}>
                    <div className="font-medium">{source.title}</div>
                    <div className="text-muted-foreground">{source.publisher}</div>
                    <div className="break-all">
                      <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        {source.url}
                      </a>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      อ่านเมื่อ {formatThaiDate(source.readOn)} · {source.note}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </div>
    </ProviderLayout>
  );
}

function CellBody({ cell }: { cell: Cell }) {
  const gap = cell.gap ? GAP_BADGE[cell.gap] : null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{LEVEL_LABEL[cell.level]}</Badge>
        {gap ? <Badge className={gap.className}>{gap.label}</Badge> : <Badge tone="neutral">ฐานเทียบ</Badge>}
      </div>
      <div className="text-xs text-muted-foreground">{cell.ref}</div>
      <p className="text-sm">{cell.text}</p>
      {cell.extraRequired ? (
        <p className="text-sm"><span className="font-medium">ต้องทำเพิ่ม:</span> {cell.extraRequired}</p>
      ) : null}
      {cell.extraRecommended ? (
        <p className="text-sm text-primary"><span className="font-medium">แนะนำให้ทำเพิ่ม:</span> {cell.extraRecommended}</p>
      ) : null}
    </div>
  );
}

function SummaryCount({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
