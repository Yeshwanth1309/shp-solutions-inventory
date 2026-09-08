import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { enforceRateLimit } from '@/server/auth/rate-limit';
import { PERMISSIONS } from '@/lib/permissions';
import { adjustStock } from '@/server/services/inventory-service';
import { adjustStockSchema } from '@/server/validation/inventory-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** POST /api/inventory/:id/adjust — sets stock to an exact figure via a correcting ledger row. */
export const POST = withRoute<Context>(async (request, { params }) => {
  const session = await requirePermission(PERMISSIONS.INVENTORY_ADJUST);
  await enforceRateLimit('stockMutation', session.user.id);
  const { id } = await params;
  const body = adjustStockSchema.parse(await request.json());

  const result = await adjustStock({
    productId: id,
    targetQuantity: body.targetQuantity,
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
