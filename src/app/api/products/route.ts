import { type NextRequest } from 'next/server';
import { ok, searchParamsToObject, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { listProducts, createProduct, getCatalogueOptions } from '@/server/services/product-service';
import { productListQuerySchema, productSchema } from '@/server/validation/product-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/products — paginated, filtered, sorted. Never the whole catalogue. */
export const GET = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const query = productListQuerySchema.parse(searchParamsToObject(request.url));
  const [page, options] = await Promise.all([listProducts(query), getCatalogueOptions()]);
  return ok({ ...page, options });
});

/** POST /api/products — create a product. No demo data is ever inserted here. */
export const POST = withRoute(async (request: NextRequest) => {
  const session = await requirePermission(PERMISSIONS.PRODUCT_CREATE);
  const body = productSchema.parse(await request.json());
  const product = await createProduct(body, { id: session.user.id, email: session.user.email });
  return ok({ product }, 201);
});
