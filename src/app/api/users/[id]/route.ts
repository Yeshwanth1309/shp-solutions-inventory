import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { updateUser } from '@/server/services/user-service';
import { updateUserSchema } from '@/server/validation/auth-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/users/:id
 * Role and active-state changes are guarded server-side against self-lockout
 * and against removing the last administrator — see user-service.ts.
 */
export const PATCH = withRoute<Context>(async (request: Request, { params }) => {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const { id } = await params;
  const body = updateUserSchema.parse(await request.json());
  const user = await updateUser(id, body, { id: session.user.id, email: session.user.email });
  return ok({ user });
});
