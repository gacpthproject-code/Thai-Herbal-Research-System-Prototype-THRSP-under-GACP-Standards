/**
 * Thai names for the packaging codes a lot is created with. A lot made from the
 * planting cycle screen carries the farmer's own free text instead, which is
 * already Thai and shows as typed.
 */
const PACKAGE_TYPE_TH: Readonly<Record<string, string>> = Object.freeze({
  BAG_1KG: 'ถุง 1 กก.',
  BAG_500G: 'ถุง 500 กรัม',
  BOX_5KG: 'กล่อง 5 กก.',
  BOTTLE_100ML: 'ขวด 100 มล.',
  BOTTLE_500ML: 'ขวด 500 มล.',
});

export function packageTypeLabel(code: string | null | undefined): string {
  const raw = String(code ?? '').trim();
  if (!raw) return '-';
  return (Object.prototype.hasOwnProperty.call(PACKAGE_TYPE_TH, raw) ? PACKAGE_TYPE_TH[raw] : undefined) ?? raw;
}
