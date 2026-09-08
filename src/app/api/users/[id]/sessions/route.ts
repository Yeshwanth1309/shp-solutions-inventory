import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { revokeUserSessions } from '@/server/services/user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** DELETE /api/users/:id/sessions — force-signs a user out of every device. */
export const DELETE = withRoute<Context>(async (_request, { params }) => {
  const session = await requirePermission(PERMISSIONS.SESSION_REVOKE);
  const { id } = await params;
  const revoked = await revokeUserSessions(id, { id: session.user.id, email: session.user.email });
  return ok({ revoked });
});
