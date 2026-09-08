import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requireSession } from '@/server/http/auth-guard';
import { changePassword } from '@/server/services/auth-service';
import { changePasswordSchema } from '@/server/validation/auth-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/password — changes the caller's own password and signs every
 * other session out.
 */
export const POST = withRoute(async (request: NextRequest) => {
  const session = await requireSession();
  const body = changePasswordSchema.parse(await request.json());
  await changePassword(session.user.id, body.currentPassword, body.newPassword, session.id);
  return ok({ changed: true });
});
