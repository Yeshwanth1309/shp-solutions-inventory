import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, withRoute } from '@/server/http/route-handler';
import { requireSession, getClientContext } from '@/server/http/auth-guard';
import { consumeRecoveryCode, verifyUserTotp } from '@/server/services/auth-service';
import { markSessionMfaVerified } from '@/server/services/session-service';
import { recordAudit } from '@/server/services/audit-service';
import { unauthenticated } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().trim().min(6).max(32),
  mode: z.enum(['totp', 'recovery']).default('totp'),
});

/** POST /api/auth/mfa/verify — completes the second factor for this session. */
export const POST = withRoute(async (request: NextRequest) => {
  const session = await requireSession();
  const body = schema.parse(await request.json());
  const context = await getClientContext();

  const valid =
    body.mode === 'recovery'
      ? await consumeRecoveryCode(session.user.id, body.code)
      : await verifyUserTotp(session.user.id, body.code);

  if (!valid) throw unauthenticated('That code is not valid. Try again.');

  await markSessionMfaVerified(session.id);
  await recordAudit({
    action: 'LOGIN',
    actorId: session.user.id,
    actorEmail: session.user.email,
    summary: `Completed two-factor sign-in for ${session.user.email}`,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return ok({ verified: true });
});
