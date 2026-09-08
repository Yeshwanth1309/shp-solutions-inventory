import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { quickSearch } from '@/server/services/product-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/products/search?q= — typeahead used by the dashboard quick-search bar. */
export const GET = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const term = new URL(request.url).searchParams.get('q') ?? '';
  const results = await quickSearch(term);
  return ok({ results });
});
