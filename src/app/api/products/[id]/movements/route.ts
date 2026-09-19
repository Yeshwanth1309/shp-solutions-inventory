import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { getProductMovementHistory } from '@/server/services/history-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/products/:id/movements — recent in/out history for one product, with supplier/customer per row. */
export const GET = withRoute<Context>(async (_request, { params }) => {
  await requirePermission(PERMISSIONS.INVENTORY_HISTORY_VIEW);
  const { id } = await params;
  const items = await getProductMovementHistory(id, 20);
  return ok({ items });
});
