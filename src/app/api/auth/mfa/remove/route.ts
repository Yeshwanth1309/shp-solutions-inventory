import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, withRoute } from '@/server/http/route-handler';
import { requireRecentAuth } from '@/server/http/auth-guard';
import { removeMfa } from '@/server/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ currentPassword: z.string().min(1, 'Enter your password') });

/** POST /api/auth/mfa/remove — sensitive, so it needs a recent sign-in and the password again. */
export const POST = withRoute(async (request: NextRequest) => {
  const session = await requireRecentAuth();
  const body = schema.parse(await request.json());
  await removeMfa(session.user.id, body.currentPassword);
  return ok({ enabled: false });
});
