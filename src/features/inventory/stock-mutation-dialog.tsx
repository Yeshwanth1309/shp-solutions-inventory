'use client';

import * as React from 'react';
import { Search, PackagePlus, PackageMinus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPost, ApiError, newRequestId } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

const ADD_REASONS = ['Purchase', 'Restock', 'Customer Return', 'Stock Correction', 'Other'] as const;
const REMOVE_REASONS = ['Sale', 'Damaged', 'Returned to Supplier', 'Stock Correction', 'Other'] as const;

interface ProductLite {
  id: string;
  sku: string;
  name: string;
  minimumStock: number;
  stock: number;
}

interface Props {
  mode: 'add' | 'remove';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-selected product — used from the product detail page, where the picker is unnecessary. */
  product?: ProductLite;
}

type Step = 'pick' | 'confirm' | 'done';

/**
 * Shared Add/Remove Stock flow (sections 20–21 of the brief): pick a product
 * (if not already given), enter quantity + reason, see a before/after preview,
 * confirm, then a success toast and a callback so the caller can refresh.
 *
 * Every submit carries a fresh idempotency key generated once per dialog open,
 * so a retried click or a flaky connection cannot double-post the movement.
 */
export function StockMutationDialog({ mode, open, onOpenChange, onSuccess, product: fixedProduct }: Props) {
  const { push } = useToast();
  const [step, setStep] = React.useState<Step>(fixedProduct ? 'confirm' : 'pick');
  const [product, setProduct] = React.useState<ProductLite | undefined>(fixedProduct);
  const [term, setTerm] = React.useState('');
  const [results, setResults] = React.useState<ProductLite[]>([]);
  const [quantity, setQuantity] = React.useState('');
  const [reason, setReason] = React.useState<string>('');
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(newRequestId());
  const debouncedTerm = useDebouncedValue(term, 250);

  const reasons = mode === 'add' ? ADD_REASONS : REMOVE_REASONS;
  const isAdd = mode === 'add';

  React.useEffect(() => {
    if (!open) return;
    requestIdRef.current = newRequestId();
    setStep(fixedProduct ? 'confirm' : 'pick');
    setProduct(fixedProduct);
    setTerm('');
    setResults([]);
    setQuantity('');
    setReason('');
    setNotes('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!debouncedTerm.trim() || step !== 'pick') {
      setResults([]);
      return;
    }
    let cancelled = false;
    apiGet<{ results: ProductLite[] }>(`/api/products/search?q=${encodeURIComponent(debouncedTerm)}`).then((data) => {
      if (!cancelled) setResults(data.results);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedTerm, step]);

  const quantityNumber = Number(quantity);
  const validQuantity = Number.isInteger(quantityNumber) && quantityNumber > 0;
  const currentStock = product?.stock ?? 0;
  const previewNewStock = isAdd ? currentStock + (validQuantity ? quantityNumber : 0) : currentStock - (validQuantity ? quantityNumber : 0);
  const wouldGoNegative = !isAdd && validQuantity && previewNewStock < 0;

  async function submit() {
    if (!product || !validQuantity || !reason || wouldGoNegative) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost(`/api/inventory/${product.id}/${isAdd ? 'add' : 'remove'}`, {
        quantity: quantityNumber,
        reason,
        notes: notes || undefined,
        requestId: requestIdRef.current,
      });
      push({ title: 'Stock successfully updated.', variant: 'success' });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_STOCK') {
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAdd ? <PackagePlus className="h-4 w-4 text-ok" aria-hidden /> : <PackageMinus className="h-4 w-4 text-destructive" aria-hidden />}
            {isAdd ? 'Add stock' : 'Remove stock'}
          </DialogTitle>
          <DialogDescription>
            {step === 'pick' ? 'Search for the product to update.' : product?.name}
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' && (
          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                placeholder="Search by name, SKU or barcode"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            {results.length > 0 && (
              <ul className="max-h-64 overflow-y-auto rounded-md border border-border">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setProduct(r);
                        setStep('confirm');
                      }}
                    >
                      <span className="truncate">
                        <span className="font-medium">{r.name}</span> <span className="text-muted-foreground">{r.sku}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.stock} in stock</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 'confirm' && product && (
          <div className="grid gap-4">
            <div className="rounded-md bg-secondary p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current stock</span>
                <span className="font-medium tabular-nums">{currentStock}</span>
              </div>
              {validQuantity && (
                <>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-muted-foreground">{isAdd ? 'Adding' : 'Removing'}</span>
                    <span className={`font-medium tabular-nums ${isAdd ? 'text-ok' : 'text-destructive'}`}>
                      {isAdd ? '+' : '−'}
                      {quantityNumber}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
                    <span className="font-medium">New stock</span>
                    <span className={`font-semibold tabular-nums ${wouldGoNegative ? 'text-destructive' : ''}`}>
                      {previewNewStock}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus={!fixedProduct}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </div>

            {wouldGoNegative && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Insufficient stock. Only {currentStock} units are currently available.
              </p>
            )}
            {error && !wouldGoNegative && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'confirm' && !fixedProduct && (
            <Button variant="outline" onClick={() => setStep('pick')} disabled={submitting}>
              Back
            </Button>
          )}
          {step === 'confirm' && (
            <Button
              onClick={submit}
              disabled={!validQuantity || !reason || submitting || !!wouldGoNegative}
              className="gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Confirm {isAdd ? 'add' : 'removal'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
