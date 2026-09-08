'use client';

import * as React from 'react';
import Link from 'next/link';
import { PackagePlus, AlertTriangle, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { StockMutationDialog } from './stock-mutation-dialog';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';

interface AttentionItem {
  id: string;
  sku: string;
  name: string;
  stock: number;
  minimumStock: number;
  unit: string;
  brandName: string | null;
  supplierName: string | null;
  locationName: string | null;
}

/** Shared list for /inventory/low-stock and /inventory/out-of-stock (sections 23–24). */
export function AttentionList({ mode }: { mode: 'LOW_STOCK' | 'OUT_OF_STOCK' }) {
  const { can } = useSession();
  const [items, setItems] = React.useState<AttentionItem[] | null>(null);
  const [target, setTarget] = React.useState<AttentionItem | null>(null);
  const endpoint = mode === 'LOW_STOCK' ? '/api/inventory/low-stock' : '/api/inventory/out-of-stock';

  const load = React.useCallback(() => {
    apiGet<{ items: AttentionItem[] }>(endpoint).then((data) => setItems(data.items));
  }, [endpoint]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!items) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (items.length === 0) {
    const Icon = mode === 'LOW_STOCK' ? AlertTriangle : XCircle;
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <Icon className="h-8 w-8" aria-hidden />
        <p className="text-sm">
          {mode === 'LOW_STOCK' ? 'No low-stock products.' : 'No products are currently out of stock.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-4 py-2.5">SKU</th>
              <th className="px-4 py-2.5 text-right">Stock</th>
              <th className="px-4 py-2.5 text-right">Minimum</th>
              <th className="px-4 py-2.5">Supplier</th>
              <th className="px-4 py-2.5">Location</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-accent/40">
                <td className="px-4 py-2.5">
                  <Link href={`/products/${item.id}`} className="font-medium hover:underline">{item.name}</Link>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.sku}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${mode === 'OUT_OF_STOCK' ? 'text-destructive' : 'text-warn'}`}>{item.stock}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{item.minimumStock}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{item.supplierName ?? '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{item.locationName ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  {can(PERMISSIONS.INVENTORY_ADD) && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTarget(item)}>
                      <PackagePlus className="h-3.5 w-3.5" aria-hidden /> Add stock
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-2 md:hidden">
        {items.map((item) => (
          <Card key={item.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/products/${item.id}`} className="truncate text-sm font-medium hover:underline">{item.name}</Link>
                <p className="truncate text-xs text-muted-foreground">{item.sku}{item.supplierName ? ` · ${item.supplierName}` : ''}</p>
              </div>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${mode === 'OUT_OF_STOCK' ? 'text-destructive' : 'text-warn'}`}>
                {item.stock} / {item.minimumStock}
              </span>
            </div>
            {can(PERMISSIONS.INVENTORY_ADD) && (
              <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={() => setTarget(item)}>
                <PackagePlus className="h-3.5 w-3.5" aria-hidden /> Add stock
              </Button>
            )}
          </Card>
        ))}
      </div>

      {target && (
        <StockMutationDialog
          mode="add"
          product={{ id: target.id, sku: target.sku, name: target.name, minimumStock: target.minimumStock, stock: target.stock }}
          open
          onOpenChange={(open) => !open && setTarget(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
}
