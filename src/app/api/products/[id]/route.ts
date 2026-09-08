import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { getProductById, updateProduct } from '@/server/services/product-service';
import { getStockByLocation } from '@/server/services/inventory-service';
import { productUpdateSchema } from '@/server/validation/product-schemas';
import { notFound } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/products/:id — detail view, including the per-location breakdown. */
export const GET = withRoute<Context>(async (_request, { params }) => {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) throw notFound('That product no longer exists.');
  const byLocation = await getStockByLocation(id);
  return ok({ product, byLocation });
});

/** PATCH /api/products/:id — partial update; deactivation goes through the same endpoint. */
export const PATCH = withRoute<Context>(async (request: Request, { params }) => {
  const session = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const { id } = await params;
  const body = productUpdateSchema.parse(await request.json());
  const product = await updateProduct(id, body, { id: session.user.id, email: session.user.email });
  return ok({ product });
});
