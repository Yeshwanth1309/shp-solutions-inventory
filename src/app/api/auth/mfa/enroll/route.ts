import { ok, withRoute } from '@/server/http/route-handler';
import { requireVerifiedSession } from '@/server/http/auth-guard';
import { beginMfaEnrolment } from '@/server/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/mfa/enroll — issues a new TOTP secret and QR code.
 * The secret stays unconfirmed (and unusable) until /confirm succeeds.
 */
export const POST = withRoute(async () => {
  const session = await requireVerifiedSession();
  const enrolment = await beginMfaEnrolment(session.user.id, session.user.email);
  return ok({ otpauthUrl: enrolment.otpauthUrl, qrDataUrl: enrolment.qrDataUrl, secret: enrolment.secret });
});
