export function unfiledLabel(status: string | null | undefined): string {
  return String(status ?? '').toUpperCase() === 'DRAFT' ? 'ยังไม่ได้ยื่น' : 'ไม่มีบันทึกวันที่ยื่น';
}
