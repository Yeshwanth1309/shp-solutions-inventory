import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { getAttentionList } from '@/server/services/dashboard-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/inventory/low-stock */
export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const items = await getAttentionList('LOW_STOCK');
  return ok({ items });
});
