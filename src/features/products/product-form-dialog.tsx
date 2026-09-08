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
import { apiPost, apiPatch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { productSchema, PRODUCT_UNITS, type ProductInput } from '@/server/validation/product-schemas';

interface Option {
  id: string;
  name: string;
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
  /** Present when editing; absent when creating. */
  product?: ExistingProduct;
}

/**
 * Create/edit form (section 9 of the brief). Validated with the exact same
 * Zod schema the server uses, so a value the form accepts is a value the
 * server accepts too.
 */
export function ProductFormDialog({ open, onOpenChange, onSuccess, categories, brands, suppliers, product }: Props) {
  const { push } = useToast();
  const isEdit = Boolean(product);
  const [serverError, setServerError] = React.useState<string | null>(null);

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
    },
  });

  React.useEffect(() => {
    if (open) reset();
    setServerError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: ProductInput) {
    setServerError(null);
    try {
      if (isEdit && product) {
        await apiPatch(`/api/products/${product.id}`, values);
        push({ title: 'Product updated.', variant: 'success' });
      } else {
        await apiPost('/api/products', values);
        push({ title: 'Product created.', variant: 'success' });
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
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="brand"><SelectValue placeholder="No brand" /></SelectTrigger>
                    <SelectContent>
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
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="supplier"><SelectValue placeholder="No supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
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
