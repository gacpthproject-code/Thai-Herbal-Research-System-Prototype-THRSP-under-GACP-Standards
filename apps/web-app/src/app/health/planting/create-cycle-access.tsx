'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/primitives/button';
import { useNavChips } from '@/lib/navigation/use-nav-chips';

export const NO_CERTIFICATE_MESSAGE = 'สร้างรอบปลูกได้เมื่อได้รับใบรับรอง GACP';

/**
 * True only once the certificate list has loaded and holds no usable
 * certificate (getCertBadgeKind !== 'expired', via useNavChips). While
 * loading or on error it is false: the page must not claim the user lacks a
 * certificate when it does not know. The server (createCycle) decides.
 */
export function useLacksCertificate(): boolean {
  const { hasActiveCert, certsLoaded } = useNavChips({ chips: false });
  return certsLoaded && !hasActiveCert;
}

export function NoCertificateNotice({ id }: { id?: string }) {
  return (
    <p id={id} className="text-sm text-muted-foreground">
      {NO_CERTIFICATE_MESSAGE}{' '}
      <Link href="/health/status" className="font-semibold text-leaf-700 underline">
        ดูสถานะคำขอ
      </Link>
    </p>
  );
}

export function CreateCycleButton({
  label,
  size,
  withIcon = false,
}: {
  label: string;
  size?: 'md' | 'lg';
  withIcon?: boolean;
}) {
  const lacksCertificate = useLacksCertificate();
  const noticeId = useId();
  const icon = withIcon ? <Plus className="h-5 w-5" aria-hidden="true" focusable="false" /> : null;

  if (lacksCertificate) {
    return (
      <div className="flex flex-col items-start gap-2">
        {/* aria-disabled, not disabled: the button stays focusable so a keyboard or
            screen-reader user reaches it and hears the reason it cannot be used. */}
        <Button
          type="button"
          variant="primary"
          {...(size ? { size } : {})}
          aria-disabled="true"
          aria-describedby={noticeId}
          className="cursor-not-allowed opacity-50"
        >
          {icon}
          {label}
        </Button>
        <NoCertificateNotice id={noticeId} />
      </div>
    );
  }

  return (
    <Button asChild variant="primary" {...(size ? { size } : {})}>
      <Link href="/health/planting/new" className="flex items-center gap-2 no-underline">
        {icon}
        {label}
      </Link>
    </Button>
  );
}
