import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { createUser, listUsers } from '@/server/services/user-service';
import { createUserSchema } from '@/server/validation/auth-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/users — admin-only user directory. */
export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.USER_VIEW);
  const users = await listUsers();
  return ok({ users });
});

/** POST /api/users — create an account. Never accessible to STAFF. */
export const POST = withRoute(async (request: NextRequest) => {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const body = createUserSchema.parse(await request.json());
  const user = await createUser(body, { id: session.user.id, email: session.user.email });
  return ok({ user }, 201);
});
