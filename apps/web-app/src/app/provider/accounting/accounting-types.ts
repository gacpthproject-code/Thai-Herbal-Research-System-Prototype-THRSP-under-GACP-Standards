export type InvoiceStatus =
    | "PENDING"
    | "PAID"
    | "OVERDUE"
    | "CANCELLED"
    | "PAID_PENDING_RECEIPT"
    | "RECEIPT_ISSUED"
    | "HELD"
    | "FORFEITED";

/**
 * ── walletA / walletB ถูกถอด 2026-09-11 ───────────────────────────────────────
 * operator: *"เราไม่มี wallet A/B แล้ว"* · เดิม walletA = ค่าธรรมเนียมรัฐที่บริษัท
 * เป็นหนี้กรม · walletB = ส่วนที่บริษัทเก็บไว้ · ตอนนี้ค่าบริการเป็นก้อนเดียวและเป็น
 * รายได้ของบริษัททั้งหมด ไม่มีหนี้ที่ต้องนำส่ง จึงไม่มีสองกระเป๋าให้แยก
 */
export interface InvoiceItem {
    id: string;
    invoiceNumber: string;
    applicationNumber: string;
    healthName: string;
    amount: number;
    status: InvoiceStatus | string;
    erpStatus?: string;
    dueDate: string;
    paidAt?: string;
    createdAt: string;
    notes?: string;
    items?: unknown;
    /** 'DTAM' (legacy state fee) | 'PLATFORM' — derived by the backend, same for every viewer */
    issuerSide?: string;
    /** CERTIFICATION_CHECKOUT_M1 / _M2 names the instalment the invoice bills (checkoutMilestoneOf). */
    serviceType?: string;
    /** The mode the settlement that paid this row ran in, as the server recorded it; null before money moved. */
    paymentMode?: 'TRIAL' | 'LIVE' | null;
}

export interface RawInvoice {
    id: string;
    invoiceNumber: string;
    applicationNumber?: string;
    application?: {
        applicationNumber?: string;
    };
    health?: {
        firstName?: string;
        lastName?: string;
        companyName?: string;
    };
    applicant?: {
        firstName?: string;
        lastName?: string;
        companyName?: string;
    };
    totalAmount?: number;
    status: InvoiceStatus | string;
    erpStatus?: string;
    paymentMode?: 'TRIAL' | 'LIVE' | null;
    dueDate: string;
    paidAt?: string;
    createdAt: string;
    notes?: string;
    items?: unknown;
    issuerSide?: string;
    serviceType?: string;
}

export interface PaymentException {
    id: string;
    action: string;
    severity: string;
    createdAt: string;
    invoiceId?: string | null;
    transactionId?: string | null;
    message?: string | null;
}

/** Revenue the company keeps: live paid invoices net of the credit notes against them. */
export interface RevenueFigure {
    gross: number;
    credited: number;
    net: number;
}

/** GET /invoices/summary — the server's shape (invoice-service getSummary). */
export interface PaymentSummary {
    /** The Bangkok month the month figure covers. */
    month: { year: number; month: number };
    revenue: { month: RevenueFigure; allTime: RevenueFigure };
    pendingAmount: number;
    overdueAmount: number;
    invoiceCount: { total: number; pending: number; paid: number; overdue: number };
}

const ZERO_FIGURE: RevenueFigure = { gross: 0, credited: 0, net: 0 };

export const DEFAULT_SUMMARY: PaymentSummary = {
    month: { year: 0, month: 0 },
    revenue: { month: ZERO_FIGURE, allTime: ZERO_FIGURE },
    pendingAmount: 0,
    overdueAmount: 0,
    invoiceCount: { total: 0, pending: 0, paid: 0, overdue: 0 },
};

/**
 * Re-exported, not re-implemented: this was a byte-identical second copy of the reading
 * in payment-service.ts. Two copies of a money vocabulary are two things that can drift,
 * and the drift is invisible until a farmer or an accountant sees the wrong word.
 */
export { normalizeInvoiceStatus } from '@/lib/services/payment-service';
