import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { createBrand, listBrands } from '@/server/services/catalogue-service';
import { brandSchema } from '@/server/validation/catalogue-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const brands = await listBrands();
  return ok({ brands });
});

export const POST = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.PRODUCT_CREATE);
  const body = brandSchema.parse(await request.json());
  const brand = await createBrand(body);
  return ok({ brand }, 201);
});
