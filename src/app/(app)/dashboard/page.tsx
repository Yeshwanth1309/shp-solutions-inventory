'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PackagePlus,
  PackageMinus,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { formatDateTime, formatNumber, humanise } from '@/lib/utils';
import { StockMutationDialog } from '@/features/inventory/stock-mutation-dialog';

interface DashboardStats {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
}

interface ActivityRow {
  id: string;
  type: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  newStock: number;
  createdAt: string;
  reason: string;
  productId: string;
  productName: string;
  sku: string;
  performedByName: string | null;
  locationName: string;
}

interface DashboardResponse {
  stats: DashboardStats;
  recentActivity: ActivityRow[];
  isEmpty: boolean;
}

const TILES: Array<{ key: keyof DashboardStats; label: string; icon: typeof Package; tone: string; href: string }> = [
  { key: 'totalProducts', label: 'Total products', icon: Package, tone: 'text-foreground', href: '/products' },
  { key: 'inStock', label: 'In stock', icon: CheckCircle2, tone: 'text-ok', href: '/products?status=IN_STOCK' },
  { key: 'lowStock', label: 'Low stock', icon: AlertTriangle, tone: 'text-warn', href: '/inventory/low-stock' },
  { key: 'outOfStock', label: 'Out of stock', icon: XCircle, tone: 'text-destructive', href: '/inventory/out-of-stock' },
];

export default function DashboardPage() {
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [mutation, setMutation] = React.useState<'add' | 'remove' | null>(null);

  const load = React.useCallback(() => {
    apiGet<DashboardResponse>('/api/dashboard').then(setData);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (data?.isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Package className="h-10 w-10 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold">No products have been added yet.</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add your first printer, toner, ink or spare part to start tracking stock.
        </p>
        <Button asChild className="mt-2">
          <Link href="/products?new=1">Add product</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link key={tile.key} href={tile.href}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{tile.label}</span>
                    <Icon className={`h-4 w-4 ${tile.tone}`} aria-hidden />
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">
                    {data ? formatNumber(data.stats[tile.key]) : '—'}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="gap-2" onClick={() => setMutation('add')}>
          <PackagePlus className="h-4 w-4" aria-hidden /> Add stock
        </Button>
        <Button variant="secondary" className="gap-2" onClick={() => setMutation('remove')}>
          <PackageMinus className="h-4 w-4" aria-hidden /> Remove stock
        </Button>
        <Button variant="outline" asChild className="gap-2">
          <Link href="/products?new=1">
            <Package className="h-4 w-4" aria-hidden /> Add product
          </Link>
        </Button>
        <Button variant="outline" asChild className="gap-2">
          <Link href="/products">
            <Search className="h-4 w-4" aria-hidden /> Search inventory
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!data || data.recentActivity.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No stock transactions found.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentActivity.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/products/${row.productId}`} className="truncate text-sm font-medium hover:underline">
                      {row.productName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.sku} · {humanise(row.reason)} · {row.performedByName ?? 'System'} · {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${row.direction === 'IN' ? 'text-ok' : 'text-destructive'}`}
                  >
                    {row.direction === 'IN' ? '+' : '−'}
                    {row.quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {mutation && (
        <StockMutationDialog
          mode={mutation}
          open
          onOpenChange={(open) => !open && setMutation(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
}
