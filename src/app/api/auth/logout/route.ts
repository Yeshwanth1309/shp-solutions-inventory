import { ok, withRoute } from '@/server/http/route-handler';
import { getSession } from '@/server/http/auth-guard';
import { revokeSession } from '@/server/services/session-service';
import { recordAudit } from '@/server/services/audit-service';
import { clearSessionCookie } from '@/server/http/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — revokes the session server-side, not just the cookie. */
export const POST = withRoute(async () => {
  const session = await getSession();
  if (session) {
    await revokeSession(session.id);
    await recordAudit({
      action: 'LOGOUT',
      actorId: session.user.id,
      actorEmail: session.user.email,
      summary: `Signed out ${session.user.email}`,
    });
  }
  await clearSessionCookie();
  return ok({ signedOut: true });
});
