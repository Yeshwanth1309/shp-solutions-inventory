import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { createLocation, listLocations } from '@/server/services/catalogue-service';
import { locationSchema } from '@/server/validation/catalogue-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.LOCATION_VIEW);
  const locations = await listLocations();
  return ok({ locations });
});

export const POST = withRoute(async (request: NextRequest) => {
  const session = await requirePermission(PERMISSIONS.LOCATION_MANAGE);
  const body = locationSchema.parse(await request.json());
  const location = await createLocation(body, { id: session.user.id, email: session.user.email });
  return ok({ location }, 201);
});
