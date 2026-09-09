'use client';

import * as React from 'react';
import { ClipboardEdit, Loader2 } from 'lucide-react';
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

interface ProductLite {
  id: string;
  sku: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Props {
  product: ProductLite;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AdjustStockDialog({ product, open, onOpenChange, onSuccess }: Props) {
  const { push } = useToast();
  const [locations, setLocations] = React.useState<LocationOption[]>([]);
  const [locationId, setLocationId] = React.useState('');
  const [currentStock, setCurrentStock] = React.useState<number | null>(null);
  const [targetQuantity, setTargetQuantity] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [loadingStock, setLoadingStock] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(newRequestId());

  React.useEffect(() => {
    if (!open) return;
    requestIdRef.current = newRequestId();
    setTargetQuantity('');
    setReason('');
    setNotes('');
    setError(null);

    apiGet<{ locations: LocationOption[] }>('/api/locations').then((data) => {
      setLocations(data.locations);
      const defaultLoc = data.locations.find((l) => l.isDefault);
      setLocationId(defaultLoc?.id ?? data.locations[0]?.id ?? '');
    });
  }, [open]);

  React.useEffect(() => {
    if (!open || !locationId) return;
    setLoadingStock(true);
    apiGet<{ byLocation: Array<{ locationId: string; quantity: number }> }>(`/api/products/${product.id}`)
      .then((data) => {
        const row = data.byLocation.find((l) => l.locationId === locationId);
        setCurrentStock(row?.quantity ?? 0);
      })
      .catch(() => setCurrentStock(null))
      .finally(() => setLoadingStock(false));
  }, [open, locationId, product.id]);

  const targetNumber = Number(targetQuantity);
  const validTarget = targetQuantity !== '' && Number.isInteger(targetNumber) && targetNumber >= 0;
  const delta = currentStock !== null && validTarget ? targetNumber - currentStock : null;
  const noChange = delta === 0;

  async function submit() {
    if (!validTarget || reason.trim().length < 2 || noChange) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost(`/api/inventory/${product.id}/adjust`, {
        targetQuantity: targetNumber,
        reason: reason.trim(),
        notes: notes || undefined,
        locationId,
        requestId: requestIdRef.current,
      });
      push({ title: 'Stock corrected.', variant: 'success' });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardEdit className="h-4 w-4 text-warn" aria-hidden />
            Correct stock count
          </DialogTitle>
          <DialogDescription>{product.name} — enter what you actually counted.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {locations.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-location">Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="adjust-location"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}{l.isDefault ? ' (default)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md bg-secondary p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Recorded stock</span>
              <span className="font-medium tabular-nums">{loadingStock ? '…' : (currentStock ?? '—')}</span>
            </div>
            {validTarget && currentStock !== null && (
              <>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Difference</span>
                  <span className={`font-medium tabular-nums ${delta && delta > 0 ? 'text-ok' : delta && delta < 0 ? 'text-destructive' : ''}`}>
                    {delta !== null && delta > 0 ? '+' : ''}{delta}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
                  <span className="font-medium">New stock</span>
                  <span className="font-semibold tabular-nums">{targetNumber}</span>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="targetQuantity">Actual count</Label>
            <Input
              id="targetQuantity"
              type="number"
              inputMode="numeric"
              min={0}
              autoFocus
              value={targetQuantity}
              onChange={(e) => setTargetQuantity(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adjustReason">Reason</Label>
            <Input
              id="adjustReason"
              placeholder="e.g. Annual stock count, Damaged in storage"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adjustNotes">Notes (optional)</Label>
            <Input id="adjustNotes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>

          {noChange && validTarget && (
            <p className="text-xs text-muted-foreground">Stock is already {targetNumber}. Nothing to correct.</p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={!validTarget || reason.trim().length < 2 || !!noChange || submitting}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}