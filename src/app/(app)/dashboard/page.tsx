'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Boxes,
  PackagePlus,
  PackageMinus,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  History as HistoryIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { formatDateTime, formatNumber, humanise } from '@/lib/utils';
import { StockMutationDialog } from '@/features/inventory/stock-mutation-dialog';
import { useToast } from '@/components/ui/toast';

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
  { key: 'totalUnits', label: 'Total units', icon: Boxes, tone: 'text-foreground', href: '/products' },
];

export default function DashboardPage() {
  const { push } = useToast();
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [mutation, setMutation] = React.useState<'add' | 'remove' | null>(null);

  const load = React.useCallback(() => {
    apiGet<DashboardResponse>('/api/dashboard')
      .then(setData)
      .catch(() => push({ title: 'Could not load the dashboard. Check your connection and try again.', variant: 'error' }));
  }, [push]);

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link key={tile.key} href={tile.href}>
              <Card className="h-full transition-colors hover:border-primary/40">
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

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h3>
        <Card>
          <CardContent className="flex flex-wrap gap-2 p-3">
            <Button className="gap-2" onClick={() => setMutation('add')}>
              <PackagePlus className="h-4 w-4" aria-hidden /> Add stock
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setMutation('remove')}>
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent activity</CardTitle>
          {data && data.recentActivity.length > 0 && (
            <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
              <Link href="/inventory/history">
                <HistoryIcon className="h-3.5 w-3.5" aria-hidden /> View all
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!data || data.recentActivity.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No stock transactions found.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentActivity.map((row) => {
                const DirectionIcon = row.direction === 'IN' ? ArrowUpRight : ArrowDownRight;
                return (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        row.direction === 'IN' ? 'bg-ok/10 text-ok' : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      <DirectionIcon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
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
                );
              })}
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