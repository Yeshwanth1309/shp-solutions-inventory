import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { getDashboardStats, getRecentActivity, isCatalogueEmpty } from '@/server/services/dashboard-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/dashboard — every figure computed live from the database. */
export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const [stats, recentActivity, isEmpty] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(),
    isCatalogueEmpty(),
  ]);
  return ok({ stats, recentActivity, isEmpty });
});
