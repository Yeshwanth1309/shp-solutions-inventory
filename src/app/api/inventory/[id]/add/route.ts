import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { enforceRateLimit } from '@/server/auth/rate-limit';
import { PERMISSIONS } from '@/lib/permissions';
import { addStock } from '@/server/services/inventory-service';
import { addStockSchema } from '@/server/validation/inventory-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/inventory/:id/add
 *
 * Body carries a client-generated `requestId`; retried requests replay the
 * original result instead of moving stock twice.
 */
export const POST = withRoute<Context>(async (request: Request, { params }) => {
  const session = await requirePermission(PERMISSIONS.INVENTORY_ADD);
  await enforceRateLimit('stockMutation', session.user.id);
  const { id } = await params;
  const body = addStockSchema.parse(await request.json());

  const result = await addStock({
    productId: id,
    quantity: body.quantity,
    reason: body.reason,
    notes: body.notes,
    locationId: body.locationId,
    requestId: body.requestId,
    performedById: session.user.id,
    performedByEmail: session.user.email,
  });

  return ok({
    previousStock: result.previousStock,
    newStock: result.newStock,
    replayed: result.replayed,
    transactionId: result.transaction.id,
  });
});
