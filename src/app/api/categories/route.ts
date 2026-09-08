import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { createCategory, listCategories } from '@/server/services/catalogue-service';
import { categorySchema } from '@/server/validation/catalogue-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const categories = await listCategories();
  return ok({ categories });
});

export const POST = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.PRODUCT_CREATE);
  const body = categorySchema.parse(await request.json());
  const category = await createCategory(body);
  return ok({ category }, 201);
});
