import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ok, searchParamsToObject, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { enforceRateLimit } from '@/server/auth/rate-limit';
import { PERMISSIONS } from '@/lib/permissions';
import { buildInventoryCsv, getInventorySummary } from '@/server/services/report-service';
import { productListQuerySchema } from '@/server/validation/product-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/inventory — summary by default; add ?format=csv to export.
 * CSV export is rate-limited separately since it can be an expensive query.
 */
export const GET = withRoute(async (request: NextRequest) => {
  const session = await requirePermission(PERMISSIONS.REPORT_VIEW);
  const url = new URL(request.url);
  const format = url.searchParams.get('format');

  if (format === 'csv') {
    await requirePermission(PERMISSIONS.REPORT_EXPORT);
    await enforceRateLimit('report', session.user.id);
    const query = productListQuerySchema.partial().parse(searchParamsToObject(request.url));
    const csv = await buildInventoryCsv(query);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const summary = await getInventorySummary(url.searchParams.get('locationId') ?? undefined);
  return ok(summary);
});
