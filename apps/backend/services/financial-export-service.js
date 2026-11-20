/**
 * Financial Export Service
 * ส่งออกข้อมูลการเงินเป็น Excel (.xlsx) และ CSV
 *
 * รองรับ 2 รายงาน:
 * 1. รายงานภาษีขาย (สรรพากร) — Tax Report
 * 2. รายงานสรุปรายได้ประจำเดือน — Monthly Revenue Report
 *
 * รายงานนำส่งเงินกรมฯ (gov_remittance) ถูกถอดแล้ว — บริษัทชำระกับกรมฯ นอกระบบ และลงบัญชี
 * ในสมุดบัญชีของบริษัทเอง แพลตฟอร์มไม่มียอดนำส่งให้รายงาน (operator 2026-09-29)
 */

const { prisma } = require('./prisma-database');
const { neutralizeCsvFormula } = require('../shared/csv-utils'); // C5-04 formula-injection guard
const { createLogger } = require('../shared/logger');
const { classifyRevenueType } = require('./split-payment-calculator');
const { PAYMENT_FEES } = require('../config/payment-fees');
const { DEFAULT_TIME_ZONE, localMonthRange, getZonedParts } = require('../utils/working-days');
const { maskThaiId } = require('../utils/field-encryption');

const logger = createLogger('financial-export');

// ─── Date Helpers ───────────────────────────────────────────

// The export month is the Bangkok calendar month (the ภ.พ.30 month), not the
// process clock's: 00:00 on the 1st in Bangkok to the last millisecond before
// 00:00 on the 1st of the next month (operator 2026-09-26).
function getMonthRange(month, year) {
  const range = localMonthRange(year, month);
  return { start: range.start, end: new Date(range.end.getTime() - 1) };
}

function formatDate(date) {
  if (!date) { return ''; }
  const d = new Date(date);
  return getZonedParts(d).isoDate; // the Bangkok day
}

