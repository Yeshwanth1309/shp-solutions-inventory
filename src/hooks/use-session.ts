'use client';

import * as React from 'react';
import { apiGet } from '@/lib/api-client';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleKey: 'ADMIN' | 'INVENTORY_MANAGER' | 'STAFF';
  roleName: string;
  mustChangePassword: boolean;
  permissions: string[];
}

interface SessionResponse {
  authenticated: boolean;
  user?: SessionUser;
}

/** Client-side view of who is signed in. Refetches on demand via `refresh`. */
export function useSession() {
  const [data, setData] = React.useState<SessionResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<SessionResponse>('/api/auth/session');
      setData(result);
    } catch {
      // A failed session check is treated as "not signed in" rather than a
      // crash — the app-shell layout already redirects to /login when
      // authenticated is false, which is the right behaviour here too.
      setData({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const can = React.useCallback((permission: string) => Boolean(data?.user?.permissions.includes(permission)), [data]);

  return { session: data, loading, refresh, can };
}
