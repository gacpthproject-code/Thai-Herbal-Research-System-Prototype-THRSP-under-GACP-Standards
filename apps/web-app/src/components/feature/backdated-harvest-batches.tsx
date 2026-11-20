import { Badge } from '@/components/ui/primitives/badge';
import { formatThaiDate } from '@/lib/format/thai-date';

export interface BackdatedHarvestBatch {
  batchNumber: string;
  harvestDate: string;
  certificateNumber: string;
}

export function BackdatedHarvestBatches({ batches }: { batches: BackdatedHarvestBatch[] | null | undefined }) {
  if (!batches || batches.length === 0) {
    return null;
  }
  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="backdated-harvest-batches">
      <h3 className="mb-1 text-sm font-semibold text-foreground">รุ่นเก็บเกี่ยวที่บันทึกย้อนหลัง</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        บันทึกหลังรอบปลูกนี้ย้ายไปใบรับรองฉบับต่ออายุแล้ว แต่วันเก็บเกี่ยวอยู่ในช่วงของใบรับรองฉบับก่อน
        จึงผูกกับฉบับก่อน ใช้สุ่มตรวจในการตรวจติดตาม
      </p>
      <ul className="space-y-2">
        {batches.map((batch) => (
          <li key={batch.batchNumber} className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <Badge tone="warning">บันทึกย้อนหลัง</Badge>
            <span className="font-medium">{batch.batchNumber}</span>
            <span>วันเก็บเกี่ยว {formatThaiDate(batch.harvestDate)}</span>
            <span>ใบรับรอง {batch.certificateNumber}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
