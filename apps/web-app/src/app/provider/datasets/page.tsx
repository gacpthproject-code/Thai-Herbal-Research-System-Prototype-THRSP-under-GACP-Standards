'use client';

/**
 * สัญญา C05F680149 ภาคผนวก 4 ข้อ 3: ชุดข้อมูลดิบ (API/CSV) + คู่มือการใช้ชุดข้อมูล
 * สำหรับคลังข้อมูลวิจัยของโครงการ
 *
 * แคตตาล็อกและคู่มือเปิดได้ทุกบทบาทเจ้าหน้าที่ ปุ่มส่งออกทุกปุ่มแสดงเฉพาะเมื่อเซิร์ฟเวอร์ตอบ
 * canExport ซึ่งคิดจากกติกาเดียวกับประตูส่งออก (system_admin_dtam ในองค์กรของตัวเอง)
 */

import { useEffect, useState } from 'react';
import { BookOpen, Database, Download, Package } from 'lucide-react';

import { Button } from '@/components/ui/primitives/button';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/api-client';
import ProviderLayout from '../components/provider-layout';

interface DatasetList {
  key: string;
  thaiName: string;
}

interface DatasetDomain {
  key: string;
  thaiName: string;
  description: string;
  fieldCount: number;
  formats: string[];
  available: boolean;
  unavailableCode: string | null;
  lists: DatasetList[];
}

interface DatasetCatalog {
  canExport: boolean;
  domains: DatasetDomain[];
}

const UNAVAILABLE_TEXT: Record<string, string> = {
  DATASET_RESEARCH_BASIS_NOT_IN_FORCE:
    'ยังส่งออกไม่ได้ ข้อมูลการทำงานของฟาร์มจะส่งออกเพื่อการวิจัยได้เมื่อคณะกรรมการจริยธรรมการวิจัยอนุมัติงานวิจัยแล้ว และนโยบายความเป็นส่วนตัวที่แจ้งการใช้ข้อมูลนี้ได้รับอนุมัติและมีผลแล้ว',
};
const UNAVAILABLE_FALLBACK = 'ยังส่งออกชุดข้อมูลนี้ไม่ได้ในขณะนี้';

const fileNameOf = (key: string, format: string) => `gacp-dataset-${key.replace('/', '-')}.${format}`;

async function saveDownload(path: string, fileName: string): Promise<boolean> {
  const blob = await apiClient.getBlob(path);
  if (!blob) {
    return false;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export default function DatasetsPage() {
  const [catalog, setCatalog] = useState<DatasetCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiClient.get<DatasetCatalog>('/api/datasets');
        if (active && res.success && res.data && Array.isArray(res.data.domains)) {
          setCatalog(res.data);
        }
      } catch {
        // catalog stays null and the page says the list could not be loaded
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

  const download = async (path: string, fileName: string) => {
    setBusyPath(path);
    setDownloadFailed(false);
    const ok = await saveDownload(path, fileName);
    setDownloadFailed(!ok);
    setBusyPath(null);
  };

  const formatButtons = (basePath: string, key: string, formats: string[]) => (
    <div className="flex flex-wrap gap-2">
      {formats.map((format) => (
        <Button
          key={format}
          size="sm"
          variant="outline"
          disabled={busyPath !== null}
          onClick={() => void download(`${basePath}?format=${format}`, fileNameOf(key, format))}
        >
          <Download className="mr-1 size-4" /> {format.toUpperCase()}
        </Button>
      ))}
    </div>
  );

  const canExport = catalog?.canExport === true;

  return (
    <ProviderLayout title="ชุดข้อมูลดิบเพื่อการวิจัย" subtitle="Raw Research Dataset · ภาคผนวก 4 ข้อ 3">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-sm text-muted-foreground">
            ชุดข้อมูลปฏิบัติการที่ยังไม่ผ่านการวิเคราะห์ สำหรับส่งเข้าคลังข้อมูลวิจัยของโครงการ
            ทุกช่องรหัสเป็นรหัสแฝง ไม่มีชื่อ เลขบัตรประชาชน อีเมล เบอร์โทร หรือรหัสบัญชีผู้ใช้
          </p>
          <Button asChild variant="outline">
            <a href="/api/datasets/dictionary" target="_blank" rel="noreferrer">
              <BookOpen className="mr-1 size-4" /> คู่มือการใช้ชุดข้อมูล
            </a>
          </Button>
        </div>

        {downloadFailed && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            ดาวน์โหลดไม่สำเร็จ กดปุ่มอีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !catalog ? (
          <p role="alert" className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            โหลดรายการชุดข้อมูลไม่สำเร็จ รีเฟรชหน้าจอแล้วลองอีกครั้ง
          </p>
        ) : (
          <>
            {canExport ? (
              <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-5" data-testid="dataset-bundle">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Package className="size-5" />
                  </span>
                  <div className="font-semibold">ชุดเต็มสำหรับส่งคลังข้อมูลวิจัยของโครงการ</div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  ไฟล์ ZIP หนึ่งไฟล์ มีทุกชุดข้อมูลที่ส่งออกได้ทั้ง CSV และ JSONL รายการลบทุกรายการ
                  คู่มือการใช้ชุดข้อมูล และ manifest.json ที่บอกจำนวนแถวและค่า sha256 ของทุกไฟล์
                </p>
                <div className="mt-4">
                  <Button
                    size="sm"
                    disabled={busyPath !== null}
                    onClick={() => void download('/api/datasets/bundle', 'gacp-research-dataset.zip')}
                  >
                    <Download className="mr-1 size-4" /> ดาวน์โหลดชุดเต็ม (ZIP)
                  </Button>
                </div>
              </div>
            ) : (
              <p
                className="mb-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
                data-testid="dataset-export-restricted"
              >
                การส่งออกทำได้เฉพาะผู้ดูแลระบบของกรม คุณเปิดดูรายการชุดข้อมูลและคู่มือได้
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {catalog.domains.map((domain) => (
                <div
                  key={domain.key}
                  className="rounded-lg border border-border bg-card p-5"
                  data-testid={`dataset-${domain.key}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Database className="size-5" />
                    </span>
                    <div>
                      <div className="font-semibold">{domain.thaiName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {domain.key} · {domain.fieldCount} คอลัมน์
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{domain.description}</p>
                  {canExport && (
                    <div className="mt-4 space-y-3">
                      {domain.available ? (
                        formatButtons(`/api/datasets/${domain.key}/export`, domain.key, domain.formats)
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {(domain.unavailableCode && UNAVAILABLE_TEXT[domain.unavailableCode]) || UNAVAILABLE_FALLBACK}
                        </p>
                      )}
                      {domain.lists.map((list) => (
                        <div key={list.key} className="border-t border-border pt-3">
                          <div className="mb-2 text-sm font-medium">{list.thaiName}</div>
                          {formatButtons(`/api/datasets/${list.key}`, list.key, domain.formats)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          ทุกครั้งที่ส่งออก ระบบบันทึกผู้ส่งออก ชุดข้อมูล และรูปแบบไฟล์ไว้ในประวัติการใช้งาน
        </p>
      </div>
    </ProviderLayout>
  );
}
