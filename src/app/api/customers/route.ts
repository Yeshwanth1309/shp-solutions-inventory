import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { createCustomer, listCustomers } from '@/server/services/catalogue-service';
import { customerSchema } from '@/server/validation/catalogue-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(async () => {
  await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
  const customers = await listCustomers();
  return ok({ customers });
});

export const POST = withRoute(async (request: NextRequest) => {
  const session = await requirePermission(PERMISSIONS.CUSTOMER_MANAGE);
  const body = customerSchema.parse(await request.json());
  const customer = await createCustomer(body, { id: session.user.id, email: session.user.email });
  return ok({ customer }, 201);
});
