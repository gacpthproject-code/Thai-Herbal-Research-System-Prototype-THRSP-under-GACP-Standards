/**
 * "Where the money goes" layout of the pricing page (operator order 38,
 * 2026-10-07). Web text only: the split is explained here, while quotations,
 * invoices and checkout bill one ค่าบริการ in the company's name.
 */

import Link from 'next/link';
import { MarketingSection } from '@/components/marketing/marketing-section';
import {
  PRICING_SPLIT_AGENCY_TH,
  type ExplainedFees,
  type ExplainedLine,
} from '@/constants/pricing-explained';
import { PAYMENT_TERMS_EDITION_TH, PAYMENT_TERMS_TITLE_TH } from '@/constants/payment-terms';
import { MILESTONE_PAY_WHEN_TH, REFUND_SUMMARY_TH, RENEWAL_WINDOW_TH } from '@/constants/service-facts';
import { formatBaht, vatPercentLabel, type PublicFees } from '@/lib/pricing/public-fees';
import type { FeeServiceCatalogue } from '@/lib/pricing/fee-services';

const baht = (n: number) => `${formatBaht(n)} บาท`;

interface CardProps {
  id: string;
  heading: string;
  line: ExplainedLine;
  vat: string;
  coverage: string[];
  when: string;
}

function FeeCard({ id, heading, line, vat, coverage, when }: CardProps) {
  return (
    <article
      aria-labelledby={id}
      className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm dark:border-primary-900/40 dark:bg-zinc-900 sm:p-6"
    >
      <h3 id={id} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{heading}</h3>
      <p className="mt-2 text-3xl font-bold tabular-nums text-primary-800 dark:text-primary-200">{baht(line.total)}</p>
      <dl className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
        <div className="flex items-start justify-between gap-3">
          <dt>ค่าตรวจรับรองของ{PRICING_SPLIT_AGENCY_TH}</dt>
          <dd className="shrink-0 tabular-nums">{baht(line.agency)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>ค่าบริการแพลตฟอร์ม</dt>
          <dd className="shrink-0 tabular-nums">{baht(line.platform)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <dt>รวมค่าบริการ</dt>
          <dd className="shrink-0 tabular-nums">{baht(line.serviceFee)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>ภาษีมูลค่าเพิ่ม {vat}</dt>
          <dd className="shrink-0 tabular-nums">{baht(line.vat)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 border-t border-zinc-200 pt-2 font-semibold dark:border-zinc-700">
          <dt>รวมชำระ</dt>
          <dd className="shrink-0 tabular-nums">{baht(line.total)}</dd>
        </div>
      </dl>
      <h4 className="mt-5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">สิ่งที่ได้รับ</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-200">
        {coverage.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <h4 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">ชำระเมื่อ</h4>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{when}</p>
    </article>
  );
}

export function FeeExplained({
  fees,
  explained,
  services,
}: {
  fees: PublicFees;
  explained: ExplainedFees;
  services: FeeServiceCatalogue;
}) {
  const vat = vatPercentLabel(fees);
  const { phase1, phase2, renewal, newApplicationTotal } = explained;
  return (
    <>
      <section aria-labelledby="pricing-hero" className="bg-primary-50 dark:bg-zinc-950">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <p className="mb-2 text-xs font-semibold text-primary-700 dark:text-primary-300">ค่าบริการ</p>
          <h1 id="pricing-hero" className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl md:text-5xl">
            ค่าบริการการรับรอง GACP
          </h1>
          <div data-testid="pricing-summary" className="mt-6 rounded-2xl border border-primary-200 bg-white p-5 shadow-sm dark:border-primary-800 dark:bg-zinc-900 sm:p-6">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              ยื่นขอใหม่ 1 ขอบเขตการปลูก รวม{' '}
              <span className="text-2xl font-bold tabular-nums text-primary-800 dark:text-primary-200">{baht(newApplicationTotal)}</span>
            </p>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
              ชำระครั้งเดียวให้บริษัท ไม่ต้องจ่ายแยกให้หน่วยงานใด
            </p>
          </div>
        </div>
      </section>

      <MarketingSection
        id="new-application"
        eyebrow="ยื่นขอใหม่"
        title="ยื่นขอใหม่ (ชำระ 2 งวด)"
        description="ราคาต่อหนึ่งขอบเขตการปลูก แบ่งชำระสองงวดตามขั้นตอนของคำขอ"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FeeCard
            id="fee-card-phase1"
            heading={services.PHASE_1.name}
            line={phase1}
            vat={vat}
            coverage={[services.PHASE_1.coverage]}
            when={MILESTONE_PAY_WHEN_TH.M1}
          />
          <FeeCard
            id="fee-card-phase2"
            heading={services.PHASE_2.name}
            line={phase2}
            vat={vat}
            coverage={[services.PHASE_2.coverage]}
            when={MILESTONE_PAY_WHEN_TH.M2}
          />
        </div>
        <p data-testid="new-application-total" className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          รวมยื่นขอใหม่ <span className="tabular-nums">{baht(phase1.total)}</span> +{' '}
          <span className="tabular-nums">{baht(phase2.total)}</span> ={' '}
          <span className="tabular-nums text-primary-800 dark:text-primary-200">{baht(newApplicationTotal)}</span>
        </p>
      </MarketingSection>

      <div className="bg-primary-50/40 dark:bg-primary-900/20">
        <MarketingSection
          id="renewal"
          eyebrow="ต่ออายุ"
          title="ต่ออายุใบรับรอง (ชำระครั้งเดียว)"
          description="ราคาต่อหนึ่งขอบเขตการปลูก ชำระครั้งเดียวเมื่อยื่นต่ออายุ"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FeeCard
              id="fee-card-renewal"
              heading={services.RENEWAL.name}
              line={renewal}
              vat={vat}
              coverage={[services.RENEWAL.coverage]}
              when="ชำระครั้งเดียวเมื่อยื่นต่ออายุ"
            />
            <div className="rounded-2xl border border-primary-100 bg-white p-5 text-sm text-zinc-700 shadow-sm dark:border-primary-900/40 dark:bg-zinc-900 dark:text-zinc-200 sm:p-6">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">รายละเอียดการต่ออายุ</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>{RENEWAL_WINDOW_TH}</li>
                <li>ตรวจเอกสารแบบสั้น และตรวจประเมินแปลง</li>
                <li>ได้ใบรับรองฉบับใหม่</li>
              </ul>
            </div>
          </div>
        </MarketingSection>
      </div>

      <MarketingSection id="pricing-notes" eyebrow="หมายเหตุ" title="ภาษีและการคืนเงิน">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
          <li>ภาษีมูลค่าเพิ่ม {vat} คิดจากค่าบริการทั้งจำนวน</li>
          <li>{REFUND_SUMMARY_TH}</li>
        </ul>
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-200">
          อ่านรายละเอียดทั้งหมดได้ที่{' '}
          <Link href="/terms-of-service" className="font-semibold text-primary-800 underline dark:text-primary-200">
            {PAYMENT_TERMS_TITLE_TH} ฉบับที่ {PAYMENT_TERMS_EDITION_TH}
          </Link>
        </p>
      </MarketingSection>
    </>
  );
}
