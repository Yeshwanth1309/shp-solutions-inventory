import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { enforceRateLimit } from '@/server/auth/rate-limit';
import { PERMISSIONS } from '@/lib/permissions';
import { removeStock } from '@/server/services/inventory-service';
import { removeStockSchema } from '@/server/validation/inventory-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/inventory/:id/remove
 *
 * A removal larger than what's on hand is rejected with 409 INSUFFICIENT_STOCK
 * and leaves the ledger and stock level exactly as they were.
 */
export const POST = withRoute<Context>(async (request: Request, { params }) => {
  const session = await requirePermission(PERMISSIONS.INVENTORY_REMOVE);
  await enforceRateLimit('stockMutation', session.user.id);
  const { id } = await params;
  const body = removeStockSchema.parse(await request.json());

  const result = await removeStock({
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
