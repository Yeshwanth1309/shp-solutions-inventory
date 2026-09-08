'use client';

import * as React from 'react';
import Link from 'next/link';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api-client';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatDateTime, humanise } from '@/lib/utils';

interface HistoryRow {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  sku: string;
  type: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  notes: string | null;
  performedByName: string | null;
  locationName: string;
}

interface ListResponse {
  items: HistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const TYPES = ['ADD', 'REMOVE', 'ADJUSTMENT', 'RETURN', 'DAMAGE', 'PURCHASE', 'SALE'];

/** Read-only ledger view (section 22). Corrections show up as their own ADJUSTMENT rows. */
export default function HistoryPage() {
  const [sku, setSku] = React.useState('');
  const [type, setType] = React.useState<string>('ALL');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<ListResponse | null>(null);
  const debouncedSku = useDebouncedValue(sku, 300);

  const load = React.useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSku.trim()) params.set('sku', debouncedSku.trim());
    if (type !== 'ALL') params.set('type', type);
    params.set('page', String(page));
    params.set('pageSize', '25');
    apiGet<ListResponse>(`/api/inventory/history?${params.toString()}`).then(setData);
  }, [debouncedSku, type, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSku, type]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Filter by SKU or product…" value={sku} onChange={(e) => setSku(e.target.value)} className="max-w-xs" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <History className="h-8 w-8" aria-hidden />
          <p className="text-sm">No stock transactions found.</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5 text-right">Quantity</th>
                  <th className="px-4 py-2.5 text-right">Previous</th>
                  <th className="px-4 py-2.5 text-right">New</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((row) => (
                  <tr key={row.id} className="hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${row.productId}`} className="font-medium hover:underline">{row.productName}</Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{row.sku}</td>
                    <td className="px-4 py-2.5"><Badge variant={row.direction === 'IN' ? 'ok' : 'destructive'}>{humanise(row.type)}</Badge></td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.direction === 'IN' ? 'text-ok' : 'text-destructive'}`}>
                      {row.direction === 'IN' ? '+' : '−'}{row.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{row.previousStock}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{row.newStock}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.reason}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.performedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-2 md:hidden">
            {data.items.map((row) => (
              <Card key={row.id} className="p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/products/${row.productId}`} className="truncate font-medium hover:underline">{row.productName}</Link>
                  <span className={`shrink-0 font-semibold tabular-nums ${row.direction === 'IN' ? 'text-ok' : 'text-destructive'}`}>
                    {row.direction === 'IN' ? '+' : '−'}{row.quantity}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.sku} · {humanise(row.type)} · {row.reason} · {formatDateTime(row.createdAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{row.previousStock} → {row.newStock} · {row.performedByName ?? 'System'}</p>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
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
    </div>
  );
}
