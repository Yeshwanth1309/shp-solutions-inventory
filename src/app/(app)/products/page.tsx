'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, PackagePlus, PackageMinus, ChevronLeft, ChevronRight, Package, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { apiGet } from '@/lib/api-client';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { StockStatusBadge } from '@/features/products/status-badge';
import { ProductFormDialog } from '@/features/products/product-form-dialog';
import { StockMutationDialog } from '@/features/inventory/stock-mutation-dialog';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/components/ui/toast';
import { PERMISSIONS } from '@/lib/permissions';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brandName: string | null;
  categoryName: string;
  stock: number;
  minimumStock: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

interface Options {
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}

interface ListResponse {
  items: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  options: Options;
}

const SORT_OPTIONS: Array<{ value: 'name' | 'sku' | 'stock' | 'minimumStock' | 'createdAt' | 'updatedAt'; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'sku', label: 'SKU' },
  { value: 'stock', label: 'Stock' },
  { value: 'minimumStock', label: 'Minimum stock' },
  { value: 'createdAt', label: 'Date added' },
  { value: 'updatedAt', label: 'Last updated' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW_STOCK', label: 'Low stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
];

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const { push } = useToast();

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState(searchParams.get('status') ?? 'ALL');
  const [categoryId, setCategoryId] = React.useState<string>('ALL');
  const [sortBy, setSortBy] = React.useState<typeof SORT_OPTIONS[number]['value']>('name');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<ListResponse | null>(null);
  const [productDialog, setProductDialog] = React.useState<{ mode: 'create' } | null>(
    searchParams.get('new') ? { mode: 'create' } : null,
  );
  const [mutationTarget, setMutationTarget] = React.useState<{ mode: 'add' | 'remove'; product: ProductRow } | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const load = React.useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (status !== 'ALL') params.set('status', status);
    if (categoryId !== 'ALL') params.set('categoryId', categoryId);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    params.set('page', String(page));
    params.set('pageSize', '20');
    apiGet<ListResponse>(`/api/products?${params.toString()}`)
      .then(setData)
      .catch(() => push({ title: 'Could not load products. Check your connection and try again.', variant: 'error' }));
  }, [debouncedSearch, status, categoryId, sortBy, sortDir, page, push]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, categoryId, sortBy, sortDir]);

  const canMutate = can(PERMISSIONS.INVENTORY_ADD) || can(PERMISSIONS.INVENTORY_REMOVE);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && data.options.categories.length > 0 && (
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {data.options.categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-40">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={sortDir === 'asc' ? 'Sorted ascending — click for descending' : 'Sorted descending — click for ascending'}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" aria-hidden /> : <ArrowDown className="h-4 w-4" aria-hidden />}
        </Button>
        <div className="ml-auto">
          {can(PERMISSIONS.PRODUCT_CREATE) && (
            <Button className="gap-2" onClick={() => setProductDialog({ mode: 'create' })}>
              <Plus className="h-4 w-4" aria-hidden /> Add product
            </Button>
          )}
        </div>
      </div>

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Package className="h-8 w-8" aria-hidden />
          <p className="text-sm">
            {debouncedSearch || status !== 'ALL' || categoryId !== 'ALL'
              ? 'No products match your filters.'
              : 'No products have been added yet.'}
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Brand</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5 text-right">Stock</th>
                  <th className="px-4 py-2.5 text-right">Minimum</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((row) => (
                  <tr key={row.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${row.id}`} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{row.sku}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.brandName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.categoryName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.stock}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{row.minimumStock}</td>
                    <td className="px-4 py-2.5"><StockStatusBadge status={row.status} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {can(PERMISSIONS.INVENTORY_ADD) && (
                          <Button size="icon" variant="ghost" aria-label={`Add stock to ${row.name}`} onClick={() => setMutationTarget({ mode: 'add', product: row })}>
                            <PackagePlus className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                        {can(PERMISSIONS.INVENTORY_REMOVE) && (
                          <Button size="icon" variant="ghost" aria-label={`Remove stock from ${row.name}`} onClick={() => setMutationTarget({ mode: 'remove', product: row })}>
                            <PackageMinus className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-2 md:hidden">
            {data.items.map((row) => (
              <Card key={row.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/products/${row.id}`} className="truncate text-sm font-medium hover:underline">
                      {row.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{row.sku} · {row.categoryName}</p>
                  </div>
                  <StockStatusBadge status={row.status} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold">{row.stock}</span>
                    <span className="text-muted-foreground"> / min {row.minimumStock}</span>
                  </span>
                  <div className="flex gap-1">
                    {can(PERMISSIONS.INVENTORY_ADD) && (
                      <Button size="icon" variant="outline" aria-label={`Add stock to ${row.name}`} onClick={() => setMutationTarget({ mode: 'add', product: row })}>
                        <PackagePlus className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                    {can(PERMISSIONS.INVENTORY_REMOVE) && (
                      <Button size="icon" variant="outline" aria-label={`Remove stock from ${row.name}`} onClick={() => setMutationTarget({ mode: 'remove', product: row })}>
                        <PackageMinus className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}
            </span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="outline" disabled={data.page >= data.pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}

      {productDialog && (
        <ProductFormDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setProductDialog(null);
              router.replace('/products');
            }
          }}
          categories={data?.options.categories ?? []}
          brands={data?.options.brands ?? []}
          suppliers={data?.options.suppliers ?? []}
          onSuccess={() => {
            setProductDialog(null);
            router.replace('/products');
            load();
          }}
        />
      )}

      {mutationTarget && canMutate && (
        <StockMutationDialog
          mode={mutationTarget.mode}
          product={mutationTarget.product}
          open
          onOpenChange={(open) => !open && setMutationTarget(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
}