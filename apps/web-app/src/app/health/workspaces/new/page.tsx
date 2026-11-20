'use client';

/**
 * /health/workspaces/new — create an organisation holder: a company, a partnership or a
 * community enterprise (orders 134 task 2, 142).
 *
 * Everything กทล.1 ส่วนที่ ๑ asks of the holder is collected here once, including the
 * signatory's first and last name in separate fields, and every application filed in this
 * holder's name prints it. The server validates; this page only draws the fields.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Handshake, Users as UsersIcon, ArrowLeft, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/api-client';
import { useMyEntities } from '@/lib/services/my-entities-provider';
import { SummaryHeader } from '@/components/feature';
import { HolderForm, HOLDER_FORM_INPUT_CLASS } from '@/components/holder/holder-form';
import {
    HOLDER_TYPES,
    ORGANISATION_HOLDER_TYPES,
    fieldErrorsOf,
    holderInputFrom,
    registrationNoProblem,
    type OrganisationHolderType,
} from '@/lib/holder/holder-registry';

interface CreateResponse {
    id: string;
    slug: string | null;
    type: OrganisationHolderType;
    displayName: string;
}

const TYPE_CARDS: Record<OrganisationHolderType, { icon: React.ComponentType<{ className?: string | undefined }>; sub: string }> = {
    JURISTIC: { icon: Building2, sub: 'บริษัทจำกัด บริษัทมหาชนจำกัด' },
    PARTNERSHIP: { icon: Handshake, sub: 'ห้างหุ้นส่วนจำกัด ห้างหุ้นส่วนสามัญนิติบุคคล' },
    COMMUNITY_ENTERPRISE: { icon: UsersIcon, sub: 'วิสาหกิจชุมชนที่จดทะเบียนแล้ว' },
};

export default function NewWorkspacePage() {
    const router = useRouter();
    const { refresh } = useMyEntities();

    const [type, setType] = useState<OrganisationHolderType>('JURISTIC');
    const [registrationNo, setRegistrationNo] = useState('');
    const [values, setValues] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const def = HOLDER_TYPES[type];

    const submit = async () => {
        setError(null);
        setFieldErrors({});
        const problem = registrationNoProblem(type, registrationNo);
        if (problem) {
            setFieldErrors({ registrationNo: problem });
            return;
        }
        try {
            setSubmitting(true);
            const res = await apiClient.post<CreateResponse>('/entities', {
                type,
                registrationNo: registrationNo.trim(),
                holder: holderInputFrom(type, values),
            });
            if (!res.success || !res.data) {
                setFieldErrors(fieldErrorsOf(res.meta));
                setError(res.error || 'สร้างผู้ถือไม่สำเร็จ ตรวจข้อมูลที่ระบบแจ้งแล้วลองอีกครั้ง');
                return;
            }
            await refresh();
            // Created from step 1 of a new application (?from=application): go back there
            // with the new holder preselected.
            const fromApplication = new URLSearchParams(window.location.search).get('from') === 'application';
            const target = fromApplication
                ? `/health/applications/new?holder=${encodeURIComponent(res.data.id)}`
                : res.data.slug
                    ? `/health/workspaces/${res.data.slug}/members`
                    : '/health/workspaces';
            router.push(target);
        } catch {
            setError('สร้างผู้ถือไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="w-full space-y-6">
            <Link
                href="/health/workspaces"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                กลับ
            </Link>

            <SummaryHeader
                eyebrow="ทะเบียนผู้ถือ"
                title="เพิ่มบริษัท ห้างหุ้นส่วน หรือวิสาหกิจชุมชน"
                description="กรอกครั้งเดียว ใช้ได้ทุกคำขอ ใบรับรองและแบบคำขอ กทล.1 จะพิมพ์ข้อมูลชุดนี้"
            />

            <div className="grid gap-3 sm:grid-cols-3">
                {ORGANISATION_HOLDER_TYPES.map((t) => (
                    <TypeCard
                        key={t}
                        active={type === t}
                        onClick={() => { setType(t); setFieldErrors({}); }}
                        icon={TYPE_CARDS[t].icon}
                        label={HOLDER_TYPES[t].labelTh}
                        sub={TYPE_CARDS[t].sub}
                    />
                ))}
            </div>

            {def.noteTh && (
                <p role="note" className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    {def.noteTh}
                </p>
            )}

            <div className="space-y-4 rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-700">
                <label className="block space-y-1">
                    <span className="block text-sm font-medium text-foreground">
                        {def.registrationLabelTh}{def.registrationDigits ? ` (${def.registrationDigits} หลัก)` : ''}
                        <span aria-hidden className="ml-1 text-destructive">*</span>
                    </span>
                    {def.registrationHintTh && <span className="block text-xs text-muted-foreground">{def.registrationHintTh}</span>}
                    <input
                        type="text"
                        inputMode={def.registrationDigits ? 'numeric' : 'text'}
                        value={registrationNo}
                        onChange={(e) => setRegistrationNo(def.registrationDigits
                            ? e.target.value.replace(/\D/g, '').slice(0, def.registrationDigits)
                            : e.target.value)}
                        {...(def.registrationDigits ? { maxLength: def.registrationDigits } : {})}
                        aria-invalid={fieldErrors.registrationNo ? true : undefined}
                        className={cn(HOLDER_FORM_INPUT_CLASS, 'font-mono')}
                    />
                    {fieldErrors.registrationNo && <span role="alert" className="block text-xs text-destructive">{fieldErrors.registrationNo}</span>}
                </label>
                <HolderForm
                    type={type}
                    values={values}
                    onChange={(path, value) => setValues((v) => ({ ...v, [path]: value }))}
                    fieldErrors={fieldErrors}
                />
            </div>

            {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex justify-end gap-3">
                <Link
                    href="/health/workspaces"
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/40"
                >
                    ยกเลิก
                </Link>
                <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="rounded-lg bg-leaf-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-leaf-800 disabled:opacity-50"
                >
                    {submitting ? 'กำลังสร้าง…' : 'สร้าง'}
                </button>
            </div>
        </div>
    );
}

interface TypeCardProps {
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string | undefined }>;
    label: string;
    sub: string;
}

function TypeCard({ active, onClick, icon: Icon, label, sub }: TypeCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200',
                active
                    ? 'border-primary bg-primary/5 dark:border-primary dark:bg-primary/15'
                    : 'border-transparent bg-muted hover:border-border hover:bg-card',
            )}
        >
            <div className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                active
                    ? 'bg-leaf-soft text-leaf-onSoft dark:bg-leaf-800/40 dark:text-leaf'
                    : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800',
            )}>
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{label}</p>
                <p className="text-xs leading-snug text-muted-foreground">{sub}</p>
            </div>
        </button>
    );
}
