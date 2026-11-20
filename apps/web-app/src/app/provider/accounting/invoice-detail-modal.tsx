import { useState } from "react";
import { Button } from '@/components/ui/primitives/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/primitives/dialog';
import { IconCreditCard } from "@tabler/icons-react";
import { invoiceIsPaid } from '@/lib/services/payment-service';
import { type InvoiceItem, normalizeInvoiceStatus } from "./accounting-types";
import { RefundRecordPanel } from "./refund-record-panel";
import { RefundTransferPanel } from "./refund-transfer-panel";
import { TrialMarkedDocument } from '@/components/payments/trial-marks';

interface InvoiceDetailModalProps {
    invoice: InvoiceItem | null;
    onClose: () => void;
    onRefresh: () => void;
    formatCurrency: (amt: number) => string;
    formatDate: (val: string) => string;
    getStatusBadge: (status: string) => React.ReactNode;
    /** Recording a refund — only for the backend refund WRITE_ROLES (canWriteAccounting). */
    canRefund: boolean;
}

export function InvoiceDetailModal({
    invoice,
    onClose,
    onRefresh,
    formatCurrency,
    formatDate,
    getStatusBadge,
    canRefund,
}: InvoiceDetailModalProps) {
    const [recordingRefund, setRecordingRefund] = useState(false);

    if (!invoice) return null;

    return (
        <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl overflow-hidden rounded-lg border-none p-0 shadow-lg">
                <DialogHeader className="bg-primary p-6 text-primary-foreground">
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                        <IconCreditCard size={24} />
                        รายละเอียดการชำระเงิน
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2">
                    <TrialMarkedDocument className="space-y-6 p-8" settledMode={invoice.paymentMode ?? null}>
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                                <p className="text-xs font-medium text-muted-foreground">หมายเลขใบแจ้งหนี้</p>
                                <p className="text-xl font-semibold text-foreground">{invoice.invoiceNumber}</p>
                                <p className="text-sm font-medium text-muted-foreground">{invoice.applicationNumber}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">จำนวนเงิน</p>
                                    <p className="text-lg font-semibold text-primary">{formatCurrency(invoice.amount)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">สถานะ</p>
                                    <div className="mt-1">{getStatusBadge(normalizeInvoiceStatus(invoice))}</div>
                                </div>
                            </div>

                            <hr className="border-border/50" />

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">ชื่อผู้สมัคร</span>
                                    <span className="text-sm font-bold">{invoice.healthName}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">วันที่ออกเอกสาร</span>
                                    <span className="text-sm font-bold">{formatDate(invoice.createdAt)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">กำหนดชำระ</span>
                                    <span className="text-sm font-bold text-rose-600">{formatDate(invoice.dueDate)}</span>
                                </div>
                            </div>
                        </div>

                        <RefundTransferPanel invoiceId={invoice.id} canWrite={canRefund} formatCurrency={formatCurrency} />

                        {canRefund && invoiceIsPaid(invoice) && (
                            <div className="pt-2">
                                {recordingRefund ? (
                                    <RefundRecordPanel
                                        invoice={invoice}
                                        formatCurrency={formatCurrency}
                                        onCancel={() => setRecordingRefund(false)}
                                        onRecorded={() => {
                                            setRecordingRefund(false);
                                            onClose();
                                            onRefresh();
                                        }}
                                    />
                                ) : (
                                    <Button
                                        variant="outline"
                                        className="w-full rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                        onClick={() => setRecordingRefund(true)}
                                    >
                                        บันทึกการคืนเงิน
                                    </Button>
                                )}
                            </div>
                        )}
                    </TrialMarkedDocument>

                    <div className="flex flex-col border-l border-border/50 bg-muted/20 p-8">
                        <p className="mb-6 text-sm font-bold text-foreground">สถานะการวางบิล</p>
                        <div className="space-y-4">
                            {[
                                { label: 'สร้างใบแจ้งหนี้', date: invoice.createdAt, done: true },
                                { label: 'ส่งใบวางบิล', date: invoice.createdAt, done: true },
                                { label: 'ชำระเงิน', date: invoice.paidAt, done: !!invoice.paidAt },
                                { label: 'ออกใบเสร็จ', date: invoice.paidAt, done: normalizeInvoiceStatus(invoice) === 'RECEIPT_ISSUED' },
                            ].map((step, idx) => (
                                <div key={idx} className="flex items-start gap-3">
                                    <div className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                        step.done
                                            ? 'bg-leaf-soft text-leaf-onSoft'
                                            : 'bg-muted text-muted-foreground'
                                    }`}>
                                        {step.done ? '✓' : idx + 1}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-semibold ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</p>
                                        {step.done && step.date && (
                                            <p className="text-xs text-muted-foreground">{formatDate(step.date)}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/*
                          * ── บล็อก "ช่องทางชำระเงิน" ถูกถอด 2026-09-11 ──────────────────
                          * เดิมพิมพ์เลขบัญชีธนาคารของกรมและเลขประจำตัวผู้เสียภาษีของกรม
                          * ไว้ตรง ๆ ในหน้าจอ เป็นค่าคงที่ที่ไม่ได้มาจากแหล่งใดเลย
                          * (ไม่คัดเลขเหล่านั้นมาไว้ในคอมเมนต์: ของที่ถูกถอดต้องหาไม่เจอ)
                          *
                          * operator 2026-09-11: "เลขที่ประจำตัวผู้เสียภาษี เป็นของบริษัท
                          * ค่าเดียว ในใบเสนอราคา ใบวางบิล และใบเสร็จ ก็จะเป็นของบริษัททั้งหมด"
                          *
                          * และการจ่ายเงินเป็น Stripe ไม่ใช่การโอนเข้าบัญชีธนาคารมานานแล้ว
                          * ⇒ กล่องนี้บอกผู้ใช้ให้โอนเงินไปที่ที่ระบบไม่ได้รับเงิน
                          * ช่องทางเดียวที่เป็นจริงอยู่ที่ constants/service-facts.ts
                          * (PAYMENT_CHANNEL_TH) ซึ่งหน้าฝั่งผู้ยื่นคำขอแสดง
                          */}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
