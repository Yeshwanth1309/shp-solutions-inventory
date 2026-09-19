import { NextResponse, type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { loginSchema } from '@/server/validation/auth-schemas';
import { verifyCredentials } from '@/server/services/auth-service';
import { createSession } from '@/server/services/session-service';
import { recordAudit } from '@/server/services/audit-service';
import { getClientContext } from '@/server/http/auth-guard';
import { issueCsrfCookie, writeSessionCookie } from '@/server/http/session-cookie';
import { generateCsrfToken } from '@/server/auth/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login
 *
 * Email and password only. A new session is always issued here rather than
 * upgrading an existing one, which is what closes session fixation.
 */
export const POST = withRoute(async (request: NextRequest) => {
  const body = loginSchema.parse(await request.json());
  const context = await getClientContext();

  const credentials = await verifyCredentials(body.email, body.password, context);

  const session = await createSession({
    userId: credentials.userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  await writeSessionCookie(session.token, session.expiresAt);
  await issueCsrfCookie(generateCsrfToken());

  await recordAudit({
    action: 'LOGIN',
    actorId: credentials.userId,
    actorEmail: credentials.email,
    summary: `Signed in as ${credentials.email}`,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return ok({
    mustChangePassword: credentials.mustChangePassword,
    user: { id: credentials.userId, email: credentials.email, name: credentials.name, roleKey: credentials.roleKey },
  });
});

export function GET() {
  return NextResponse.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } }, { status: 405 });
}
