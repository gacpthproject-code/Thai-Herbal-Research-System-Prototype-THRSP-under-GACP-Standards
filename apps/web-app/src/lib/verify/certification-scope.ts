/**
 * The certification scope the public doors answer with (operator order 68(1)): the crop, the
 * cultivation types in Thai and the standard, read by the backend from the certificate's own
 * record. The certificate result page and the lot scan page draw the same line from it.
 */
export interface CertificationScope {
  crop: string | null;
  cultivationTypes: { code: string; labelTh: string }[];
  standard: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isCultivationType(value: unknown): value is { code: string; labelTh: string } {
  const row = value as Record<string, unknown> | null;
  return !!row && typeof row.code === 'string' && typeof row.labelTh === 'string';
}

/** The wire value as a scope, or null when the door sent none. */
export function parseCertificationScope(raw: unknown): CertificationScope | null {
  if (!raw || typeof raw !== 'object') return null;
  const scope = raw as Record<string, unknown>;
  return {
    crop: text(scope.crop),
    cultivationTypes: (Array.isArray(scope.cultivationTypes) ? scope.cultivationTypes : []).filter(isCultivationType),
    standard: text(scope.standard),
  };
}

/** "กัญชา · ปลูกในอาคาร · GACP Thailand": the parts the certificate records, in that order. */
export function scopeLineTh(scope: CertificationScope): string {
  const types = scope.cultivationTypes.map((type) => type.labelTh).join(', ');
  return [scope.crop, types, scope.standard].filter(Boolean).join(' · ');
}
