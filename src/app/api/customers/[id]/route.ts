import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { updateCustomer } from '@/server/services/catalogue-service';
import { customerSchema } from '@/server/validation/catalogue-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withRoute<Context>(async (request: Request, { params }) => {
  const session = await requirePermission(PERMISSIONS.CUSTOMER_MANAGE);
  const { id } = await params;
  const body = customerSchema.partial().parse(await request.json());
  const customer = await updateCustomer(id, body, { id: session.user.id, email: session.user.email });
  return ok({ customer });
});
