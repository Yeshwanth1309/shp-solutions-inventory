import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { getProductsForModel } from '@/server/services/dashboard-service';
import { validationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/model-products?model=Canon+G3010 — every active
 * product compatible with that exact printer model, with current stock.
 * Backs the dashboard's expandable "Printer Models & Their Stock" rows.
 */
export const GET = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const model = new URL(request.url).searchParams.get('model');
  if (!model) throw validationError('A model is required.');
  const products = await getProductsForModel(model);
  return ok({ model, products });
});
