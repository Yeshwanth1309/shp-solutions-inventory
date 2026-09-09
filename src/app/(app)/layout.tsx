'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { Topbar } from '@/components/layout/topbar';
import { useSession } from '@/hooks/use-session';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/inventory/history': 'Stock history',
  '/inventory/low-stock': 'Low stock',
  '/inventory/out-of-stock': 'Out of stock',
  '/suppliers': 'Suppliers',
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading } = useSession();

  React.useEffect(() => {
    if (loading) return;
    if (!session?.authenticated) {
      router.replace('/login');
      return;
    }
    if (session.mfaSatisfied === false) {
      router.replace('/login/mfa');
      return;
    }
    if (session.user?.mustChangePassword && pathname !== '/settings') {
      router.replace('/settings?forcePasswordChange=1');
    }
  }, [loading, session, router, pathname]);

  if (loading || !session?.authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-pulse rounded-full bg-muted" aria-hidden />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

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
