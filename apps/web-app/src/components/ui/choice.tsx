'use client';

import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/primitives/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/primitives/radio-group';
import { cn } from '@/lib/utils';

export type ChoiceMode = 'multi' | 'single';

export interface ChoiceOption<T extends string> {
    value: T;
    labelTH: string;
    detail?: ReactNode;
    disabled?: boolean;
}

export const HELPER_TEXT = 'text-[13px] leading-relaxed text-foreground/80';

const MARK = 'h-5 w-5 border-2 border-foreground/60 bg-card shadow-none';

export function TickBox({ id, checked, onCheckedChange, disabled, ...aria }: {
    id: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean | undefined;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}) {
    return (
        <Checkbox
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={(state) => onCheckedChange(state === true)}
            className={cn(MARK, 'rounded data-[state=checked]:border-leaf-700 data-[state=checked]:bg-leaf-700 data-[state=checked]:text-white dark:data-[state=checked]:border-leaf dark:data-[state=checked]:bg-leaf dark:data-[state=checked]:text-background')}
            {...aria}
        />
    );
}

export function RadioDot({ id, value, disabled, ...aria }: {
    id: string;
    value: string;
    disabled?: boolean | undefined;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}) {
    return (
        <RadioGroupItem
            id={id}
            value={value}
            disabled={disabled}
            className={cn(MARK, 'text-leaf-700 data-[state=checked]:border-leaf-700 dark:text-leaf dark:data-[state=checked]:border-leaf')}
            {...aria}
        />
    );
}

export { RadioGroup };

export function ChoiceGroup<T extends string>({
    mode, options, isChecked, onPick, labelledBy, label, className,
}: {
    mode: ChoiceMode;
    options: ReadonlyArray<ChoiceOption<T>>;
    isChecked: (value: T) => boolean;
    onPick: (value: T) => void;
    labelledBy?: string;
    label?: string;
    className?: string;
}) {
    const baseId = useId();
    const groupName = labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label };

    const tiles = options.map((option, index) => {
        const id = `${baseId}-${index}`;
        const checked = isChecked(option.value);
        const aria = {
            'aria-labelledby': `${id}-label`,
            ...(option.detail ? { 'aria-describedby': `${id}-detail` } : {}),
        };
        return (
            <label
                key={option.value}
                htmlFor={id}
                className={cn(
                    'flex min-h-11 items-start gap-3 rounded-xl border-2 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                    option.detail ? 'p-4' : 'p-3',
                    checked ? 'border-leaf-700 bg-leaf-soft' : 'border-muted bg-card',
                    option.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                    !checked && !option.disabled && 'hover:border-leaf-300',
                )}
            >
                {mode === 'single'
                    ? <RadioDot id={id} value={option.value} disabled={option.disabled} {...aria} />
                    : <TickBox id={id} checked={checked} disabled={option.disabled} onCheckedChange={() => onPick(option.value)} {...aria} />}
                <span className="flex min-w-0 flex-col gap-1">
                    <span id={`${id}-label`} className={cn('text-sm text-foreground', option.detail && 'font-semibold')}>
                        {option.labelTH}
                    </span>
                    {option.detail && <span id={`${id}-detail`} className={HELPER_TEXT}>{option.detail}</span>}
                </span>
            </label>
        );
    });

    if (mode === 'single') {
        const picked = options.find((option) => isChecked(option.value));
        return (
            <RadioGroup
                {...groupName}
                value={picked?.value ?? ''}
                onValueChange={(next) => {
                    const option = options.find((candidate) => candidate.value === next);
                    if (option) { onPick(option.value); }
                }}
                className={cn('grid gap-2', className)}
            >
                {tiles}
            </RadioGroup>
        );
    }

    return (
        <div role="group" {...groupName} className={cn('grid gap-2', className)}>
            {tiles}
        </div>
    );
}
