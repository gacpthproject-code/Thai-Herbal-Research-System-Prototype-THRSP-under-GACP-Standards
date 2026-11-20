'use client';

/**
 * The holder record's fields for one holder type (orders 134 task 2, 142).
 *
 * Presentational: the page owns reading and saving. Fields a verified login filled are
 * shown but cannot be typed into, and say why.
 */

import { Lock } from 'lucide-react';
import { HOLDER_PAGE_COPY_TH, HOLDER_TYPES, type HolderField, type HolderType } from '@/lib/holder/holder-registry';

export interface HolderFormProps {
    type: HolderType;
    values: Readonly<Record<string, string>>;
    onChange: (path: string, value: string) => void;
    lockedFields?: readonly string[];
    /** Server messages by field path, from a refused save. */
    fieldErrors?: Readonly<Record<string, string>>;
    /** The masked value on record for a field that starts empty (a national ID). */
    placeholders?: Readonly<Record<string, string>>;
}

const INPUT_CLASS =
    'w-full rounded-xl border-2 border-muted bg-card px-4 py-2.5 text-sm text-foreground focus:border-leaf-700 focus:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground';

function FieldInput({ field, value, locked, error, placeholder, onChange }: {
    field: HolderField;
    value: string;
    locked: boolean;
    error: string | undefined;
    placeholder: string | undefined;
    onChange: (path: string, value: string) => void;
}) {
    const inputId = `holder-${field.path.replace('.', '-')}`;
    const help = locked ? HOLDER_PAGE_COPY_TH.lockedHelp : placeholder ? HOLDER_PAGE_COPY_TH.keepNationalId : field.helpTh;
    return (
        <div className="space-y-1">
            <label htmlFor={inputId} className="flex items-center gap-1 text-sm font-medium text-foreground">
                {field.labelTh}
                {field.required && <span aria-hidden className="text-destructive">*</span>}
                {field.required && <span className="sr-only"> (บังคับ)</span>}
                {locked && <Lock aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />}
            </label>
            <input
                id={inputId}
                type={field.kind === 'email' ? 'email' : field.kind === 'tel' ? 'tel' : 'text'}
                // A national ID is digits, never type="number": a leading zero is significant.
                inputMode={field.kind === 'nationalId' || field.kind === 'tel' ? 'numeric' : undefined}
                value={value}
                placeholder={placeholder}
                disabled={locked}
                aria-invalid={error ? true : undefined}
                onChange={(e) => onChange(field.path, e.target.value)}
                className={INPUT_CLASS}
            />
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            {!error && help && <p className="text-xs text-muted-foreground">{help}</p>}
        </div>
    );
}

export function HolderForm({ type, values, onChange, lockedFields = [], fieldErrors = {}, placeholders = {} }: HolderFormProps) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {HOLDER_TYPES[type].fields.map((field) => (
                <FieldInput
                    key={field.path}
                    field={field}
                    value={values[field.path] ?? ''}
                    locked={lockedFields.includes(field.path)}
                    error={fieldErrors[field.path]}
                    placeholder={placeholders[field.path]}
                    onChange={onChange}
                />
            ))}
        </div>
    );
}

export const HOLDER_FORM_INPUT_CLASS = INPUT_CLASS;