function formatThaiDate(date) {
  if (!date) { return ''; }
  try {
    return new Date(date).toLocaleDateString('th-TH', {
      timeZone: DEFAULT_TIME_ZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (_e) {
    return formatDate(date);
  }
}

// ─── Query Helpers ──────────────────────────────────────────

async function fetchPaidInvoices(startDate, endDate, extraWhere = {}) {
  return prisma.invoice.findMany({
    where: {
      isDeleted: false,
      status: { in: ['PAID', 'PAID_PENDING_RECEIPT', 'RECEIPT_ISSUED', 'paid'] },
      paidAt: {
        gte: startDate,
        lte: endDate,
      },
      // SoD + tenant scope (VIS-ACCT, multi-role system test 2026-06-24): a
      // single-side accountant must only export THEIR wallet, and the export is
      // org-scoped. This service uses the module prisma client, so it cannot rely
      // on request-scoped auto-org-scoping — the caller threads both in here.
      ...extraWhere,
    },
    include: {
      applicant: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          taxId: true,
        },
      },
      application: {
        select: {
          applicationNumber: true,
        },
      },
    },
    orderBy: { paidAt: 'asc' },
  });
}

const PAYER_SELECT = Object.freeze({ firstName: true, lastName: true, companyName: true, taxId: true });

/**
 * The credit notes issued in the month (ม.86/10: a credit note reduces the output VAT of the
 * month it is issued in), on invoices the paid-invoice read above can report.
 */
async function fetchIssuedCreditNotes(startDate, endDate, extraWhere = {}) {
  return prisma.creditNote.findMany({
    where: {
      isDeleted: false,
      status: { in: ['ISSUED', 'POSTED'] },
      issuedAt: { gte: startDate, lte: endDate },
      originalInvoice: { isDeleted: false },
      ...extraWhere,
    },
    include: {
      originalInvoice: { select: { invoiceNumber: true, receiptNumber: true, applicant: { select: PAYER_SELECT } } },
    },
    orderBy: { issuedAt: 'asc' },
  });
}

function payerNameOf(applicant) {
  return applicant?.companyName
    || `${applicant?.firstName || ''} ${applicant?.lastName || ''}`.trim()
    || '-';
}

// ─── CSV Builder ────────────────────────────────────────────

function buildCSV(headers, rows) {
  const headerLine = headers.join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => {
      const val = neutralizeCsvFormula(String(row[h] ?? '')); // C5-04: defuse =,+,-,@ before quoting
      // Escape CSV: wrap in quotes if contains comma, quote, or newline
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','),
  );
  // BOM for proper Thai encoding in Excel
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

// ─── Report Builders ────────────────────────────────────────

// The amount column is what was received, before credit notes. The finance dashboard's
// revenue is net of them; the column says so, so the two figures never read as one
// (security review 2026-10-09, L7).
const RECEIVED_GROSS_COLUMN = 'ยอดรับชำระ (ก่อนหักใบลดหนี้)';

/**
 * Monthly Revenue Report
 * สรุปยอดรับชำระประจำเดือน (ก่อนหักใบลดหนี้) · ค่าบริการก้อนเดียวในนามบริษัท ไม่แยกกระเป๋า
 * หรือประเภทรายได้ (มติ 2026-09-11)
 */
async function buildMonthlyRevenueReport(month, year, extraWhere = {}) {
  const { start, end } = getMonthRange(month, year);
  const invoices = await fetchPaidInvoices(start, end, extraWhere);

  const headers = [
    'ลำดับ', 'วันที่ชำระ', 'เลขที่ใบแจ้งหนี้', 'เลขที่คำขอ',
    'ผู้ชำระ', 'ประเภทค่าธรรมเนียม',
    RECEIVED_GROSS_COLUMN,
    'สถานะ', 'เลขที่ใบเสร็จ',
  ];

  const rows = invoices.map((inv, idx) => ({
    'ลำดับ': idx + 1,
    'วันที่ชำระ': formatThaiDate(inv.paidAt),
    'เลขที่ใบแจ้งหนี้': inv.invoiceNumber || '-',
    'เลขที่คำขอ': inv.application?.applicationNumber || '-',
    'ผู้ชำระ': payerNameOf(inv.applicant),
    'ประเภทค่าธรรมเนียม': inv.serviceType || '-',
    [RECEIVED_GROSS_COLUMN]: Number(inv.totalAmount || 0).toLocaleString('th-TH'),
    'สถานะ': inv.status,
    'เลขที่ใบเสร็จ': inv.receiptNumber || '-',
  }));

  return {
    title: `รายงานสรุปรายได้ประจำเดือน ${month}/${year}`,
    headers,
    rows,
    period: { month, year },
  };
}

/**
 * Tax Report (สรรพากร)
 * รายงานภาษีขาย — แยกฐานภาษีและ VAT 7% · ใบลดหนี้ที่ออกในเดือนเป็นรายการติดลบ (ม.86/10)
 * จึงยอดรวมของเดือนเป็นภาษีขายสุทธิที่ยื่น ภ.พ.30
 *
 * The buyer's tax id is printed in full only for the company finance officer, who files the
 * return (order 34); everyone else reads it masked to its first digit and last four (order 10).
 *
 * @param {object} [options]
 * @param {boolean} [options.fullTaxIds=false]
 */
async function buildTaxReport(month, year, extraWhere = {}, { fullTaxIds = false } = {}) {
  const { start, end } = getMonthRange(month, year);
  const [invoices, creditNotes] = await Promise.all([
    fetchPaidInvoices(start, end, extraWhere),
    fetchIssuedCreditNotes(start, end, extraWhere),
  ]);
  const taxIdShown = (taxId) => (taxId ? (fullTaxIds ? taxId : maskThaiId(taxId)) : '-');
  const deducted = (amount) => `(${amount.toLocaleString('th-TH')})`;

  const headers = [
    'ลำดับ', 'วันที่', 'เลขที่ใบกำกับภาษี', 'ชื่อผู้ซื้อ', 'เลขประจำตัวผู้เสียภาษี',
    'มูลค่าสินค้า/บริการ (ไม่รวม VAT)', 'ภาษีมูลค่าเพิ่ม 7%', 'ยอดรวมทั้งสิ้น',
    'ยกเว้น VAT', 'หมายเหตุ',
  ];

  let totalTaxable = 0;
  let totalVat = 0;
  let totalExempt = 0;
  let totalAmount = 0;

  const sales = invoices.map((inv) => {
    const revenueType = classifyRevenueType(inv.serviceType);
    const amount = Number(inv.totalAmount || 0);

    let taxableAmount = 0;
    let vatAmount = 0;
    let exemptAmount = 0;

    if (revenueType === 'GOV') {
      // Gov fees are VAT exempt
      exemptAmount = amount;
      totalExempt += exemptAmount;
    } else {
      // Platform fees include VAT. Round VAT at 2 dp (satang), not whole baht —
      // money-flow audit 2026-06-11 (3.3); same fix as split-payment-calculator.
      vatAmount = Math.round(amount * (PAYMENT_FEES.VAT_RATE / (1 + PAYMENT_FEES.VAT_RATE)) * 100) / 100;
      taxableAmount = Math.round((amount - vatAmount) * 100) / 100;
      totalTaxable += taxableAmount;
      totalVat += vatAmount;
    }
    totalAmount += amount;

    return {
      at: inv.paidAt,
      row: {
        'วันที่': formatDate(inv.paidAt),
        'เลขที่ใบกำกับภาษี': inv.receiptNumber || inv.invoiceNumber || '-',
        'ชื่อผู้ซื้อ': payerNameOf(inv.applicant),
        'เลขประจำตัวผู้เสียภาษี': taxIdShown(inv.applicant?.taxId),
        'มูลค่าสินค้า/บริการ (ไม่รวม VAT)': taxableAmount > 0 ? taxableAmount.toLocaleString('th-TH') : '-',
        'ภาษีมูลค่าเพิ่ม 7%': vatAmount > 0 ? vatAmount.toLocaleString('th-TH') : '-',
        'ยอดรวมทั้งสิ้น': amount.toLocaleString('th-TH'),
        'ยกเว้น VAT': exemptAmount > 0 ? exemptAmount.toLocaleString('th-TH') : '-',
        'หมายเหตุ': revenueType === 'GOV' ? 'ค่าธรรมเนียมรัฐ · ยกเว้น VAT' : '',
      },
    };
  });

  // A credit note is a negative line in the month it was issued; the amounts are its own
  // (ม.86/10), printed in brackets so a spreadsheet reads them as negative numbers.
  const deductions = creditNotes.map((cn) => {
    const subtotal = Number(cn.subtotal || 0);
    const vat = Number(cn.vat || 0);
    const total = Number(cn.totalAmount || 0);
    totalTaxable -= subtotal;
    totalVat -= vat;
    totalAmount -= total;
    const original = cn.originalInvoice || {};
    return {
      at: cn.issuedAt,
      row: {
        'วันที่': formatDate(cn.issuedAt),
        'เลขที่ใบกำกับภาษี': cn.creditNoteNumber || '-',
        'ชื่อผู้ซื้อ': payerNameOf(original.applicant),
        'เลขประจำตัวผู้เสียภาษี': taxIdShown(original.applicant?.taxId),
        'มูลค่าสินค้า/บริการ (ไม่รวม VAT)': deducted(subtotal),
        'ภาษีมูลค่าเพิ่ม 7%': deducted(vat),
        'ยอดรวมทั้งสิ้น': deducted(total),
        'ยกเว้น VAT': '-',
        'หมายเหตุ': `ใบลดหนี้ อ้างอิงใบกำกับภาษี ${original.receiptNumber || original.invoiceNumber || '-'}`,
      },
    };
  });

  const rows = [...sales, ...deductions]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .map(({ row }, idx) => ({ 'ลำดับ': idx + 1, ...row }));

  return {
    title: `รายงานภาษีขาย ประจำเดือน ${month}/${year}`,
    headers,
    rows,
    // Boundary-round the float accumulators to 2 dp (audit 2026-06-11 3.3).
    totals: {
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      totalExempt: Math.round(totalExempt * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
    },
    period: { month, year },
  };
}

// ─── Export Functions ────────────────────────────────────────

/**
 * Export a report as CSV.
 * @param {'monthly' | 'tax'} reportType — anything else gets the monthly report
 * @param {number} month
 * @param {number} year
 * @param {object} [extraWhere]  the caller's organization
 * @param {object} [options]     { fullTaxIds } for the tax report (buildTaxReport)
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
async function exportCSV(reportType, month, year, extraWhere = {}, options = {}) {
  let report;
  let filename;

  // The DTAM remittance report is gone (operator 2026-09-29: DTAM is settled
  // offline in the company's own accounts). Asking for it is refused by name
  // rather than answered with a different report under the same request.
  if (reportType === 'gov_remittance') {
    throw Object.assign(
      new Error('The gov_remittance report no longer exists; the platform keeps no DTAM remittance'),
      { status: 400, statusCode: 400, code: 'EXPORT_REPORT_TYPE_RETIRED' },
    );
  }

  switch (reportType) {
    case 'tax':
      report = await buildTaxReport(month, year, extraWhere, options);
      filename = `tax_report_${year}_${String(month).padStart(2, '0')}.csv`;
      break;
    case 'monthly':
    default:
      report = await buildMonthlyRevenueReport(month, year, extraWhere);
      filename = `monthly_revenue_${year}_${String(month).padStart(2, '0')}.csv`;
      break;
  }

  const csv = buildCSV(report.headers, report.rows);
  const buffer = Buffer.from(csv, 'utf-8');

  logger.info(`[Export] Generated ${reportType} CSV: ${filename} (${report.rows.length} rows)`);

  return { buffer, filename, contentType: 'text/csv; charset=utf-8' };
}

module.exports = {
  buildMonthlyRevenueReport,
  buildTaxReport,
  exportCSV,
};
