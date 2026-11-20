'use client';

/**
 * /health/home — farmer tile launcher (N1, N5-N7).
 *
 * Hub-and-spoke replacement for the old menu-row dashboard: a heading
 * ("คุณต้องการทำอะไรวันนี้") over a 2-column grid of primary-tier NavTiles,
 * plus a small "เมนูเพิ่มเติม" row for secondary-tier items. The 'home'
 * item itself (tier: 'system') is filtered out — it must never render as
 * a tile pointing at itself.
 *
 * One data source: useNavChips() for the pendingActions/unpaid chip text. Every
 * tile is a plain link; the planting page explains for itself when a
 * certificate is missing.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/primitives/button';
import { NavTile } from '@/components/navigation/nav-tile';
import { getNavForRole } from '@/lib/navigation/nav-config';
import { useNavChips } from '@/lib/navigation/use-nav-chips';

export default function HealthHomeClientView() {
  const chips = useNavChips({ certLock: false });

  const navItems = getNavForRole('health').filter((item) => item.tier !== 'system');
  const primaryItems = navItems.filter((item) => item.tier === 'primary');
  const secondaryItems = navItems.filter((item) => item.tier === 'secondary');

  return (
    <div className="w-full space-y-[22px]">
      <h1 className="text-2xl font-bold text-foreground">คุณต้องการทำอะไรวันนี้</h1>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {primaryItems.map((item) => {
          const chipSource = item.chipSource;
          const chipText = chipSource ? chips[chipSource] : null;
          return (
            <NavTile
              key={item.key}
              item={item}
              chipText={chipText}
            />
          );
        })}
      </div>

      {secondaryItems.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold text-muted-foreground">เมนูเพิ่มเติม</span>
          <div className="flex flex-wrap gap-3">
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.key} asChild variant="outline" size="md">
                  <Link href={item.path}>
                    <Icon className="mr-1.5 h-[17px] w-[17px]" aria-hidden="true" focusable="false" />
                    {item.labelTH}
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
