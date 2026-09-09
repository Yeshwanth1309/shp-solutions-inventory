'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPost, apiPatch, ApiError, newRequestId } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { humanise } from '@/lib/utils';
import {
  productSchema,
  PRODUCT_UNITS,
  PRINTER_TYPES,
  COLOR_TYPES,
  CONSUMABLE_TYPES,
  type ProductInput,
} from '@/server/validation/product-schemas';

interface Option {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
}

interface ExistingProduct extends Partial<ProductInput> {
  id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  categories: Option[];
  brands: Option[];
  suppliers: Option[];
  product?: ExistingProduct;
}

const NONE = '__none__';

export function ProductFormDialog({ open, onOpenChange, onSuccess, categories, brands, suppliers, product }: Props) {
  const { push } = useToast();
  const isEdit = Boolean(product);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [locations, setLocations] = React.useState<LocationOption[]>([]);
  const [startingLocationId, setStartingLocationId] = React.useState('');
  const [startingQuantity, setStartingQuantity] = React.useState('');
  const requestIdRef = React.useRef(newRequestId());

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: product?.sku ?? '',
      barcode: product?.barcode ?? undefined,
      name: product?.name ?? '',
      model: product?.model ?? undefined,
      description: product?.description ?? undefined,
      unit: product?.unit ?? 'PIECE',
      minimumStock: product?.minimumStock ?? 0,
      maximumStock: product?.maximumStock,
      isActive: product?.isActive ?? true,
      categoryId: product?.categoryId ?? '',
      brandId: product?.brandId,
      supplierId: product?.supplierId,
      compatibility: product?.compatibility ?? [],
      partNumber: product?.partNumber ?? undefined,
      manufacturerPartNumber: product?.manufacturerPartNumber ?? undefined,
      printerType: product?.printerType,
      colorType: product?.colorType,
      consumableType: product?.consumableType,
    },
  });

  React.useEffect(() => {
    if (!open) return;
    reset();
    setServerError(null);
    setStartingQuantity('');
    requestIdRef.current = newRequestId();

    if (!isEdit) {
      apiGet<{ locations: LocationOption[] }>('/api/locations')
        .then((data) => {
          setLocations(data.locations);
          const defaultLoc = data.locations.find((l) => l.isDefault);
          setStartingLocationId(defaultLoc?.id ?? data.locations[0]?.id ?? '');
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: ProductInput) {
    setServerError(null);
    try {
      if (isEdit && product) {
        await apiPatch(`/api/products/${product.id}`, values);
        push({ title: 'Product updated.', variant: 'success' });
        onSuccess();
        return;
      }

      const created = await apiPost<{ product: { id: string } }>('/api/products', values);
      push({ title: 'Product created.', variant: 'success' });

      const qty = Number(startingQuantity);
      if (startingQuantity && Number.isInteger(qty) && qty > 0 && startingLocationId) {
        try {
          await apiPost(`/api/inventory/${created.product.id}/add`, {
            quantity: qty,
            reason: 'Purchase',
            notes: 'Starting stock set at creation',
            locationId: startingLocationId,
            requestId: requestIdRef.current,
          });
          push({ title: `Starting stock of ${qty} recorded.`, variant: 'success' });
        } catch (stockError) {
          push({
            title: 'Product created, but starting stock could not be recorded.',
            description: stockError instanceof ApiError ? stockError.message : 'Add stock manually from the product page.',
            variant: 'warning',
          });
        }
      }

      onSuccess();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'Add product'}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Product name</Label>
              <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...register('sku')} aria-invalid={!!errors.sku} />
              {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="barcode">Barcode (optional)</Label>
              <Input id="barcode" {...register('barcode')} aria-invalid={!!errors.barcode} />
              {errors.barcode && <p className="text-xs text-destructive">{errors.barcode.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="model">Model (optional)</Label>
              <Input id="model" {...register('model')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Controller
                control={control}
                name="unit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRODUCT_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>{u.charAt(0) + u.slice(1).toLowerCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="brand">Brand (optional)</Label>
              <Controller
                control={control}
                name="brandId"
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                    <SelectTrigger id="brand"><SelectValue placeholder="No brand" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No brand</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="supplier">Supplier (optional)</Label>
              <Controller
                control={control}
                name="supplierId"
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                    <SelectTrigger id="supplier"><SelectValue placeholder="No supplier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No supplier</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Printer-specific details (optional)</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="printerType">Printer type</Label>
              <Controller
                control={control}
                name="printerType"
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                    <SelectTrigger id="printerType"><SelectValue placeholder="N/A" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>N/A</SelectItem>
                      {PRINTER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="colorType">Colour type</Label>
              <Controller
                control={control}
                name="colorType"
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                    <SelectTrigger id="colorType"><SelectValue placeholder="N/A" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>N/A</SelectItem>
                      {COLOR_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="consumableType">Consumable type</Label>
              <Controller
                control={control}
                name="consumableType"
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                    <SelectTrigger id="consumableType"><SelectValue placeholder="N/A" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>N/A</SelectItem>
                      {CONSUMABLE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="partNumber">Part number (optional)</Label>
              <Input id="partNumber" {...register('partNumber')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manufacturerPartNumber">Manufacturer part number (optional)</Label>
              <Input id="manufacturerPartNumber" {...register('manufacturerPartNumber')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="minimumStock">Minimum stock</Label>
              <Input id="minimumStock" type="number" min={0} {...register('minimumStock', { valueAsNumber: true })} aria-invalid={!!errors.minimumStock} />
              {errors.minimumStock && <p className="text-xs text-destructive">{errors.minimumStock.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="maximumStock">Maximum stock (optional)</Label>
              <Input id="maximumStock" type="number" min={0} {...register('maximumStock', { valueAsNumber: true })} aria-invalid={!!errors.maximumStock} />
              {errors.maximumStock && <p className="text-xs text-destructive">{errors.maximumStock.message}</p>}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" {...register('description')} />
          </div>

          {!isEdit && (
            <div className="grid gap-3 rounded-md border border-border bg-secondary/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">Starting stock (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="startingLocation">Location</Label>
                  <Select value={startingLocationId} onValueChange={setStartingLocationId} disabled={locations.length === 0}>
                    <SelectTrigger id="startingLocation">
                      <SelectValue placeholder={locations.length === 0 ? 'No locations yet' : 'Choose a location'} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}{l.isDefault ? ' (default)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="startingQuantity">Quantity</Label>
                  <Input
                    id="startingQuantity"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={startingQuantity}
                    onChange={(e) => setStartingQuantity(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Leave the quantity blank to add stock later instead.</p>
            </div>
          )}

          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}