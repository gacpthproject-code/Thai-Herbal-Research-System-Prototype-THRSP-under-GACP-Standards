'use client';

/**
 * วันหยุดพิเศษ (operator order 32, 2026-10-07): the DTAM admin adds a special holiday the
 * cabinet announced, and revision deadlines computed from then on skip it. Rows are
 * append-only on the server, so this panel adds and lists; it never edits or deletes.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives/card';
import { apiClient } from '@/lib/api/api-client';
import { formatThaiDate } from '@/lib/format/thai-date';

interface SpecialHoliday {
  id: string;
  date: string;
  name: string;
  reason: string;
}

const REASON_MIN_LENGTH = 5;

const REFUSAL_TH: Readonly<Record<string, string>> = Object.freeze({
  SPECIAL_HOLIDAY_EXISTS: 'วันนี้เป็นวันหยุดพิเศษอยู่แล้ว',
  SPECIAL_HOLIDAY_ADMIN_ONLY: 'เพิ่มวันหยุดพิเศษได้เฉพาะผู้ดูแลระบบฝั่งกรม',
  SPECIAL_HOLIDAY_INVALID: `ระบุวันที่ ชื่อวันหยุด และเหตุผลอย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร`,
});
const ADD_FAILED_TH = 'เพิ่มวันหยุดพิเศษไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง';

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';

export function SpecialHolidaysPanel() {
  const [rows, setRows] = useState<SpecialHoliday[]>([]);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<SpecialHoliday[]>('/admin/special-holidays');
      if (res.success && Array.isArray(res.data)) setRows(res.data);
    } catch { /* the list stays as it was */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ready = /^\d{4}-\d{2}-\d{2}$/.test(date) && name.trim() !== '' && reason.trim().length >= REASON_MIN_LENGTH;

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.post<SpecialHoliday>('/admin/special-holidays', {
        date, name: name.trim(), reason: reason.trim(),
      });
      if (res.success) {
        setDate('');
        setName('');
        setReason('');
        await load();
      } else {
        const code = [res.errorCode, res.code, res.error].find((c) => c && REFUSAL_TH[c]);
        setError((code && REFUSAL_TH[code]) || ADD_FAILED_TH);
      }
    } catch {
      setError(ADD_FAILED_TH);
    }
    setSaving(false);
  };

  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardHeader className="border-b border-border/50 bg-muted/30 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <CalendarPlus className="h-4 w-4 text-primary" />
          วันหยุดพิเศษ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <p className="text-xs text-muted-foreground">
          วันหยุดที่เพิ่มที่นี่ไม่นับเป็นวันทำการเมื่อคำนวณกำหนดแก้ไขตั้งแต่นี้ไป กำหนดที่ออกไปแล้วไม่เปลี่ยน
          เพิ่มแล้วแก้หรือลบไม่ได้ ตรวจวันที่ให้ถูกก่อนกดเพิ่ม
        </p>
        <div className="grid max-w-lg gap-3">
          <label className="text-xs font-bold text-foreground">
            วันที่
            <input type="date" data-testid="holiday-date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-foreground">
            ชื่อวันหยุด
            <input type="text" data-testid="holiday-name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-foreground">
            เหตุผลหรือที่มา (เช่น มติ ครม. วันที่)
            <input type="text" data-testid="holiday-reason" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </label>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          <Button onClick={add} disabled={!ready || saving} className="rounded-xl font-bold">เพิ่มวันหยุดพิเศษ</Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีวันหยุดพิเศษ</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3 text-sm">
                <p className="font-bold text-foreground">{formatThaiDate(row.date)} · {row.name}</p>
                <p className="text-xs text-muted-foreground">{row.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
