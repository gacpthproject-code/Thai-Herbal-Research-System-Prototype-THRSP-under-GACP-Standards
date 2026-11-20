/**
 * The landing page at `/` (operator 2026-10-06: "กู้หน้าแรกเดิมกลับมา แล้วพัฒนาให้ตรงกับความจริง
 * ปัจจุบันนี้"). Sign-in is still the chooser at /auth; this page only sends people there.
 *
 * Every fact on this page is read from the module that owns it (service-facts, the purpose
 * vocabulary, the wizard's herb and area-type lists, project-info), so the page cannot drift
 * from what the system does. The certificate term is the dated rule GET
 * /api/certificate-validity serves. It prints no price: amounts live on /pricing, served by
 * GET /api/pricing/fees.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, QrCode, ScanSearch } from 'lucide-react';
import { MarketingSection, MarketingCard } from '@/components/marketing/marketing-section';
import { Button } from '@/components/ui/primitives/button';
import { FALLBACK_PLANTS } from '@/app/health/applications/new/_steps/steps/plant-selection-config';
import { AREA_TYPE_OPTIONS } from '@/app/health/applications/new/_steps/steps/step3-site-land-config';
import { CERTIFICATION_PURPOSES } from '@/lib/certification-purposes';
import { HOLDER_TYPES, HOLDER_TYPES_TH, ORGANISATION_HOLDER_TYPES_TH } from '@/lib/holder/holder-registry';
import { PROJECT_STATUS } from '@/lib/project-info';
import { certificateValidityTh, type ValidityState } from '@/lib/certificate-validity/certificate-validity';
import { fetchCertificateValidity } from '@/lib/certificate-validity/fetch-certificate-validity';
import {
  DOCUMENT_REVISION_DEADLINE_TH,
  CERTIFICATE_ISSUER_TH,
  PAYMENT_CHANNEL_TH,
  RECEIPT_TH,
  RENEWAL_WINDOW_TH,
} from '@/constants/service-facts';

export const metadata: Metadata = {
  title: { absolute: 'GACP Thailand ระบบยื่นขอใบรับรอง GACP สมุนไพร' },
  description:
    'ยื่นขอใบรับรอง GACP สำหรับสมุนไพร แนบเอกสาร ชำระค่าบริการ และติดตามผลออนไลน์ ระบบอยู่ระหว่างการพัฒนาและทดสอบ',
};

const HERBS = FALLBACK_PLANTS.filter((plant) => plant.enabled).map((plant) => plant.nameTH);

const SERVICES = [
  {
    title: 'ยื่นคำขอออนไลน์',
    description: 'กรอกคำขอ แนบเอกสาร ชำระค่าบริการ และดูสถานะได้ในระบบเดียว ระบบบอกให้ว่าต้องแนบเอกสารอะไรบ้าง',
    Icon: FileText,
  },
  {
    title: 'ตรวจสอบใบรับรองได้ทันที',
    description: 'ใครก็ตรวจสอบใบรับรองได้ ด้วยการสแกน QR บนใบรับรอง หรือพิมพ์เลขใบรับรอง ไม่ต้องเข้าสู่ระบบ',
    Icon: ScanSearch,
  },
  {
    title: 'สืบย้อนผลผลิตด้วย QR',
    description: 'หลังได้ใบรับรอง บันทึกรอบการปลูกและล็อตผลผลิตได้ ผู้ซื้อสแกน QR ของล็อตเพื่อดูที่มา',
    Icon: QrCode,
  },
];

const STEPS = [
  {
    title: 'เข้าสู่ระบบ',
    description: 'เมื่อเปิดให้บริการ ยืนยันตัวตนด้วย ThaiD หรือหมอพร้อม ซึ่งอยู่ระหว่างการเชื่อมต่อ',
  },
  {
    title: 'กรอกคำขอและแนบเอกสาร',
    description: 'เลือกสมุนไพร ลักษณะพื้นที่ปลูก และวัตถุประสงค์ แล้วแนบเอกสารตามที่ระบบบอก',
  },
  {
    title: 'ชำระงวดที่ 1',
    description: 'สแกน QR พร้อมเพย์ ระบบบันทึกการชำระให้เอง ไม่ต้องรอเจ้าหน้าที่อนุมัติ',
  },
  { title: 'เจ้าหน้าที่ตรวจเอกสาร', description: 'ถ้าต้องแก้ ระบบจะแจ้งรายการให้แก้ในคำขอเดิม' },
  {
    title: 'ชำระงวดที่ 2 และนัดตรวจแปลง',
    description: 'เมื่อชำระงวดที่ 2 แล้ว เจ้าหน้าที่จึงนัดวันตรวจ และลงตรวจที่แปลงปลูก',
  },
  {
    title: 'รับใบรับรอง',
    description: 'เจ้าหน้าที่ผู้อนุมัติพิจารณาผลตรวจ เมื่ออนุมัติแล้วได้ใบรับรองแยกตามลักษณะพื้นที่ปลูก พร้อม QR สำหรับตรวจสอบ',
  },
];

const faqItems = (validity: ValidityState) => [
  {
    question: 'ใครยื่นคำขอได้บ้าง',
    answer: `${HOLDER_TYPES_TH} ถ้ายื่นในนาม${ORGANISATION_HOLDER_TYPES_TH} ใบรับรองจะออกในนามนั้น โดย${HOLDER_TYPES.PARTNERSHIP.labelTh}ต้องจดทะเบียนเป็นนิติบุคคลแล้ว`,
  },
  {
    question: 'ปลูกหลายแบบในฟาร์มเดียว ได้ใบรับรองกี่ใบ',
    answer: `หนึ่งใบต่อลักษณะพื้นที่ปลูก (${AREA_TYPE_OPTIONS.map((area) => area.labelTH).join(' ')}) แต่ละแบบพิจารณาแยกกัน แบบที่ได้รับอนุมัติแล้วออกใบรับรองได้โดยไม่ต้องรอแบบอื่น`,
  },
  {
    question: 'ใบรับรองมีอายุนานเท่าไร',
    answer: `${certificateValidityTh(validity)} ${RENEWAL_WINDOW_TH}`,
  },
  {
    question: 'ชำระค่าบริการอย่างไร',
    answer: `${PAYMENT_CHANNEL_TH} ${RECEIPT_TH}`,
  },
  {
    question: 'ถ้าเอกสารไม่ครบหรือต้องแก้ไข ทำอย่างไร',
    answer: `เจ้าหน้าที่จะส่งคำขอกลับพร้อมรายการที่ต้องแก้ คุณแก้ในคำขอเดิมแล้วส่งกลับภายใน ${DOCUMENT_REVISION_DEADLINE_TH}`,
  },
];

export default async function LandingPage() {
  const validity = await fetchCertificateValidity();
  return (
    <>
      <section aria-labelledby="hero-title" className="bg-mint-bg">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
          <span aria-hidden="true" className="mb-4 block h-1 w-14 rounded-full bg-accent" />
          <p className="mb-3 text-sm font-semibold text-primary dark:text-primary-300">
            ระบบยื่นขอใบรับรอง GACP สมุนไพร
          </p>
          <h1
            id="hero-title"
            className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            ยื่นขอใบรับรอง GACP ออนไลน์ ครบในที่เดียว
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            ยื่นคำขอ แนบเอกสาร ชำระค่าบริการ และติดตามผลได้จากที่ไหนก็ได้ {CERTIFICATE_ISSUER_TH}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button href="/auth" variant="primary" size="lg">
              เข้าสู่ระบบ / สมัคร
            </Button>
            <Button href="/verify" variant="secondary" size="lg">
              ตรวจสอบใบรับรอง
            </Button>
            <Button href="/pricing" variant="outline" size="lg">
              ค่าบริการ
            </Button>
          </div>
          <p
            role="note"
            className="mt-8 max-w-2xl rounded-lg border border-caution-edge bg-caution-soft px-4 py-3 text-sm text-foreground"
          >
            {PROJECT_STATUS}
          </p>
        </div>
      </section>

      <MarketingSection id="services" eyebrow="ทำอะไรได้บ้าง" title="สิ่งที่ระบบนี้ทำให้คุณ">
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map((item) => (
            <MarketingCard
              key={item.title}
              title={item.title}
              description={item.description}
              icon={<item.Icon className="h-6 w-6" aria-hidden="true" />}
            />
          ))}
        </div>
      </MarketingSection>

      <div className="bg-mint-bg">
        <MarketingSection
          id="how-it-works"
          eyebrow="ขั้นตอน"
          title={`ขอใบรับรองใน ${STEPS.length} ขั้นตอน`}
          description="เจ้าหน้าที่ทำสามอย่าง คือ ตรวจเอกสาร ตรวจแปลง และอนุมัติใบรับรอง ส่วนการชำระเงิน ระบบบันทึกให้เอง"
        >
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-lg bg-card p-5 shadow-leaf-card">
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-leaf-700 text-base font-bold tabular-nums text-white"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-card-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </MarketingSection>
      </div>

      <MarketingSection
        id="scope"
        eyebrow="ยื่นอะไรได้บ้าง"
        title={`สมุนไพร ${HERBS.length} ชนิดที่ยื่นขอได้`}
        description="หนึ่งคำขอเลือกได้หลายวัตถุประสงค์ ใบรับรองไม่แยกตามวัตถุประสงค์"
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-card-foreground">สมุนไพร</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {HERBS.map((name) => (
                <li key={name} className="rounded-full bg-leaf-soft px-3 py-1 text-sm font-medium text-leaf-onSoft">
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-card-foreground">วัตถุประสงค์</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              {CERTIFICATION_PURPOSES.map((purpose) => (
                <li key={purpose.code}>{purpose.label}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-card-foreground">ลักษณะพื้นที่ปลูก</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              {AREA_TYPE_OPTIONS.map((area) => (
                <li key={area.value}>{area.labelTH}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">ได้ใบรับรองแยกหนึ่งใบต่อลักษณะพื้นที่ปลูก</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          ค่าบริการคิดต่อลักษณะพื้นที่ปลูก แบ่งชำระ 2 งวด ดูราคาล่าสุดได้ที่{' '}
          <Link href="/pricing" className="font-semibold text-primary underline dark:text-primary-300">
            หน้าค่าบริการ
          </Link>
        </p>
      </MarketingSection>

      <div className="bg-mint-bg">
        <MarketingSection id="faqs" eyebrow="คำถามที่พบบ่อย" title="ถามบ่อยก่อนยื่นคำขอ">
          <div className="max-w-3xl space-y-3">
            {faqItems(validity).map((item) => (
              <details key={item.question} className="group rounded-lg bg-card p-5 shadow-leaf-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded text-base font-semibold text-card-foreground [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-leaf-soft text-lg text-leaf-onSoft transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </MarketingSection>
      </div>
    </>
  );
}
