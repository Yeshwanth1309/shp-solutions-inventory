import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { updateSupplier } from '@/server/services/catalogue-service';
import { supplierSchema } from '@/server/validation/catalogue-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withRoute<Context>(async (request: Request, { params }) => {
  const session = await requirePermission(PERMISSIONS.SUPPLIER_MANAGE);
  const { id } = await params;
  const body = supplierSchema.partial().parse(await request.json());
  const supplier = await updateSupplier(id, body, { id: session.user.id, email: session.user.email });
  return ok({ supplier });
});
