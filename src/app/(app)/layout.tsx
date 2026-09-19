import { redirect } from 'next/navigation';
import { getSession } from '@/server/http/auth-guard';
import { AppShell } from '@/components/layout/app-shell';

/**
 * The auth gate for every page behind the sidebar.
 *
 * This is a Server Component specifically so the "are you logged in" check
 * happens before any HTML is ever sent to the browser — not as a client-side
 * check that renders a loading spinner, attempts an API call, gets a 401,
 * and *then* redirects. With the old client-side version, a visitor with no
 * session could briefly see the dashboard shell attempt to load (and the
 * browser network tab would show a real 401 request) before being bounced
 * to /login. Here, `redirect()` fires on the server, mid-request — an
 * unauthenticated visitor's browser never receives dashboard content at
 * all, not even for a moment.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return <AppShell>{children}</AppShell>;
}
