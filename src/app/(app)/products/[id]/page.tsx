'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PackagePlus, PackageMinus, ClipboardEdit, Pencil, ArrowLeft, Ban, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { apiGet, apiPatch, ApiError } from '@/lib/api-client';
import { StockStatusBadge } from '@/features/products/status-badge';
import { StockMutationDialog } from '@/features/inventory/stock-mutation-dialog';
import { AdjustStockDialog } from '@/features/inventory/adjust-stock-dialog';
import { ProductFormDialog } from '@/features/products/product-form-dialog';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';
import { humanise } from '@/lib/utils';
import type { ProductInput } from '@/server/validation/product-schemas';
import { useToast } from '@/components/ui/toast';

interface ProductDetail {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  model: string | null;
  description: string | null;
  unit: string;
  minimumStock: number;
  maximumStock: number | null;
  isActive: boolean;
  brandName: string | null;
  brandId: string | null;
  categoryName: string;
  categoryId: string;
  supplierName: string | null;
  supplierId: string | null;
  compatibility: string[];
  partNumber: string | null;
  manufacturerPartNumber: string | null;
  printerType: string | null;
  colorType: string | null;
  consumableType: string | null;
  stock: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

interface LocationRow {
  locationId: string;
  locationCode: string;
  locationName: string;
  quantity: number;
  updatedAt: string;
}

interface Options {
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const { push } = useToast();
  const [product, setProduct] = React.useState<ProductDetail | null>(null);
  const [byLocation, setByLocation] = React.useState<LocationRow[]>([]);
  const [options, setOptions] = React.useState<Options | null>(null);
  const [mutation, setMutation] = React.useState<'add' | 'remove' | null>(null);
  const [adjusting, setAdjusting] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = React.useState(false);
  const [togglingActive, setTogglingActive] = React.useState(false);

  const load = React.useCallback(() => {
    apiGet<{ product: ProductDetail; byLocation: LocationRow[] }>(`/api/products/${params.id}`)
      .then((data) => {
        setProduct(data.product);
        setByLocation(data.byLocation);
      })
      .catch(() => push({ title: 'Could not load this product.', variant: 'error' }));
  }, [params.id, push]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    apiGet<{ options: Options }>('/api/products?page=1&pageSize=1')
      .then((data) => setOptions(data.options))
      .catch(() => {});
  }, []);

  async function deactivate() {
    if (!product) return;
    setTogglingActive(true);
    try {
      await apiPatch(`/api/products/${product.id}`, { isActive: false });
      push({ title: `${product.name} has been deactivated.`, variant: 'success' });
      setConfirmingDeactivate(false);
      load();
    } catch (err) {
      push({ title: err instanceof ApiError ? err.message : 'Could not deactivate this product.', variant: 'error' });
    } finally {
      setTogglingActive(false);
    }
  }

  async function reactivate() {
    if (!product) return;
    setTogglingActive(true);
    try {
      await apiPatch(`/api/products/${product.id}`, { isActive: true });
      push({ title: `${product.name} has been reactivated.`, variant: 'success' });
      load();
    } catch (err) {
      push({ title: err instanceof ApiError ? err.message : 'Could not reactivate this product.', variant: 'error' });
    } finally {
      setTogglingActive(false);
    }
  }

