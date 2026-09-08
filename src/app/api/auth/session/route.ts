import { ok, withRoute } from '@/server/http/route-handler';
import { getSession } from '@/server/http/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/session — who am I, and what may I do? */
export const GET = withRoute(async () => {
  const session = await getSession();
  if (!session) return ok({ authenticated: false });

  return ok({
    authenticated: true,
    mfaSatisfied: !session.user.mfaEnabled || Boolean(session.mfaVerifiedAt),
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roleKey: session.user.roleKey,
      roleName: session.user.roleName,
      mfaEnabled: session.user.mfaEnabled,
      mustChangePassword: session.user.mustChangePassword,
      permissions: [...session.user.permissions],
    },
  });
});
