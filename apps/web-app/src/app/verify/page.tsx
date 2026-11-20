import type { Metadata } from 'next';
import { Card } from '@/components/ui/primitives/card';
import { PublicVerifyHeader } from '@/components/feature/public-verify-header';
import {
  CERTIFICATE_VERDICTS,
  LEGEND_VERDICTS,
  VERDICT_TONE_CLASSES,
} from '@/lib/verify/certificate-verdict';
import { CertificateLookup } from './certificate-lookup';

export const metadata: Metadata = {
  title: 'ตรวจสอบใบรับรอง GACP',
  description: 'ตรวจสอบว่าใบรับรอง GACP สมุนไพรยังใช้ได้หรือไม่ ด้วยเลขที่ใบรับรองหรือการสแกน QR',
};

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-mint-bg">
      <PublicVerifyHeader />
      <main id="main-content" className="flex flex-1 justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold leading-snug text-primary">ตรวจสอบใบรับรอง GACP</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              พิมพ์เลขที่ใบรับรอง หรือสแกน QR บนใบรับรองหรือบนสินค้า เพื่อดูว่าใบรับรองยังใช้ได้หรือไม่
            </p>
          </div>

          <Card className="p-5 sm:p-6">
            <CertificateLookup />
          </Card>

          <section aria-labelledby="verify-legend-heading" className="space-y-3">
            <h2 id="verify-legend-heading" className="text-base font-bold text-foreground">
              ผลที่อาจพบ
            </h2>
            <ul className="space-y-2">
              {LEGEND_VERDICTS.map((verdict) => {
                const copy = CERTIFICATE_VERDICTS[verdict];
                const tone = VERDICT_TONE_CLASSES[copy.tone];
                return (
                  <li key={verdict} className="flex items-start gap-3 rounded-lg bg-card px-4 py-3">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${tone.chip}`}>
                      {copy.word}
                    </span>
                    <span className="text-sm text-foreground">{copy.meaning}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