  if (!product) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const attributes = [
    { label: 'SKU', value: product.sku },
    { label: 'Barcode', value: product.barcode },
    { label: 'Brand', value: product.brandName },
    { label: 'Model', value: product.model },
    { label: 'Category', value: product.categoryName },
    { label: 'Supplier', value: product.supplierName },
    { label: 'Part number', value: product.partNumber },
    { label: 'Manufacturer part number', value: product.manufacturerPartNumber },
    { label: 'Printer type', value: humanise(product.printerType) },
    { label: 'Colour type', value: humanise(product.colorType) },
    { label: 'Consumable type', value: humanise(product.consumableType) },
  ].filter((a) => a.value && a.value !== '—');

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{product.name}</h2>
            {!product.isActive && <Badge variant="destructive">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{product.sku}</p>
        </div>
        <div className="flex gap-2">
          {can(PERMISSIONS.PRODUCT_UPDATE) && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </Button>
          )}
          {can(PERMISSIONS.PRODUCT_DEACTIVATE) && product.isActive && (
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmingDeactivate(true)}>
              <Ban className="h-3.5 w-3.5" aria-hidden /> Deactivate
            </Button>
          )}
          {can(PERMISSIONS.PRODUCT_DEACTIVATE) && !product.isActive && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={reactivate} disabled={togglingActive}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reactivate
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current stock</p>
            <p className="text-3xl font-semibold tabular-nums">{product.stock} <span className="text-base font-normal text-muted-foreground">{humanise(product.unit).toLowerCase()}</span></p>
            <div className="mt-1"><StockStatusBadge status={product.status} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(PERMISSIONS.INVENTORY_ADD) && product.isActive && (
              <Button className="gap-2" onClick={() => setMutation('add')}>
                <PackagePlus className="h-4 w-4" aria-hidden /> Add stock
              </Button>
            )}
            {can(PERMISSIONS.INVENTORY_REMOVE) && product.isActive && (
              <Button variant="outline" className="gap-2" onClick={() => setMutation('remove')}>
                <PackageMinus className="h-4 w-4" aria-hidden /> Remove stock
              </Button>
            )}
            {can(PERMISSIONS.INVENTORY_ADJUST) && (
              <Button variant="outline" className="gap-2" onClick={() => setAdjusting(true)}>
                <ClipboardEdit className="h-4 w-4" aria-hidden /> Correct count
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {attributes.map((a) => (
              <div key={a.label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{a.label}</span>
                <span className="text-right font-medium">{a.value}</span>
              </div>
            ))}
            {product.description && (
              <p className="mt-1 border-t border-border pt-2 text-muted-foreground">{product.description}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Stock by location</CardTitle></CardHeader>
          <CardContent className="p-0">
            {byLocation.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">No stock recorded at any location yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {byLocation.map((loc) => (
                  <li key={loc.locationId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{loc.locationName}</span>
                    <span className="tabular-nums font-medium">{loc.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {mutation && (
        <StockMutationDialog
          mode={mutation}
          product={product}
          open
          onOpenChange={(open) => !open && setMutation(null)}
          onSuccess={load}
        />
      )}

      {adjusting && (
        <AdjustStockDialog
          product={product}
          open
          onOpenChange={setAdjusting}
          onSuccess={load}
        />
      )}

      {editing && options && (
        <ProductFormDialog
          open
          onOpenChange={setEditing}
          product={{
            id: product.id,
            sku: product.sku,
            barcode: product.barcode ?? undefined,
            name: product.name,
            model: product.model ?? undefined,
            description: product.description ?? undefined,
            unit: product.unit as ProductInput['unit'],
            minimumStock: product.minimumStock,
            maximumStock: product.maximumStock ?? undefined,
            isActive: product.isActive,
            categoryId: product.categoryId,
            brandId: product.brandId ?? undefined,
            supplierId: product.supplierId ?? undefined,
            compatibility: product.compatibility,
            partNumber: product.partNumber ?? undefined,
            manufacturerPartNumber: product.manufacturerPartNumber ?? undefined,
            printerType: product.printerType as ProductInput['printerType'],
            colorType: product.colorType as ProductInput['colorType'],
            consumableType: product.consumableType as ProductInput['consumableType'],
          }}
          categories={options.categories}
          brands={options.brands}
          suppliers={options.suppliers}
          onSuccess={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      <Dialog open={confirmingDeactivate} onOpenChange={setConfirmingDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {product.name}?</DialogTitle>
            <DialogDescription>
              It will disappear from the active products list and can&apos;t have stock added to it. Its stock
              history stays exactly as it is, and you can reactivate it at any time.
              {product.stock > 0 && (
                <span className="mt-2 block font-medium text-warn">
                  It currently has {product.stock} {humanise(product.unit).toLowerCase()} in stock — that stock
                  stays recorded, it isn&apos;t removed.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDeactivate(false)} disabled={togglingActive}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deactivate} disabled={togglingActive} className="gap-2">
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}