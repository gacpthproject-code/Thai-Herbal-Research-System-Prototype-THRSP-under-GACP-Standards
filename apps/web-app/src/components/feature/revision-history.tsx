/**
 * Each earlier round the document reviewer sent back: which papers, why, and by when.
 * Shared by the reviewer's check screen (rounds before the current one) and the approver's
 * decision file (every round). The server builds the list (revisionRoundsOf); this only shows it.
 */

import { formatThaiDate } from '@/lib/format/thai-date';

export interface RevisionRound {
    round: number;
    requests: Array<{
        slotId: string;
        labelTH: string;
        reason: string | null;
        requestedAt: string | null;
        dueDate: string | null;
    }>;
}

const DAY = { day: 'numeric', month: 'long', year: 'numeric' } as const;

export function RevisionHistoryList({ rounds }: { rounds: RevisionRound[] }) {
    return (
        <ol className="space-y-3 text-sm">
            {rounds.map((r) => (
                <li key={r.round} data-revision-round={r.round} className="rounded-lg border border-border p-3">
                    <p className="font-medium text-foreground">ส่งกลับรอบที่ {r.round}</p>
                    <ul className="mt-1 space-y-1">
                        {r.requests.map((q) => (
                            <li key={q.slotId}>
                                <span className="font-medium">{q.labelTH}</span>
                                {q.reason ? `: ${q.reason}` : ''}
                                <span className="block text-xs text-muted-foreground">
                                    ขอเมื่อ {formatThaiDate(q.requestedAt, DAY, 'ไม่ระบุ')} · กำหนดส่ง {formatThaiDate(q.dueDate, DAY, 'ไม่ระบุ')}
                                </span>
                            </li>
                        ))}
                    </ul>
                </li>
            ))}
        </ol>
    );
}
