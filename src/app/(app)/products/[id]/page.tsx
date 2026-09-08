'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PackagePlus, PackageMinus, Pencil, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { StockStatusBadge } from '@/features/products/status-badge';
import { StockMutationDialog } from '@/features/inventory/stock-mutation-dialog';
import { ProductFormDialog } from '@/features/products/product-form-dialog';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';
import { humanise } from '@/lib/utils';
import type { ProductInput } from '@/server/validation/product-schemas';

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
  const [product, setProduct] = React.useState<ProductDetail | null>(null);
  const [byLocation, setByLocation] = React.useState<LocationRow[]>([]);
  const [options, setOptions] = React.useState<Options | null>(null);
  const [mutation, setMutation] = React.useState<'add' | 'remove' | null>(null);
  const [editing, setEditing] = React.useState(false);

  const load = React.useCallback(() => {
    apiGet<{ product: ProductDetail; byLocation: LocationRow[] }>(`/api/products/${params.id}`).then((data) => {
      setProduct(data.product);
      setByLocation(data.byLocation);
    });
  }, [params.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    apiGet<{ options: Options }>('/api/products?page=1&pageSize=1').then((data) => setOptions(data.options));
  }, []);

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
          <h2 className="text-lg font-semibold">{product.name}</h2>
          <p className="text-sm text-muted-foreground">{product.sku}</p>
        </div>
        <div className="flex gap-2">
          {can(PERMISSIONS.PRODUCT_UPDATE) && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
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
          <div className="flex gap-2">
            {can(PERMISSIONS.INVENTORY_ADD) && (
              <Button className="gap-2" onClick={() => setMutation('add')}>
                <PackagePlus className="h-4 w-4" aria-hidden /> Add stock
              </Button>
            )}
            {can(PERMISSIONS.INVENTORY_REMOVE) && (
              <Button variant="outline" className="gap-2" onClick={() => setMutation('remove')}>
                <PackageMinus className="h-4 w-4" aria-hidden /> Remove stock
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
    </div>
  );
}
