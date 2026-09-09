'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';
import { useSession } from '@/hooks/use-session';
import { apiPost } from '@/lib/api-client';

export function MobileMoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const { session, can } = useSession();
  const items = NAV_ITEMS.filter((item) => can(item.permission));

  async function handleSignOut() {
    await apiPost('/api/auth/logout');
    window.location.href = '/login';
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 data-[state=open]:animate-fade-in md:hidden" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-border bg-card',
            'data-[state=open]:animate-slide-up md:hidden',
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-sm p-1 text-muted-foreground hover:bg-accent">
              <X className="h-5 w-5" aria-hidden />
              <span className="sr-only">Close menu</span>
            </DialogPrimitive.Close>
          </div>

          <nav className="grid grid-cols-3 gap-1 p-3" aria-label="All pages">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <DialogPrimitive.Close key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-md p-3 text-center text-xs font-medium',
                      active ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-accent',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                </DialogPrimitive.Close>
              );
            })}
          </nav>

          <div className="border-t border-border p-3">
            <p className="mb-2 truncate px-1 text-xs text-muted-foreground">
              {session?.user?.name} · {session?.user?.roleName}
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}