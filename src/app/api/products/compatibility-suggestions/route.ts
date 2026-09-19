import { type NextRequest } from 'next/server';
import { ok, withRoute } from '@/server/http/route-handler';
import { requirePermission } from '@/server/http/auth-guard';
import { PERMISSIONS } from '@/lib/permissions';
import { searchCompatibilityModels } from '@/server/services/product-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/products/compatibility-suggestions?q=canon — printer models
 * already in use elsewhere, matching what's been typed so far. Backs the
 * autocomplete in the product form's "Compatible with" field.
 */
export const GET = withRoute(async (request: NextRequest) => {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const term = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (term.length < 1) return ok({ models: [] });
  const models = await searchCompatibilityModels(term);
  return ok({ models });
});