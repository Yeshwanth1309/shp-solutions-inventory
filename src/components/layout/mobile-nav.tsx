'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';
import { useSession } from '@/hooks/use-session';
import { MobileMoreSheet } from './mobile-more-sheet';

const PRIMARY_HREFS = ['/dashboard', '/products', '/inventory/history', '/inventory/low-stock'];

export function MobileNav() {
  const pathname = usePathname();
  const { can } = useSession();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const primaryItems = PRIMARY_HREFS
    .map((href) => NAV_ITEMS.find((item) => item.href === href))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => can(item.permission));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur md:hidden"
        aria-label="Main"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primaryItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium text-muted-foreground"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <Menu className="h-5 w-5" aria-hidden />
          <span className="truncate">More</span>
        </button>
      </nav>

      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}