import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { getStockMovement } from '@/server/services/report-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/reports/movement?from=&to= — units added/removed and net movement. */
export const GET = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.REPORT_VIEW);
  const params = new URL(request.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  const report = await getStockMovement({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  return ok(report);
});
