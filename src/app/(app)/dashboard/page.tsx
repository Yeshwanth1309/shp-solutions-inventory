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
  Printer,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';
import { StockMutationDialog } from '@/features/inventory/stock-mutation-dialog';
import { useToast } from '@/components/ui/toast';

interface DashboardStats {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
}

interface ModelStockRow {
  model: string;
  productCount: number;
  outOfStock: number;
  lowStock: number;
  inStock: number;
}

interface DashboardResponse {
  stats: DashboardStats;
  modelSummary: ModelStockRow[];
  isEmpty: boolean;
}

const TILES: Array<{ key: keyof DashboardStats; label: string; icon: typeof Package; tone: string; href: string }> = [
  { key: 'totalProducts', label: 'Total products', icon: Package, tone: 'text-foreground', href: '/products' },
  { key: 'inStock', label: 'In stock', icon: CheckCircle2, tone: 'text-ok', href: '/products?status=IN_STOCK' },
  { key: 'lowStock', label: 'Low stock', icon: AlertTriangle, tone: 'text-warn', href: '/inventory/low-stock' },
  { key: 'outOfStock', label: 'Out of stock', icon: XCircle, tone: 'text-destructive', href: '/inventory/out-of-stock' },
  { key: 'totalUnits', label: 'Total units', icon: Boxes, tone: 'text-foreground', href: '/products' },
];

/**
 * The dashboard leads with what a printer/toner business actually needs at a
 * glance: total stock health, then — in place of a generic transaction log —
 * which specific printer models are running low or out of the consumables
 * and parts that fit them. The full chronological history still has its own
 * dedicated page (Stock History); this view answers a different question:
 * "if a customer walks in with a Canon G3010, do we have what they need."
 */
interface ModelProductRow {
  id: string;
  sku: string;
  name: string;
  stock: number;
  minimumStock: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

const STATUS_STYLES: Record<ModelProductRow['status'], string> = {
  OUT_OF_STOCK: 'bg-destructive/10 text-destructive',
  LOW_STOCK: 'bg-warn/10 text-warn',
  IN_STOCK: 'bg-ok/10 text-ok',
};

const STATUS_LABELS: Record<ModelProductRow['status'], string> = {
  OUT_OF_STOCK: 'Out',
  LOW_STOCK: 'Low',
  IN_STOCK: 'OK',
};

/**
 * One printer model's row on the dashboard. Clicking anywhere on it expands
 * an inline list of exactly which products (toners, ink, parts) are marked
 * compatible with that model and what each one's current stock is — so
 * "does the shop have what a Canon G3010 needs" is answerable without ever
 * leaving the dashboard. The product list is fetched lazily, only on first
 * expand, since most rows on a busy dashboard will never be opened.
 */
function ModelRow({ row }: { row: ModelStockRow }) {
  const [open, setOpen] = React.useState(false);
  const [products, setProducts] = React.useState<ModelProductRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && products === null) {
      setLoading(true);
      apiGet<{ products: ModelProductRow[] }>(`/api/dashboard/model-products?model=${encodeURIComponent(row.model)}`)
        .then((data) => setProducts(data.products))
        .catch(() => setProducts([]))
        .finally(() => setLoading(false));
    }
  }

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          <Printer className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.model}</p>
            <p className="text-xs text-muted-foreground">
              {row.productCount} compatible item{row.productCount === 1 ? '' : 's'} — click to see which
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {row.outOfStock > 0 && (
            <span className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">{row.outOfStock} out</span>
          )}
          {row.lowStock > 0 && (
            <span className="rounded-md bg-warn/10 px-2 py-1 text-xs font-medium text-warn">{row.lowStock} low</span>
          )}
          {row.inStock > 0 && (
            <span className="rounded-md bg-ok/10 px-2 py-1 text-xs font-medium text-ok">{row.inStock} ok</span>
          )}
        </div>
      </button>

      {open && (
        <div className="mt-2 ml-6 grid gap-1 border-l border-border pl-4">
          {loading && <p className="py-1 text-xs text-muted-foreground">Loading…</p>}
          {!loading && products && products.length === 0 && (
            <p className="py-1 text-xs text-muted-foreground">No compatible products found.</p>
          )}
          {!loading && products?.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="flex items-center justify-between gap-3 rounded-md py-1.5 pr-2 text-sm hover:bg-accent/40"
            >
              <span className="min-w-0 truncate">
                {p.name} <span className="text-xs text-muted-foreground">{p.sku}</span>
              </span>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${STATUS_STYLES[p.status]}`}>
                {p.stock} · {STATUS_LABELS[p.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

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
        <CardHeader>
          <CardTitle>Printer models &amp; their stock</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!data || data.modelSummary.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              No products list a compatible printer model yet — add one under a product&apos;s
              &quot;Compatible with&quot; field to see it summarised here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.modelSummary.map((row) => (
                <ModelRow key={row.model} row={row} />
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
