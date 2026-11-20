import Image from 'next/image';
import Link from 'next/link';

/** The one header of the public certificate-check pages: ministry seal + where you are. */
export function PublicVerifyHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-primary-100 bg-card/95 backdrop-blur-sm dark:border-border">
      <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-600"
        >
          <Image src="/images/dtam-seal.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-bold text-primary">ตรวจสอบใบรับรอง GACP</span>
            <span className="block truncate text-[11px] text-muted-foreground">กรมการแพทย์แผนไทยและการแพทย์ทางเลือก</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
