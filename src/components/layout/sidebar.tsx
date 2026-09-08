'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Printer, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';
import { useSession } from '@/hooks/use-session';
import { apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

export function Sidebar() {
  const pathname = usePathname();
  const { session, can } = useSession();

  async function handleSignOut() {
    await apiPost('/api/auth/logout');
    window.location.href = '/login';
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Printer className="h-5 w-5 text-primary" aria-hidden />
        <span className="text-sm font-semibold">SHP Solutions</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
        {NAV_ITEMS.filter((item) => can(item.permission)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-accent',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 truncate px-1 text-xs text-muted-foreground">
          {session?.user?.name} · {session?.user?.roleName}
        </div>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
