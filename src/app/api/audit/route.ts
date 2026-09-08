import { type NextRequest } from 'next/server';
import { ok, searchParamsToObject, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { listAuditLogs } from '@/server/services/audit-service';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  action: z.string().optional(),
  actorId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** GET /api/audit — admin-only view over the security/business event log. */
export const GET = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const query = querySchema.parse(searchParamsToObject(request.url));
  const logs = await listAuditLogs(query as never);
  return ok({ logs });
});
