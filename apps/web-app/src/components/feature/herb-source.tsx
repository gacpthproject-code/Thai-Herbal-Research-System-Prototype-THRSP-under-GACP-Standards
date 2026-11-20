import { formatThaiDate } from '@/lib/format/thai-date';

const CITED = /^(.*) · (https?:\/\/\S+) · เข้าถึง (\d{4}-\d{2}-\d{2})$/;

/** The `source` of a herb knowledge entry, rendered as a link when it cites a document. */
export function HerbSource({ source }: { source?: string | null | undefined }) {
  if (!source) {
    return null;
  }
  if (source.startsWith('AI_DRAFT')) {
    return <p className="mt-1 text-xs text-amber-800">ร่างที่ AI เรียบเรียง ยังไม่ได้ตรวจกับแหล่งอ้างอิง</p>;
  }
  const cited = CITED.exec(source);
  if (!cited) {
    return <p className="mt-1 text-xs text-muted-foreground">ที่มา: {source}</p>;
  }
  const [, document, url, accessed] = cited;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      แหล่งอ้างอิง:{' '}
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
        {document}
      </a>{' '}
      · เปิดอ่านเมื่อ {formatThaiDate(`${accessed}T12:00:00+07:00`)}
    </p>
  );
}
