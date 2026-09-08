import { type NextRequest } from 'next/server';
import { ok, searchParamsToObject, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { listHistory } from '@/server/services/history-service';
import { historyQuerySchema } from '@/server/validation/inventory-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/inventory/history — the read-only, filterable ledger view. */
export const GET = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.INVENTORY_HISTORY_VIEW);
  const query = historyQuerySchema.parse(searchParamsToObject(request.url));
  const page = await listHistory(query);
  return ok(page);
});
