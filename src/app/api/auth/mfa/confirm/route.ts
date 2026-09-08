import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requireVerifiedSession } from '@/server/http/auth-guard';
import { confirmMfaEnrolment } from '@/server/services/auth-service';
import { markSessionMfaVerified } from '@/server/services/session-service';
import { totpSchema } from '@/server/validation/auth-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/mfa/confirm — proves the app works, then returns recovery codes once. */
export const POST = withRoute(async (request: NextRequest) => {
  const session = await requireVerifiedSession();
  const body = totpSchema.parse(await request.json());
  const recoveryCodes = await confirmMfaEnrolment(session.user.id, body.code);
  await markSessionMfaVerified(session.id);
  return ok({ enabled: true, recoveryCodes });
});
