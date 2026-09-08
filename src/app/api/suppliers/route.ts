import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { createSupplier, listSuppliers } from '@/server/services/catalogue-service';
import { supplierSchema } from '@/server/validation/catalogue-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.SUPPLIER_VIEW);
  const suppliers = await listSuppliers();
  return ok({ suppliers });
});

export const POST = withRoute(async (request: NextRequest) => {
  const session = await requirePermission(PERMISSIONS.SUPPLIER_MANAGE);
  const body = supplierSchema.parse(await request.json());
  const supplier = await createSupplier(body, { id: session.user.id, email: session.user.email });
  return ok({ supplier }, 201);
});
