'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { Topbar } from './topbar';
import { useSession } from '@/hooks/use-session';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/inventory/history': 'Stock history',
  '/inventory/low-stock': 'Low stock',
  '/inventory/out-of-stock': 'Out of stock',
  '/suppliers': 'Suppliers',
  '/customers': 'Customers',
  '/categories': 'Categories',
  '/brands': 'Brands',
  '/locations': 'Locations',
  '/reports': 'Reports',
  '/users': 'Users',
  '/settings': 'Settings',
  '/audit': 'Audit log',
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES).find((key) => pathname.startsWith(`${key}/`));
  return match ? TITLES[match]! : 'SHP Solutions';
}

/**
 * The visible app shell — sidebar, top bar, mobile nav — rendered only once
 * the parent Server Component layout has already confirmed a session
 * exists. This component's own `useSession()` call is for *display* data
 * (name, role, permission-filtered nav items), not for the authentication
 * gate itself; that gate already ran server-side before this ever mounted.
 *
 * The one thing still checked here is the "must change password" nudge —
 * a UX prompt, not a security boundary, so client-side is the right place
 * for it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();

  React.useEffect(() => {
    if (session?.user?.mustChangePassword && pathname !== '/settings') {
      router.replace('/settings?forcePasswordChange=1');
    }
  }, [session, router, pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={titleFor(pathname)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-6">
          <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">{children}</div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
